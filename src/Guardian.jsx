// The Guardian of Weimar: an intelligence inside the map that secretly protects one landmark.
// It watches which streets and landmarks the visitor clicks, asks Claude Haiku (through the local backend in
// server/guardian.js) whether to trust them, and acts on the map with temporary, fictional overlays.
// The real street and building data are never changed.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { snapToStreet, walkTree } from './reach.js'
import { walkTo } from './landmarks.js'
import { hideBuildings, roadGeometry, toShape } from './cityGeometry.js'
import { ROOFS, USE_COLOR } from './palette.js'

const LIVE = import.meta.env.DEV // the local AI exists only under `npm run dev`
const API = `${import.meta.env.BASE_URL}api/guardian`
const CLIENT_COOLDOWN_MS = 0 // no waiting: a click goes to Claude at once unless a call is already running
const IDLE_MS = 60000
const NEAR_M = 250 // a click this close to the protected site counts as an approach
export const RED = '#e3122b' // reserved for the Guardian's interference
const GOLD = '#c99a2e'

const midpoint = (line) => line[Math.floor(line.length / 2)]
const dist = (a, b) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1]))
const ease = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
// One frame of a transition from 0 to 1 that lasts `secs`, or back to 0 while the city is being restored.
const step = (t, dt, back, secs) => (back ? Math.max(0, t - dt / secs) : Math.min(1, t + Math.min(dt, 0.1) / secs))

// --- geometry for the physical transformations (worked out by the app, never by the model) ---

// The nearest point `q` of a line to point p, and its distance `d`.
function closest([x, y], line) {
  let best = { d: Infinity, q: line[0] }
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1]
    const [x1, y1] = line[i]
    const L = (x1 - x0) ** 2 + (y1 - y0) ** 2
    const t = L ? Math.max(0, Math.min(1, ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / L)) : 0
    const q = [x0 + t * (x1 - x0), y0 + t * (y1 - y0)]
    const d = Math.hypot(x - q[0], y - q[1])
    if (d < best.d) best = { d, q }
  }
  return best
}

// The point halfway along a line, and the line's direction there (radians, in plan).
function halfway(line) {
  const seg = line.slice(1).map((p, i) => Math.hypot(p[0] - line[i][0], p[1] - line[i][1]))
  let left = seg.reduce((a, b) => a + b, 0) / 2
  let i = 0
  while (i < seg.length - 1 && left > seg[i]) left -= seg[i++]
  const [x0, y0] = line[i]
  const [x1, y1] = line[i + 1] ?? line[i]
  const t = seg[i] ? left / seg[i] : 0
  return { p: [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t], angle: Math.atan2(y1 - y0, x1 - x0) }
}

// A real building standing 2–15 m from the street and small enough to slide into it, or null.
// Landmark buildings and buildings already moved are skipped.
function buildingBeside(buildings, line, skip) {
  const [mx, my] = halfway(line).p
  let best = null
  buildings.forEach((b, i) => {
    const [x0, y0, x1, y1] = b.bbox
    if (skip.has(i) || x1 - x0 > 40 || y1 - y0 > 40) return
    if (x1 < mx - 60 || x0 > mx + 60 || y1 < my - 60 || y0 > my + 60) return
    const d = Math.min(...b.polygon[0].map((v) => closest(v, line).d))
    if (d >= 2 && d <= 15 && (!best || d < best.d)) best = { i, d }
  })
  return best?.i ?? null
}

// How far a building slides: its corner nearest the street ends 3 m past the street's centre line.
function slideInto(b, line) {
  let best = null
  for (const v of b.polygon[0]) {
    const c = closest(v, line)
    if (!best || c.d < best.d) best = { ...c, v }
  }
  const k = (best.d + 3) / best.d
  return { offset: [(best.q[0] - best.v[0]) * k, (best.q[1] - best.v[1]) * k], metres: Math.round(best.d + 3) }
}

// The shortest connected way between the two ends of a street that avoids every obstructed street,
// on the real pedestrian network. Null if the street cannot be walked around.
function detour(graph, k, blocked) {
  const e = graph.edges[k]
  const costs = graph.edges.map((x, j) => (blocked.has(j) ? Infinity : x.length))
  const { dist: d, prev } = walkTree(graph, [[e.a, 0]], costs)
  if (!Number.isFinite(d[e.b]) || e.a === e.b) return null
  const lines = []
  for (let v = e.b; prev[v] !== -1; v = prev[v]) {
    const u = prev[v]
    const j = graph.nodes[v].edges
      .filter((j) => !blocked.has(j) && [graph.edges[j].a, graph.edges[j].b].includes(u))
      .sort((p, q) => costs[p] - costs[q])[0]
    const line = graph.edges[j].line
    lines.unshift(graph.edges[j].a === u ? line : [...line].reverse())
  }
  return { lines, metres: Math.round(d[e.b]) }
}

const obstructed = (fx) => new Set([...fx.blocks, ...fx.barriers, ...fx.moved].map((x) => x.street))

// The city's current fictional state, in words, so the model knows what it has already done.
function describeCity(fx) {
  const parts = [
    ...fx.moved.map((m) => `building ${m.building} pushed into street ${m.street}`),
    ...fx.barriers.map((b) => `barrier across street ${b.street}`),
    ...fx.detours.map((d) => `detour road around street ${d.street}`),
    ...fx.blocks.map((b) => `street ${b.street} marked restricted`),
    ...fx.labels.map((l) => `street ${l.street} renamed "${l.name}"`),
    fx.closure && 'protected site shown as closed',
    fx.conceal && 'protected site concealed',
    fx.reveal && 'protected site revealed',
    fx.redirect && `route drawn to ${fx.redirect.name}`,
  ].filter(Boolean)
  return parts.join('; ')
}

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
  const effectsRef = useRef(EMPTY) // the same, readable at once inside a decision
  const restoreTimer = useRef(null)
  const [thinking, setThinking] = useState(false)
  // Landmark buildings have their own illustrated models, so they never move.
  const fixed = useMemo(() => new Set(landmarks?.flatMap((lm) => lm.facadeParts) ?? []), [landmarks])

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
    const skip = new Set([...fixed, ...effectsRef.current.moved.map((m) => m.building)])
    // Each street also offers the one real building beside it that could be slid into it.
    return picked
      .filter((o) => !seen.has(o.id) && seen.add(o.id))
      .map((o) => ({
        id: o.id,
        d: dist(o.m, s),
        b: buildingBeside(city.buildings, graph.edges[o.id].line, skip),
        // whether the network offers a way around this street, so a detour is possible
        w: detour(graph, o.id, new Set([...obstructed(effectsRef.current), o.id])) !== null,
      }))
  }
  const awayOptions = () =>
    [...landmarks]
      .filter((l) => l.id !== secret.current.id)
      .sort((a, b) => dist(b.p, secret.current.p) - dist(a.p, secret.current.p))
      .slice(0, 5)
      .map((l) => l.id)

  const send = async (trigger, point) => {
    const t0 = performance.now() // the click (send starts in the same event)
    busy.current = true
    lastCall.current = Date.now()
    setThinking(true)
    const id = Date.now()
    const observed = trigger
    setLog((l) => [{ id, time: new Date(), observed, state: 'thinking' }, ...l].slice(0, 8))
    let retry = 0
    try {
      const body = JSON.stringify({
        secret: secret.current.id,
        trigger,
        history: history.current,
        decisions: decisions.current,
        state: describeCity(effectsRef.current),
        streets: streetOptions(point),
        away: awayOptions(),
      })
      const prep = performance.now() - t0
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      // Another tab (or the idle review) is using Claude right now: wait for it, then try again.
      if (r.status === 429) {
        setLog((l) => l.filter((e) => e.id !== id))
        pending.current ??= { trigger, point }
        retry = 800
        return
      }
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`)
      const answered = performance.now()
      const d = data.decision
      const executed = execute(d, point) // the transformation starts animating on the next frame
      const applied = performance.now()
      decisions.current.push(`${d.action}${d.target_street !== null ? ` street ${d.target_street}` : ''}${d.redirect_to ? ` to ${d.redirect_to}` : ''}${d.fake_name ? ` "${d.fake_name}"` : ''} (trust ${d.trust})`)
      // Measure when the map has actually drawn the change: two frames after the state update.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const timing = { ...data.timing, prep_ms: Math.round(prep), http_ms: Math.round(answered - t0 - prep), apply_ms: Math.round(applied - answered), draw_ms: Math.round(performance.now() - applied), total_ms: Math.round(performance.now() - t0) }
          setLog((l) => l.map((e) => (e.id === id ? { ...e, timing } : e)))
        }),
      )
      setLog((l) => l.map((e) => (e.id === id ? { ...e, state: 'done', decision: d, executed, model: data.model, ms: data.ms } : e)))
      setStatus('live')
    } catch (e) {
      setLog((l) => l.map((x) => (x.id === id ? { ...x, state: 'error', error: e.message } : x)))
    } finally {
      busy.current = false
      setThinking(false)
      // A click that came in while Claude was busy goes out at once.
      if (pending.current) {
        const p = pending.current
        pending.current = null
        setTimeout(() => send(p.trigger, p.point), retry)
      }
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

  // The visitor searched for the protected site. Claude decides how the search answers; this returns what the
  // search bar and the map should show. Ordinary searches never come here and never call Claude.
  const searchSecret = async (query, from) => {
    while (busy.current) await new Promise((r) => setTimeout(r, 200)) // never two calls at once
    const s = secret.current
    const t0 = performance.now()
    const obs = remember(`Searched for "${query.slice(0, 60)}", the protected site by name`, from)
    busy.current = true
    lastCall.current = Date.now()
    setThinking(true)
    const id = Date.now()
    setLog((l) => [{ id, time: new Date(), observed: `SEARCH "${query.slice(0, 60)}": matches the protected site`, state: 'thinking' }, ...l].slice(0, 8))
    try {
      const body = JSON.stringify({
        kind: 'search',
        secret: s.id,
        trigger: `VISITOR SEARCHED: ${obs.text}`,
        history: history.current,
        decisions: decisions.current,
        state: describeCity(effectsRef.current),
        streets: [],
        away: awayOptions(),
      })
      let r
      for (let k = 0; k < 40; k++) {
        r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
        if (r.status !== 429) break
        await new Promise((ok) => setTimeout(ok, 800)) // another tab is using Claude: wait for it
      }
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`)
      const d = data.decision
      const { result, text } = searchOutcome(d, from, query)
      decisions.current.push(`SEARCH ${d.action}${d.redirect_to ? ` to ${d.redirect_to}` : ''} (trust ${d.trust})`)
      const timing = { ...data.timing, total_ms: Math.round(performance.now() - t0) }
      setLog((l) => l.map((e) => (e.id === id ? { ...e, state: 'done', decision: d, executed: text, timing } : e)))
      return result
    } catch (e) {
      setLog((l) => l.map((x) => (x.id === id ? { ...x, state: 'error', error: e.message } : x)))
      return { error: e.message }
    } finally {
      busy.current = false
      setThinking(false)
    }
  }

  // What a search decision shows. Everything except ALLOW is fictional and drawn in red.
  const searchOutcome = (d, from, query) => {
    const s = secret.current
    const to = landmarks.find((l) => l.id === d.redirect_to)
    const key = Date.now()
    const route = (lm) => walkTo(graph, from, lm, costs)
    const m = (w) => Math.round(w.metres / 10) * 10
    switch (d.action) {
      case 'ALLOW': {
        const w = route(s)
        return {
          result: { color: 'blue', id: s.id, title: s.name, sub: s.address, line: w.line, metres: w.metres, marker: s.p, focus: s.p, key },
          text: `Search answered truthfully: ${s.name} and its real ${m(w)} m route shown in blue.`,
        }
      }
      case 'NOT_FOUND': {
        // A wide red pulse near the site, centred away from it so its exact position stays hidden; then it is unlisted.
        const a = Math.random() * Math.PI * 2
        const centre = [s.p[0] + Math.cos(a) * 90, s.p[1] + Math.sin(a) * 90]
        effectsRef.current = { ...effectsRef.current, unlisted: true }
        setEffects(effectsRef.current)
        return {
          result: { notFound: true, query, pulse: { centre, radius: 220 }, focus: centre, key },
          text: 'Search answered "No results found". A wide area near the site pulsed red (not its exact position); its pin and list entry were hidden.',
        }
      }
      case 'FAKE_LOCATION':
        return {
          result: { color: 'red', title: s.name, sub: s.address, marker: to.p, focus: to.p, key },
          text: `Search placed ${s.name} at the location of ${to.name}, ${dist(to.p, s.p)} m from where it really is.`,
        }
      case 'FALSE_ROUTE': {
        const w = route(to)
        return {
          result: { color: 'red', title: s.name, sub: s.address, line: w.line, metres: w.metres, marker: to.p, focus: w.line[Math.floor(w.line.length / 2)], key },
          text: `Search drew a misleading red route of ${m(w)} m labelled "${s.name}" that leads to ${to.name}.`,
        }
      }
      case 'REDIRECT': {
        const w = route(to)
        return {
          result: { color: 'red', id: to.id, title: to.name, sub: `Showing ${to.name} instead of "${query.slice(0, 40)}"`, line: w.line, metres: w.metres, marker: to.p, focus: to.p, key },
          text: `Search swapped the result: ${to.name} suggested instead, with a red route of ${m(w)} m.`,
        }
      }
    }
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

  // Turn a validated decision into changes on the map, and describe exactly what was changed.
  // The model decides what and why; the app works out the geometry: where a building slides, the detour's route.
  const execute = (d, point) => {
    const s = secret.current
    const fx = effectsRef.current
    const street = d.target_street !== null ? graph.edges[d.target_street] : null
    const next = { ...fx, allow: null }
    let text
    let focus = street ? halfway(street.line).p : s.p // where the camera turns to look
    switch (d.action) {
      case 'ALLOW':
        next.allow = street ? { line: street.line, key: Date.now() } : null
        text = street ? `Nothing changed. Street ${d.target_street} left open; a faint trace marks it as observed.` : 'Nothing changed on the map.'
        break
      case 'FAKE_CLOSURE':
        Object.assign(next, { closure: true, reveal: false })
        text = `A red "Temporarily closed" notice now stands over ${s.name}.`
        break
      case 'CONCEAL':
        Object.assign(next, { conceal: true, reveal: false })
        text = `${s.name} flashed red and vanished, leaving only a red outline of its footprint; it left the pins and the landmark list too.`
        break
      case 'REVEAL': {
        const physical = fx.moved.length + fx.barriers.length + fx.detours.length
        Object.assign(next, { ...EMPTY, reveal: true, moved: fx.moved, barriers: fx.barriers, detours: fx.detours, restoring: physical > 0 })
        text = `All manipulations lifted${physical ? ' and the city restored' : ''}. ${s.name} revealed with a gold ring.`
        break
      }
      case 'MISLABEL':
        next.labels = [...fx.labels.filter((l) => l.street !== d.target_street), { street: d.target_street, line: street.line, name: d.fake_name }].slice(-3)
        text = `Street ${d.target_street} now displays the invented name "${d.fake_name}".`
        break
      case 'BLOCK':
        next.blocks = [...fx.blocks.filter((b) => b.street !== d.target_street), { street: d.target_street, line: street.line }].slice(-4)
        text = `Street ${d.target_street} marked in red as RESTRICTED.`
        break
      case 'REDIRECT': {
        const to = landmarks.find((l) => l.id === d.redirect_to)
        const walk = walkTo(graph, point ?? s.p, to, costs)
        // the visitor's own way towards the protected site turns red; the imposed route glows beside it
        const original = walkTo(graph, point ?? s.p, s, costs).line
        next.redirect = { line: walk.line, original, name: to.name, metres: walk.metres }
        focus = walk.line[Math.floor(walk.line.length / 2)]
        text = `The way towards the site turned red; a glowing route to ${name(d.redirect_to)} took its place.`
        break
      }
      case 'MOVE_BUILDING': {
        const b = city.buildings[d.target_building]
        const { offset, metres } = slideInto(b, street.line)
        next.moved = [...fx.moved, { building: d.target_building, street: d.target_street, offset }].slice(-3)
        focus = [(b.bbox[0] + b.bbox[2]) / 2 + offset[0], (b.bbox[1] + b.bbox[3]) / 2 + offset[1]]
        text = `Building ${d.target_building} (${b.use}, ${Math.round(b.height)} m tall) slid ${metres} m into street ${d.target_street} and now obstructs it.`
        break
      }
      case 'RAISE_BARRIER':
        next.barriers = [...fx.barriers.filter((b) => b.street !== d.target_street), { street: d.target_street, line: street.line }].slice(-4)
        text = `A barrier rose out of street ${d.target_street} and closes it.`
        break
      case 'CREATE_DETOUR': {
        let closed = ''
        if (!obstructed(fx).has(d.target_street)) {
          next.barriers = [...fx.barriers, { street: d.target_street, line: street.line }].slice(-4)
          closed = ' by a new barrier'
        }
        const route = detour(graph, d.target_street, obstructed(next))
        if (route) {
          next.detours = [...fx.detours.filter((x) => x.street !== d.target_street), { street: d.target_street, ...route }].slice(-2)
          text = `Street ${d.target_street} closed${closed}; a fictional detour road of ${route.metres} m grew around it along ${route.lines.length} connected street segments.`
        } else text = `Street ${d.target_street} closed${closed}; the network offers no connected way around it, so no detour was drawn.`
        break
      }
      case 'RESTORE_CITY': {
        next.restoring = true
        const [m, b, r] = [fx.moved.length, fx.barriers.length, fx.detours.length]
        text = describeCity(fx)
          ? `City restored: ${m} building(s) slid back, ${b} barrier(s) sank, ${r} detour(s) dissolved; all signs removed.`
          : 'Nothing to restore; the city was untouched.'
        break
      }
    }
    next.focus = ['ALLOW', 'RESTORE_CITY'].includes(d.action) ? null : { p: focus, key: Date.now() }
    effectsRef.current = next
    setEffects(next)
    // After the reverse animations have played, the fictional changes are gone for good.
    if (next.restoring) {
      clearTimeout(restoreTimer.current)
      restoreTimer.current = setTimeout(() => {
        effectsRef.current = { ...EMPTY, reveal: d.action === 'REVEAL' }
        setEffects(effectsRef.current)
      }, 2000)
    }
    return text
  }

  return { secret: secret.current, status, log, effects, thinking, observeStreet, observeLandmark, test, searchSecret }
}

const EMPTY = {
  closure: false, conceal: false, reveal: false, labels: [], blocks: [], redirect: null, allow: null,
  moved: [], barriers: [], detours: [], restoring: false, focus: null, unlisted: false,
}

// CSS classes for the protected site's pin, so the pin itself closes, vanishes or glows.
export function pinState(guardian, id) {
  if (guardian.secret?.id !== id) return ''
  const fx = guardian.effects
  return [fx.closure ? ' g-closed' : '', fx.conceal || fx.unlisted ? ' g-concealed' : '', fx.reveal ? ' g-revealed' : ''].join('')
}

// --- the overlays in the 3D scene ---
// Red is reserved for the Guardian: everything it touches glows red, intensely for the first seconds.

const at = ([x, y], h) => [x, h, -y]
export const FLASH_S = 4.5 // seconds of intense glow after each action; a calmer pulse stays afterwards
export const glowAt = (t) => (t < FLASH_S ? 1 : 0.55) * (0.6 + 0.4 * Math.sin(t * 6))

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

// A street, route or outline that glows red: a solid core and a wide pulsing halo, drawn over the buildings.
export function GlowLine({ points, width = 6, dashed = false, restoring = false }) {
  const core = useRef()
  const halo = useRef()
  const born = useRef(null)
  const shown = useRef(0)
  useFrame(({ clock }, dt) => {
    born.current ??= clock.elapsedTime
    const t = clock.elapsedTime - born.current
    shown.current = step(shown.current, dt, restoring, 1.2)
    const k = ease(shown.current)
    if (core.current) core.current.material.opacity = 0.95 * k
    if (halo.current) halo.current.material.opacity = 0.42 * glowAt(t) * k
  })
  return (
    <>
      <Line ref={halo} points={points} color={RED} lineWidth={width * 3.2} transparent opacity={0} depthTest={false} renderOrder={23} />
      <Line ref={core} points={points} color={RED} lineWidth={width} dashed={dashed} dashSize={8} gapSize={5} transparent opacity={0} depthTest={false} renderOrder={24} />
    </>
  )
}

const ring = (polygon, h, [dx, dy] = [0, 0]) => polygon[0].map(([x, y]) => [x + dx, h, -(y + dy)])

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

// A red perimeter around a landmark: a ring that pulses, with a wide halo.
function Perimeter({ lm, color = RED, restoring = false }) {
  const solid = useRef()
  const halo = useRef()
  const born = useRef(null)
  const shown = useRef(0)
  useFrame(({ clock }, dt) => {
    born.current ??= clock.elapsedTime
    const t = clock.elapsedTime - born.current
    shown.current = step(shown.current, dt, restoring, 1.2)
    const k = ease(shown.current)
    solid.current.material.opacity = 0.9 * k
    halo.current.material.opacity = 0.35 * glowAt(t) * k
    halo.current.scale.setScalar(1 + 0.06 * Math.sin(t * 4))
  })
  return (
    <group position={at(lm.p, 1.6)} rotation-x={-Math.PI / 2}>
      <mesh ref={halo} renderOrder={24}>
        <ringGeometry args={[27, 40, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0} depthTest={false} />
      </mesh>
      <mesh ref={solid} renderOrder={25}>
        <ringGeometry args={[31, 34, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0} depthTest={false} />
      </mesh>
    </group>
  )
}

// The extruded footprint of a building, in the same position as the city mesh draws it.
function useExtrusion(b) {
  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(toShape(b.polygon), { depth: Math.max(b.height, 0.1), bevelEnabled: false })
    g.rotateX(-Math.PI / 2)
    return g
  }, [b])
  useEffect(() => () => geo.dispose(), [geo])
  return geo
}

// A real building, slid out of its plot into a street. The merged city mesh can't move one building, so the
// building is folded away there and this exact copy of it slides instead; restoring slides it back.
// It glows red while it moves; a red outline of its footprint and a trail stay where it stood.
function MovedBuilding({ b, i, offset, restoring, gradient }) {
  const geo = useExtrusion(b)
  const edges = useMemo(() => new THREE.EdgesGeometry(geo, 30), [geo])
  useEffect(() => () => edges.dispose(), [edges])
  const ref = useRef()
  const walls = useRef()
  const t = useRef(0)
  const born = useRef(null)
  useFrame(({ clock }, dt) => {
    born.current ??= clock.elapsedTime
    t.current = step(t.current, dt, restoring, 1.8)
    const k = ease(t.current)
    ref.current.position.set(offset[0] * k, 0, -offset[1] * k)
    const g = glowAt(clock.elapsedTime - born.current)
    walls.current.emissiveIntensity = clock.elapsedTime - born.current < FLASH_S ? 0.9 * g : 0.3 * g
  })
  const [cx, cy] = [(b.bbox[0] + b.bbox[2]) / 2, (b.bbox[1] + b.bbox[3]) / 2]
  return (
    <>
      <group ref={ref}>
        {/* the same colours as in the city: the roof (the extrusion's caps) and the walls (its sides), tinted red */}
        <mesh geometry={geo}>
          <meshToonMaterial attach="material-0" color={ROOFS[((i * 7919) % 13) % ROOFS.length]} emissive={RED} emissiveIntensity={0.25} gradientMap={gradient} />
          <meshToonMaterial ref={walls} attach="material-1" color={USE_COLOR[b.use] ?? USE_COLOR.none} emissive={RED} gradientMap={gradient} />
        </mesh>
        <lineSegments geometry={edges}>
          <lineBasicMaterial color={RED} />
        </lineSegments>
        <GlowLine points={ring(b.polygon, b.height + 0.3)} width={4} restoring={restoring} />
      </group>
      <GlowLine points={ring(b.polygon, 0.5)} width={3} dashed restoring={restoring} />
      <GlowLine points={[at([cx, cy], 1), at([cx + offset[0], cy + offset[1]], 1)]} width={3} dashed restoring={restoring} />
    </>
  )
}

// A landmark that vanishes: its real model is hidden, a red copy flashes and glows, then sinks and fades,
// leaving a red outline of the footprint.
function Vanish({ lm, buildings }) {
  const parts = lm.facadeParts.map((k) => buildings[k])
  const ghosts = useRef([])
  const born = useRef(null)
  useFrame(({ clock }) => {
    born.current ??= clock.elapsedTime
    const t = clock.elapsedTime - born.current
    const fade = Math.max(0, Math.min(1, (t - 1.2) / 1.8)) // flash for 1.2 s, then fade over 1.8 s
    ghosts.current.forEach((m) => {
      if (!m) return
      m.material.opacity = (1 - fade) * (0.55 + 0.4 * Math.sin(t * 14))
      m.scale.y = Math.max(0.001, 1 - ease(fade))
      m.visible = fade < 1
    })
  })
  return (
    <>
      {parts.map((b, k) => (
        <Ghost key={k} b={b} ref={(m) => (ghosts.current[k] = m)} />
      ))}
      {parts.map((b, k) => (
        <GlowLine key={k} points={ring(b.polygon, 0.5)} width={4} />
      ))}
    </>
  )
}

function Ghost({ b, ref }) {
  const geo = useExtrusion(b)
  return (
    <mesh ref={ref} geometry={geo} renderOrder={22}>
      <meshBasicMaterial color={RED} transparent opacity={0.9} depthWrite={false} />
    </mesh>
  )
}

// A barrier that rises out of the street at its middle, across its whole width.
function Barrier({ line, restoring }) {
  const { p, angle } = useMemo(() => halfway(line), [line])
  const ref = useRef()
  const t = useRef(0)
  useFrame((_, dt) => {
    t.current = step(t.current, dt, restoring, 1.5)
    ref.current.scale.y = Math.max(0.001, ease(t.current))
  })
  // Local x runs along the street, local z across it.
  return (
    <group position={[p[0], 0, -p[1]]} rotation-y={angle}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.18} renderOrder={9}>
        <planeGeometry args={[10, 8]} />
        <meshBasicMaterial color={RED} transparent opacity={0.55} depthWrite={false} polygonOffset polygonOffsetFactor={-9} polygonOffsetUnits={-9} />
      </mesh>
      <group ref={ref}>
        <mesh position-y={2.5}>
          <boxGeometry args={[0.8, 5, 8]} />
          <meshLambertMaterial color={RED} emissive={RED} emissiveIntensity={0.35} />
        </mesh>
        {[-2.6, 0, 2.6].map((z) => (
          <mesh key={z} position={[0, 3.2, z]}>
            <boxGeometry args={[0.85, 0.7, 1.2]} />
            <meshLambertMaterial color="#f4efe6" />
          </mesh>
        ))}
        {[-4.2, 4.2].map((z) => (
          <mesh key={z} position={[0, 3.5, z]}>
            <boxGeometry args={[1, 7, 1]} />
            <meshLambertMaterial color="#2b2622" />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// A fictional road that grows segment by segment along the detour and glows red.
function Detour({ route, restoring }) {
  const geos = useMemo(() => route.lines.map((l) => roadGeometry([l], 4.4, 0.16)), [route])
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos])
  const refs = useRef([])
  const t = useRef(0)
  const total = geos.length * 0.12 + 0.6 // seconds until the last segment is fully there
  useFrame((_, dt) => {
    t.current = restoring ? Math.max(0, t.current - (dt * total) / 1.5) : Math.min(total, t.current + Math.min(dt, 0.1))
    refs.current.forEach((m, k) => m && (m.material.opacity = 0.75 * Math.max(0, Math.min(1, (t.current - k * 0.12) / 0.6))))
  })
  return (
    <>
      {geos.map((g, k) => (
        <mesh key={k} ref={(m) => (refs.current[k] = m)} geometry={g} renderOrder={10}>
          <meshBasicMaterial color={RED} transparent opacity={0} depthWrite={false} polygonOffset polygonOffsetFactor={-10} polygonOffsetUnits={-10} />
        </mesh>
      ))}
      <GlowLine points={route.lines.flat().map((p) => at(p, 1.2))} width={4} restoring={restoring} />
      {!restoring && (
        <Sign position={at(halfway(route.lines[Math.floor(route.lines.length / 2)]).p, 6)} className="g-route">
          Detour
        </Sign>
      )}
    </>
  )
}

// After each action, the camera glides a little towards the affected place (not at street level, where it would
// fight the walk), and comes somewhat closer if it is far away.
export function CameraFocus({ focus, streetView }) {
  const { camera } = useThree()
  const controls = useThree((s) => s.controls)
  const move = useRef(null)
  useEffect(() => {
    if (!focus || !controls || streetView) return
    const goal = new THREE.Vector3(focus.p[0], 0, -focus.p[1])
    const dist = camera.position.distanceTo(controls.target)
    move.current = {
      t: 0,
      fromT: controls.target.clone(),
      fromP: camera.position.clone(),
      shift: goal.sub(controls.target).multiplyScalar(0.9),
      zoom: dist > 700 ? 0.65 : 1,
    }
  }, [focus?.key]) // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, dt) => {
    const m = move.current
    if (!m || !controls) return
    m.t = Math.min(1, m.t + Math.min(dt, 0.1) / 1.4)
    const k = ease(m.t)
    const target = m.fromT.clone().addScaledVector(m.shift, k)
    const offset = m.fromP.clone().sub(m.fromT).multiplyScalar(1 + (m.zoom - 1) * k)
    controls.target.copy(target)
    camera.position.copy(target).add(offset)
    controls.update()
    if (m.t === 1) move.current = null
  })
  return null
}

export function GuardianLayer({ guardian, buildings, geometry, ranges, gradient, streetView }) {
  const { secret: s, effects: fx } = guardian
  const lifted = (line) => line.map((p) => at(p, 1.4))

  // Fold moved buildings away in the merged city mesh, and put them back exactly as they were on restore.
  const saved = useRef(new Map())
  useEffect(() => {
    const want = new Set(fx.moved.map((m) => m.building))
    const pos = geometry.attributes.position.array
    for (const i of want) {
      if (saved.current.has(i)) continue
      const [start, n] = ranges[i]
      saved.current.set(i, pos.slice(start * 3, (start + n) * 3))
      hideBuildings(geometry, ranges, [i])
    }
    for (const [i, copy] of saved.current) {
      if (want.has(i)) continue
      pos.set(copy, ranges[i][0] * 3)
      saved.current.delete(i)
      geometry.attributes.position.needsUpdate = true
    }
  }, [fx.moved, geometry, ranges])

  if (!s) return null
  return (
    <group>
      <CameraFocus focus={fx.focus} streetView={streetView} />
      {fx.moved.map((m) => (
        <MovedBuilding key={m.building} b={buildings[m.building]} i={m.building} offset={m.offset} restoring={fx.restoring} gradient={gradient} />
      ))}
      {fx.barriers.map((b) => (
        <group key={b.street}>
          <Barrier line={b.line} restoring={fx.restoring} />
          <GlowLine points={lifted(b.line)} restoring={fx.restoring} />
        </group>
      ))}
      {fx.detours.map((d) => (
        <Detour key={d.street} route={d} restoring={fx.restoring} />
      ))}
      {fx.allow && <FadeLine key={fx.allow.key} points={lifted(fx.allow.line)} color="#ffffff" width={4} opacity={0.55} />}
      {fx.blocks.map((b) => (
        <group key={b.street}>
          <GlowLine points={lifted(b.line)} width={7} />
          <Sign position={at(midpoint(b.line), 6)} className="g-restricted">
            RESTRICTED
          </Sign>
        </group>
      ))}
      {fx.labels.map((l) => (
        <group key={l.street}>
          <GlowLine points={lifted(l.line)} width={6} />
          <Sign position={at(midpoint(l.line), 5)} className="g-label">
            {l.name}
          </Sign>
        </group>
      ))}
      {fx.redirect && (
        <group key={fx.redirect.name}>
          <FadeLine points={lifted(fx.redirect.original)} color={RED} width={3} opacity={0.7} dashed />
          <GlowLine points={lifted(fx.redirect.line)} width={6} />
          <Sign position={at(fx.redirect.line.at(-1), 10)} className="g-route">
            Recommended route · {fx.redirect.name}
          </Sign>
        </group>
      )}
      {fx.closure && !fx.reveal && (
        <>
          <Perimeter lm={s} />
          <Sign position={at(s.p, s.height + 22)} className="g-closure">
            Temporarily closed
          </Sign>
        </>
      )}
      {fx.conceal && <Vanish lm={s} buildings={buildings} />}
      {fx.reveal && (
        <>
          <Perimeter lm={s} color={GOLD} />
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
                    trust {e.decision.trust}/100 · {e.decision.reason}
                  </dd>
                  <dt>DECISION</dt>
                  <dd className="g-action">{e.decision.action}</dd>
                  <dt>EXECUTED</dt>
                  <dd>{e.executed}</dd>
                  {e.timing && (
                    <>
                      <dt>TIME</dt>
                      <dd className="g-time" title={Object.entries(e.timing).map(([k, v]) => `${k}: ${v}`).join(', ')}>
                        {(e.timing.total_ms / 1000).toFixed(1)} s from click to map change
                        {e.timing.model_ms > 0 && ` · Claude ${(e.timing.model_ms / 1000).toFixed(1)} s`}
                      </dd>
                    </>
                  )}
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

