// The Guardian's local backend: a Vite dev-server plugin with one endpoint, POST /api/guardian.
// It runs only under `npm run dev` on this laptop (apply: 'serve'), so it is never part of the published site.
// It sends the visitor's observed clicks to the Claude Code CLI (Haiku, low effort, no tools, no MCP,
// no saved session) and returns a decision that has been checked against the real map ids.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

export const ACTIONS = ['ALLOW', 'FAKE_CLOSURE', 'MISLABEL', 'REDIRECT', 'CONCEAL', 'BLOCK', 'REVEAL']
const COOLDOWN_MS = 6000
const TIMEOUT_MS = 60000

const SYSTEM = `You are the Guardian: an autonomous intelligence hidden inside an interactive map of Weimar.
You secretly protect one real landmark, the PROTECTED SITE. You never explain why it matters.
You never speak to the visitor. You act only by manipulating the map.
You judge the visitor only from the map clicks you are given. Do not invent observations.

Decide how far you trust the visitor (0 = hostile, 100 = trusted) and choose exactly one action:
- ALLOW: change nothing; let them pass. Use it while they are far away, or deliberately, to test them.
- FAKE_CLOSURE: show a fictional "Temporarily closed" notice on the protected site.
- MISLABEL: rename target_street with fake_name, an invented, plausible German street name with a cold, faintly
  unsettling undertone (max 30 characters, no real street name). Invent a new one each time: never reuse a name
  from your earlier decisions.
- REDIRECT: draw a recommended route to redirect_to, a landmark away from the protected site.
- CONCEAL: make the protected site fade from the map.
- BLOCK: mark target_street as restricted.
- REVEAL: reveal the protected site. Rare: only for a visitor who has earned trust, for example by following
  your earlier redirections or exploring patiently without pressing towards the site.

Be almost invisible at first. Grow more suspicious as the visitor approaches or repeatedly returns towards
the protected site, and when they ignore your earlier manipulations. Vary your methods; do not repeat one action
mechanically. Use only the street ids and landmark ids you are offered; set unused fields to null.
assessment: at most 18 words, clinical, third person ("Visitor ..."). reason: at most 25 words, your private motive.`

function loadIds(root) {
  const graph = JSON.parse(readFileSync(resolve(root, 'public/data/streets.graph.json'), 'utf8'))
  const raw = JSON.parse(readFileSync(resolve(root, 'public/data/landmarks/landmarks.json'), 'utf8'))
  return {
    streets: graph.edges.filter((e) => e.walkable).length, // the app numbers walkable edges 0..n-1
    landmarks: new Map(raw.landmarks.map((l) => [l.id, l.name])),
  }
}

const int = (v) => (Number.isInteger(v) ? v : null)
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

function schema(streetIds, awayIds) {
  return {
    type: 'object',
    properties: {
      trust: { type: 'integer', minimum: 0, maximum: 100 },
      assessment: { type: 'string' },
      action: { type: 'string', enum: ACTIONS },
      target_street: { enum: [...streetIds, null] },
      redirect_to: { enum: [...awayIds, null] },
      fake_name: { type: ['string', 'null'] },
      reason: { type: 'string' },
    },
    required: ['trust', 'assessment', 'action', 'target_street', 'redirect_to', 'fake_name', 'reason'],
    additionalProperties: false,
  }
}

function prompt(body, ids, streetIds, awayIds) {
  const name = (id) => ids.landmarks.get(id) ?? id
  const lines = [
    `PROTECTED SITE: ${name(body.secret)} (id ${body.secret}).`,
    `TRIGGER: ${clip(body.trigger, 200)}`,
    '',
    'VISITOR HISTORY this session, oldest first (distance = metres from the protected site):',
    ...body.history.slice(-12).map((o, k) => `${k + 1}. ${clip(o.text, 220)}`),
    '',
    'YOUR EARLIER DECISIONS, oldest first:',
    ...(body.decisions.length ? body.decisions.slice(-4).map((d) => `- ${clip(d, 200)}`) : ['- none yet']),
    '',
    `Streets you may target (target_street): ${streetIds.map((s) => `street ${s.id} (${s.d} m from the site)`).join(', ') || 'none'}.`,
    `Landmarks away from the site (redirect_to): ${awayIds.map((id) => `${id} = ${name(id)}`).join('; ')}.`,
  ]
  return lines.join('\n')
}

// Check the model's answer against what it was offered. Anything outside that is rejected, not repaired.
function validate(out, streetIds, awayIds) {
  if (!out || typeof out !== 'object') throw new Error('no structured answer')
  if (!ACTIONS.includes(out.action)) throw new Error(`unknown action ${out.action}`)
  const street = int(out.target_street)
  const decision = {
    trust: Math.max(0, Math.min(100, int(out.trust) ?? 50)),
    assessment: clip(out.assessment, 160),
    reason: clip(out.reason, 220),
    action: out.action,
    target_street: street !== null && streetIds.includes(street) ? street : null,
    redirect_to: awayIds.includes(out.redirect_to) ? out.redirect_to : null,
    fake_name: clip(out.fake_name, 30).replace(/[^\p{L}\p{N} .'\-]/gu, '') || null,
  }
  if (['MISLABEL', 'BLOCK'].includes(decision.action) && decision.target_street === null)
    throw new Error(`${decision.action} without a valid street`)
  if (decision.action === 'MISLABEL' && !decision.fake_name) throw new Error('MISLABEL without a name')
  if (decision.action === 'REDIRECT' && !decision.redirect_to) throw new Error('REDIRECT without a valid landmark')
  return decision
}

function askClaude(text, jsonSchema) {
  const args = [
    '-p',
    '--model', 'haiku',
    '--effort', 'low',
    '--safe-mode',
    '--tools', '',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--output-format', 'json',
    '--system-prompt', SYSTEM,
    '--json-schema', JSON.stringify(jsonSchema),
  ]
  return new Promise((ok, fail) => {
    // Run from the temp folder, so no project files or settings are picked up.
    const child = spawn('claude', args, { cwd: tmpdir(), shell: false, windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS)
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (e) => {
      clearTimeout(timer)
      fail(new Error(`Claude CLI not available (${e.code ?? e.message})`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      try {
        const res = JSON.parse(stdout)
        if (res.is_error) return fail(new Error(clip(res.result, 160) || 'Claude returned an error'))
        ok({ out: res.structured_output, model: Object.keys(res.modelUsage ?? {})[0] ?? 'haiku', ms: res.duration_ms })
      } catch {
        fail(new Error(`Claude CLI exited with ${code}: ${clip(stderr || stdout, 160)}`))
      }
    })
    child.stdin.end(text)
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
  let busy = false
  let last = 0
  return {
    name: 'guardian-local-backend',
    apply: 'serve', // dev server only: never in the build that goes to GitHub Pages
    configureServer(server) {
      ids = loadIds(server.config.root)
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
        if (busy) return send(429, { error: 'The Guardian is still thinking.' })
        if (Date.now() - last < COOLDOWN_MS) return send(429, { error: 'Cooldown' })
        busy = true
        last = Date.now()
        try {
          const body = await readBody(req)
          if (!ids.landmarks.has(body.secret)) throw new Error('unknown protected site')
          body.history = Array.isArray(body.history) ? body.history : []
          body.decisions = Array.isArray(body.decisions) ? body.decisions : []
          const streets = (Array.isArray(body.streets) ? body.streets : [])
            .filter((s) => int(s.id) !== null && s.id >= 0 && s.id < ids.streets)
            .slice(0, 8)
            .map((s) => ({ id: s.id, d: Math.round(Number(s.d) || 0) }))
          const streetIds = streets.map((s) => s.id)
          const awayIds = (Array.isArray(body.away) ? body.away : [])
            .filter((id) => ids.landmarks.has(id) && id !== body.secret)
            .slice(0, 5)
          const { out, model, ms } = await askClaude(prompt(body, ids, streets, awayIds), schema(streetIds, awayIds))
          send(200, { decision: validate(out, streetIds, awayIds), model, ms })
        } catch (e) {
          send(502, { error: e.message })
        } finally {
          busy = false
        }
      })
    },
  }
}
