# Sources for the landmarks tab

Added on 2026-10-20 for the landmarks tab. This folder is not part of the generated city kit; the files one level up are unchanged.

| File | Source | Licence |
| --- | --- | --- |
| `landmarks.json` | positions: OpenStreetMap; texts: written for this app from the sources linked in each entry; opening hours: the sources linked in each entry, checked 2026-10-20 | positions © OpenStreetMap contributors (ODbL) |
| `bus_stops.geojson` | OpenStreetMap, bus stops in the kit area (`highway=bus_stop` and bus platforms), downloaded 2026-10-20 | © OpenStreetMap contributors (ODbL) |
| `photos/` | Wikimedia Commons; author, licence and source page of each photo are in `landmarks.json` | each photo's own licence: CC0, public domain, CC BY or CC BY-SA |

## Attribution

> Landmark and bus stop positions © OpenStreetMap contributors (ODbL). Photos: Wikimedia Commons, authors and licences listed with each photo.

## `landmarks.json`

17 landmarks inside the kit area. Each has `id`, `name`, `nameDe`, `kind`, `address`, `lon`, `lat`, a one-line `tagline`, `history` (paragraphs), `hours`, `links` (the sources for the history) and `photos`.

`hours.seasons` is a list of periods with `label`, `from` and `to` (ISO dates). Each period has either `rows` (`days`: seven 0/1 flags from Monday to Sunday, and `hours`), or `closed` (a sentence). `unconfirmed` marks hours that were not yet published on the day of checking; the app shows that sentence. `hours.source` is where the hours come from.

Opening hours, as of 2026-10-20:

- Klassik Stiftung Weimar houses: summer season flyer 2026 (21 March – 1 November 2026). Winter hours for 2026/27 were not yet published; where the app shows winter hours, they are last winter's (flyer 2025/26) and marked as such.
- House of the Weimar Republic, City Museum, Museum of Pre- and Early History, Museum of Forced Labour, Tourist Information: WeimarCard flyer of Weimar Tourist Information, March 2026.
- Herder Church: the parish website, whose pages give no year.

Each photo has `file`, `width`, `height` (pixels, after shrinking to at most 720 px), `author`, `license`, `licenseUrl` and `source` (the Commons page).

## `bus_stops.geojson`

72 points, one per platform, with `id` (OpenStreetMap node) and `name`. Stops with the same name are the two directions or the platforms of one station.
