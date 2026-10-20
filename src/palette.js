// An illustrated palette taken from Weimar's facades: the ochre yellow of Goethe's and Schiller's houses,
// apricot and rose plaster, sage shutters, terracotta and slate roofs, sandstone paving, the green Ilm park.
// The reach keeps one accent colour (blue) in three shades, and the chosen landmark is red.

export const USES = [
  ['residential', 'residential', '#efd48e'],
  ['service', 'service', '#e9b98c'],
  ['office', 'office', '#cfc6b2'],
  ['retail', 'retail', '#f2a965'],
  ['food_and_drink', 'food and drink', '#e8957a'],
  ['accommodation', 'accommodation', '#ecbcbc'],
  ['entertainment', 'entertainment', '#d397b4'],
  ['culture', 'culture', '#bfa2d6'],
  ['education', 'education', '#b2cf92'],
  ['civic', 'civic', '#93c3a3'],
  ['health', 'health', '#bfe0cc'],
  ['sport', 'sport', '#a3c96d'],
  ['transport', 'transport', '#aaa49a'],
  ['light_industrial', 'light industrial', '#948a7b'],
  ['undefined', 'use not known', '#f1e5c9'],
  ['none', 'no use given', '#f6f0e3'],
]

export const USE_COLOR = Object.fromEntries(USES.map(([key, , color]) => [key, color]))

// Roofs: mostly terracotta tiles, some slate.
export const ROOFS = ['#c76c4c', '#c76c4c', '#b45d43', '#c97a55', '#6e7c88', '#7b8691']

// 5, 10 and 15 minutes: darkest for the nearest.
export const REACH_COLORS = ['#1f5a96', '#4f8cc9', '#a3c7ea']
export const REACH_OPACITY = 0.55

// The chosen landmark's building, and the walk to it from the bus stop.
export const LANDMARK = '#c2410c'
export const ROUTE = '#e8590c'
// The round past all landmarks
export const TOUR = '#6a2c91'
// Secret missions: the search area, the target and the way there
export const MISSION = '#0f766e'

// Ground, streets and land use, painted flat.
export const SKY = '#efe6d4'
export const GROUND = '#f3ead6'
export const STREET = '#fbf6ea'
export const STREET_EDGE = '#cdbf9f'
export const INK = '#3a312a'

export const LANDUSE = {
  residential: '#f1e4c8',
  'mixed use': '#f3dfc6',
  'special functions': '#eedfd3',
  'industrial and commercial': '#e4ddcd',
  recreation: '#b9d595',
  cemetery: '#a8c58c',
  square: '#ece2cc',
  wasteland: '#ddd4b4',
  'flowing water': '#8ec4dc',
  'standing water': '#8ec4dc',
}

// What the legend names under "Ground"
export const GROUND_LEGEND = [
  ['park and green', LANDUSE.recreation],
  ['water', LANDUSE['flowing water']],
  ['square', LANDUSE.square],
  ['street', STREET],
]

// Street lights: dark green iron, warm glass.
export const LAMP_IRON = '#2f4a3b'
export const LAMP_GLASS = '#ffd98a'
