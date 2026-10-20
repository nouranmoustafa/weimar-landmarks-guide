import { DAYS, currentSeason } from './landmarks.js'

// The landmarks tab: one row per landmark with today's season, its open days and the walk from the bus.
export default function LandmarkList({ landmarks, selected, onSelect, today, checked }) {
  if (!landmarks) return <p className="hint">Loading the landmarks…</p>
  return (
    <>
      <p className="hint">Press a landmark to go there at street level and open its flyer.</p>
      <ol className="landmark-list">
        {landmarks.map((lm) => {
          const season = currentSeason(lm.hours.seasons, today)
          return (
            <li key={lm.id}>
              <button className={lm.id === selected ? 'landmark selected' : 'landmark'} onClick={() => onSelect(lm.id)}>
                <span className="badge">{lm.number}</span>
                <span className="landmark-body">
                  <strong>{lm.name}</strong>
                  <span className="landmark-kind">{lm.kind}</span>
                  <SeasonSummary season={season} />
                  <span className="bus">
                    <span className="stop-sign">H</span>
                    {lm.walk.minutes} min walk ({Math.round(lm.walk.metres / 10) * 10} m) from {lm.walk.stop}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <div className="method">
        <p>
          Opening hours were checked on {formatDate(checked)} from the sources named in each flyer. They change, so check
          before you visit. Where this winter's hours were not yet published, the flyer says so.
        </p>
        <p>
          The walk starts at the bus stop with the shortest walk on the pedestrian network, at 80 m per minute, and
          includes the short straight steps from the stop to the street and from the street to the landmark. Only bus
          stops and streets inside the kit area are counted, so near its edge a closer stop may be missing.
        </p>
      </div>
    </>
  )
}

export function SeasonSummary({ season }) {
  if (!season) return null
  if (season.closed && !season.rows) return <span className="season closed">{season.closed}</span>
  if (!season.rows) return <span className="season unconfirmed">{season.unconfirmed}</span>
  return (
    <span className="season">
      {season.rows.map((row, i) => (
        <span className="hours-row" key={i}>
          <DayDots days={row.days} />
          <span>{row.hours}</span>
        </span>
      ))}
      {season.unconfirmed && <span className="unconfirmed">{season.unconfirmed}</span>}
    </span>
  )
}

export function DayDots({ days }) {
  return (
    <span className="days" aria-label={DAYS.filter((_, i) => days[i]).join(', ')}>
      {DAYS.map((d, i) => (
        <span key={d} className={days[i] ? 'day open' : 'day'} title={d}>
          {d[0]}
        </span>
      ))}
    </span>
  )
}

export function formatDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}
