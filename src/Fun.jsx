import { SPEED_M_PER_MIN } from './reach.js'

// The playful extras: the two buttons over the map, the gossip card, and the secret mission card.

export function FunBar({ gossipOn, onGossip, onSuspicious }) {
  return (
    <div className="funbar">
      <button className={gossipOn ? 'fun-button on' : 'fun-button'} aria-pressed={gossipOn} onClick={onGossip}>
        <span className="fun-icon" aria-hidden="true">
          ❝
        </span>
        Let the Buildings Gossip
      </button>
      <button className="fun-button" onClick={onSuspicious}>
        <span className="fun-icon" aria-hidden="true">
          ?
        </span>
        I’m Feeling Suspicious
      </button>
    </div>
  )
}

export function GossipCard({ lm, gossip, onClose, onGo }) {
  return (
    <aside className={gossip.serious ? 'gossip-card serious' : 'gossip-card'} role="dialog" aria-label={`${lm.name} says`}>
      <button className="card-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <p className="gossip-personality">{gossip.personality}</p>
      <h2>
        <span className="badge">{lm.number}</span>
        {lm.name}
      </h2>
      <blockquote>“{gossip.quote}”</blockquote>
      <p className="gossip-fact">
        <strong>True story:</strong> {gossip.fact}
      </p>
      <button className="card-action" onClick={onGo}>
        Go there ›
      </button>
    </aside>
  )
}

const minutes = (m) => Math.max(1, Math.round(m / SPEED_M_PER_MIN))

export function MissionCard({ mission, solved, onReveal, onShowWay, onComplete, onNew, onGo, onClose }) {
  const { lm, clue, walk, from, revealed, showWay, done } = mission
  return (
    <aside className="mission-card" role="dialog" aria-label="Secret mission">
      <button className="card-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      {done ? (
        <>
          <p className="mission-label">Mission complete</p>
          <h2>Well done, agent.</h2>
          <p>
            You found <strong>{lm.name}</strong>. Missions solved: {solved}.
          </p>
          <p className="gossip-fact">
            <strong>Your reward, a true story:</strong> {mission.fact}
          </p>
          <div className="mission-actions">
            <button className="card-action" onClick={onNew}>
              Another mission
            </button>
            <button className="card-action quiet" onClick={onGo}>
              Visit it in street view
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mission-label">Secret mission</p>
          <p className="mission-clue">{clue}</p>
          <p className="mission-distance">
            {walk.metres < 30
              ? `You are practically standing on it: it is right by ${from}.`
              : `From ${from}: about ${Math.round(walk.metres / 10) * 10} m, ${minutes(walk.metres)} min on foot.`}
            {!revealed && ' The pulsing circle on the map marks the search area.'}
          </p>
          {revealed && (
            <p className="mission-answer">
              <span className="badge">{lm.number}</span> {lm.name}
            </p>
          )}
          <div className="mission-actions">
            {!revealed && (
              <button className="card-action quiet" onClick={onReveal}>
                Reveal the destination
              </button>
            )}
            {!showWay && (
              <button className="card-action quiet" onClick={onShowWay}>
                Show me the way
              </button>
            )}
            <button className="card-action" onClick={onComplete}>
              Mission complete
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
