import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/store/useGameStore'

const POS_MESSAGES: Record<number, string> = {
  1: '🏆 CHAMPION! Unbeatable brain power!',
  2: '🥈 So close! Great driving!',
  3: '🥉 On the podium! Keep racing!',
  4: 'Almost there! Keep it up!',
  5: 'Every race makes you sharper!',
}

export default function PostRaceScreen() {
  const navigate = useNavigate()
  const { raceResult, resetRace } = useGameStore()

  if (!raceResult) {
    navigate('/home', { replace: true })
    return null
  }

  const { position, totalVehicles, score, coinsEarned, xpEarned,
          distanceTraveled, qualiScore, gridPosition } = raceResult

  const handlePlayAgain = () => { resetRace(); navigate('/race-setup') }
  const handleHome      = () => { resetRace(); navigate('/home') }

  return (
    <div className="screen" style={{ paddingTop: 28 }}>
      {/* Position banner */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          fontSize: 56, fontWeight: 900,
          background: 'linear-gradient(135deg, #ff6b35, #cc3300)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          {position} / {totalVehicles}
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{POS_MESSAGES[position] ?? 'Great race!'}</h1>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <StatCard label="Race Score"    value={score.toLocaleString()}          icon="🏁" color="var(--accent)" />
        <StatCard label="Coins Earned"  value={`+${coinsEarned}`}               icon="🪙" color="var(--gold)" />
        <StatCard label="XP Earned"     value={`+${xpEarned}`}                  icon="⚡" color="var(--secondary)" />
        <StatCard label="Distance"      value={`${Math.round(distanceTraveled)}m`} icon="📏" color="var(--text)" />
        <StatCard label="Qualifier"     value={`${qualiScore}/5 correct`}       icon="🧠" color="var(--success)" />
        <StatCard label="Grid Start"    value={`P${gridPosition}`}              icon="🏎️" color={gridPosition === 1 ? 'var(--gold)' : 'var(--text-muted)'} />
      </div>

      {/* Quali summary */}
      <div className="card" style={{ marginBottom: 20, background: 'var(--surface-2)', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Qualification result</div>
        <div style={{ fontWeight: 700 }}>
          {qualiScore}/5 correct → Started P{gridPosition}
          {gridPosition === 1 ? ' (No delay 🚀)' : ` (${(gridPosition - 1) * 0.8}s delay)`}
        </div>
        {qualiScore === 5 && (
          <div style={{ color: 'var(--success)', fontSize: 13, marginTop: 6 }}>
            🌟 Perfect qualifier! You owned the grid.
          </div>
        )}
      </div>

      {/* CTA */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="btn btn-primary btn-full btn-lg" onClick={handlePlayAgain}>
          🔄 Race Again
        </button>
        <button className="btn btn-outline btn-full" onClick={handleHome}>
          🏠 Back to Home
        </button>
        <button className="btn btn-ghost btn-full" style={{ fontSize: 13 }}
          onClick={() => { resetRace(); navigate('/garage') }}>
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
