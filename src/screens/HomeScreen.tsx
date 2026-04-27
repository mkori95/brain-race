import { useNavigate } from 'react-router-dom'
import { useGameStore, LEVEL_THRESHOLDS } from '@/store/useGameStore'
import { signOut } from '@/services/auth'

const LEVEL_COLORS: Record<string, string> = {
  rookie: '#888',
  amateur: '#4ecdc4',
  pro: '#22c55e',
  expert: '#f59e0b',
  legend: '#ffd700',
}

const LEVEL_EMOJIS: Record<string, string> = {
  rookie: '🔰', amateur: '⚡', pro: '🔥', expert: '💎', legend: '👑',
}

const today = () => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

const DAILY_TOPICS = [
  'Python', 'Linux', 'World History', 'Space & Astronomy', 'Formula 1',
  'Ancient Civilizations', 'Human Biology', 'Music', 'Geography', 'Mathematics',
]
const getDailyTopic = () => {
  const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24))
  return DAILY_TOPICS[dayIndex % DAILY_TOPICS.length]
}

export default function HomeScreen() {
  const navigate = useNavigate()
  const { user, setUser, setAuthLoading } = useGameStore()

  if (!user) return null

  const { progress, persona } = user
  const level = progress.level
  const nextLevelXp = (Object.values(LEVEL_THRESHOLDS) as number[]).find((x) => x > progress.xp) ?? progress.xp
  const xpPercent = Math.min(100, (progress.xp / nextLevelXp) * 100)
  const dailyTopic = getDailyTopic()
  const dailyDone = progress.dailyChallenge?.lastCompleted === new Date().toISOString().split('T')[0]

  const handleSignOut = async () => {
    await signOut()
    setUser(null)
    setAuthLoading(false)
    navigate('/auth')
  }

  return (
    <div className="screen" style={{ paddingTop: 20 }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{today()}</p>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>
            Hey, {persona.name} {LEVEL_EMOJIS[level]}
          </h1>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 12px',
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--gold)',
            }}
          >
            🪙 {progress.coins.toLocaleString()}
          </div>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, padding: '4px 8px' }}
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Level & XP */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 10,
                background: LEVEL_COLORS[level] + '22',
                color: LEVEL_COLORS[level],
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {LEVEL_EMOJIS[level]} {level}
            </span>
          </div>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{progress.xp.toLocaleString()} XP</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${xpPercent}%`, background: LEVEL_COLORS[level] }} />
        </div>
        {level !== 'legend' && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
            {(nextLevelXp - progress.xp).toLocaleString()} XP to next level
          </p>
        )}
      </div>

      {/* Main play button */}
      <button
        className="btn btn-primary btn-full btn-lg"
        style={{
          marginBottom: 14,
          fontSize: 20,
          fontWeight: 900,
          padding: '20px',
          borderRadius: 'var(--radius-lg)',
          background: 'linear-gradient(135deg, #ff6b35, #cc3300)',
          boxShadow: '0 4px 24px rgba(255,107,53,0.35)',
          letterSpacing: '0.04em',
        }}
        onClick={() => navigate('/race-setup')}
      >
        🚦 RACE NOW
      </button>

      {/* Daily challenge */}
      <button
        className="btn btn-full"
        style={{
          marginBottom: 14,
          background: dailyDone ? 'var(--surface)' : 'linear-gradient(135deg, #1a1a35, #2a2a55)',
          border: dailyDone ? '1px solid var(--border)' : '1px solid var(--secondary)',
          borderRadius: 'var(--radius)',
          padding: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: dailyDone ? 'var(--text-muted)' : 'var(--text)',
          cursor: dailyDone ? 'default' : 'pointer',
        }}
        onClick={() => !dailyDone && navigate('/daily')}
        disabled={dailyDone}
      >
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {dailyDone ? '✅ Daily Complete' : '⭐ Daily Challenge'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {dailyDone ? 'Come back tomorrow' : `Today: ${dailyTopic} • +300 🪙`}
          </div>
        </div>
        {!dailyDone && <span style={{ color: 'var(--secondary)', fontSize: 18 }}>→</span>}
      </button>

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
        <StatCard label="Best (Cars)" value={`${Math.round(progress.personalBests.cars)}m`} emoji="🏎️" />
        <StatCard label="Best (Bikes)" value={`${Math.round(progress.personalBests.bikes)}m`} emoji="🏍️" />
        <StatCard label="Best (Trucks)" value={`${Math.round(progress.personalBests.trucks)}m`} emoji="🚛" />
      </div>

      {/* Secondary nav */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <NavCard emoji="🏪" label="Garage" sub="Buy & upgrade vehicles" onClick={() => navigate('/garage')} />
        <NavCard emoji="👤" label="Profile" sub="Edit your preferences" onClick={() => navigate('/profile')} />
      </div>
    </div>
  )
}

function StatCard({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 12 }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{emoji}</div>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function NavCard({ emoji, label, sub, onClick }: { emoji: string; label: string; sub: string; onClick: () => void }) {
  return (
    <div className="card" style={{ cursor: 'pointer', padding: 16 }} onClick={onClick}>
      <div style={{ fontSize: 24, marginBottom: 6 }}>{emoji}</div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}
