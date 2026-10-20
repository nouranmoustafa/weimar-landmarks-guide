import polygonClipping from 'polygon-clipping'

// Walking reach on the street graph, and the residents and buildings inside it.
// Everything here works in local metres: x to the east, y to the north of the kit centre.

export const SPEED_M_PER_MIN = 80 // 4.8 km/h
export const MINUTES = [5, 10, 15]
export const BAND_M = 25
export const MAX_SNAP_M = 100

// --- Projection: longitude/latitude to local metres --------------------------------

export function makeProjection([lon0, lat0]) {
  const phi = (lat0 * Math.PI) / 180
  const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi)
  const mPerDegLon = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi)
  return ([lon, lat]) => [(lon - lon0) * mPerDegLon, (lat - lat0) * mPerDegLat]
}

// --- Street graph and walking ------------------------------------------------------

export function buildGraph(raw, project) {
  const nodes = raw.nodes.map((n) => ({ id: n.id, p: project([n.lon, n.lat]), edges: [] }))
  const index = new Map(nodes.map((n, i) => [n.id, i]))
  const edges = []
  for (const e of raw.edges) {
    if (!e.walkable) continue
    const a = index.get(e.from)
    const b = index.get(e.to)
    const line = e.coords.map(project)
    const k = edges.length
    edges.push({ a, b, length: e.length, line })
    nodes[a].edges.push(k)
    nodes[b].edges.push(k)
  }
  return { nodes, edges }
}

// The nearest node that has a walkable edge, or null if none is within maxDist metres.
export function nearestNode(graph, [x, y], maxDist = MAX_SNAP_M) {
  let best = -1
  let bestD = Infinity
  graph.nodes.forEach((n, i) => {
    if (!n.edges.length) return
    const d = Math.hypot(n.p[0] - x, n.p[1] - y)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return bestD <= maxDist ? { node: best, distance: bestD } : null
}

// Shortest walking distance in metres from the start node to every node (Dijkstra).
export function walkDistances(graph, start) {
  return walkTree(graph, [[start, 0]]).dist
}

// Dijkstra from several start nodes, each with a distance already walked.
// `prev[i]` is the node before i on its shortest path, or -1 at a start.
// `costs`, if given, replaces each edge's length as the price of walking it (used to avoid some edges).
export function walkTree(graph, seeds, costs = null) {
  const dist = new Float64Array(graph.nodes.length).fill(Infinity)
  const prev = new Int32Array(graph.nodes.length).fill(-1)
  const heap = []
  const push = (item) => {
    heap.push(item)
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p][0] <= heap[i][0]) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  for (const [node, d] of seeds)
    if (d < dist[node]) {
      dist[node] = d
      push([d, node])
    }
  while (heap.length) {
    const [d, i] = pop()
    if (d > dist[i]) continue
    for (const k of graph.nodes[i].edges) {
      const e = graph.edges[k]
      const j = e.a === i ? e.b : e.a
      const nd = d + (costs ? costs[k] : e.length)
      if (nd < dist[j]) {
        dist[j] = nd
        prev[j] = i
        push([nd, j])
      }
    }
  }
  return { dist, prev }
}

// The nearest point on a walkable street, with the walking distance from it to both ends of its edge.
export function snapToStreet(graph, [x, y]) {
  let best = null
  graph.edges.forEach((e, k) => {
    const total = lineLength(e.line)
    let along = 0
    for (let i = 1; i < e.line.length; i++) {
      const [x0, y0] = e.line[i - 1]
      const [x1, y1] = e.line[i]
      const seg = Math.hypot(x1 - x0, y1 - y0)
      const t = seg ? Math.max(0, Math.min(1, ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / (seg * seg))) : 0
      const p = [x0 + t * (x1 - x0), y0 + t * (y1 - y0)]
      const d = Math.hypot(x - p[0], y - p[1])
      if (!best || d < best.distance) {
        // Distances along the edge use the graph's own length, in proportion to the drawn line.
        const share = total ? (along + t * seg) / total : 0
        best = { edge: k, point: p, distance: d, toA: share * e.length, toB: (1 - share) * e.length }
      }
      along += seg
    }
  })
  return best
}

// The first `meters` of a polyline, measured along it.
function cutLine(line, meters) {
  const out = [line[0]]
  let left = meters
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1]
    const [x1, y1] = line[i]
    const seg = Math.hypot(x1 - x0, y1 - y0)
    if (seg >= left) {
      const t = seg ? left / seg : 0
      out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t])
      return out
    }
    out.push(line[i])
    left -= seg
  }
  return out
}

function lineLength(line) {
  let s = 0
  for (let i = 1; i < line.length; i++) s += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])
  return s
}

// The street pieces reachable within `budget` metres: whole edges, and the reachable part of the last ones.
export function reachedLines(graph, dist, budget) {
  const lines = []
  for (const e of graph.edges) {
    const ra = Math.max(0, budget - dist[e.a])
    const rb = Math.max(0, budget - dist[e.b])
    if (ra === 0 && rb === 0) continue
    if (ra + rb >= e.length) {
      lines.push(e.line)
      continue
    }
    // The drawn line and the graph length may differ a little; cut in proportion.
    const scale = lineLength(e.line) / e.length
    if (ra > 0) lines.push(cutLine(e.line, ra * scale))
    if (rb > 0) lines.push(cutLine([...e.line].reverse(), rb * scale))
  }
  return lines
}

// --- The band around the reached streets, as one shape ------------------------------

// A segment widened by r on each side, with round ends.
function capsule([x0, y0], [x1, y1], r, steps = 8) {
  const ang = Math.atan2(y1 - y0, x1 - x0)
  const ring = []
  for (let i = 0; i <= steps; i++) {
    const t = ang + Math.PI / 2 + (Math.PI * i) / steps
    ring.push([x0 + r * Math.cos(t), y0 + r * Math.sin(t)])
  }
  for (let i = 0; i <= steps; i++) {
    const t = ang - Math.PI / 2 + (Math.PI * i) / steps
    ring.push([x1 + r * Math.cos(t), y1 + r * Math.sin(t)])
  }
  ring.push(ring[0])
  return [ring]
}

// One band piece per straight bit of street, with its bounding box.
export function bandPieces(lines, r = BAND_M) {
  const pieces = []
  const add = (s, t) => {
    const polygon = capsule(s, t, r)
    pieces.push({
      polygon,
      bbox: [Math.min(s[0], t[0]) - r, Math.min(s[1], t[1]) - r, Math.max(s[0], t[0]) + r, Math.max(s[1], t[1]) + r],
    })
  }
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) add(line[i - 1], line[i])
    if (line.length === 1) add(line[0], line[0])
  }
  return pieces
}

// Union of all band pieces: a MultiPolygon in local metres.
export function bandShape(pieces) {
  if (!pieces.length) return []
  return polygonClipping.union(...pieces.map((p) => p.polygon))
}

// --- Areas ----------------------------------------------------------------------------

function ringArea(ring) {
  let s = 0
  for (let i = 1; i < ring.length; i++) s += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1]
  return Math.abs(s) / 2
}

export function multiPolygonArea(mp) {
  let s = 0
  for (const poly of mp) {
    s += ringArea(poly[0])
    for (let h = 1; h < poly.length; h++) s -= ringArea(poly[h])
  }
  return s
}

const overlaps = (a, b) => a[2] >= b[0] && a[0] <= b[2] && a[3] >= b[1] && a[1] <= b[3]

// Residents in the area: each cell's population times the share of the cell inside the area.
// Cells with no published figure are left out and counted.
// Only the band pieces near a cell can fall inside it, so each cell is clipped against those alone.
export function countResidents(pieces, cells) {
  let sum = 0
  let missing = 0
  for (const c of cells) {
    const near = pieces.filter((p) => overlaps(p.bbox, c.bbox)).map((p) => p.polygon)
    if (!near.length) continue
    const inside = multiPolygonArea(polygonClipping.intersection(c.polygon, polygonClipping.union(...near)))
    if (inside <= 0.01) continue
    if (c.population === null) missing++
    else sum += c.population * (inside / c.area)
  }
  return { residents: Math.round(sum / 10) * 10, exact: sum, missing }
}

export function prepareCells(zensus, project) {
  return zensus.features.map((f) => {
    const polygon = f.geometry.coordinates.map((ring) => ring.map(project))
    const xs = polygon[0].map((p) => p[0])
    const ys = polygon[0].map((p) => p[1])
    return {
      id: f.properties.id,
      population: f.properties.population,
      polygon,
      area: multiPolygonArea([polygon]),
      bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    }
  })
}

export function prepareBuildings(geojson, project) {
  return geojson.features.map((f) => {
    const polygon = f.geometry.coordinates.map((ring) => ring.map(project))
    const xs = polygon[0].map((p) => p[0])
    const ys = polygon[0].map((p) => p[1])
    return {
      id: f.properties.id,
      height: f.properties.height,
      use: f.properties.use ?? 'none',
      polygon,
      bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    }
  })
}

// --- Buildings that touch the shape -------------------------------------------------

function pointInRing([x, y], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// A quick test for "is this point inside a building?", using a coarse grid of the buildings.
export function buildingGrid(buildings, cell = 50) {
  const grid = new Map()
  buildings.forEach((b, i) => {
    const [x0, y0, x1, y1] = b.bbox
    for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++)
      for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) {
        const key = gx + ',' + gy
        if (!grid.has(key)) grid.set(key, [])
        grid.get(key).push(i)
      }
  })
  return (p) =>
    (grid.get(Math.floor(p[0] / cell) + ',' + Math.floor(p[1] / cell)) ?? []).some((i) =>
      pointInPolygon(p, buildings[i].polygon),
    )
}

export function pointInPolygon(p, poly) {
  if (!pointInRing(p, poly[0])) return false
  for (let h = 1; h < poly.length; h++) if (pointInRing(p, poly[h])) return false
  return true
}

function segmentsCross(p1, p2, q1, q2) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const d1 = d(q1, q2, p1)
  const d2 = d(q1, q2, p2)
  const d3 = d(p1, p2, q1)
  const d4 = d(p1, p2, q2)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

function pointSegmentDistance([px, py], [x0, y0], [x1, y1]) {
  const dx = x1 - x0
  const dy = y1 - y0
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2)) : 0
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy))
}

function segmentDistance(p, q, s, t) {
  if (segmentsCross(p, q, s, t)) return 0
  return Math.min(
    pointSegmentDistance(p, s, t),
    pointSegmentDistance(q, s, t),
    pointSegmentDistance(s, p, q),
    pointSegmentDistance(t, p, q),
  )
}

// A building touches the area if it comes within the band's width of a reached street piece:
// that is exactly when it touches the band drawn around that piece.
export function buildingsTouching(lines, buildings, r = BAND_M) {
  const touched = new Set()
  const cell = 50
  const grid = new Map()
  for (const line of lines)
    for (let i = 1; i < line.length; i++) {
      const s = line[i - 1]
      const t = line[i]
      const gx0 = Math.floor((Math.min(s[0], t[0]) - r) / cell)
      const gx1 = Math.floor((Math.max(s[0], t[0]) + r) / cell)
      const gy0 = Math.floor((Math.min(s[1], t[1]) - r) / cell)
      const gy1 = Math.floor((Math.max(s[1], t[1]) + r) / cell)
      for (let gx = gx0; gx <= gx1; gx++)
        for (let gy = gy0; gy <= gy1; gy++) {
          const key = gx + ',' + gy
          if (!grid.has(key)) grid.set(key, [])
          grid.get(key).push([s, t])
        }
    }

  buildings.forEach((b, i) => {
    const [bx0, by0, bx1, by1] = b.bbox
    const seen = new Set()
    for (let gx = Math.floor(bx0 / cell); gx <= Math.floor(bx1 / cell); gx++)
      for (let gy = Math.floor(by0 / cell); gy <= Math.floor(by1 / cell); gy++)
        for (const seg of grid.get(gx + ',' + gy) || []) {
          if (seen.has(seg)) continue
          seen.add(seg)
          const [s, t] = seg
          if (pointInPolygon(s, b.polygon)) return touched.add(i)
          for (const ring of b.polygon)
            for (let k = 1; k < ring.length; k++)
              if (segmentDistance(ring[k - 1], ring[k], s, t) <= r) return touched.add(i)
        }
  })
  return touched
}

// --- Everything for one click ---------------------------------------------------------

export function computeReach({ graph, cells, buildings }, point) {
  const start = nearestNode(graph, point)
  if (!start) return { error: `No walkable street within ${MAX_SNAP_M} m of this point.` }
  const dist = walkDistances(graph, start.node)
  const areas = MINUTES.map((minutes) => {
    const lines = reachedLines(graph, dist, minutes * SPEED_M_PER_MIN)
    const pieces = bandPieces(lines)
    return {
      minutes,
      lines,
      shape: bandShape(pieces),
      buildings: buildingsTouching(lines, buildings),
      ...countResidents(pieces, cells),
    }
  })
  return { start: graph.nodes[start.node].p, snap: start.distance, areas }
}
