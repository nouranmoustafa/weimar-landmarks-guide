# Walking reach, Weimar

A web app that shows how far you can walk from any point in central Weimar, and about how many people live there.

The whole city kit area is shown in 3D as an illustrated map: every building is raised from its footprint to its measured height, its walls coloured by its main use in a palette taken from Weimar's facades (the ochre yellow of Goethe's and Schiller's houses, apricot, rose, sage), with terracotta and slate roofs, flat cel shading and ink outlines. The ground is painted by land use, with the Park an der Ilm green and the Ilm blue, and the pedestrian network runs as cream paving. Historic dark-green street lights stand along the streets. About 1,000 people, drawn like the scale figures in architects' drawings (an inverted triangle for the upper body, a round head, thin legs and arms, some with a triangular skirt or a coloured top), walk the network at walking pace; more of them stroll near each landmark, and small groups stand in front of the landmarks looking at them. Zoom in or use a landmark's street view to see them. The landmarks' own buildings carry illustrated facades drawn after their photos: wall and roof colours, windows and frames, shutters, pilasters, arcades, Gothic windows, and a slate mansard with dormers where the real building has one. These are drawings, not the photos themselves, and the buildings keep their plain block shapes from the 3D model. A legend names every colour. You can orbit, pan and zoom with the mouse. Click on the ground, and the app shows three nested areas you can reach on foot in 5, 10 and 15 minutes, in three shades of blue. The buildings that touch each area turn the matching shade. A panel lists, for each walk, how many buildings it reaches and about how many residents live in it.

A second tab, **Landmarks**, lists 17 landmarks inside the kit area, from Goethe's House to the Bauhaus Museum, with their opening days and hours and the walk from the nearest bus stop. Hovering a numbered pin in the overview shows its folded flyer beside it, with photos, this season's opening hours and the walk from the bus. Press a landmark in the list or its numbered pin on the map: the camera glides down to eye level on a street in front of it, its building turns orange, and the walk from the bus stop is drawn in orange. A folded flyer appears with a collage of photos on its cover. Press the flyer and it unfolds into three panels: the history of the place, its photos, and its opening hours with the way from the bus.

## Run it

You need [Node.js](https://nodejs.org). In this folder:

```
npm install     install the packages (once)
npm run dev     start the app at http://localhost:5173
```

Drag with the left mouse button to orbit, with the right button to pan, and scroll to zoom. Click on the ground to start a walk. In the Landmarks tab, press a landmark to go there; "Back to the city overview" or the × on the flyer returns to the whole city.

On every push to `main`, GitHub Pages publishes the app at `https://<user>.github.io/<repo>/`.

## Method and its limits

- **Start.** The walk starts at the node of the pedestrian network nearest to the click. If no walkable street is within 100 m, the app says so and doesn't calculate anything.
- **Walking.** The walk follows the network's walkable edges both ways, using each edge's length in metres, at 4.8 km/h, which is 80 m per minute: 400 m in 5 minutes, 800 m in 10, 1,200 m in 15. Slopes, crossings, traffic lights and steps are not taken into account.
- **Areas.** Each area is the set of street pieces reached in that time, including the reachable part of the last street, widened by a band of 25 m on each side and joined into one shape. It isn't a circle or a convex hull. A building counts as reached if it touches the area.
- **Residents.** The residents come from the 100 m census cells of Zensus 2022. Each cell that overlaps an area adds its population times the share of the cell's area inside the area. This assumes people are spread evenly across each cell. The sum is rounded to the nearest 10. The census changes small counts slightly at random to protect privacy, so the figures are approximate.
- **Missing figures.** Some cells have no published resident count. These aren't zero: they are left out of the sum, and the panel shows how many such cells overlap each area. In this kit, one cell has no figure.
- **Edges of the kit.** The network and the buildings stop at the edge of the kit area, so walks that start near the edge are cut short there.

## Gossip and secret missions

Two buttons float over the map.

- **Let the Buildings Gossip** gives each landmark a personality, drawn from its history. Small speech bubbles pop up above the pins. To keep the map readable, a bubble only appears where it covers neither another bubble nor another landmark's pin, so as you zoom and orbit, different buildings get a word in. Clicking a bubble opens a card with the building's name, a joke in its own voice and one true historical fact; "Go there" opens its street view and flyer. The jokes are made up; the facts come from the same sources as the flyers. The Museum of Forced Labour under National Socialism speaks seriously, because it remembers victims.
- **I'm Feeling Suspicious** picks one of 17 predefined missions at random, never the same one twice in a row, with a clue to a landmark. The map shows a pulsing search circle that lies near the landmark but is not centred on it, and is made wide enough (at least 110 m) that at least three landmarks lie well inside it, so it doesn't give the answer away. The card gives the real walking distance on the pedestrian network: from where your last walking reach started, or else from the Market Square. You can reveal the destination, or press "Show me the way": teal dashes are painted along the route on the street, with "START" and the name of the starting point written on the ground at its beginning, and the camera drops to eye height at the start and walks the route through the streets, faster than life (6 to 22 seconds, while the card keeps the real distance and time), then arrives in front of the landmark and opens its flyer; "Skip" jumps straight there. Then press "Mission complete" for a short message, a true fact and the number of missions solved; then start another one. The Museum of Forced Labour is not one of the mission destinations. In a few places the pedestrian network was drawn through building footprints (about 0.7 km of its 46 km, for example passages and courtyards). The mission route avoids those stretches wherever there is a reasonable way round, by counting each metre through a building like 30 metres of open street; the distance shown is the real length of that route, at most a few dozen metres longer than the shortest one. The texts are in `src/gossip.js`; no AI or online service is used.

## Landmark tour: method and limits

At the top of both the Walking reach and the Landmarks tab, the button "Show a walk past all 17 landmarks" draws one round walk, in purple, that starts and ends at the Market Square (with the Tourist Information) and passes the street in front of every landmark. The panel gives its length (about 5.3 km), its time on foot at 4.8 km/h (about 1 h 6 min) and by bicycle at 15 km/h (about 21 min), and the landmarks in order with the distance to the next one. In the Landmarks tab, pressing a stop in that list goes to the landmark's street view and opens its flyer. At street level the purple line is hidden, so it doesn't cross the facades; it comes back in the overview.

- The round follows the same pedestrian network as the walking reach. Distances between landmarks are the shortest walks on it.
- The order is worked out by going to the nearest unvisited landmark each time, then reversing stretches of the round while that makes it shorter. The result is short, but not guaranteed to be the very shortest round.
- The times count moving only, not time spent visiting, waiting at crossings or climbing.
- The bicycle time uses the pedestrian network too. Some of its paths and squares are for walking only, so a real bicycle route may need small detours.

## Landmarks: method and limits

- **Which landmarks.** 17 museums, churches, squares and monuments that lie inside the kit area and are open to visitors or can be seen from the street. Landmarks outside the kit area, such as the Park an der Ilm's Garden House, Belvedere or Buchenwald, are left out because the 3D city and the street network do not reach them.
- **Opening hours** were checked on 20 October 2026 from the official sources named in each flyer: the Klassik Stiftung Weimar's summer flyer 2026, the Weimar Tourist Information's WeimarCard flyer of March 2026, and the Herder Church parish website. The Klassik Stiftung had not yet published its winter hours for 2026/27; where the flyer shows winter hours, they are last winter's and are marked as such. Goethe's House closes for about three years of restoration from 2 November 2026. Hours change: check before you visit.
- **Walk from the bus.** The app takes every bus stop in the kit area, steps straight to the nearest street, follows the pedestrian network at 80 m per minute (4.8 km/h), and steps straight from the street to the landmark. It shows the stop with the shortest walk, rounded to whole minutes. Only stops inside the kit area are counted, so for landmarks near its edge, such as the City Palace and the Goethe and Schiller Archive, a closer stop just outside may be missing.
- **Street view.** This is a view inside the app's own 3D model, not photographs: the camera stands at 2 m eye height on a walkable street about 45 m from the landmark's front, at a spot where no other building blocks the view. The buildings are the plain blocks of the model. The Goethe and Schiller Archive's building lies just outside the kit's building data, and the Park Cave is underground, so neither shows a building.
- **History texts** were written for this app from the sources linked in each flyer, mostly Wikipedia and the Klassik Stiftung.
- **Photos** come from Wikimedia Commons under free licences (CC0, public domain, CC BY, CC BY-SA). Each photo shows its author and licence under it.

## Data sources

All data is in `public/data/`. See `public/data/SOURCES.md` for every file and field.

- Buildings (`buildings.geojson`): footprints and heights from the 3D building models LoD2 of Thuringia, © GDI-Th, licence dl-de/by-2-0. The uses were added by Egor Gaydukov.
- Pedestrian network (`streets.graph.json`): Egor Gaydukov, InfAU, Bauhaus-Universität Weimar.
- Land use per plot (`plots.geojson`), used to paint the ground: Egor Gaydukov, InfAU, Bauhaus-Universität Weimar.
- The street lights and walking figures are decoration: their places are made up along the network, not taken from data.
- Census grid (`zensus.geojson`): Zensus 2022, 100 m grid, © Statistische Ämter des Bundes und der Länder, licence dl-de/by-2-0.

For the landmarks tab, in `public/data/landmarks/` (see its own `SOURCES.md`):

- Landmark and bus stop positions: OpenStreetMap, © OpenStreetMap contributors, licence ODbL.
- Photos: Wikimedia Commons; each photo's author and licence are listed with it.
- Opening hours: Klassik Stiftung Weimar (summer flyer 2026, winter flyer 2025/26), Weimar Tourist Information (WeimarCard flyer, March 2026), Evangelical parish of Weimar.

Attribution line, as shown on the map:

> Buildings: 3D building models LoD2 © GDI-Th (dl-de/by-2-0). Land use and pedestrian network: Egor Gaydukov, InfAU, Bauhaus-Universität Weimar. Census grid: Zensus 2022, © Statistische Ämter des Bundes und der Länder (dl-de/by-2-0). Landmark and bus stop positions © OpenStreetMap contributors (ODbL). Photos: Wikimedia Commons, authors and licences listed with each photo.

## How this was made

1. Tools: Claude Code, with the model Claude Opus 5.5 (`claude-opus-5-5`).
2. I decided:
3. The agent did: it read the city kit, then wrote the 3D city view, the walking-reach and resident calculations, the panel, the legend and this README; for the landmarks tab it gathered bus stops from OpenStreetMap, opening hours from official flyers and photos from Wikimedia Commons, wrote the history texts, built the street view, the walk from the bus and the folding flyer, and tested the result in a browser.
4. I checked:
