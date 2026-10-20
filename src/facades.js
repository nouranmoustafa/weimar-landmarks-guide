import * as THREE from 'three'
import { INK } from './palette.js'

// Illustrated facades for the landmarks, drawn after their photos in public/data/landmarks/photos/.
// Each style gives the wall and roof colours and how one bay of the front looks: its window, frame,
// shutters or pilasters, the ground floor, and a dark mansard band under the roof where the building has one.
// A facade texture shows one bay, `bay` metres wide, repeated along every wall, floor above floor.

const BASE = {
  bay: 3.2, // metres between windows
  floor: 3.6, // metres per storey
  frame: '#f6f1e6',
  glass: '#3f4a55',
  plinth: '#a69f92',
  window: 'rect', // rect, arch, gothic or none
  shutters: null,
  pilasters: null,
  mansard: false,
  ground: 'windows', // windows, arches or door
  bands: false, // horizontal grooves instead of windows
}

export const FACADES = {
  'goethe-house': { wall: '#e8c56b', roof: '#4b5560', frame: '#eeeae0', mansard: true, bay: 2.9 },
  'schiller-house': { wall: '#f0cd6e', roof: '#56606a', shutters: '#7f95a3', mansard: true, bay: 3.0 },
  'anna-amalia-library': { wall: '#f1e4c2', roof: '#4f5964', frame: '#ffffff', mansard: true, bay: 3.4, floor: 4.2 },
  'city-palace': { wall: '#efdfb2', roof: '#b4603f', frame: '#fbf8ee', bay: 3.6, floor: 4.6, pilasters: '#e2cf9c' },
  'bauhaus-museum': { wall: '#dddcd5', roof: '#cfcec7', window: 'none', bands: true, plinth: '#c9c8c0', ground: 'door' },
  'museum-neues-weimar': { wall: '#c98b6f', roof: '#6d6a68', frame: '#ead6bd', window: 'arch', bay: 3.6, floor: 5, pilasters: '#b97c62' },
  wittumspalais: { wall: '#f1c95f', roof: '#5a5f66', pilasters: '#b9654b', mansard: true, bay: 3.2 },
  'liszt-house': { wall: '#e6c690', roof: '#8a8f95', bay: 3.2 },
  'weimar-republic-house': { wall: '#e9c08c', roof: '#7b7f86', window: 'arch', ground: 'arches', bay: 4.4, floor: 4.2 },
  'herder-church': { wall: '#f3f1ea', roof: '#4b545d', window: 'gothic', glass: '#56636e', pilasters: '#dcd6c8', bay: 4.6, floor: 14, plinth: '#c8c1b2' },
  'theatre-square': { wall: '#eadbbd', roof: '#8a8c8f', frame: '#f8f2e4', pilasters: '#dccaa6', bay: 3.6, floor: 4.6 },
  markt: { wall: '#8f9196', roof: '#3f464d', frame: '#e8a491', pilasters: '#e8a491', ground: 'arches', bay: 3.4 },
  'city-museum': { wall: '#d9b47c', roof: '#b9654a', frame: '#f4ead8', bay: 3.2 },
  'prehistory-museum': { wall: '#f1de9a', roof: '#b05e45', frame: '#ffffff', bay: 3.2, ground: 'door' },
  'forced-labour-museum': { wall: '#e3dccb', roof: '#9e9b94', frame: '#d4ccb9', pilasters: '#d2c9b4', bay: 2.8, floor: 4.4, ground: 'arches' },
}

const PX = 40 // texture pixels per metre

// Paint one bay of a facade, from the ground to the eaves, for a building `height` metres tall.
function paintFacade(style, height) {
  const s = { ...BASE, ...style }
  const w = Math.round(s.bay * PX)
  const h = Math.max(32, Math.round(height * PX))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')
  const Y = (m) => h - m * PX // metres above ground to canvas y
  g.lineJoin = 'round'

  g.fillStyle = s.wall
  g.fillRect(0, 0, w, h)

  // plinth along the ground
  g.fillStyle = s.plinth
  g.fillRect(0, Y(0.6), w, 0.6 * PX)

  // pilasters at the edges of every bay
  if (s.pilasters) {
    g.fillStyle = s.pilasters
    g.fillRect(0, 0, w * 0.07, h)
    g.fillRect(w * 0.93, 0, w * 0.07, h)
  }

  const mansard = s.mansard ? Math.min(2.6, height * 0.25) : 0
  const body = height - mansard
  const floors = Math.max(1, Math.round(body / s.floor))
  const fh = body / floors

  const ink = (width = 1.6) => {
    g.strokeStyle = INK
    g.lineWidth = width
    g.stroke()
  }

  const windowShape = (cx, bottom, ww, wh, kind) => {
    g.beginPath()
    const x0 = cx - ww / 2
    if (kind === 'arch' || kind === 'gothic') {
      const r = ww / 2
      const spring = bottom - wh + (kind === 'gothic' ? ww * 0.9 : r)
      g.moveTo(x0, bottom)
      g.lineTo(x0, spring)
      if (kind === 'arch') g.arc(cx, spring, r, Math.PI, 0)
      else {
        g.quadraticCurveTo(x0, bottom - wh + ww * 0.25, cx, bottom - wh)
        g.quadraticCurveTo(x0 + ww, bottom - wh + ww * 0.25, x0 + ww, spring)
      }
      g.lineTo(x0 + ww, bottom)
      g.closePath()
    } else g.rect(x0, bottom - wh, ww, wh)
  }

  const drawWindow = (cx, bottom, ww, wh, kind) => {
    // frame, glass, glazing bars, a light reflection, a sill
    windowShape(cx, bottom, ww + 6, wh + 6, kind)
    g.fillStyle = s.frame
    g.fill()
    windowShape(cx, bottom - 3, ww, wh, kind)
    g.fillStyle = s.glass
    g.fill()
    ink(1.4)
    g.beginPath()
    g.moveTo(cx, bottom - 3)
    g.lineTo(cx, bottom - 3 - wh * 0.92)
    g.moveTo(cx - ww / 2, bottom - 3 - wh * 0.55)
    g.lineTo(cx + ww / 2, bottom - 3 - wh * 0.55)
    g.strokeStyle = s.frame
    g.lineWidth = 2
    g.stroke()
    g.beginPath()
    g.moveTo(cx - ww * 0.3, bottom - wh * 0.25)
    g.lineTo(cx - ww * 0.05, bottom - wh * 0.7)
    g.strokeStyle = 'rgba(255,255,255,0.35)'
    g.lineWidth = 3
    g.stroke()
    g.fillStyle = s.frame
    g.fillRect(cx - ww / 2 - 5, bottom + 1, ww + 10, 4)
    if (s.shutters && kind === 'rect') {
      g.fillStyle = s.shutters
      g.fillRect(cx - ww / 2 - 3 - ww * 0.42, bottom - 3 - wh, ww * 0.4, wh)
      g.fillRect(cx + ww / 2 + 3, bottom - 3 - wh, ww * 0.4, wh)
    }
  }

  if (s.bands) {
    // plain grooved concrete, as on the Bauhaus Museum
    g.strokeStyle = 'rgba(58,49,42,0.28)'
    g.lineWidth = 1.5
    for (let m = 1.2; m < height; m += 0.6) {
      g.beginPath()
      g.moveTo(0, Y(m))
      g.lineTo(w, Y(m))
      g.stroke()
    }
  }

  const cx = w / 2
  for (let f = 0; f < floors; f++) {
    const bottomM = f * fh + (f === 0 ? 0.8 : fh * 0.22)
    const ww = s.window === 'gothic' ? w * 0.36 : w * 0.38
    const wh = (s.window === 'gothic' ? fh * 0.72 : fh * 0.55) * PX
    if (f === 0 && s.ground === 'arches') {
      // an arcade: a round-headed opening
      windowShape(cx, Y(0.6), w * 0.62, fh * 0.78 * PX, 'arch')
      g.fillStyle = '#4a4038'
      g.fill()
      ink(1.8)
      continue
    }
    if (f === 0 && s.ground === 'door') {
      g.beginPath()
      g.rect(cx - w * 0.2, Y(0.6 + fh * 0.62), w * 0.4, fh * 0.62 * PX)
      g.fillStyle = '#4a4038'
      g.fill()
      ink(1.8)
      continue
    }
    if (f === 0 && s.ground === 'none') continue
    if (s.window !== 'none') drawWindow(cx, Y(bottomM), ww, wh, s.window)
    // a cornice line above each storey
    g.fillStyle = 'rgba(58,49,42,0.18)'
    g.fillRect(0, Y((f + 1) * fh) - 2, w, 3)
  }

  if (mansard) {
    // the dark roof band with a dormer window
    g.fillStyle = style.roof
    g.fillRect(0, 0, w, mansard * PX)
    g.fillStyle = 'rgba(255,255,255,0.08)'
    for (let x = 6; x < w; x += 10) g.fillRect(x, 0, 2, mansard * PX)
    const dw = w * 0.3
    const dh = mansard * PX * 0.55
    g.beginPath()
    g.moveTo(cx - dw / 2 - 6, mansard * PX - 4)
    g.lineTo(cx - dw / 2 - 6, mansard * PX - 4 - dh)
    g.lineTo(cx, mansard * PX - 8 - dh * 1.35)
    g.lineTo(cx + dw / 2 + 6, mansard * PX - 4 - dh)
    g.lineTo(cx + dw / 2 + 6, mansard * PX - 4)
    g.closePath()
    g.fillStyle = style.wall
    g.fill()
    ink(1.4)
    g.fillStyle = s.glass
    g.fillRect(cx - dw / 2, mansard * PX - 4 - dh * 0.85, dw, dh * 0.75)
    // the eaves
    g.fillStyle = s.frame
    g.fillRect(0, mansard * PX - 3, w, 5)
  } else {
    // a cornice under the roof
    g.fillStyle = s.frame
    g.fillRect(0, 0, w, 6)
    g.fillStyle = 'rgba(58,49,42,0.3)'
    g.fillRect(0, 6, w, 2)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.anisotropy = 4
  // three.js gives extruded walls u = metres along the wall and v = 1 - metres above ground;
  // scale both so one texture covers one bay across and the whole height up.
  texture.repeat.set(1 / s.bay, -1 / height)
  texture.offset.set(0, 1 / height)
  return texture
}

// One textured mesh per building part of a landmark: caps take the roof colour, walls the facade.
export function landmarkFacades(lm, buildings, toShape, gradient) {
  const style = FACADES[lm.id]
  if (!style) return []
  const textures = new Map()
  return lm.facadeParts.map((k) => {
    const b = buildings[k]
    const height = Math.max(b.height, 1)
    const geometry = new THREE.ExtrudeGeometry(toShape(b.polygon), { depth: height, bevelEnabled: false })
    geometry.rotateX(-Math.PI / 2)
    const key = Math.round(height)
    if (!textures.has(key)) textures.set(key, paintFacade(style, key))
    const roof = new THREE.MeshToonMaterial({ color: style.roof, gradientMap: gradient })
    roof.userData.roof = style.roof
    const wall = new THREE.MeshToonMaterial({ map: textures.get(key), gradientMap: gradient })
    return { index: k, geometry, materials: [roof, wall], edges: new THREE.EdgesGeometry(geometry, 30) }
  })
}
