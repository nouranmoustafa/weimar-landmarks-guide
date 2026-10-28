import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import {
  buildGraph,
  makeProjection,
  prepareBuildings,
  BAND_M,
  MAX_SNAP_M,
  MINUTES,
  SPEED_M_PER_MIN,
  buildingGrid,
} from './reach.js'
import {
  areaGeometry,
  buildingsGeometry,
  dashedGeometry,
  groundTextTexture,
  hideBuildings,
  landuseGeometries,
  outlineGeometry,
  paintBuildings,
  paperTexture,
  roadGeometry,
  toonGradient,
} from './cityGeometry.js'
import {
  BIKE_M_PER_MIN,
  landmarkTour,
  prepareLandmarks,
  streetCosts,
  streetView,
  todayISO,
  walkTo,
} from './landmarks.js'
import { GOSSIP, MISSIONS } from './gossip.js'
import { FunBar, GossipCard, MissionCard } from './Fun.jsx'
import {
  GROUND,
  GROUND_LEGEND,
  INK,
  LANDUSE,
  REACH_COLORS,
  REACH_OPACITY,
  ROOFS,
  MISSION,
  ROUTE,
  TOUR,
  SKY,
  STREET,
  STREET_EDGE,
  USES,
  USE_COLOR,
} from './palette.js'
import { People, StreetLights } from './decor.jsx'
import LandmarkBuildings from './LandmarkBuildings.jsx'
import LandmarkList from './LandmarkList.jsx'
import Flyer, { FlyerPreview } from './Flyer.jsx'
import { GuardianLayer, GuardianLog, pinState, useGuardian } from './Guardian.jsx'

const ATTRIBUTION =
  'Buildings: 3D building models LoD2 © GDI-Th (dl-de/by-2-0). Land use and pedestrian network: Egor Gaydukov, InfAU, Bauhaus-Universität Weimar. Census grid: Zensus 2022, © Statistische Ämter des Bundes und der Länder (dl-de/by-2-0).'
const ATTRIBUTION_LANDMARKS =
  'Landmark and bus stop positions © OpenStreetMap contributors (ODbL). Photos: Wikimedia Commons, authors and licences listed with each photo.'

const START_CAMERA = [0, 1300, 1500]
const OVERVIEW_FOV = 45
const SEARCH_RADIUS = 110 // metres: the smallest search area of a secret mission
const SEARCH_SUSPECTS = 3 // landmarks that must lie inside the search area, the answer included
const SEARCH_MARGIN = 25 // metres: how far inside the circle they must be
const STREET_FOV = 65
// The Guardian version hides the original map's walking reach, gossip and missions. Set to true to bring them back.
const ORIGINAL_FEATURES = false

const load = (file) =>
  fetch(`${import.meta.env.BASE_URL}data/${file}`).then((r) => {
    if (!r.ok) throw new Error(`data/${file}: ${r.status}`)
    return r.json()
  })

export default function App() {
  const [city, setCity] = useState(null)
  const [error, setError] = useState(null)
  const [reach, setReach] = useState(null)
  const [busy, setBusy] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [tab, setTab] = useState(ORIGINAL_FEATURES ? 'reach' : 'landmarks')
  const [landmarks, setLandmarks] = useState(null)
  const [checked, setChecked] = useState(null)
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState(null)
  const [showTour, setShowTour] = useState(false)
  const [gossipOn, setGossipOn] = useState(false)
  const [gossipId, setGossipId] = useState(null)
  const [mission, setMission] = useState(null)
  const [solved, setSolved] = useState(0)
  const [walking, setWalking] = useState(false)
  const lastMission = useRef(-1)
  const bubbles = useRef(new Map())
  const worker = useRef(null)
  const lastId = useRef(0)
  const pins = useRef(new Map())
  const today = useMemo(todayISO, [])

  // Hovering a pin in the overview shows its folded flyer beside it (not in street view, where the
  // full flyer is already out). The pin's place on screen is taken once, when the mouse arrives.
  const [preview, setPreview] = useState(null)
  const showPreview = (id, el) => {
    if (view?.street) return
    const r = el.getBoundingClientRect()
    setPreview({ id, at: { left: r.left, right: r.right, top: r.top, height: r.height } })
  }
  const previewLandmark = preview && landmarks?.find((lm) => lm.id === preview.id)

  useEffect(() => {
    Promise.all(['kit.json', 'buildings.geojson', 'streets.graph.json', 'plots.geojson'].map(load))
      .then(([kit, buildingsRaw, graphRaw, plotsRaw]) => {
        const project = makeProjection(kit.center)
        const [w, s, e, n] = kit.bbox
        const [x0, y0] = project([w, s])
        const [x1, y1] = project([e, n])
        const buildings = prepareBuildings(buildingsRaw, project)
        const graph = buildGraph(graphRaw, project)
        setCity({
          kit,
          bounds: [x0, y0, x1, y1],
          buildings,
          graph,
          streets: graph.edges.map((ed) => ed.line),
          plots: plotsRaw.features.map((f) => ({
            landuse: f.properties.landuse,
            polygon: f.geometry.coordinates.map((ring) => ring.map(project)),
          })),
        })
        return Promise.all(['landmarks/landmarks.json', 'landmarks/bus_stops.geojson'].map(load)).then(
          ([raw, stops]) => {
            setChecked(raw.checked)
            setLandmarks(prepareLandmarks(raw, { graph, buildings, project }, stops))
          },
        )
      })
      .catch((e) => setError(e.message))

    const w = new Worker(new URL('./reachWorker.js', import.meta.url), { type: 'module' })
    w.onmessage = ({ data }) => {
      if (data.id !== lastId.current) return
      setBusy(false)
      setReach(data.result)
    }
    worker.current = w
    return () => w.terminate()
  }, [])

  const startWalk = (point) => {
    guardian.observeStreet(point)
    if (!ORIGINAL_FEATURES) return // the click still reaches the Guardian, but no walking reach is drawn
    lastId.current += 1
    setBusy(true)
    worker.current.postMessage({ id: lastId.current, point })
  }

  const landmark = landmarks?.find((lm) => lm.id === selected) ?? null

  const selectLandmark = (id) => {
    const lm = landmarks.find((l) => l.id === id)
    setTab('landmarks')
    setSelected(id)
    setView({ ...streetView(lm), street: true, key: Date.now() })
  }

  // A landmark the visitor chose themselves, from a pin or a list: the Guardian sees it.
  const pickLandmark = (id) => {
    guardian.observeLandmark(id)
    selectLandmark(id)
  }

  const backToOverview = () => {
    const [x0, y0, x1, y1] = city.bounds
    const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2]
    setWalking(false)
    setSelected(null)
    setView({ position: [cx, 1300, 1500 - cy], target: [cx, 0, -cy], street: false, key: Date.now() })
  }

  // Prices for walking each street, with a surcharge through buildings, for walks shown at street level.
  const costs = useMemo(() => (city ? streetCosts(city.graph, city.buildings) : null), [city])

  // One round walk past all the landmarks, worked out once the landmarks have loaded.
  const tour = useMemo(() => (city && landmarks ? landmarkTour(city.graph, landmarks) : null), [city, landmarks])
  // The Guardian watches street and landmark clicks and manipulates the map in response.
  const guardian = useGuardian(city, landmarks, costs)
  // --- gossip and secret missions ---
  const gossipLandmark = landmarks?.find((lm) => lm.id === gossipId) ?? null
  const missionTarget = mission && (mission.revealed || mission.showWay) ? mission.lm.id : null
  const toggleGossip = () => {
    setGossipOn(!gossipOn)
    setGossipId(null)
  }

  // Pick a mission (never the same one twice in a row) and measure the real walk to it:
  // from where the last walking reach started, or else from the Market Square.
  const newMission = () => {
    let k
    do k = Math.floor(Math.random() * MISSIONS.length)
    while (MISSIONS.length > 1 && k === lastMission.current)
    lastMission.current = k
    const lm = landmarks.find((l) => l.id === MISSIONS[k].id)
    const markt = landmarks.find((l) => l.id === 'markt')
    const fromReach = reach && !reach.error
    const from = fromReach ? 'where your last walk started' : 'the Market Square (Tourist Information)'
    const startName = fromReach ? 'Your last walk' : 'Market Square'
    // the way you would actually walk it: on open streets, not through buildings
    const walk = walkTo(city.graph, fromReach ? reach.start : markt.p, lm, costs)
    // The search circle is centred near the landmark, not on it, so the map doesn't give the answer away.
    const a = Math.random() * Math.PI * 2
    const r = 25 + Math.random() * 45
    const centre = [lm.p[0] + Math.cos(a) * r, lm.p[1] + Math.sin(a) * r]
    // Wide enough that at least SEARCH_SUSPECTS landmarks lie well inside, so the circle alone doesn't give it away.
    const searchRadius = ([cx, cy]) => {
      const d = landmarks.map((l) => Math.hypot(l.p[0] - cx, l.p[1] - cy)).sort((p, q) => p - q)
      return Math.max(SEARCH_RADIUS, d[SEARCH_SUSPECTS - 1] + SEARCH_MARGIN)
    }
    setMission({
      lm,
      clue: MISSIONS[k].clue,
      fact: GOSSIP[lm.id].fact,
      walk,
      from,
      startName,
      centre,
      radius: searchRadius(centre),
      revealed: false,
      showWay: false,
      done: false,
    })
    setGossipId(null)
    if (view?.street) backToOverview()
  }

  // "Show me the way": walk the route at street level, then arrive at the landmark and open its flyer.
  const walkToMission = () => {
    const id = mission.lm.id
    setMission({ ...mission, showWay: true })
    setGossipId(null)
    if (mission.walk.metres < 30) return arriveAt(id)
    setWalking(true)
    setSelected(null)
    setView({ walk: mission.walk.line, street: true, key: Date.now(), onArrive: () => arriveAt(id) })
  }
  const arriveAt = (id) => {
    setWalking(false)
    setMission((m) => (m && m.lm.id === id ? { ...m, revealed: true } : m))
    selectLandmark(id)
  }

  const toggleTour = () => {
    if (!showTour) backToOverview()
    setShowTour(!showTour)
  }

  return (
    <div className={landmark ? 'app has-flyer' : 'app'}>
      {city ? (
        // `flat` turns off the film-like colour filter, so the illustrated colours show exactly as in the legend.
        <Canvas flat camera={{ position: START_CAMERA, fov: OVERVIEW_FOV, near: 10, far: 20000 }}>
          <City
            city={city}
            reach={reach && !reach.error ? reach : null}
            onGroundClick={startWalk}
            landmarks={landmarks}
            pins={pins}
            selected={landmark}
            view={view}
            tour={showTour && !view?.street ? tour : null}
            bubbles={bubbles}
            gossipOn={gossipOn}
            mission={mission}
            guardian={guardian}
          />
        </Canvas>
      ) : (
        <p className="loading">{error ? `The city kit didn't load (${error}).` : 'Loading the city…'}</p>
      )}

      {/* Numbered pins and gossip bubbles over the 3D view; PinTracker moves them every frame.
          All pins show in the landmarks tab, with the tour or with gossip; a revealed mission shows its target alone. */}
      <div
        className={[
          'pins',
          tab === 'landmarks' || showTour || gossipOn ? '' : missionTarget ? 'only-target' : 'hidden',
          view?.street ? 'street' : '',
          gossipOn ? 'gossip' : '',
        ].join(' ')}
      >
        {landmarks?.map((lm, k) => (
          <div key={lm.id}>
            <button
              ref={(el) => (el ? pins.current.set(lm.id, el) : pins.current.delete(lm.id))}
              className={`pin${lm.id === selected ? ' selected' : ''}${lm.id === missionTarget ? ' target' : ''}${pinState(guardian, lm.id)}`}
              onClick={() => {
                setPreview(null)
                pickLandmark(lm.id)
              }}
              onMouseEnter={(e) => showPreview(lm.id, e.currentTarget)}
              onMouseLeave={() => setPreview(null)}
              onFocus={(e) => showPreview(lm.id, e.currentTarget)}
              onBlur={() => setPreview(null)}
              aria-label={lm.name}
            >
              {lm.number}
            </button>
            {GOSSIP[lm.id] && (
              <button
                ref={(el) => (el ? bubbles.current.set(lm.id, el) : bubbles.current.delete(lm.id))}
                className={`bubble${lm.id === selected ? ' selected' : ''}${GOSSIP[lm.id].serious ? ' serious' : ''}`}
                style={{ '--d': `${k * 70}ms` }}
                onClick={() => setGossipId(lm.id)}
                title={`What ${lm.name} has to say`}
              >
                <span>{GOSSIP[lm.id].teaser}</span>
              </button>
            )}
          </div>
        ))}
      </div>

      {ORIGINAL_FEATURES && landmarks && !landmark && !walking && <FunBar gossipOn={gossipOn} onGossip={toggleGossip} onSuspicious={newMission} />}
      {gossipLandmark && (
        <GossipCard
          lm={gossipLandmark}
          gossip={GOSSIP[gossipLandmark.id]}
          onClose={() => setGossipId(null)}
          onGo={() => {
            setGossipId(null)
            selectLandmark(gossipLandmark.id)
          }}
        />
      )}
      {walking && mission && (
        <div className="walk-chip" role="status">
          <span className="walk-dots" aria-hidden="true" />
          On the way: {Math.round(mission.walk.metres / 10) * 10} m on foot
          <button onClick={() => arriveAt(mission.lm.id)}>Skip ›</button>
        </div>
      )}
      {mission && !walking && (
        <MissionCard
          mission={mission}
          solved={solved}
          onReveal={() => setMission({ ...mission, revealed: true })}
          onShowWay={walkToMission}
          onComplete={() => {
            setMission({ ...mission, revealed: true, done: true })
            setSolved(solved + 1)
          }}
          onNew={newMission}
          onGo={() => {
            const id = mission.lm.id
            setMission(null)
            selectLandmark(id)
          }}
          onClose={() => setMission(null)}
        />
      )}

      {/* The left column: the landmarks panel (folds with its – button) and the Guardian's log beneath it. */}
      <div className="left-col">
      <aside className={panelOpen ? 'panel' : 'panel folded'}>
        <div className="tabs" role="tablist">
          {ORIGINAL_FEATURES && (
            <button role="tab" aria-selected={tab === 'reach'} onClick={() => setTab('reach')}>
              Walking reach
            </button>
          )}
          <button role="tab" aria-selected={tab === 'landmarks'} onClick={() => setTab('landmarks')}>
            Landmarks
          </button>
          <button className="fold" onClick={() => setPanelOpen(!panelOpen)} aria-expanded={panelOpen} title={panelOpen ? 'Minimise' : 'Open'}>
            {panelOpen ? '–' : '+'}
          </button>
        </div>
        {panelOpen && (tab === 'reach' ? (
          <ReachPanel reach={reach} busy={busy} tour={tour} showTour={showTour} onToggleTour={toggleTour} />
        ) : (
          <>
            <TourCard tour={tour} show={showTour} onToggle={toggleTour} onSelect={pickLandmark} />
            <LandmarkList
              // a landmark the Guardian has concealed disappears from the list as well
              landmarks={guardian.effects.conceal ? landmarks?.filter((lm) => lm.id !== guardian.secret?.id) : landmarks}
              selected={selected}
              onSelect={pickLandmark}
              today={today}
              checked={checked}
            />
          </>
        ))}
      </aside>
      <GuardianLog guardian={guardian} />
      </div>

      {view?.street && (
        <button className="overview-button" onClick={backToOverview}>
          ‹ Back to the city overview
        </button>
      )}

      {landmark && <Flyer landmark={landmark} checked={checked} onClose={backToOverview} />}
      {previewLandmark && !view?.street && <FlyerPreview landmark={previewLandmark} at={preview.at} today={today} />}

      {!landmark && (
        <Legend buildings={city?.buildings} showLandmark={tab === 'landmarks'} showTour={showTour} showMission={!!mission} />
      )}
      <p className="attribution">
        {ATTRIBUTION} {landmarks && ATTRIBUTION_LANDMARKS}
      </p>
    </div>
  )
}

function City({ city, reach, onGroundClick, landmarks, pins, selected, view, tour, bubbles, gossipOn, mission, guardian }) {
  const [x0, y0, x1, y1] = city.bounds
  const margin = 300
  const ground = [x1 - x0 + 2 * margin, y1 - y0 + 2 * margin]
  const centre = [(x0 + x1) / 2, (y0 + y1) / 2]

  const { geometry, ranges, roof } = useMemo(() => buildingsGeometry(city.buildings), [city])
  const outline = useMemo(() => outlineGeometry(geometry), [geometry])
  const landuse = useMemo(() => landuseGeometries(city.plots), [city])
  const road = useMemo(() => roadGeometry(city.streets, 5.5, 0.06), [city])
  const roadEdge = useMemo(() => roadGeometry(city.streets, 7.5, 0.04), [city])
  const gradient = useMemo(toonGradient, [])
  const paper = useMemo(() => paperTexture(GROUND, [ground[0] / 120, ground[1] / 120]), [ground[0], ground[1]])
  const areas = useMemo(() => (reach ? reach.areas.map((a) => areaGeometry(a.shape)) : []), [reach])

  // Colour each building by its use, or by the nearest reach area it touches.
  // Walls take that colour; roofs are terracotta or slate, or a darker shade of the reach colour.
  useEffect(() => {
    const ring = new Map()
    if (reach) [...reach.areas].reverse().forEach((a, k) => a.buildings.forEach((i) => ring.set(i, 2 - k)))
    paintBuildings(geometry, ranges, roof, (i) => {
      if (ring.has(i)) return [REACH_COLORS[ring.get(i)], darker(REACH_COLORS[ring.get(i)])]
      return [USE_COLOR[city.buildings[i].use] ?? USE_COLOR.none, ROOFS[(i * 7919) % 13 % ROOFS.length]]
    })
  }, [geometry, ranges, roof, reach, city])

  // The landmarks' buildings are drawn separately, with their illustrated facades.
  useEffect(() => {
    if (landmarks) hideBuildings(geometry, ranges, landmarks.flatMap((lm) => lm.facadeParts))
  }, [landmarks, geometry, ranges])

  useEffect(() => () => areas.forEach((g) => g.dispose()), [areas])

  const click = (e) => {
    if (e.delta > 4) return // that was a drag, not a click
    e.stopPropagation()
    onGroundClick([e.point.x, -e.point.z])
  }

  return (
    <>
      <color attach="background" args={[SKY]} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[-500, 900, 600]} intensity={2.2} color="#fff1d6" />
      <OrbitControls makeDefault maxPolarAngle={view?.street ? Math.PI * 0.62 : Math.PI / 2.1} />
      <CameraRig view={view} home={[centre[0], 0, -centre[1]]} />

      {/* Paper ground, then the painted layers on it: land use, the streets with their edge, the reach. */}
      <mesh rotation-x={-Math.PI / 2} position={[centre[0], 0, -centre[1]]} onClick={click}>
        <planeGeometry args={ground} />
        <meshBasicMaterial map={paper} />
      </mesh>

      {landuse.map(({ landuse: use, geometry: g }) => (
        <mesh key={use} geometry={g} position-y={0.02} renderOrder={1}>
          <FlatMaterial color={LANDUSE[use] ?? GROUND} layer={1} />
        </mesh>
      ))}
      <mesh geometry={roadEdge} renderOrder={2}>
        <FlatMaterial color={STREET_EDGE} layer={2} />
      </mesh>
      <mesh geometry={road} renderOrder={3}>
        <FlatMaterial color={STREET} layer={3} />
      </mesh>

      {/* The see-through areas lie at one height. The 5-minute area is drawn first and marks its pixels as
          taken, so the 10- and 15-minute areas only paint around it and the shades never pile up. */}
      {areas.map((g, k) => (
        <mesh key={k} geometry={g} position-y={0.08} renderOrder={4 + k}>
          <FlatMaterial color={REACH_COLORS[k]} layer={4} opacity={REACH_OPACITY} claim />
        </mesh>
      ))}

      <mesh geometry={geometry} onClick={click}>
        <meshToonMaterial vertexColors gradientMap={gradient} />
      </mesh>
      <lineSegments geometry={outline}>
        <lineBasicMaterial color={INK} transparent opacity={0.45} />
      </lineSegments>

      {landmarks && (
        <LandmarkBuildings
          landmarks={landmarks}
          buildings={city.buildings}
          gradient={gradient}
          reach={reach}
          selected={selected}
          onClick={click}
          hidden={guardian.effects.conceal ? guardian.secret?.id : null}
        />
      )}

      <StreetLights lines={city.streets} buildings={city.buildings} />
      <People graph={city.graph} landmarks={landmarks} buildings={city.buildings} />

      {reach && (
        <mesh position={[reach.start[0], 6, -reach.start[1]]}>
          <sphereGeometry args={[6, 24, 12]} />
          <meshLambertMaterial color={ROUTE} />
        </mesh>
      )}

      {landmarks && <GuardianLayer guardian={guardian} buildings={city.buildings} geometry={geometry} ranges={ranges} gradient={gradient} streetView={!!view?.street} />}
      {landmarks && <PinTracker landmarks={landmarks} pins={pins} bubbles={bubbles} gossipOn={gossipOn} />}

      {mission && !view?.street && !mission.revealed && !mission.showWay && !mission.done && (
        <Pulse centre={mission.centre} radius={mission.radius} />
      )}
      {mission && !view?.street && (mission.revealed || mission.showWay) && <Pulse centre={mission.lm.p} radius={22} />}
      {mission?.showWay && <MissionWay mission={mission} buildings={city.buildings} />}
      {mission?.showWay && !view?.street && (
        <Line
          points={mission.walk.line.map(([x, y]) => [x, 1.2, -y])}
          color={MISSION}
          lineWidth={7}
          dashed
          dashSize={12}
          gapSize={6}
          depthTest={false}
          renderOrder={21}
        />
      )}

      {tour && (
        // Drawn over the buildings, like a route printed on a map, so it stays readable from any angle.
        <Line
          points={tour.legs.flatMap((l) => l.line.map(([x, y]) => [x, 1, -y]))}
          color={TOUR}
          lineWidth={6}
          depthTest={false}
          transparent
          opacity={0.9}
          renderOrder={20}
        />
      )}

      {selected && (
        <>
          <Line
            points={selected.walk.line.map(([x, y]) => [x, 0.8, -y])}
            color={ROUTE}
            lineWidth={4}
            renderOrder={6}
          />
          <BusStopSign at={selected.walk.stopPoint} />
        </>
      )}
    </>
  )
}

// A flat, unlit colour for the painted ground layers. Each layer sits a little above the one below it,
// so they never flicker into each other. A layer that `claim`s its pixels keeps later ones at its height out.
function FlatMaterial({ color, layer, opacity = 1, claim = false }) {
  return (
    <meshBasicMaterial
      color={color}
      side={THREE.DoubleSide}
      depthWrite={claim}
      depthFunc={claim ? THREE.LessDepth : THREE.LessEqualDepth}
      transparent={opacity < 1}
      opacity={opacity}
      polygonOffset
      polygonOffsetFactor={-layer}
      polygonOffsetUnits={-layer}
    />
  )
}

function darker(hex) {
  return '#' + new THREE.Color(hex).multiplyScalar(0.72).getHexString()
}

// Places each pin (a button outside the canvas) over its landmark, and hides pins behind the camera.
// With gossip on, it also places each speech bubble above its pin, and only lets a bubble speak where it
// does not overlap one placed before it, so the map stays readable.
function PinTracker({ landmarks, pins, bubbles, gossipOn }) {
  const { camera, size } = useThree()
  const v = useMemo(() => new THREE.Vector3(), [])
  const sizes = useMemo(() => new WeakMap(), [])
  useFrame(() => {
    // First the pins: place them, and keep their boxes so no bubble covers another landmark's pin.
    const spots = new Map()
    const placed = []
    for (const lm of landmarks) {
      const el = pins.current.get(lm.id)
      if (!el) continue
      v.set(lm.p[0], lm.height + 8, -lm.p[1]).project(camera)
      if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) {
        el.style.display = 'none'
        continue
      }
      const x = ((v.x + 1) / 2) * size.width
      const y = ((1 - v.y) / 2) * size.height
      el.style.display = ''
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
      spots.set(lm.id, [x, y])
      placed.push([x - 13, y - 13, x + 13, y + 13])
    }
    // Then the bubbles, each above its own pin, in the order of the list.
    for (const lm of landmarks) {
      const bubble = bubbles.current.get(lm.id)
      if (!bubble) continue
      if (!spots.has(lm.id) || !gossipOn) {
        bubble.dataset.clear = '0'
        continue
      }
      const [x, y] = spots.get(lm.id)
      // the bubble's size never changes, so measure it once
      if (!sizes.has(bubble) && bubble.offsetWidth) sizes.set(bubble, [bubble.offsetWidth, bubble.offsetHeight])
      const [w, h] = sizes.get(bubble) ?? [120, 30]
      const box = [x - w / 2 - 4, y - 18 - h - 4, x + w / 2 + 4, y - 18 + 4]
      const free = !placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])
      bubble.dataset.clear = free ? '1' : '0'
      bubble.style.transform = `translate(${x}px, ${y - 18}px) translate(-50%, -100%)`
      if (free) placed.push(box)
    }
  })
  return null
}

// The way to a mission's destination, painted on the street: teal dashes, and the name of the starting
// point written across the street a few steps ahead of the start, like a road marking.
function MissionWay({ mission, buildings }) {
  const { dashes, label, texture } = useMemo(() => {
    const street = mission.walk.line.length > 3 ? mission.walk.line.slice(1, -1) : mission.walk.line
    const path = walkPath(mission.walk.line)
    const s = Math.min(11, path.length / 2)
    const [ax, , az] = path.at(s)
    const [bx, , bz] = path.at(s + 1)
    // Where the way hugs a wall, slide the marking sideways onto open paving (up to 2.5 m).
    const inside = buildingGrid(buildings)
    const len = Math.hypot(bx - ax, bz - az) || 1
    const [fx, fz] = [(bx - ax) / len, (bz - az) / len] // forward, in the scene
    const [sx, sz] = [-fz, fx] // sideways
    const clear = (cx, cz) =>
      [-1, 0, 1].every((u) =>
        [-1, 0, 1].every((w) => {
          const x = cx + sx * u * 2.1 + fx * w * 2.6
          const z = cz + sz * u * 2.1 + fz * w * 2.6
          return !inside([x, -z])
        }),
      )
    const shift = [0, 0.8, -0.8, 1.6, -1.6, 2.5, -2.5].find((o) => clear(ax + sx * o, az + sz * o)) ?? 0
    return {
      dashes: dashedGeometry(street, 1.6, 3, 2, 0.14),
      // Turn the words so their tops point along the way, readable to someone walking it.
      label: { x: ax + sx * shift, z: az + sz * shift, angle: Math.atan2(-(bx - ax), -(bz - az)) },
      texture: groundTextTexture('START', mission.startName.toUpperCase(), MISSION, STREET),
    }
  }, [mission.walk, mission.startName, buildings])
  useEffect(
    () => () => {
      dashes.dispose()
      texture.dispose()
    },
    [dashes, texture],
  )
  return (
    <>
      <mesh geometry={dashes} renderOrder={8}>
        <FlatMaterial color={MISSION} layer={8} />
      </mesh>
      <group position={[label.x, 0.16, label.z]} rotation-y={label.angle}>
        <mesh rotation-x={-Math.PI / 2} renderOrder={9}>
          {/* about as wide as the paving, and long like a road marking so it reads well at a low angle */}
          <planeGeometry args={[3.8, 5]} />
          <meshBasicMaterial
            map={texture}
            transparent
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-9}
            polygonOffsetUnits={-9}
          />
        </mesh>
      </group>
    </>
  )
}

// A soft pulsing circle on the ground: the search area of a secret mission, or the found target.
function Pulse({ centre: [x, y], radius }) {
  const ring = useRef()
  const fill = useRef()
  useFrame(({ clock }) => {
    const t = (clock.elapsedTime % 1.6) / 1.6
    ring.current.scale.setScalar(0.8 + 0.2 * t)
    ring.current.material.opacity = 1 - 0.55 * t
    fill.current.material.opacity = 0.26 + 0.1 * Math.sin(clock.elapsedTime * 4)
  })
  return (
    <group position={[x, 1.5, -y]} rotation-x={-Math.PI / 2}>
      <mesh ref={fill} renderOrder={22}>
        <circleGeometry args={[radius, 48]} />
        <meshBasicMaterial color={MISSION} transparent depthTest={false} />
      </mesh>
      <mesh ref={ring} renderOrder={23}>
        <ringGeometry args={[radius * 0.88, radius, 64]} />
        <meshBasicMaterial color={MISSION} transparent depthTest={false} />
      </mesh>
    </group>
  )
}

// A German bus stop sign, a green ring around yellow, on a pole: big enough to see from above.
function BusStopSign({ at: [x, y] }) {
  return (
    <group position={[x, 0, -y]}>
      <mesh position-y={3}>
        <cylinderGeometry args={[0.25, 0.25, 6, 8]} />
        <meshLambertMaterial color="#555" />
      </mesh>
      <mesh position-y={6.2}>
        <cylinderGeometry args={[5, 5, 0.6, 32]} />
        <meshLambertMaterial color="#1e7a3c" />
      </mesh>
      <mesh position-y={6.4}>
        <cylinderGeometry args={[3.8, 3.8, 0.6, 32]} />
        <meshLambertMaterial color="#f5d000" />
      </mesh>
    </group>
  )
}

const EYE = 2 // metres: eye height while walking
const LOOK_AHEAD = 13 // metres: how far ahead the walker looks
const LOOK_HEIGHT = 2.6

// A walking route as something the camera can follow: `at(s)` is the scene point `s` metres along it.
// The route's first and last steps (into the starting point and the landmark itself) are left out,
// so the walk stays on the streets.
function walkPath(line) {
  const pts = line.length > 3 ? line.slice(1, -1) : line
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const length = cum.at(-1)
  // Beyond the end it carries straight on, so looking ahead near the end stays level.
  const at = (s, h = EYE) => {
    const d = Math.max(s, 0)
    let i = 1
    while (i < pts.length - 1 && cum[i] < d) i++
    const seg = cum[i] - cum[i - 1] || 1
    const t = (d - cum[i - 1]) / seg
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i] ?? pts[i - 1]
    return [x0 + (x1 - x0) * t, h, -(y0 + (y1 - y0) * t)]
  }
  return { length, at }
}

// Glides the camera to a new view: down to the street in front of a landmark, or back to the overview.
// Also keeps the near clipping plane small when the camera is close, so nothing is cut off at street level.
function CameraRig({ view, home }) {
  const { camera } = useThree()
  const controls = useThree((s) => s.controls)
  const flight = useRef(null)
  const [hx, hy, hz] = home

  // Aim at the middle of the kit once, when the controls first appear.
  useEffect(() => {
    if (!controls) return
    controls.target.set(hx, hy, hz)
    controls.update()
  }, [controls, hx, hy, hz])

  const walk = useRef(null)

  // A new view: glide there. A view with a `walk` (a line in local metres) first glides down to its start,
  // then walks along it at eye height, and calls `onArrive` at the end.
  useEffect(() => {
    if (!view || !controls) return
    walk.current = null
    const path = view.walk ? walkPath(view.walk) : null
    const to = path ? { position: path.at(0), target: path.at(LOOK_AHEAD, LOOK_HEIGHT) } : view
    flight.current = {
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPos: new THREE.Vector3(...to.position),
      toTarget: new THREE.Vector3(...to.target),
      // A wider lens at street level, like street-view photos.
      fromFov: camera.fov,
      toFov: view.street ? STREET_FOV : OVERVIEW_FOV,
      t: 0,
      then: path && { path, s: 0, time: 0, onArrive: view.onArrive },
    }
  }, [view, controls, camera])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    const f = flight.current
    if (f && controls) {
      f.t = Math.min(1, f.t + dt / 1.8)
      const k = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2 // ease in and out
      camera.position.lerpVectors(f.fromPos, f.toPos, k)
      controls.target.lerpVectors(f.fromTarget, f.toTarget, k)
      camera.fov = f.fromFov + (f.toFov - f.fromFov) * k
      camera.updateProjectionMatrix()
      controls.update()
      if (f.t === 1) {
        flight.current = null
        walk.current = f.then
      }
    }
    const w = walk.current
    if (w && controls) {
      // Walk faster than life so the film stays short: 6 to 22 seconds, easing in and out.
      // (The walk's own clock may take bigger steps, so it lasts as long on a slow computer.)
      const duration = Math.min(22, Math.max(6, w.path.length / 12))
      w.time = Math.min(duration, w.time + Math.min(dtRaw, 0.25))
      const u = w.time / duration
      w.s = w.path.length * u * u * (3 - 2 * u)
      camera.position.set(...w.path.at(w.s))
      // Look a little way ahead along the route, turning smoothly at corners.
      const ahead = new THREE.Vector3(...w.path.at(w.s + LOOK_AHEAD, LOOK_HEIGHT))
      controls.target.lerp(ahead, 1 - Math.exp(-Math.min(dtRaw, 0.25) * 6))
      controls.update()
      if (w.time >= duration) {
        walk.current = null
        w.onArrive?.()
      }
    }
    const distance = controls ? camera.position.distanceTo(controls.target) : 1000
    const near = Math.min(10, Math.max(0.3, distance / 150))
    if (Math.abs(camera.near - near) > near * 0.1) {
      camera.near = near
      camera.updateProjectionMatrix()
    }
  })
  return null
}

function ReachPanel({ reach, busy, tour, showTour, onToggleTour }) {
  return (
    <>
      <TourCard tour={tour} show={showTour} onToggle={onToggleTour} />
      {busy && <p className="hint">Calculating…</p>}
      {!busy && !reach && <p className="hint">Click anywhere on the ground to start a walk from there.</p>}
      {!busy && reach?.error && <p className="warning">{reach.error}</p>}
      {!busy && reach?.areas && (
        <table>
          <thead>
            <tr>
              <th>Walk</th>
              <th>Buildings</th>
              <th>Residents</th>
            </tr>
          </thead>
          <tbody>
            {reach.areas.map((a, k) => (
              <tr key={a.minutes}>
                <td>
                  <span className="swatch" style={{ background: REACH_COLORS[k] }} />
                  {a.minutes} min
                </td>
                <td>{a.buildings.length.toLocaleString('en')}</td>
                <td>
                  about {a.residents.toLocaleString('en')}
                  {a.missing > 0 && (
                    <span className="missing">
                      {' '}
                      + {a.missing} {a.missing === 1 ? 'cell' : 'cells'} without a figure
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="method">
        <p>
          The walk starts at the street node nearest to your click (it must be within {MAX_SNAP_M} m) and follows the
          pedestrian network at 4.8 km/h, which is {SPEED_M_PER_MIN} m per minute, for {MINUTES.join(', ')} minutes.
        </p>
        <p>
          Each area is the streets reached in that time, including the reached part of the last street, widened by a band
          of {BAND_M} m on each side. A building counts if it touches the area.
        </p>
        <p>
          Residents come from the 100 m census cells (Zensus 2022): each cell adds its population times the share of the
          cell that lies inside the area. The sum is rounded to the nearest 10.
        </p>
        <p>
          Cells where the census published no figure are left out of the sum, not counted as zero; the panel shows how
          many of them overlap the area.
        </p>
      </div>
    </>
  )
}

// The legend starts open on wide screens and folded on phones, where it would cover the map.
// "minutes" as "1 h 6 min" or "21 min"
function duration(minutes) {
  const m = Math.round(minutes)
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`
}

// The button for the landmark tour, and when it is shown: its length, its time on foot and by bicycle,
// and the landmarks in the order the round passes them.
// In the landmarks tab, `onSelect` makes each stop a link to that landmark's street view and flyer.
function TourCard({ tour, show, onToggle, onSelect }) {
  if (!tour) return null
  return (
    <div className="tour">
      <button className={show ? 'tour-button on' : 'tour-button'} onClick={onToggle}>
        <span className="tour-line" />
        {show ? 'Hide the landmark tour' : 'Show a walk past all 17 landmarks'}
      </button>
      {show && (
        <>
          <p className="tour-summary">
            <strong>{(tour.metres / 1000).toFixed(1)} km</strong> round from the {tour.order[0].name}:
            <br />
            on foot about <strong>{duration(tour.metres / SPEED_M_PER_MIN)}</strong> (4.8 km/h), by bicycle about{' '}
            <strong>{duration(tour.metres / BIKE_M_PER_MIN)}</strong> (15 km/h), not counting time spent visiting.
          </p>
          <ol className="tour-stops">
            {tour.legs.map((l) => (
              <li key={l.from.id}>
                <span className="badge">{l.from.number}</span>
                {onSelect ? (
                  <button className="tour-stop" onClick={() => onSelect(l.from.id)}>
                    {l.from.name}
                  </button>
                ) : (
                  <span>{l.from.name}</span>
                )}
                <span className="tour-leg">{Math.round(l.metres / 10) * 10} m to the next</span>
              </li>
            ))}
            <li>
              <span className="badge">{tour.order[0].number}</span>
              <span>back at the start</span>
            </li>
          </ol>
          <p className="small-note">
            The round follows the pedestrian network and passes the street in front of each landmark. Its order is
            worked out to be short, but it is not guaranteed to be the very shortest. Some of these paths are for
            walking only, so a bicycle route may need small detours.
          </p>
        </>
      )}
    </div>
  )
}

function Legend({ buildings, showLandmark, showTour, showMission }) {
  const present = useMemo(() => new Set(buildings?.map((b) => b.use)), [buildings])
  const [open] = useState(() => !window.matchMedia('(max-width: 700px)').matches)
  return (
    <details className="legend" open={open}>
      <summary>Legend</summary>
      <h2>Main use of the building</h2>
      <ul>
        {USES.filter(([key]) => present.has(key)).map(([key, label, color]) => (
          <li key={key}>
            <span className="swatch" style={{ background: color }} />
            {label}
          </li>
        ))}
      </ul>
      <h2>Ground</h2>
      <ul>
        {GROUND_LEGEND.map(([label, color]) => (
          <li key={label}>
            <span className="swatch" style={{ background: color }} />
            {label}
          </li>
        ))}
      </ul>
      {ORIGINAL_FEATURES && <>
      <h2>Reached on foot</h2>
      <ul>
        {MINUTES.map((m, k) => (
          <li key={m}>
            <span className="swatch" style={{ background: REACH_COLORS[k] }} />
            within {m} min
          </li>
        ))}
      </ul>
      </>}
      {showMission && (
        <>
          <h2>Secret mission</h2>
          <ul>
            <li>
              <span className="swatch" style={{ background: MISSION }} />
              search area, target and the way there
            </li>
          </ul>
        </>
      )}
      {showTour && (
        <>
          <h2>Landmark tour</h2>
          <ul>
            <li>
              <span className="swatch" style={{ background: TOUR }} />
              round past all landmarks
            </li>
          </ul>
        </>
      )}
      {showLandmark && (
        <>
          <h2>Landmarks</h2>
          <ul>
            <li>
              <span className="swatch" style={{ background: 'transparent', border: `2px solid ${ROUTE}` }} />
              chosen landmark (outlined)
            </li>
            <li>
              <span className="swatch" style={{ background: ROUTE }} />
              walk from the bus stop
            </li>
          </ul>
        </>
      )}
    </details>
  )
}
