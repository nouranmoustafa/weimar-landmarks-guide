import { useEffect, useState } from 'react'
import { DayDots, SeasonSummary, formatDate } from './LandmarkList.jsx'
import { currentSeason } from './landmarks.js'

const PREVIEW_W = 250
const PREVIEW_H = 330

// The folded flyer as a quick preview beside a pin, while the mouse is over it: the photo collage,
// name, this season's opening hours and the walk from the bus. `at` is the pin's box on screen.
export function FlyerPreview({ landmark: lm, at, today }) {
  const src = (p) => `${import.meta.env.BASE_URL}data/landmarks/photos/${p.file}`
  // to the right of the pin, or to its left near the right edge; kept inside the window vertically
  const right = at.right + 12 + PREVIEW_W < window.innerWidth - 8
  const left = right ? at.right + 12 : at.left - 12 - PREVIEW_W
  const top = Math.min(Math.max(8, at.top + at.height / 2 - PREVIEW_H / 2), window.innerHeight - PREVIEW_H - 40)
  return (
    <div className={right ? 'flyer-preview' : 'flyer-preview from-left'} style={{ left, top, width: PREVIEW_W }} aria-hidden="true">
      <div className={`collage n${Math.min(lm.photos.length, 4)}`}>
        {lm.photos.slice(0, 4).map((p) => (
          <img key={p.file} src={src(p)} alt="" />
        ))}
      </div>
      <div className="cover-title">
        <span className="badge">{lm.number}</span>
        <div>
          <h2>{lm.name}</h2>
          <p>{lm.tagline}</p>
        </div>
      </div>
      <div className="preview-facts">
        <SeasonSummary season={currentSeason(lm.hours.seasons, today)} />
        <span className="bus">
          <span className="stop-sign">H</span>
          {lm.walk.minutes} min walk from {lm.walk.stop}
        </span>
      </div>
      <span className="unfold">Click the number for street view and the full flyer ›</span>
    </div>
  )
}

// A folded three-panel flyer. Folded, it shows a cover with a photo collage; pressed, it unfolds to
// history (left), photos (middle) and opening hours with the walk from the bus (right).
export default function Flyer({ landmark: lm, checked, onClose }) {
  const [open, setOpen] = useState(false)
  const [photo, setPhoto] = useState(0)

  // A new landmark arrives folded.
  useEffect(() => {
    setOpen(false)
    setPhoto(0)
  }, [lm.id])

  const src = (p) => `${import.meta.env.BASE_URL}data/landmarks/photos/${p.file}`
  const shown = lm.photos[photo] ?? lm.photos[0]

  return (
    <div className={open ? 'flyer open' : 'flyer'}>
      <div className="flyer-tools">
        {open && (
          <button onClick={() => setOpen(false)} title="Fold the flyer">
            Fold
          </button>
        )}
        <button onClick={onClose} title="Close the flyer and go back to the overview" aria-label="Close">
          ×
        </button>
      </div>

      <div className="sheet">
        {/* middle panel: photos */}
        <section className="middle">
          <figure className="photo-main">
            <img src={src(shown)} alt={`${lm.name}, photo ${photo + 1}`} />
            <figcaption>
              Photo: {shown.author},{' '}
              {shown.licenseUrl ? (
                <a href={shown.licenseUrl} target="_blank" rel="noreferrer">
                  {shown.license}
                </a>
              ) : (
                shown.license
              )}
              ,{' '}
              <a href={shown.source} target="_blank" rel="noreferrer">
                Wikimedia Commons
              </a>
            </figcaption>
          </figure>
          <div className="thumbs">
            {lm.photos.map((p, i) => (
              <button key={p.file} className={i === photo ? 'thumb on' : 'thumb'} onClick={() => setPhoto(i)}>
                <img src={src(p)} alt="" />
              </button>
            ))}
          </div>
          <p className="address">
            {lm.nameDe}
            <br />
            {lm.address}, Weimar
          </p>
        </section>

        {/* left flap: history */}
        <section className="flap left">
          <div className="face front">
            <h3>History</h3>
            {lm.history.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
            <p className="small">
              Sources:{' '}
              {lm.links.map((l, i) => (
                <span key={l.url}>
                  {i > 0 && ' · '}
                  <a href={l.url} target="_blank" rel="noreferrer">
                    {l.label}
                  </a>
                </span>
              ))}
            </p>
          </div>
          <div className="face back paper" />
        </section>

        {/* right flap: hours and the walk; its back is the cover */}
        <section className="flap right">
          <div className="face front">
            <h3>Opening hours</h3>
            {lm.hours.seasons.map((s) => (
              <div className="season-block" key={s.label}>
                <h4>{s.label}</h4>
                {!s.closed && (
                  <p className="small">
                    {formatDate(s.from)} – {formatDate(s.to)}
                  </p>
                )}
                {s.rows?.map((row, i) => (
                  <div className="hours-row" key={i}>
                    <DayDots days={row.days} />
                    <span>{row.hours}</span>
                  </div>
                ))}
                {s.closed && <p className="closed">{s.closed}</p>}
                {s.unconfirmed && <p className="unconfirmed">{s.unconfirmed}</p>}
                {s.note && <p className="small">{s.note}</p>}
              </div>
            ))}
            <p className="small">
              Source:{' '}
              <a href={lm.hours.source.url} target="_blank" rel="noreferrer">
                {lm.hours.source.label}
              </a>
              , checked {formatDate(checked)}.
            </p>

            <h3>Getting there</h3>
            <p className="walk">
              <span className="stop-sign">H</span>
              <span>
                From the bus stop <strong>{lm.walk.stop}</strong>: about <strong>{lm.walk.minutes} min</strong> on foot,{' '}
                {Math.round(lm.walk.metres / 10) * 10} m at 4.8 km/h. The route is drawn on the map.
              </span>
            </p>
          </div>

          <button className="face back cover" onClick={() => setOpen(true)} aria-label={`Open the flyer for ${lm.name}`}>
            <div className={`collage n${Math.min(lm.photos.length, 4)}`}>
              {lm.photos.slice(0, 4).map((p) => (
                <img key={p.file} src={src(p)} alt="" />
              ))}
            </div>
            <div className="cover-title">
              <span className="badge">{lm.number}</span>
              <div>
                <h2>{lm.name}</h2>
                <p>{lm.tagline}</p>
              </div>
            </div>
            <span className="unfold">Press to unfold ›</span>
          </button>
        </section>
      </div>
    </div>
  )
}
