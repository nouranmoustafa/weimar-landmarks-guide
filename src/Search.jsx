// A Google Maps-style search: landmarks (English and German names, addresses) and bus stops (named after
// Weimar's streets and squares). An ordinary result gets a real walking route in blue. A search for the
// Guardian's protected site is answered by the Guardian (see searchSecret in Guardian.jsx), in red.
import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { CameraFocus, GlowLine, RED } from './Guardian.jsx'

export const BLUE = '#1a73e8'

// Lower case, no accents, ß as ss, so "Schillerstrasse", "schillerstr" and "Schillerstraße" all match.
export const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// Best matches first: a name that starts with the query, then a word that does, then any partial match,
// then texts that contain every typed word in any order ("herzogin amalia").
function find(places, query) {
  const q = norm(query)
  if (!q) return []
  const words = q.split(' ')
  return places
    .map((p) => {
      const texts = [p.name, ...p.alt].map(norm)
      const score = Math.min(
        ...texts.map((t) =>
          t.startsWith(q) ? 0 : (' ' + t).includes(' ' + q) ? 1 : t.includes(q) ? 2 : words.every((w) => t.includes(w)) ? 3 : 9,
        ),
      )
      return { p, score: score + (p.kind === 'stop' ? 0.5 : 0) }
    })
    .filter((x) => x.score < 9)
    .sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name))
    .slice(0, 7)
    .map((x) => x.p)
}

const minutes = (m) => `${Math.max(1, Math.round(m / 80))} min walk`
const metres = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`)

export function SearchBar({ places, onPick, onClear, onOpen, busy, result, fromName }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [k, setK] = useState(0)
  const hits = useMemo(() => find(places, q), [places, q])
  const choose = (p) => {
    setQ(p ? p.name : q)
    setOpen(false)
    onPick(p, q)
  }
  const key = (e) => {
    if (e.key === 'ArrowDown') (setK((k + 1) % Math.max(hits.length, 1)), e.preventDefault())
    else if (e.key === 'ArrowUp') (setK((k - 1 + hits.length) % Math.max(hits.length, 1)), e.preventDefault())
    else if (e.key === 'Enter') choose(hits[k] ?? hits[0] ?? null)
    else if (e.key === 'Escape') setOpen(false)
  }
  const clear = () => {
    setQ('')
    setOpen(false)
    onClear()
  }
  return (
    <div className="search">
      <div className="search-box">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z" />
        </svg>
        <input
          value={q}
          placeholder="Search Weimar: landmarks, streets, squares"
          onChange={(e) => (setQ(e.target.value), setOpen(true), setK(0))}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={key}
          aria-label="Search Weimar"
        />
        {busy ? <span className="search-spin" title="The search is being answered" /> : q && <button className="search-x" onClick={clear} aria-label="Clear search">×</button>}
      </div>
      {open && hits.length > 0 && (
        <ul className="search-hits" role="listbox">
          {hits.map((p, i) => (
            <li key={p.key} role="option" aria-selected={i === k} className={i === k ? 'on' : ''} onMouseDown={() => choose(p)} onMouseEnter={() => setK(i)}>
              <span className={`search-icon ${p.kind}`}>{p.kind === 'stop' ? 'H' : p.number}</span>
              <span>
                <b>{p.name}</b>
                <small>{p.kind === 'stop' ? 'Bus stop' : p.alt[1]}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
      {busy && <p className="search-card">Searching…</p>}
      {!busy && result && (
        <div className={`search-card ${result.color ?? ''}`}>
          {result.notFound ? (
            <p>
              No results found for “{result.query}”.
            </p>
          ) : (
            <>
              <b>{result.title}</b>
              <small>{result.sub}</small>
              {result.metres > 0 && (
                <span>
                  {minutes(result.metres)} · {metres(result.metres)} from {fromName}
                </span>
              )}
              {result.color === 'blue' && result.id && <button onClick={() => onOpen(result.id)}>Open the flyer</button>}
            </>
          )}
          {result.guardian && <em>Guardian simulation: this answer may be fictional</em>}
        </div>
      )}
    </div>
  )
}

// The result on the 3D map: a blue route and pin, or the Guardian's glowing red route and pulsing marker.
export function SearchLayer({ result, streetView }) {
  if (!result) return null
  const pts = result.line?.map(([x, y]) => [x, 1.6, -y])
  const red = result.color === 'red'
  return (
    <group key={result.key}>
      <CameraFocus focus={result.focus && { p: result.focus, key: result.key }} streetView={streetView} />
      {pts && !red && (
        <>
          <Line points={pts} color="#ffffff" lineWidth={11} depthTest={false} renderOrder={26} />
          <Line points={pts} color={BLUE} lineWidth={6} depthTest={false} renderOrder={27} />
        </>
      )}
      {pts && red && <GrowingRoute points={pts} />}
      {result.marker && <Marker at={result.marker} color={red ? RED : BLUE} pulse={red} />}
      {result.pulse && <AreaPulse {...result.pulse} />}
    </group>
  )
}

// A red route that draws itself from the start to the end over about 1.5 s, then glows.
function GrowingRoute({ points }) {
  const [n, setN] = useState(2)
  const t = useRef(0)
  useFrame((_, dt) => {
    if (n >= points.length) return
    t.current += Math.min(dt, 0.1)
    const next = Math.min(points.length, 2 + Math.floor((t.current / 1.5) * points.length))
    if (next !== n) setN(next)
  })
  return <GlowLine points={points.slice(0, n)} width={6} />
}

// A map pin: a pole and a head, with a ring on the ground that pulses when it is the Guardian's.
function Marker({ at: [x, y], color, pulse }) {
  const ring = useRef()
  useFrame(({ clock }) => {
    if (!pulse) return
    const t = (clock.elapsedTime % 1.2) / 1.2
    ring.current.scale.setScalar(0.6 + 0.9 * t)
    ring.current.material.opacity = 0.9 * (1 - t)
  })
  return (
    <group position={[x, 0, -y]}>
      <mesh position-y={25}>
        <cylinderGeometry args={[1.6, 1.6, 50, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position-y={56}>
        <sphereGeometry args={[11, 24, 14]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh ref={ring} position-y={1.7} rotation-x={-Math.PI / 2} renderOrder={28}>
        <ringGeometry args={[22, 30, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} depthTest={false} />
      </mesh>
    </group>
  )
}

// "No results found": a wide area pulses red for a few seconds and fades, centred away from the real site.
function AreaPulse({ centre: [x, y], radius }) {
  const ref = useRef()
  const t = useRef(0)
  useFrame((_, dt) => {
    t.current += Math.min(dt, 0.1)
    const fade = Math.max(0, 1 - Math.max(0, t.current - 2.5) / 1.5)
    ref.current.material.opacity = fade * (0.18 + 0.14 * Math.sin(t.current * 7))
    ref.current.visible = fade > 0
  })
  return (
    <mesh ref={ref} position={[x, 1.5, -y]} rotation-x={-Math.PI / 2} renderOrder={22}>
      <circleGeometry args={[radius, 64]} />
      <meshBasicMaterial color={RED} transparent opacity={0} depthTest={false} />
    </mesh>
  )
}
