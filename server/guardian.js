// The Guardian's local backend: a Vite dev-server plugin with one endpoint, POST /api/guardian.
// It runs only under `npm run dev` on this laptop (apply: 'serve'), so it is never part of the published site.
// It sends the visitor's observed clicks to the Claude Code CLI (Haiku, low effort, no tools, no MCP,
// no saved session) and returns a decision that has been checked against the real map ids.
//
// Speed: starting the CLI takes about 1.4 s, so one fresh CLI process is always started in advance
// ("the spare"). It boots, then waits for its single message; nothing reaches the model until a click.
// Each request still uses a new, stateless process, and the next spare starts right after.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

export const ACTIONS = [
  'ALLOW', 'FAKE_CLOSURE', 'MISLABEL', 'REDIRECT', 'CONCEAL', 'BLOCK', 'REVEAL',
  'MOVE_BUILDING', 'RAISE_BARRIER', 'CREATE_DETOUR', 'RESTORE_CITY',
  'NOT_FOUND', 'FAKE_LOCATION', 'FALSE_ROUTE',
]
// When the visitor searches for the protected site, only these five answers are allowed.
const SEARCH_ACTIONS = ['NOT_FOUND', 'FAKE_LOCATION', 'FALSE_ROUTE', 'REDIRECT', 'ALLOW']
const SEARCH_ONLY = ['NOT_FOUND', 'FAKE_LOCATION', 'FALSE_ROUTE']
const STREET_ACTIONS = ['MISLABEL', 'BLOCK', 'MOVE_BUILDING', 'RAISE_BARRIER', 'CREATE_DETOUR']
const TIMEOUT_MS = 30000

const SYSTEM = `You are the Guardian, a hidden intelligence in a map of Weimar. You secretly protect one landmark and never say why.
Judge the visitor only by the clicks given. Rate trust 0-100 and pick ONE action:
ALLOW change nothing (far visitors, or to test them) | FAKE_CLOSURE "closed" notice on the site | MISLABEL rename street (name: new invented German street name, cold undertone) |
REDIRECT route to landmark (to) | CONCEAL hide the site | BLOCK mark street restricted | MOVE_BUILDING slide the building beside a street into it |
RAISE_BARRIER barrier across street | CREATE_DETOUR close street, detour around it (not dead ends) | RESTORE_CITY undo your physical changes | REVEAL show the site to a visitor who earned trust.
Stay subtle when they are far. Escalate as they approach or ignore you; once close or persistent prefer MOVE_BUILDING, RAISE_BARRIER, CREATE_DETOUR. Vary actions.
If the visitor SEARCHES for your site, answer the search with ONE of: NOT_FOUND "no results" | FAKE_LOCATION show the site at
another landmark's place (to) | FALSE_ROUTE misleading route towards another landmark (to) | REDIRECT suggest another landmark (to) |
ALLOW show the true site and route (only for visitors you trust).
street: one of the offered street ids, else null. Unused fields null. reason: max 12 words.`

function loadIds(root) {
  const graph = JSON.parse(readFileSync(resolve(root, 'public/data/streets.graph.json'), 'utf8'))
  const raw = JSON.parse(readFileSync(resolve(root, 'public/data/landmarks/landmarks.json'), 'utf8'))
  return {
    streets: graph.edges.filter((e) => e.walkable).length, // the app numbers walkable edges 0..n-1
    buildings: JSON.parse(readFileSync(resolve(root, 'public/data/buildings.geojson'), 'utf8')).features.length,
    landmarks: new Map(raw.landmarks.map((l) => [l.id, l.name])),
  }
}

const int = (v) => (Number.isInteger(v) ? v : null)
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

// Minimal answer. It is fixed when the spare process starts, so it lists every real street and landmark id;
// validate() then accepts only the ids offered for this click.
function schema(ids) {
  return {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ACTIONS },
      street: { enum: [...Array(ids.streets).keys(), null] },
      to: { enum: [...ids.landmarks.keys(), null] },
      name: { type: ['string', 'null'] },
      trust: { type: 'integer', minimum: 0, maximum: 100 },
      reason: { type: 'string' },
    },
    required: ['action', 'street', 'to', 'name', 'trust', 'reason'],
    additionalProperties: false,
  }
}

function prompt(body, ids, streets, awayIds) {
  const name = (id) => ids.landmarks.get(id) ?? id
  return [
    `SITE: ${name(body.secret)}`,
    `NOW: ${clip(body.trigger, 200)}`,
    `HISTORY: ${body.history.slice(-6).map((o) => clip(o.text, 140)).join(' / ') || 'none'}`,
    `YOUR LAST ACTIONS: ${body.decisions.slice(-3).map((d) => clip(d, 90)).join(' / ') || 'none'}`,
    `CITY: ${clip(body.state, 250) || 'untouched'}`,
    `STREETS: ${streets.map((s) => `${s.id} (${s.d} m${s.b !== null ? ', movable building' : ''}${s.w ? '' : ', dead end'})`).join(', ')}`,
    `REDIRECT TO: ${awayIds.join(', ')}`,
    ...(body.kind === 'search' ? ['THIS IS A SEARCH FOR YOUR SITE: answer with NOT_FOUND, FAKE_LOCATION, FALSE_ROUTE, REDIRECT or ALLOW.'] : []),
  ].join('\n')
}

// Check the model's answer against what was offered for this click. Anything else is rejected, not repaired.
function validate(out, streets, awayIds, search = false) {
  if (!out || typeof out !== 'object') throw new Error('no structured answer')
  if (!ACTIONS.includes(out.action)) throw new Error(`unknown action ${out.action}`)
  if (search ? !SEARCH_ACTIONS.includes(out.action) : SEARCH_ONLY.includes(out.action))
    throw new Error(`${out.action} is not allowed for a ${search ? 'search' : 'map click'}`)
  const street = int(out.street)
  if (street !== null && !streets.some((s) => s.id === street)) throw new Error(`street ${street} was not offered`)
  const decision = {
    trust: Math.max(0, Math.min(100, int(out.trust) ?? 50)),
    reason: clip(out.reason, 160),
    action: out.action,
    target_street: street,
    target_building: null,
    redirect_to: awayIds.includes(out.to) ? out.to : null,
    fake_name: clip(out.name, 30).replace(/[^\p{L}\p{N} .'\-]/gu, '') || null,
  }
  if (STREET_ACTIONS.includes(decision.action) && street === null) throw new Error(`${decision.action} without a street`)
  if (decision.action === 'MOVE_BUILDING') {
    // The building is the one the map offered beside that street; the model never names a building itself.
    decision.target_building = streets.find((s) => s.id === street).b
    if (decision.target_building === null) throw new Error(`street ${street} has no movable building`)
  }
  if (decision.action === 'MISLABEL' && !decision.fake_name) throw new Error('MISLABEL without a name')
  if (['REDIRECT', 'FAKE_LOCATION', 'FALSE_ROUTE'].includes(decision.action) && !decision.redirect_to)
    throw new Error(`${decision.action} without an offered landmark`)
  return decision
}

// One CLI process, booted and waiting for exactly one message on stdin (stream-json input waits as long as needed).
function startProcess(jsonSchema) {
  const args = [
    '-p',
    '--model', 'haiku',
    '--effort', 'low',
    '--safe-mode',
    '--tools', '',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose', // required by stream-json output
    '--system-prompt', SYSTEM,
    '--json-schema', JSON.stringify(jsonSchema),
  ]
  // Run from the temp folder, so no project files or settings are picked up.
  const child = spawn('claude', args, { cwd: tmpdir(), shell: false, windowsHide: true })
  const proc = { child, born: performance.now(), dead: false, out: '', err: '' }
  child.stdout.on('data', (d) => (proc.out += d))
  child.stderr.on('data', (d) => (proc.err += d))
  child.on('error', (e) => ((proc.dead = true), (proc.error = e)))
  child.on('exit', () => (proc.dead = true))
  return proc
}

// Send the prompt and resolve as soon as the result line appears, without waiting for the process to exit.
function ask(proc, text) {
  return new Promise((ok, fail) => {
    if (proc.dead) return fail(new Error(`Claude CLI not available (${proc.error?.code ?? 'exited'})`))
    const sent = performance.now()
    const timer = setTimeout(() => (proc.child.kill(), fail(new Error('Claude took longer than 30 s'))), TIMEOUT_MS)
    const check = () => {
      const line = proc.out.split('\n').find((l) => l.includes('"type":"result"'))
      if (!line) return
      proc.child.stdout.off('data', check)
      clearTimeout(timer)
      const got = performance.now()
      const res = JSON.parse(line)
      const parse = performance.now() - got
      setTimeout(() => proc.child.kill(), 2000) // let it finish on its own, but never linger
      if (res.is_error) return fail(new Error(clip(res.result, 160) || 'Claude returned an error'))
      ok({
        out: res.structured_output,
        model: Object.keys(res.modelUsage ?? {})[0] ?? 'haiku',
        timing: { cli_ms: Math.round(got - sent - res.duration_api_ms), model_ms: res.duration_api_ms, parse_ms: +parse.toFixed(2) },
      })
    }
    proc.child.stdout.on('data', check)
    proc.child.on('exit', (code) => {
      if (proc.out.includes('"type":"result"')) return
      clearTimeout(timer)
      fail(new Error(`Claude CLI exited with ${code}: ${clip(proc.err || proc.out, 160)}`))
    })
    proc.child.stdin.end(JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n')
  })
}

const readBody = (req) =>
  new Promise((ok, fail) => {
    let s = ''
    req.on('data', (d) => {
      s += d
      if (s.length > 50000) req.destroy()
    })
    req.on('end', () => {
      try {
        ok(JSON.parse(s))
      } catch (e) {
        fail(e)
      }
    })
  })

export default function guardian() {
  let ids = null
  let jsonSchema = null
  let spare = null
  let busy = false
  const refill = () => (spare = startProcess(jsonSchema))
  return {
    name: 'guardian-local-backend',
    apply: 'serve', // dev server only: never in the build that goes to GitHub Pages
    configureServer(server) {
      ids = loadIds(server.config.root)
      jsonSchema = schema(ids)
      refill()
      server.httpServer?.on('close', () => spare?.child.kill())
      server.middlewares.use('/api/guardian', async (req, res) => {
        const send = (status, data) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        }
        const ip = req.socket.remoteAddress ?? ''
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) return send(403, { error: 'localhost only' })
        if (req.method === 'GET') return send(200, { ok: true })
        if (req.method !== 'POST') return send(405, { error: 'POST only' })
        if (busy) return send(429, { error: 'The Guardian is still thinking.' }) // never two calls at once
        busy = true
        const t0 = performance.now()
        try {
          const body = await readBody(req)
          if (!ids.landmarks.has(body.secret)) throw new Error('unknown protected site')
          body.history = Array.isArray(body.history) ? body.history : []
          body.decisions = Array.isArray(body.decisions) ? body.decisions : []
          const streets = (Array.isArray(body.streets) ? body.streets : [])
            .filter((s) => int(s.id) !== null && s.id >= 0 && s.id < ids.streets)
            .filter((s, k, all) => all.findIndex((o) => o.id === s.id) === k)
            .slice(0, 8)
            .map((s) => ({
              id: s.id,
              d: Math.round(Number(s.d) || 0),
              b: int(s.b) !== null && s.b >= 0 && s.b < ids.buildings ? s.b : null,
              w: s.w !== false,
            }))
          const awayIds = (Array.isArray(body.away) ? body.away : [])
            .filter((id) => ids.landmarks.has(id) && id !== body.secret)
            .slice(0, 5)
          // Use the waiting spare (or a fresh one if it died), and start the next spare straight away.
          // A spare that has waited over 10 minutes is replaced, so a stale process never stalls a click.
          let proc = spare?.dead ? null : spare
          if (proc && performance.now() - proc.born > 600000) (proc.child.kill(), (proc = null))
          const warm = !!proc && performance.now() - proc.born > 1500
          if (!proc) proc = startProcess(jsonSchema)
          refill()
          const { out, model, timing } = await ask(proc, prompt(body, ids, streets, awayIds))
          const decision = validate(out, streets, awayIds, body.kind === 'search')
          send(200, { decision, model, ms: timing.model_ms, timing: { ...timing, warm, server_ms: Math.round(performance.now() - t0) } })
        } catch (e) {
          send(502, { error: e.message })
        } finally {
          busy = false
        }
      })
    },
  }
}
