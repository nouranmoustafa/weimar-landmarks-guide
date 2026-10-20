import { buildingGrid, pointInPolygon, snapToStreet, walkTree, SPEED_M_PER_MIN } from './reach.js'

// Landmarks: their building, the nearest bus stop on foot, and where to stand to look at them.
// Everything works in local metres, like reach.js.

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const EYE_HEIGHT = 2
const MIN_VIEW_DISTANCE = 25
const IDEAL_VIEW_DISTANCE = 45
const RAISED_HEIGHT = 30
const PARTS_RADIUS = 30
const CLEARANCE = 6
const FACADE_RADIUS = 45
const INDOOR_SURCHARGE = 30 // each metre through a building counts like 30 metres of open street

export function prepareLandmarks(raw, { graph, buildings, project }, stopsGeojson) {
  const stops = stopsGeojson.features.map((f) => {
    const p = project(f.geometry.coordinates)
    return { name: f.properties.name, p, snap: snapToStreet(graph, p) }
  })
  return raw.landmarks.map((lm, i) => {
    const p = project([lm.lon, lm.lat])
    const building = findBuilding(buildings, p)
    const parts = connectedParts(buildings, building, p)
    const street = snapToStreet(graph, p)
    const prepared = {
      ...lm,
      number: i + 1,
      p,
      building,
      parts,
      // Coloured on the map: the parts that share the landmark building's use, so terrace neighbours stay as they are.
      highlight: parts.filter((k) => buildings[k].use === buildings[building].use),
      // Drawn with the landmark's illustrated facade: those parts whose middle is near the landmark point.
      facadeParts: parts.filter((k) => {
        if (k === building) return true
        if (buildings[k].use !== buildings[building].use) return false
        const [x0, y0, x1, y1] = buildings[k].bbox
        return Math.hypot((x0 + x1) / 2 - p[0], (y0 + y1) / 2 - p[1]) < FACADE_RADIUS
      }),
      height: parts.length ? Math.max(...parts.map((k) => buildings[k].height)) : 10,
      street,
      walk: nearestStopOnFoot(graph, stops, p, street),
    }
    prepared.viewpoint = chooseViewpoint(prepared, graph, buildings)
    return prepared
  })
}

// The building the landmark point lies in, or else the nearest one within 20 m.
function findBuilding(buildings, p) {
  let best = -1
  let bestD = 20
  buildings.forEach((b, i) => {
    if (bestD === 0) return
    if (pointInPolygon(p, b.polygon)) {
      best = i
      bestD = 0
      return
    }
    for (const ring of b.polygon)
      for (const [x, y] of ring) {
        const d = Math.hypot(p[0] - x, p[1] - y)
        if (d < bestD) {
          best = i
          bestD = d
        }
      }
  })
  return best
}

// Landmarks are often stored as several attached building parts. Starting from the landmark's building,
// collect the parts that touch it, and the parts touching those, within PARTS_RADIUS of the landmark point.
function connectedParts(buildings, start, p) {
  if (start === -1) return []
  const parts = [start]
  const seen = new Set(parts)
  for (let k = 0; k < parts.length; k++) {
    const own = buildings[parts[k]].polygon
    buildings.forEach((b, i) => {
      if (seen.has(i)) return
      const [x0, y0, x1, y1] = b.bbox
      if (x1 < p[0] - PARTS_RADIUS || x0 > p[0] + PARTS_RADIUS || y1 < p[1] - PARTS_RADIUS || y0 > p[1] + PARTS_RADIUS)
        return
      // Parts touch along a wall, or overlap.
      const touches =
        b.polygon[0].some((q) => {
          const n = nearestOnOutline(q, own)
          return Math.hypot(q[0] - n[0], q[1] - n[1]) < 1.5 || pointInPolygon(q, own)
        }) || own[0].some((q) => pointInPolygon(q, b.polygon))
      if (touches) {
        seen.add(i)
        parts.push(i)
      }
    })
  }
  return parts
}

// The bus stop with the shortest walk to the landmark, and that walk as a line.
// The walk goes straight from the stop to its street, along the network, then straight to the landmark.
function nearestStopOnFoot(graph, stops, p, street) {
  const e = graph.edges[street.edge]
  const { dist, prev } = walkTree(graph, [
    [e.a, street.toA],
    [e.b, street.toB],
  ])
  let best = null
  for (const stop of stops) {
    const s = stop.snap
    const se = graph.edges[s.edge]
    let network
    let via = -1
    if (s.edge === street.edge) network = Math.abs(s.toA - street.toA)
    else {
      const da = dist[se.a] + s.toA
      const db = dist[se.b] + s.toB
      network = Math.min(da, db)
      via = da <= db ? se.a : se.b
    }
    const metres = s.distance + network + street.distance
    if (!best || metres < best.metres) best = { stop, metres, via }
  }
  const line = [best.stop.p, best.stop.snap.point]
  for (let n = best.via; n !== -1; n = prev[n]) line.push(graph.nodes[n].p)
  line.push(street.point, p)
  return {
    stop: best.stop.name,
    stopPoint: best.stop.p,
    metres: best.metres,
    minutes: Math.max(1, Math.round(best.metres / SPEED_M_PER_MIN)),
    line,
  }
}

// The price of walking each edge for a walk you watch at street level: its length, plus a heavy
// surcharge for every metre that runs through a building (passages, or where the network was drawn
// across a footprint), so such stretches are only used when there is no reasonable way round.
export function streetCosts(graph, buildings) {
  const inside = buildingGrid(buildings)
  return graph.edges.map((e) => {
    let indoors = 0
    for (let i = 1; i < e.line.length; i++) {
      const [x0, y0] = e.line[i - 1]
      const [x1, y1] = e.line[i]
      const seg = Math.hypot(x1 - x0, y1 - y0)
      const n = Math.max(1, Math.ceil(seg))
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n
        if (inside([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t])) indoors += seg / n
      }
    }
    return e.length + INDOOR_SURCHARGE * indoors
  })
}

// A walk from any point to a landmark: straight to the nearest street, along the network, then straight
// from the landmark's street to the landmark. With `costs` (see streetCosts) it avoids walking through
// buildings; without, it is the shortest walk. Returns the real length of the walk and its line.
export function walkTo(graph, point, lm, costs = null) {
  const s = snapToStreet(graph, point)
  const e = graph.edges[s.edge]
  const { dist, prev } = walkTree(
    graph,
    [
      [e.a, s.toA],
      [e.b, s.toB],
    ],
    costs,
  )
  const t = lm.street
  const te = graph.edges[t.edge]
  let network
  let via = -1
  if (t.edge === s.edge) network = Math.abs(t.toA - s.toA)
  else {
    const da = dist[te.a] + t.toA
    const db = dist[te.b] + t.toB
    network = Math.min(da, db)
    via = da <= db ? te.a : te.b
  }
  const back = [lm.p, t.point]
  for (let v = via; v !== -1; v = prev[v]) back.push(graph.nodes[v].p)
  back.push(s.point, point)
  const line = back.reverse()
  // With costs, `network` is a price, not metres: measure the walk's real length along its line.
  const metres = costs
    ? line.slice(1).reduce((sum, q, i) => sum + Math.hypot(q[0] - line[i][0], q[1] - line[i][1]), 0)
    : s.distance + network + t.distance
  return { metres, line }
}

// --- one walk past every landmark ------------------------------------------------------

export const BIKE_M_PER_MIN = 250 // 15 km/h, an easy pace for cycling in town

// A round walk on the pedestrian network that starts and ends at `startId` and passes the street in front
// of every landmark. The order is found by going to the nearest unvisited landmark each time, then
// improving it by reversing stretches while that makes the round shorter (2-opt). It is short, but not
// guaranteed to be the very shortest.
export function landmarkTour(graph, landmarks, startId = 'markt') {
  const n = landmarks.length
  const trees = landmarks.map((lm) => {
    const e = graph.edges[lm.street.edge]
    return walkTree(graph, [
      [e.a, lm.street.toA],
      [e.b, lm.street.toB],
    ])
  })
  // Walking distance from landmark i's street point to landmark j's, and the node where the path reaches j's street.
  const leg = (i, j) => {
    const a = landmarks[i].street
    const b = landmarks[j].street
    if (a.edge === b.edge) return { metres: Math.abs(a.toA - b.toA), via: -1 }
    const be = graph.edges[b.edge]
    const { dist } = trees[i]
    const da = dist[be.a] + b.toA
    const db = dist[be.b] + b.toB
    return da <= db ? { metres: da, via: be.a } : { metres: db, via: be.b }
  }
  const D = landmarks.map((_, i) => landmarks.map((_, j) => (i === j ? 0 : leg(i, j).metres)))

  // nearest neighbour from the start
  const start = Math.max(0, landmarks.findIndex((lm) => lm.id === startId))
  const order = [start]
  const left = new Set(landmarks.keys())
  left.delete(start)
  while (left.size) {
    const last = order.at(-1)
    let next = -1
    for (const j of left) if (next === -1 || D[last][j] < D[last][next]) next = j
    order.push(next)
    left.delete(next)
  }
  // 2-opt on the closed round (the start stays first)
  const length = (o) => o.reduce((s, v, k) => s + D[v][o[(k + 1) % n]], 0)
  for (let improved = true; improved; ) {
    improved = false
    for (let i = 1; i < n - 1; i++)
      for (let k = i + 1; k < n; k++) {
        const a = order[i - 1]
        const b = order[i]
        const c = order[k]
        const d = order[(k + 1) % n]
        if (D[a][c] + D[b][d] < D[a][b] + D[c][d] - 0.01) {
          order.splice(i, k - i + 1, ...order.slice(i, k + 1).reverse())
          improved = true
        }
      }
  }

  // The drawn line of each stretch: from i's street point along the network to j's street point.
  const legs = order.map((i, k) => {
    const j = order[(k + 1) % n]
    const { metres, via } = leg(i, j)
    const back = [landmarks[j].street.point]
    for (let v = via; v !== -1; v = trees[i].prev[v]) back.push(graph.nodes[v].p)
    back.push(landmarks[i].street.point)
    return { from: landmarks[i], to: landmarks[j], metres, line: back.reverse() }
  })
  return { order: order.map((i) => landmarks[i]), legs, metres: length(order) }
}

// A camera at eye height on the street in front of the landmark, looking at it.
export function streetView(lm) {
  const [sx, sy] = lm.viewpoint.point
  const lookHeight = Math.min(Math.max(lm.height * 0.45, 3), 14)
  return {
    position: [sx, lm.viewpoint.clear ? EYE_HEIGHT : RAISED_HEIGHT, -sy],
    target: [lm.p[0], lookHeight, -lm.p[1]],
  }
}

// Where to stand: a point on a walkable street, about IDEAL_VIEW_DISTANCE from the landmark's front,
// with no other building in the way. If every street point is blocked, the camera rises above the roofs.
function chooseViewpoint(lm, graph, buildings) {
  // The landmark's own parts never block the view; its front is the nearest point on any of them.
  const parts = new Set(lm.parts)
  const frontOf = (c) => {
    let front = lm.p
    let bestD = Infinity
    for (const k of lm.parts) {
      const q = nearestOnOutline(c, buildings[k].polygon)
      const d = Math.hypot(c[0] - q[0], c[1] - q[1])
      if (d < bestD) {
        bestD = d
        front = q
      }
    }
    return front
  }
  let best = null
  let fallback = null
  for (const e of graph.edges)
    for (let i = 1; i < e.line.length; i++) {
      const [x0, y0] = e.line[i - 1]
      const [x1, y1] = e.line[i]
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 5))
      for (let s = 0; s <= steps; s++) {
        const c = [x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps]
        if (Math.hypot(c[0] - lm.p[0], c[1] - lm.p[1]) > 160) continue
        const front = frontOf(c)
        const d = Math.hypot(c[0] - front[0], c[1] - front[1])
        if (d < MIN_VIEW_DISTANCE || d > 110) continue
        const score = Math.abs(d - IDEAL_VIEW_DISTANCE)
        const inside = buildings.some(
          (b) => c[0] >= b.bbox[0] && c[0] <= b.bbox[2] && c[1] >= b.bbox[1] && c[1] <= b.bbox[3] && pointInPolygon(c, b.polygon),
        )
        if (inside) continue
        if (!fallback || score < fallback.score) fallback = { point: c, score }
        if (best && score >= best.score) continue
        // Clear lines to the nearest front and to the middle of the landmark, and no wall right beside the camera.
        if (blocked(c, front, buildings, parts) || blocked(c, lm.p, buildings, parts)) continue
        if (tooClose(c, buildings, parts)) continue
        best = { point: c, score }
      }
    }
  if (best) return { point: best.point, clear: true }
  return { point: (fallback ?? { point: lm.street.point }).point, clear: false }
}

function nearestOnOutline(p, polygon) {
  let best = null
  let bestD = Infinity
  for (const ring of polygon)
    for (let i = 1; i < ring.length; i++) {
      const [x0, y0] = ring[i - 1]
      const [x1, y1] = ring[i]
      const len2 = (x1 - x0) ** 2 + (y1 - y0) ** 2
      const t = len2 ? Math.max(0, Math.min(1, ((p[0] - x0) * (x1 - x0) + (p[1] - y0) * (y1 - y0)) / len2)) : 0
      const q = [x0 + t * (x1 - x0), y0 + t * (y1 - y0)]
      const d = Math.hypot(p[0] - q[0], p[1] - q[1])
      if (d < bestD) {
        bestD = d
        best = q
      }
    }
  return best
}

// Is a building, other than those in `skip`, within CLEARANCE of point c?
function tooClose(c, buildings, skip) {
  return buildings.some((b, i) => {
    if (skip.has(i)) return false
    const [x0, y0, x1, y1] = b.bbox
    if (x1 < c[0] - CLEARANCE || x0 > c[0] + CLEARANCE || y1 < c[1] - CLEARANCE || y0 > c[1] + CLEARANCE) return false
    const q = nearestOnOutline(c, b.polygon)
    return Math.hypot(c[0] - q[0], c[1] - q[1]) < CLEARANCE
  })
}

// Does any building, other than those in `skip`, stand between a and b?
function blocked(a, b, buildings, skip) {
  const minX = Math.min(a[0], b[0])
  const maxX = Math.max(a[0], b[0])
  const minY = Math.min(a[1], b[1])
  const maxY = Math.max(a[1], b[1])
  // Stop just short of the front, so touching the landmark itself does not count.
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const end = [b[0] - ((b[0] - a[0]) / len) * 1.5, b[1] - ((b[1] - a[1]) / len) * 1.5]
  return buildings.some((bl, i) => {
    if (skip.has(i)) return false
    const [x0, y0, x1, y1] = bl.bbox
    if (x1 < minX || x0 > maxX || y1 < minY || y0 > maxY) return false
    if (pointInPolygon(a, bl.polygon)) return true
    for (const ring of bl.polygon)
      for (let k = 1; k < ring.length; k++) if (crosses(a, end, ring[k - 1], ring[k])) return true
    return false
  })
}

function crosses(p1, p2, q1, q2) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const d1 = d(q1, q2, p1)
  const d2 = d(q1, q2, p2)
  const d3 = d(p1, p2, q1)
  const d4 = d(p1, p2, q2)
  return d1 * d2 < 0 && d3 * d4 < 0
}

// The season whose dates include `date` (YYYY-MM-DD), or the next one to come, or the last.
export function currentSeason(seasons, date) {
  return (
    seasons.find((s) => s.from <= date && date <= s.to) ?? seasons.find((s) => s.from > date) ?? seasons.at(-1)
  )
}

export function todayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
}
