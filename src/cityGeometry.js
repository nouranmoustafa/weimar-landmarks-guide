import * as THREE from 'three'

// Turns footprints in local metres (x east, y north) into three.js geometry.
// Shapes are drawn in the x/y plane and then turned flat, so north becomes -z in the 3D scene.

export function toShape(polygon) {
  const ring = (r) => r.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y))
  const shape = new THREE.Shape(ring(polygon[0]))
  for (let h = 1; h < polygon.length; h++) shape.holes.push(new THREE.Path(ring(polygon[h])))
  return shape
}

// All buildings as one mesh, with a colour per vertex. `ranges[i]` is where building i sits in it,
// so it can be recoloured without rebuilding anything. `roof` marks the vertices of the flat tops.
export function buildingsGeometry(buildings) {
  const parts = []
  let count = 0
  const ranges = buildings.map((b) => {
    const g = new THREE.ExtrudeGeometry(toShape(b.polygon), { depth: Math.max(b.height, 0.1), bevelEnabled: false })
    const n = g.attributes.position.count
    parts.push(g)
    const range = [count, n]
    count += n
    return range
  })
  const position = new Float32Array(count * 3)
  const normal = new Float32Array(count * 3)
  let offset = 0
  for (const g of parts) {
    position.set(g.attributes.position.array, offset)
    normal.set(g.attributes.normal.array, offset)
    offset += g.attributes.position.array.length
    g.dispose()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  geometry.rotateX(-Math.PI / 2)
  geometry.computeBoundingSphere()
  const roof = new Uint8Array(count)
  const nrm = geometry.attributes.normal.array
  for (let v = 0; v < count; v++) roof[v] = nrm[v * 3 + 1] > 0.5 ? 1 : 0
  return { geometry, ranges, roof }
}

// `colorOf(i)` gives [wall, roof] colours for building i.
export function paintBuildings(geometry, ranges, roof, colorOf) {
  const colors = geometry.attributes.color.array
  const wall = new THREE.Color()
  const top = new THREE.Color()
  ranges.forEach(([start, n], i) => {
    const [w, r] = colorOf(i)
    wall.set(w)
    top.set(r)
    for (let v = start; v < start + n; v++) {
      const c = roof[v] ? top : wall
      colors[v * 3] = c.r
      colors[v * 3 + 1] = c.g
      colors[v * 3 + 2] = c.b
    }
  })
  geometry.attributes.color.needsUpdate = true
}

// Take buildings out of the merged mesh by folding each of them into a single point,
// where a separate, more detailed mesh stands in for them.
export function hideBuildings(geometry, ranges, indices) {
  const pos = geometry.attributes.position.array
  for (const i of indices) {
    const [start, n] = ranges[i]
    for (let v = start + 1; v < start + n; v++) {
      pos[v * 3] = pos[start * 3]
      pos[v * 3 + 1] = pos[start * 3 + 1]
      pos[v * 3 + 2] = pos[start * 3 + 2]
    }
  }
  geometry.attributes.position.needsUpdate = true
}

// Ink lines along the building edges that turn sharply: the corners, eaves and footprints.
export function outlineGeometry(geometry) {
  return new THREE.EdgesGeometry(geometry, 30)
}

// The streets as flat ribbons of the given width, with round joints at every bend and junction.
export function roadGeometry(lines, width, lift) {
  const r = width / 2
  const pos = []
  const disc = (x, y) => {
    const steps = 10
    for (let k = 0; k < steps; k++) {
      const a0 = (k / steps) * Math.PI * 2
      const a1 = ((k + 1) / steps) * Math.PI * 2
      pos.push(x, lift, -y, x + r * Math.cos(a1), lift, -(y + r * Math.sin(a1)), x + r * Math.cos(a0), lift, -(y + r * Math.sin(a0)))
    }
  }
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const [x0, y0] = line[i - 1]
      const [x1, y1] = line[i]
      const len = Math.hypot(x1 - x0, y1 - y0)
      if (!len) continue
      const nx = (-(y1 - y0) / len) * r
      const ny = ((x1 - x0) / len) * r
      const a = [x0 + nx, y0 + ny]
      const b = [x0 - nx, y0 - ny]
      const c = [x1 - nx, y1 - ny]
      const d = [x1 + nx, y1 + ny]
      for (const [x, y] of [a, b, c, a, c, d]) pos.push(x, lift, -y)
    }
    for (const [x, y] of line) disc(x, y)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  geometry.computeVertexNormals()
  return geometry
}

// A dashed line painted on the ground along a route: dashes `dash` metres long, `width` wide, `gap` apart.
export function dashedGeometry(line, width, dash, gap, lift) {
  const r = width / 2
  const pos = []
  let phase = 0 // metres into the current dash (+) or gap (-) pattern
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1]
    const [x1, y1] = line[i]
    const len = Math.hypot(x1 - x0, y1 - y0)
    if (!len) continue
    const ux = (x1 - x0) / len
    const uy = (y1 - y0) / len
    let s = 0
    while (s < len) {
      const inDash = phase < dash
      const left = inDash ? dash - phase : dash + gap - phase
      const step = Math.min(left, len - s)
      if (inDash) {
        const a = [x0 + ux * s, y0 + uy * s]
        const b = [x0 + ux * (s + step), y0 + uy * (s + step)]
        const n = [-uy * r, ux * r]
        const quad = [
          [a[0] + n[0], a[1] + n[1]],
          [a[0] - n[0], a[1] - n[1]],
          [b[0] - n[0], b[1] - n[1]],
          [b[0] + n[0], b[1] + n[1]],
        ]
        for (const k of [0, 1, 2, 0, 2, 3]) pos.push(quad[k][0], lift, -quad[k][1])
      }
      s += step
      phase = (phase + step) % (dash + gap)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  return geometry
}

// Words painted flat on the ground like a road marking, drawn into a texture (512 × 512):
// a big first line and a smaller second line, each squeezed to fit the width.
export function groundTextTexture(big, small, color, paving) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const g = canvas.getContext('2d')
  // a panel of fresh paving under the words, so the dashes don't run through them
  g.fillStyle = paving
  g.beginPath()
  g.roundRect(8, 60, 496, 392, 40)
  g.fill()
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  const line = (text, size, y) => {
    g.font = `800 ${size}px system-ui, sans-serif`
    g.lineWidth = size / 6
    g.strokeStyle = 'rgba(255, 253, 247, 0.95)'
    g.strokeText(text, 256, y, 480)
    g.fillStyle = color
    g.fillText(text, 256, y, 480)
  }
  line(big, 170, 190)
  line(small, 64, 380)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

// Land-use plots, one flat geometry per land use.
export function landuseGeometries(plots) {
  const groups = new Map()
  for (const p of plots) {
    if (!groups.has(p.landuse)) groups.set(p.landuse, [])
    groups.get(p.landuse).push(toShape(p.polygon))
  }
  return [...groups].map(([landuse, shapes]) => {
    const geometry = new THREE.ShapeGeometry(shapes)
    geometry.rotateX(-Math.PI / 2)
    return { landuse, geometry }
  })
}

// A flat area (a MultiPolygon in local metres) lying on the ground.
export function areaGeometry(multiPolygon) {
  const geometry = new THREE.ShapeGeometry(multiPolygon.map(toShape))
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

// Three flat tones for the illustrated (cel-shaded) look.
export function toonGradient() {
  const texture = new THREE.DataTexture(new Uint8Array([120, 190, 255]), 3, 1, THREE.RedFormat)
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

// A faint paper grain for the ground, drawn once into a small tile that repeats.
export function paperTexture(color, repeat) {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')
  g.fillStyle = color
  g.fillRect(0, 0, size, size)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let k = 0; k < 2600; k++) {
    const shade = rnd() < 0.5 ? 0 : 255
    g.fillStyle = `rgba(${shade},${shade},${shade},${0.025 + rnd() * 0.035})`
    g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1 + rnd() * 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat[0], repeat[1])
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
