// A clean navigation-map palette: light grey streets with white edges, beige and grey buildings with soft
// tints by use, soft green parks, light blue water, a warm off-white ground. Red is never used here:
// it is reserved for the Guardian's interference (src/Guardian.jsx). Highlights are navigation blue.

export const USES = [
  ['residential', 'residential', '#ebe5da'],
  ['service', 'service', '#e5ddcf'],
  ['office', 'office', '#dde0e4'],
  ['retail', 'retail', '#e9dfcc'],
  ['food_and_drink', 'food and drink', '#ece0cf'],
  ['accommodation', 'accommodation', '#e6dfdc'],
  ['entertainment', 'entertainment', '#e1dbe4'],
  ['culture', 'culture', '#dcd8e8'],
  ['education', 'education', '#dee6d4'],
  ['civic', 'civic', '#d7e3dc'],
  ['health', 'health', '#dcebe4'],
  ['sport', 'sport', '#d9e7cc'],
  ['transport', 'transport', '#d6d4d0'],
  ['light_industrial', 'light industrial', '#cfccc6'],
  ['undefined', 'use not known', '#ede9e1'],
  ['none', 'no use given', '#f0ede6'],
]

export const USE_COLOR = Object.fromEntries(USES.map(([key, , color]) => [key, color]))

// Roofs: light greys and warm stone, slightly darker than the walls so the shapes read.
export const ROOFS = ['#d2cdc4', '#cbc6bd', '#c5c7ca', '#d8d3ca', '#bfc2c6', '#cfcbc3']

// 5, 10 and 15 minutes: darkest for the nearest.
export const REACH_COLORS = ['#1f5a96', '#4f8cc9', '#a3c7ea']
export const REACH_OPACITY = 0.55

// The chosen landmark's building, and the walk to it from the bus stop.
export const LANDMARK = '#1a73e8'
export const ROUTE = '#1a73e8'
// The round past all landmarks
export const TOUR = '#6a2c91'
// Secret missions: the search area, the target and the way there
export const MISSION = '#0f766e'

// Ground, streets and land use, painted flat.
export const SKY = '#f5f3ee'
export const GROUND = '#f4f1eb'
export const STREET = '#d9d9d6'
export const STREET_EDGE = '#ffffff'
export const INK = '#6f6a63'

export const LANDUSE = {
  residential: '#efebe4',
  'mixed use': '#ece8e1',
  'special functions': '#e9e6e0',
  'industrial and commercial': '#e6e4df',
  recreation: '#c5e3b8',
  cemetery: '#cfe3c5',
  square: '#ebe8e2',
  wasteland: '#e5e3d6',
  'flowing water': '#a7d1ee',
  'standing water': '#a7d1ee',
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
