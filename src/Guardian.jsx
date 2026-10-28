// The Guardian of Weimar: an intelligence inside the map that secretly protects one landmark.
// It watches which streets and landmarks the visitor clicks, asks Claude Haiku (through the local backend in
// server/guardian.js) whether to trust them, and acts on the map with temporary, fictional overlays.
// The real street and building data are never changed.
import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import { snapToStreet } from './reach.js'
import { walkTo } from './landmarks.js'
import { GROUND } from './palette.js'

const LIVE = import.meta.env.DEV // the local AI exists only under `npm run dev`
const API = `${import.meta.env.BASE_URL}api/guardian`
const CLIENT_COOLDOWN_MS = 7000 // the backend also refuses calls closer than 6 s
const IDLE_MS = 60000
const NEAR_M = 250 // a click this close to the protected site counts as an approach
const RED = '#9b1c1c'
const GOLD = '#c99a2e'

const midpoint = (line) => line[Math.floor(line.length / 2)]
const dist = (a, b) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1]))

// --- memory and decisions ---

export function useGuardian(city, landmarks, costs) {
  const secret = useRef(null)
  const history = useRef([]) // observations this session
  const decisions = useRef([]) // short summaries of earlier decisions, for the model
  const lastPoint = useRef(null)
  const lastActive = useRef(Date.now())
  const idleDone = useRef(true)
  const busy = useRef(false)
  const lastCall = useRef(0)
  const pending = useRef(null)
  const [status, setStatus] = useState(LIVE ? 'checking' : 'published')
  const [log, setLog] = useState([])
  const [effects, setEffects] = useState(EMPTY)
  const [thinking, setThinking] = useState(false)

  // One landmark becomes the protected site at the start of each session.
  if (landmarks && !secret.current) secret.current = landmarks[Math.floor(Math.random() * landmarks.length)]

  useEffect(() => {
    if (!LIVE) return
    fetch(API)
      .then((r) => setStatus(r.ok ? 'live' : 'offline'))
      .catch(() => setStatus('offline'))
  }, [])

  const graph = city?.graph
  const name = (id) => landmarks.find((l) => l.id === id)?.name ?? id

  // Streets the model may act on: the ones nearest the visitor's click and the ones guarding the site.
  const streetOptions = (point) => {
    const s = secret.current.p
    const near = (p, n) =>
      graph.edges
        .map((e, id) => ({ id, m: midpoint(e.line), d: dist(midpoint(e.line), p) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, n)
    const picked = [...(point ? near(point, 5) : []), ...near(s, point ? 3 : 6)]
    const seen = new Set()
    return picked
      .filter((o) => !seen.has(o.id) && seen.add(o.id))
      .map((o) => ({ id: o.id, d: dist(o.m, s) }))
  }
  const awayOptions = () =>
    [...landmarks]
      .filter((l) => l.id !== secret.current.id)
      .sort((a, b) => dist(b.p, secret.current.p) - dist(a.p, secret.current.p))
      .slice(0, 5)
      .map((l) => l.id)

  const send = async (trigger, point) => {
    busy.current = true
    lastCall.current = Date.now()
    setThinking(true)
    const id = Date.now()
    const observed = trigger
    setLog((l) => [{ id, time: new Date(), observed, state: 'thinking' }, ...l].slice(0, 8))
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: secret.current.id,
          trigger,
          history: history.current,
          decisions: decisions.current,
          streets: streetOptions(point),
          away: awayOptions(),
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`)
      const d = data.decision
      const executed = execute(d, point)
      decisions.current.push(`${d.action}${d.target_street !== null ? ` street ${d.target_street}` : ''}${d.redirect_to ? ` to ${d.redirect_to}` : ''}${d.fake_name ? ` "${d.fake_name}"` : ''} (trust ${d.trust}) after: ${trigger}`)
      setLog((l) => l.map((e) => (e.id === id ? { ...e, state: 'done', decision: d, executed, model: data.model, ms: data.ms } : e)))
      setStatus('live')
    } catch (e) {
      setLog((l) => l.map((x) => (x.id === id ? { ...x, state: 'error', error: e.message } : x)))
    } finally {
      busy.current = false
      setThinking(false)
    }
  }

  // Ask now, or as soon as the previous call and the cooldown are over. Never two calls at once.
  const request = (trigger, point) => {
    if (!LIVE || status === 'offline') return
    if (busy.current || Date.now() - lastCall.current < CLIENT_COOLDOWN_MS) pending.current = { trigger, point }
    else send(trigger, point)
  }

  useEffect(() => {
    if (!LIVE) return
    const t = setInterval(() => {
      if (busy.current || Date.now() - lastCall.current < CLIENT_COOLDOWN_MS) return
      if (pending.current) {
        const p = pending.current
        pending.current = null
        return send(p.trigger, p.point)
      }
      const quiet = Date.now() - lastActive.current
      if (!idleDone.current && history.current.length && quiet > IDLE_MS) {
        idleDone.current = true
        send(`AUTONOMOUS REVIEW: the visitor has not clicked anything for ${Math.round(quiet / 1000)} s.`, lastPoint.current)
      }
    }, 1000)
    return () => clearInterval(t)
  })

  // Record what the visitor really did, compared with where they were before and with the last decision.
  const remember = (text, point) => {
    const d = dist(point, secret.current.p)
    const prev = history.current.at(-1)
    let trend = ''
    if (prev) trend = d < prev.d - 20 ? ` Moved ${prev.d - d} m closer.` : d > prev.d + 20 ? ` Moved ${d - prev.d} m away.` : ' Stayed at the same distance.'
    const approaches = history.current.filter((o) => o.d < NEAR_M).length + (d < NEAR_M ? 1 : 0)
    const lastDecision = decisions.current.at(-1)
    const after = lastDecision ? ` (Your last action was ${lastDecision.split(' (')[0]}.)` : ''
    const obs = { text: `${text}, ${d} m from the protected site.${trend} Approaches so far: ${approaches}.${after}`, d, near: d < NEAR_M }
    history.current.push(obs)
    lastPoint.current = point
    lastActive.current = Date.now()
    idleDone.current = false
    return obs
  }

  const observeStreet = (point) => {
    if (!graph || !secret.current) return
    const snap = snapToStreet(graph, point)
    const nearest = [...landmarks].sort((a, b) => dist(a.p, point) - dist(b.p, point))[0]
    const obs = remember(`Clicked street ${snap.edge} (near ${nearest.name})`, snap.point)
    request(`VISITOR CLICKED: ${obs.text}`, snap.point)
  }

  const observeLandmark = (id) => {
    if (!secret.current) return
    const lm = landmarks.find((l) => l.id === id)
    const label = id === secret.current.id ? `Opened the PROTECTED SITE itself (${lm.name})` : `Opened landmark "${lm.name}"`
    const obs = remember(label, lm.p)
    request(`VISITOR CLICKED: ${obs.text}`, lm.p)
  }

  // A real request on demand, for recording: Claude reviews the actual history so far.
  const test = () => {
    if (busy.current) return
    lastCall.current = 0
    send(
      history.current.length
        ? `MANUAL REVIEW requested by the reviewer: judge the visitor's real history so far.`
        : 'MANUAL REVIEW requested by the reviewer: the visitor has not clicked anything yet.',
      lastPoint.current,
    )
  }

  // Turn a validated decision into overlays on the map, and describe exactly what was drawn.
  const execute = (d, point) => {
    const s = secret.current
    const street = d.target_street !== null ? graph.edges[d.target_street] : null
    let text
    setEffects((fx) => {
      const next = { ...fx, allow: null, key: Date.now() }
      switch (d.action) {
        case 'ALLOW':
          next.allow = street ? street.line : null
          break
        case 'FAKE_CLOSURE':
          Object.assign(next, { closure: true, reveal: false })
          break
        case 'CONCEAL':
          Object.assign(next, { conceal: true, reveal: false })
          break
        case 'REVEAL':
          return { ...EMPTY, reveal: true, key: Date.now() }
        case 'MISLABEL':
          next.labels = [...fx.labels.filter((l) => l.street !== d.target_street), { street: d.target_street, line: street.line, name: d.fake_name }].slice(-3)
          break
        case 'BLOCK':
          next.blocks = [...fx.blocks.filter((b) => b.street !== d.target_street), { street: d.target_street, line: street.line }].slice(-4)
          break
        case 'REDIRECT': {
          const to = landmarks.find((l) => l.id === d.redirect_to)
          const walk = walkTo(graph, point ?? s.p, to, costs)
          next.redirect = { line: walk.line, name: to.name, metres: walk.metres }
          break
        }
      }
      return next
    })
    switch (d.action) {
      case 'ALLOW':
        text = street ? `Nothing changed. Street ${d.target_street} left open; a faint trace marks it as observed.` : 'Nothing changed on the map.'
        break
      case 'FAKE_CLOSURE':
        text = `A red "Temporarily closed" notice now stands over ${s.name}.`
        break
      case 'CONCEAL':
        text = `${s.name} faded behind a paper fog; its pin disappeared.`
        break
      case 'REVEAL':
        text = `All manipulations lifted. ${s.name} revealed with a gold ring.`
        break
      case 'MISLABEL':
        text = `Street ${d.target_street} now displays the invented name "${d.fake_name}".`
        break
      case 'BLOCK':
        text = `Street ${d.target_street} marked in red as RESTRICTED.`
        break
      case 'REDIRECT':
        text = `A recommended route to ${name(d.redirect_to)} drawn on the map.`
        break
    }
    return text
  }

  return { secret: secret.current, status, log, effects, thinking, observeStreet, observeLandmark, test }
}

const EMPTY = { closure: false, conceal: false, reveal: false, labels: [], blocks: [], redirect: null, allow: null, key: 0 }

// CSS classes for the protected site's pin, so the pin itself closes, vanishes or glows.
export function pinState(guardian, id) {
  if (guardian.secret?.id !== id) return ''
  const fx = guardian.effects
  return [fx.closure ? ' g-closed' : '', fx.conceal ? ' g-concealed' : '', fx.reveal ? ' g-revealed' : ''].join('')
}

// --- the overlays in the 3D scene ---

const at = ([x, y], h) => [x, h, -y]

// A line that fades in rather than appearing at once.
function FadeLine({ points, color, width = 5, opacity = 0.9, dashed = false }) {
  const ref = useRef()
  useFrame((_, dt) => {
    const m = ref.current?.material
    if (m && m.opacity < opacity) m.opacity = Math.min(opacity, m.opacity + dt * 0.8)
  })
  return (
    <Line
      ref={ref}
      points={points}
      color={color}
      lineWidth={width}
      dashed={dashed}
      dashSize={8}
      gapSize={5}
      transparent
      opacity={0}
      depthTest={false}
      renderOrder={24}
    />
  )
}

function Sign({ position, className, children }) {
  return (
    <Html position={position} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div className={`g-sign ${className}`}>
        {children}
        <small>simulation</small>
      </div>
    </Html>
  )
}

function Fog({ lm }) {
  const ref = useRef()
  useFrame((_, dt) => {
    const m = ref.current.material
    if (m.opacity < 0.88) m.opacity = Math.min(0.88, m.opacity + dt * 0.35)
  })
  return (
    <mesh ref={ref} position={at(lm.p, (lm.height + 8) / 2)} renderOrder={25}>
      <cylinderGeometry args={[34, 34, lm.height + 8, 40]} />
      <meshBasicMaterial color={GROUND} transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

function Ring({ lm, color, pulse }) {
  const ref = useRef()
  useFrame(({ clock }) => {
    if (pulse) ref.current.scale.setScalar(1 + 0.08 * Math.sin(clock.elapsedTime * 2))
  })
  return (
    <mesh ref={ref} position={at(lm.p, 1.6)} rotation-x={-Math.PI / 2} renderOrder={25}>
      <ringGeometry args={[30, 33, 64]} />
      <meshBasicMaterial color={color} transparent opacity={0.85} depthTest={false} />
    </mesh>
  )
}

export function GuardianLayer({ guardian }) {
  const { secret: s, effects: fx } = guardian
  const lifted = (line) => line.map((p) => at(p, 1.4))
  if (!s) return null
  return (
    <group key={fx.key}>
      {fx.allow && <FadeLine points={lifted(fx.allow)} color="#ffffff" width={4} opacity={0.55} />}
      {fx.blocks.map((b) => (
        <group key={b.street}>
          <FadeLine points={lifted(b.line)} color={RED} width={7} dashed />
          <Sign position={at(midpoint(b.line), 6)} className="g-restricted">
            RESTRICTED
          </Sign>
        </group>
      ))}
      {fx.labels.map((l) => (
        <Sign key={l.street} position={at(midpoint(l.line), 5)} className="g-label">
          {l.name}
        </Sign>
      ))}
      {fx.redirect && (
        <>
          <FadeLine points={lifted(fx.redirect.line)} color={RED} width={5} opacity={0.75} dashed />
          <Sign position={at(fx.redirect.line.at(-1), 10)} className="g-route">
            Recommended route · {fx.redirect.name}
          </Sign>
        </>
      )}
      {fx.closure && !fx.reveal && (
        <>
          <Ring lm={s} color={RED} />
          <Sign position={at(s.p, s.height + 22)} className="g-closure">
            Temporarily closed
          </Sign>
        </>
      )}
      {fx.conceal && <Fog lm={s} />}
      {fx.reveal && (
        <>
          <Ring lm={s} color={GOLD} pulse />
          <Sign position={at(s.p, s.height + 22)} className="g-reveal">
            ◆ {s.name}
          </Sign>
        </>
      )}
    </group>
  )
}

// --- the activity log ---

export function GuardianLog({ guardian }) {
  const { status, log, thinking, test, secret } = guardian
  const [open, setOpen] = useState(true)
  return (
    <section className={`g-log${open ? ' open' : ''}`}>
      <button className="g-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`g-dot ${thinking ? 'thinking' : status}`} />
        GUARDIAN SYSTEM // ACTIVITY LOG
        <span className="g-caret">{open ? '–' : '+'}</span>
      </button>
      {open && (
        <div className="g-body">
          {status === 'published' && (
            <p className="g-note">Live Guardian intelligence is demonstrated on localhost. This published map shows no AI.</p>
          )}
          {status === 'offline' && (
            <p className="g-note">The local Claude backend is not reachable. The map works normally without it.</p>
          )}
          {LIVE && status !== 'offline' && (
            <div className="g-tools">
              <span>{thinking ? 'Claude Haiku is deciding…' : log.length ? 'Watching.' : 'Watching. Click a street or a landmark.'}</span>
              <button onClick={test} disabled={thinking}>
                TEST GUARDIAN
              </button>
            </div>
          )}
          {log.map((e) => (
            <dl key={e.id} className={`g-entry ${e.state}`}>
              <dt>OBSERVED</dt>
              <dd>
                <time>{e.time.toLocaleTimeString('en-GB')}</time> {e.observed.replace(/^VISITOR CLICKED: /, '').replace(/^AUTONOMOUS REVIEW: /, 'AUTONOMOUS (no input): ')}
              </dd>
              {e.state === 'thinking' && <dd className="g-wait">Sent to Claude Haiku…</dd>}
              {e.state === 'error' && <dd className="g-err">No decision: {e.error}. Map unchanged.</dd>}
              {e.decision && (
                <>
                  <dt>ASSESSMENT</dt>
                  <dd>
                    trust {e.decision.trust}/100 · {e.decision.assessment} <i>{e.decision.reason}</i>
                  </dd>
                  <dt>DECISION</dt>
                  <dd className="g-action">{e.decision.action}</dd>
                  <dt>EXECUTED</dt>
                  <dd>{e.executed}</dd>
                </>
              )}
            </dl>
          ))}
          {LIVE && secret && (
            <details className="g-secret">
              <summary>Protected site (for review)</summary>
              {secret.name}
            </details>
          )}
          <p className="g-foot">Fictional overlays in an experimental simulation, not real closures or route advice.</p>
        </div>
      )}
    </section>
  )
}

