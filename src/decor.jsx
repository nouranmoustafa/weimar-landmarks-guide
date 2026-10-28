import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { buildingGrid } from './reach.js'
import { INK, LAMP_GLASS, LAMP_IRON } from './palette.js'

// Street furniture and people for the illustrated city: historic street lights along the streets,
// and stick figures, drawn like the scale figures in architecture sketches, walking the pedestrian network.

const LAMP_SPACING = 35 // metres along a street
const LAMP_OFFSET = 3.8 // metres to the side of the street's centre line
const PEOPLE = 600
const WALK_SPEED = 1.4 // metres per second, an ordinary walking pace

function lampPositions(lines, buildings) {
  const inside = buildingGrid(buildings)
  const out = []
  let side = 1
  for (const line of lines) {
    let carry = LAMP_SPACING / 2
    for (let i = 1; i < line.length; i++) {
      const [x0, y0] = line[i - 1]
      const [x1, y1] = line[i]
      const len = Math.hypot(x1 - x0, y1 - y0)
      if (!len) continue
      const nx = -(y1 - y0) / len
      const ny = (x1 - x0) / len
      for (let s = carry; s < len; s += LAMP_SPACING) {
        const t = s / len
        const cx = x0 + (x1 - x0) * t
        const cy = y0 + (y1 - y0) * t
        // Alternate sides; if that side is inside a building, try the other; else leave it out.
        side = -side
        for (const k of [side, -side]) {
          const p = [cx + nx * LAMP_OFFSET * k, cy + ny * LAMP_OFFSET * k]
          if (!inside(p)) {
            out.push(p)
            break
          }
        }
      }
      carry = (carry - len) % LAMP_SPACING
      if (carry < 0) carry += LAMP_SPACING
    }
  }
  return out
}

export function StreetLights({ lines, buildings }) {
  const points = useMemo(() => lampPositions(lines, buildings), [lines, buildings])
  const pole = useRef()
  const glass = useRef()
  const cap = useRef()
  const parts = useMemo(
    () => ({
      pole: new THREE.CylinderGeometry(0.07, 0.11, 4, 6).translate(0, 2, 0),
      glass: new THREE.CylinderGeometry(0.34, 0.2, 0.55, 4).rotateY(Math.PI / 4).translate(0, 4.27, 0),
      cap: new THREE.ConeGeometry(0.42, 0.35, 4).rotateY(Math.PI / 4).translate(0, 4.72, 0),
    }),
    [],
  )
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    points.forEach(([x, y], i) => {
      m.makeTranslation(x, 0, -y)
      for (const ref of [pole, glass, cap]) ref.current.setMatrixAt(i, m)
    })
    for (const ref of [pole, glass, cap]) {
      ref.current.instanceMatrix.needsUpdate = true
      ref.current.computeBoundingSphere()
    }
  }, [points])
  return (
    <group>
      <instancedMesh ref={pole} args={[parts.pole, null, points.length]}>
        <meshLambertMaterial color={LAMP_IRON} />
      </instancedMesh>
      <instancedMesh ref={glass} args={[parts.glass, null, points.length]}>
        <meshBasicMaterial color={LAMP_GLASS} />
      </instancedMesh>
      <instancedMesh ref={cap} args={[parts.cap, null, points.length]}>
        <meshLambertMaterial color={LAMP_IRON} />
      </instancedMesh>
    </group>
  )
}

// --- people ---------------------------------------------------------------------------
// Scale figures as in architects' drawings: an inverted triangle for the upper body, a round head
// with a gap for the neck, thin tapered legs and arms, some with a triangular skirt.

const STROLLERS_PER_LANDMARK = 18 // walking about near a landmark
const STANDERS_PER_LANDMARK = 8 // standing in front of it, looking at it
const NEAR_LANDMARK = 120 // metres: where strollers start
const STAY_NEAR = 180 // metres: strollers turn back towards their landmark beyond this
const ACCENTS = ['#5f7385', '#7f9a6a', '#c9a24a', '#8a8f99', '#6b8fb3'] // no reds: red belongs to the Guardian

// Limbs hang from a pivot and swing as the figure walks: [pivot height, sideways offset, length, swing].
const LIMBS = [
  [0.9, 0.08, 0.9, 0.42], // left leg
  [0.9, -0.08, 0.9, -0.42], // right leg
  [1.4, 0.21, 0.58, -0.3], // left arm, against the left leg
  [1.4, -0.21, 0.58, 0.3], // right arm
]

function lineLength(line) {
  let s = 0
  for (let i = 1; i < line.length; i++) s += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])
  return s
}

// The point and heading at `d` metres along a polyline.
function along(line, d) {
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1]
    const [x1, y1] = line[i]
    const seg = Math.hypot(x1 - x0, y1 - y0)
    if (d <= seg || i === line.length - 1) {
      const t = seg ? Math.min(1, Math.max(0, d / seg)) : 0
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, x1 - x0, y1 - y0]
    }
    d -= seg
  }
  return [line[0][0], line[0][1], 1, 0]
}

// Everyone in the city: walkers spread over all streets, strollers near each landmark,
// and small groups standing in front of the landmarks.
function makePeople(graph, lengths, landmarks, buildings) {
  let seed = 11
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const looks = () => {
    const skirt = rnd() < 0.3
    return {
      scale: 0.9 + rnd() * 0.18,
      skirt,
      color: rnd() < 0.3 ? ACCENTS[Math.floor(rnd() * ACCENTS.length)] : INK,
      phase: rnd() * Math.PI * 2,
      rnd,
    }
  }
  const walker = (edge, d, home = null) => ({
    kind: 'walk',
    edge,
    dir: rnd() < 0.5 ? 1 : -1,
    d,
    side: (rnd() < 0.5 ? -1 : 1) * (0.8 + rnd() * 1.2),
    speed: WALK_SPEED * (0.8 + rnd() * 0.4),
    home,
    ...looks(),
  })

  const people = []
  const total = lengths.reduce((a, b) => a + b, 0)
  for (let n = 0; n < PEOPLE; n++) {
    // Spread over the network in proportion to street length.
    let r = rnd() * total
    let edge = 0
    while (r > lengths[edge] && edge < lengths.length - 1) r -= lengths[edge++]
    people.push(walker(edge, r))
  }

  const inside = buildingGrid(buildings)
  for (const lm of landmarks ?? []) {
    const near = graph.edges
      .map((e, k) => k)
      .filter((k) => {
        const [x, y] = along(graph.edges[k].line, lengths[k] / 2)
        return Math.hypot(x - lm.p[0], y - lm.p[1]) < NEAR_LANDMARK
      })
    if (near.length)
      for (let n = 0; n < STROLLERS_PER_LANDMARK; n++) {
        const k = near[Math.floor(rnd() * near.length)]
        people.push(walker(k, rnd() * lengths[k], lm.p))
      }
    // Standing groups on the street in front, turned towards the landmark.
    const [sx, sy] = lm.street.point
    for (let n = 0, tries = 0; n < STANDERS_PER_LANDMARK && tries < 80; tries++) {
      const a = rnd() * Math.PI * 2
      const r = 1.5 + rnd() * 8
      const x = sx + Math.cos(a) * r
      const y = sy + Math.sin(a) * r
      if (inside([x, y])) continue
      people.push({ kind: 'stand', x, y, heading: Math.atan2(lm.p[0] - x, -(lm.p[1] - y)), ...looks(), phase: 0.35 })
      n++
    }
  }
  return people
}

export function People({ graph, landmarks, buildings }) {
  const limbs = useRef()
  const torsos = useRef()
  const skirts = useRef()
  const heads = useRef()
  const lengths = useMemo(() => graph.edges.map((e) => lineLength(e.line)), [graph])
  const people = useMemo(() => makePeople(graph, lengths, landmarks, buildings), [graph, lengths, landmarks, buildings])

  const geometry = useMemo(
    () => ({
      limb: new THREE.CylinderGeometry(0.03, 0.02, 1, 5).translate(0, -0.5, 0),
      // shoulders wide, narrowing to the waist; flattened front to back like a drawn figure
      torso: new THREE.CylinderGeometry(0.24, 0.035, 0.56, 4).rotateY(Math.PI / 4).scale(1, 1, 0.45).translate(0, 1.16, 0),
      skirt: new THREE.CylinderGeometry(0.05, 0.25, 0.5, 4).rotateY(Math.PI / 4).scale(1, 1, 0.6).translate(0, 0.68, 0),
      head: new THREE.SphereGeometry(0.105, 10, 8).translate(0, 1.6, 0),
    }),
    [],
  )

  // Colours: most figures ink, some with a muted accent on the body.
  useLayoutEffect(() => {
    const c = new THREE.Color()
    people.forEach((w, i) => {
      c.set(w.color)
      torsos.current.setColorAt(i, c)
      skirts.current.setColorAt(i, c)
    })
    torsos.current.instanceColor.needsUpdate = true
    skirts.current.instanceColor.needsUpdate = true
  }, [people])

  const tmp = useMemo(
    () => ({
      base: new THREE.Matrix4(),
      local: new THREE.Matrix4(),
      none: new THREE.Matrix4().makeScale(0, 0, 0),
      q: new THREE.Quaternion(),
      e: new THREE.Euler(),
      p: new THREE.Vector3(),
      s: new THREE.Vector3(),
    }),
    [],
  )

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    const { base, local, none, q, e, p, s } = tmp
    people.forEach((w, i) => {
      if (w.kind === 'stand') {
        if (w.placed) return
        w.placed = true
        base.makeRotationY(w.heading).setPosition(w.x, 0, -w.y)
      } else {
        // Walk on; at the end of a street, turn into another (not straight back, unless it is a dead end).
        // Strollers pick streets that keep them near their landmark.
        w.d += w.speed * dt
        while (w.d > lengths[w.edge]) {
          w.d -= lengths[w.edge]
          const ed = graph.edges[w.edge]
          const node = w.dir === 1 ? ed.b : ed.a
          let options = graph.nodes[node].edges.filter((k) => k !== w.edge)
          if (w.home && options.length) {
            const close = options.filter((k) => {
              const other = graph.edges[k].a === node ? graph.edges[k].b : graph.edges[k].a
              const [ox, oy] = graph.nodes[other].p
              return Math.hypot(ox - w.home[0], oy - w.home[1]) < STAY_NEAR
            })
            if (close.length) options = close
          }
          const next = options.length ? options[Math.floor(w.rnd() * options.length)] : w.edge
          w.edge = next
          w.dir = graph.edges[next].a === node ? 1 : -1
        }
        w.phase += w.speed * dt * 4.2

        const line = graph.edges[w.edge].line
        const d = w.dir === 1 ? w.d : lengths[w.edge] - w.d
        const [x, y, dx0, dy0] = along(line, d)
        const dx = dx0 * w.dir
        const dy = dy0 * w.dir
        const len = Math.hypot(dx, dy) || 1
        // Keep to one side of the street, like on a pavement, and face the way along it (north is -z).
        const px = x + (-dy / len) * w.side
        const py = y + (dx / len) * w.side
        base.makeRotationY(Math.atan2(dx, -dy)).setPosition(px, 0, -py)
      }
      base.scale(s.set(w.scale, w.scale, w.scale))

      LIMBS.forEach(([pivot, offset, length, swing], k) => {
        e.set(Math.sin(w.phase) * swing, 0, 0)
        q.setFromEuler(e)
        p.set(offset, pivot, 0)
        s.set(1, length, 1)
        local.compose(p, q, s)
        limbs.current.setMatrixAt(i * LIMBS.length + k, local.premultiply(base))
      })
      torsos.current.setMatrixAt(i, base)
      heads.current.setMatrixAt(i, base)
      skirts.current.setMatrixAt(i, w.skirt ? base : none)
    })
    for (const ref of [limbs, torsos, skirts, heads]) ref.current.instanceMatrix.needsUpdate = true
  })

  const n = people.length
  return (
    <group>
      <instancedMesh ref={limbs} args={[geometry.limb, null, n * LIMBS.length]} frustumCulled={false}>
        <meshBasicMaterial color={INK} />
      </instancedMesh>
      <instancedMesh ref={torsos} args={[geometry.torso, null, n]} frustumCulled={false}>
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh ref={skirts} args={[geometry.skirt, null, n]} frustumCulled={false}>
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh ref={heads} args={[geometry.head, null, n]} frustumCulled={false}>
        <meshBasicMaterial color={INK} />
      </instancedMesh>
    </group>
  )
}

