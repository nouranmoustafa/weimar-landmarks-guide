import { buildGraph, computeReach, makeProjection, prepareBuildings, prepareCells } from './reach.js'

// Runs the reach calculation away from the page, so orbiting stays smooth while it works.

const load = (file) =>
  fetch(`${import.meta.env.BASE_URL}data/${file}`).then((r) => {
    if (!r.ok) throw new Error(`data/${file}: ${r.status}`)
    return r.json()
  })

const ready = Promise.all(['kit.json', 'streets.graph.json', 'zensus.geojson', 'buildings.geojson'].map(load)).then(
  ([kit, graph, zensus, buildings]) => {
    const project = makeProjection(kit.center)
    return {
      graph: buildGraph(graph, project),
      cells: prepareCells(zensus, project),
      buildings: prepareBuildings(buildings, project),
    }
  },
)

self.onmessage = async ({ data: { id, point } }) => {
  try {
    const result = computeReach(await ready, point)
    if (result.areas)
      result.areas = result.areas.map(({ minutes, shape, buildings, residents, missing }) => ({
        minutes,
        shape,
        buildings: [...buildings],
        residents,
        missing,
      }))
    self.postMessage({ id, result })
  } catch (e) {
    self.postMessage({ id, result: { error: `The calculation failed (${e.message}).` } })
  }
}
