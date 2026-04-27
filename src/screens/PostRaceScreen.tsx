import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/store/useGameStore'

const POS_MESSAGES: Record<number, string> = {
  1: "🏆 CHAMPION! Perfect brain power!",
  2: "🥈 So close! Great thinking!",
  3: "🥉 On the podium! Keep it up!",
  4: "Almost there! Keep racing!",
  5: "Every race makes you smarter!",
}

const POS_CLASSES: Record<number, string> = {
  1: 'pos-1', 2: 'pos-2', 3: 'pos-3', 4: 'pos-4', 5: 'pos-5',
}

export default function PostRaceScreen() {
  const navigate = useNavigate()
  const { raceResult, resetRace } = useGameStore()

  if (!raceResult) {
    navigate('/home', { replace: true })
    return null
  }

  const {
    position, totalVehicles, points, coinsEarned, xpEarned,
    wrongAnswers, totalQuestions, correctAnswers, playerDistance,
  } = raceResult

  const accuracy = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0

  const handlePlayAgain = () => {
    resetRace()
    navigate('/race-setup')
  }

  const handleHome = () => {
    resetRace()
    navigate('/home')
  }

  return (
    <div className="screen" style={{ paddingTop: 28 }}>
      {/* Position banner */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div className={`position-badge ${POS_CLASSES[position] ?? 'pos-5'}`} style={{ display: 'inline-block', marginBottom: 12 }}>
          {position} / {totalVehicles}
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>{POS_MESSAGES[position] ?? 'Great race!'}</h1>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <StatCard label="Points" value={points.toLocaleString()} icon="🏆" color="var(--warning)" />
        <StatCard label="Coins Earned" value={`+${coinsEarned}`} icon="🪙" color="var(--gold)" />
        <StatCard label="XP Earned" value={`+${xpEarned}`} icon="⚡" color="var(--secondary)" />
        <StatCard label="Accuracy" value={`${accuracy}%`} icon="🎯" color={accuracy >= 80 ? 'var(--success)' : accuracy >= 50 ? 'var(--warning)' : 'var(--error)'} />
        <StatCard label="Distance" value={`${Math.round(playerDistance)}m`} icon="📏" color="var(--text)" />
        <StatCard label="Correct" value={`${correctAnswers}/${totalQuestions}`} icon="✅" color="var(--success)" />
      </div>

      {/* Wrong answers review */}
      {wrongAnswers.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p className="section-label">📚 Learn from mistakes</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {wrongAnswers.map(({ question, playerAnswer }, i) => (
              <div key={i} className="card" style={{ borderLeft: '3px solid var(--error)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className="topic-badge">{question.topic}</span>
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{question.question}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: 'var(--error)' }}>✗ You answered: </span>
                    <span style={{ color: 'var(--text-muted)' }}>{playerAnswer || 'No answer'}</span>
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: 'var(--success)' }}>✓ Correct: </span>
                    <span style={{ fontWeight: 600 }}>{question.correct}</span>
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 8,
                    padding: '8px 10px',
                    background: 'var(--surface)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    lineHeight: 1.5,
                  }}
                >
                  💡 {question.explanation}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {wrongAnswers.length === 0 && totalQuestions > 0 && (
        <div
          className="card"
          style={{
            textAlign: 'center',
            marginBottom: 20,
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid var(--success)',
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 6 }}>🌟</div>
          <div style={{ fontWeight: 700, color: 'var(--success)' }}>Perfect Race!</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            You answered every question correctly. Incredible!
          </div>
        </div>
      )}

      {/* CTA buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="btn btn-primary btn-full btn-lg" onClick={handlePlayAgain}>
          🔄 Race Again
        </button>
        <button className="btn btn-outline btn-full" onClick={handleHome}>
          🏠 Back to Home
        </button>
        <button
          className="btn btn-ghost btn-full"
          style={{ fontSize: 13 }}
          onClick={() => { resetRace(); navigate('/garage') }}
        >
          🏪 Go to Garage
        </button>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 14 }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
}
