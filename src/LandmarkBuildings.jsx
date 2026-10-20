import { useEffect, useMemo } from 'react'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { landmarkFacades } from './facades.js'
import { toShape } from './cityGeometry.js'
import { INK, REACH_COLORS, ROUTE } from './palette.js'

// The landmarks' own buildings, drawn with illustrated facades after their photos.
// Reached by a walk, they take a light tint of that walk's blue; the chosen landmark gets an orange outline.
export default function LandmarkBuildings({ landmarks, buildings, gradient, reach, selected, onClick }) {
  const parts = useMemo(
    () => landmarks.flatMap((lm) => landmarkFacades(lm, buildings, toShape, gradient).map((p) => ({ ...p, lm }))),
    [landmarks, buildings, gradient],
  )

  useEffect(
    () => () =>
      parts.forEach((p) => {
        p.geometry.dispose()
        p.edges.dispose()
        p.materials.forEach((m) => m.dispose())
      }),
    [parts],
  )

  // Tint the reached ones; the textures keep their drawing, only their colour is shifted towards blue.
  useEffect(() => {
    const ring = new Map()
    if (reach) [...reach.areas].reverse().forEach((a, k) => a.buildings.forEach((i) => ring.set(i, 2 - k)))
    for (const p of parts) {
      const tint = ring.has(p.index) ? new THREE.Color('#ffffff').lerp(new THREE.Color(REACH_COLORS[ring.get(p.index)]), 0.6) : null
      p.materials[1].color.set(tint ?? '#ffffff')
      p.materials[0].color.set(tint ? tint.clone().multiplyScalar(0.7) : p.materials[0].userData.roof)
    }
  }, [parts, reach])

  return (
    <group>
      {parts.map((p) => (
        <group key={`${p.lm.id}-${p.index}`}>
          <mesh geometry={p.geometry} material={p.materials} onClick={onClick} />
          <lineSegments geometry={p.edges}>
            <lineBasicMaterial
              color={p.lm.id === selected?.id ? ROUTE : INK}
              transparent
              opacity={p.lm.id === selected?.id ? 1 : 0.5}
            />
          </lineSegments>
        </group>
      ))}
      {selected &&
        selected.facadeParts.map((k) => (
          <Line
            key={k}
            points={buildings[k].polygon[0].map(([x, y]) => [x, 0.3, -y])}
            color={ROUTE}
            lineWidth={5}
          />
        ))}
    </group>
  )
}
