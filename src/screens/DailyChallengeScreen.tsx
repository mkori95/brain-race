import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/store/useGameStore'

const DAILY_TOPICS = [
  'Python', 'Linux', 'World History', 'Space & Astronomy', 'Formula 1',
  'Ancient Civilizations', 'Human Biology', 'Music', 'Geography', 'Mathematics',
  'JavaScript', 'Cybersecurity', 'Food & Cooking', 'Animals', 'Movies & TV',
]

const getDailyInfo = () => {
  const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24))
  const topic = DAILY_TOPICS[dayIndex % DAILY_TOPICS.length]
  const dateStr = new Date().toISOString().split('T')[0]
  return { topic, dateStr }
}

const getMidnightCountdown = () => {
  const now = new Date()
  const midnight = new Date()
  midnight.setHours(24, 0, 0, 0)
  const diff = midnight.getTime() - now.getTime()
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return `${h}h ${m}m`
}

export default function DailyChallengeScreen() {
  const navigate = useNavigate()
  const { user, setRaceTopicOverride, prepareRace } = useGameStore()
  const { topic, dateStr } = getDailyInfo()

  if (!user) return null

  const alreadyDone = user.progress.dailyChallenge?.lastCompleted === dateStr

  const handleStart = async () => {
    setRaceTopicOverride(topic)
    await prepareRace()
    navigate('/race')
  }

  return (
    <div className="screen" style={{ paddingTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-ghost" style={{ padding: '8px' }} onClick={() => navigate('/home')}>← Back</button>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>Daily Challenge</h1>
      </div>

      <div
        className="card"
        style={{
          textAlign: 'center',
          marginBottom: 24,
          padding: 32,
          background: 'linear-gradient(135deg, #1a1a35, #2a1a4a)',
          border: '1px solid var(--secondary)',
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 12 }}>⭐</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>Today's Topic</p>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: 'var(--secondary)' }}>{topic}</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 8 }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
        <div className="card" style={{ textAlign: 'center', padding: 14 }}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>🪙</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--gold)' }}>+300</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Coin Reward</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 14 }}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>🔥</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--primary)' }}>
            {user.progress.dailyChallenge?.streak ?? 0}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Day Streak</div>
        </div>
      </div>

      {alreadyDone ? (
        <div className="card" style={{ textAlign: 'center', padding: 24, border: '1px solid var(--success)' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
          <div style={{ fontWeight: 700, color: 'var(--success)', fontSize: 16 }}>Today's challenge complete!</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 8 }}>
            Next challenge resets in {getMidnightCountdown()}
          </div>
          <button className="btn btn-outline btn-full" style={{ marginTop: 16 }} onClick={() => navigate('/home')}>
            Back to Home
          </button>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <p className="section-label">Challenge rules</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['⏱️', 'Duration', '90 seconds'],
                ['🎯', 'Topic', `${topic} questions only`],
                ['🪙', 'Reward', '+300 coins on completion'],
                ['🔄', 'Resets', 'Every day at midnight'],
              ].map(([icon, label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{icon} {label}</span>
                  <span style={{ fontWeight: 600 }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
          <button
            className="btn btn-secondary btn-full btn-lg"
            style={{ fontWeight: 900, letterSpacing: '0.06em' }}
            onClick={handleStart}
          >
            ⭐ START DAILY CHALLENGE
          </button>
        </>
      )}
    </div>
  )
}
