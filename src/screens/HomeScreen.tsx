import { useNavigate } from 'react-router-dom'
import { useGameStore, LEVEL_THRESHOLDS } from '@/store/useGameStore'
import { signOut } from '@/services/auth'

const LEVEL_COLORS: Record<string, string> = {
  rookie: '#888', amateur: '#4ecdc4', pro: '#22c55e', expert: '#f59e0b', legend: '#ffd700',
}
const LEVEL_EMOJIS: Record<string, string> = {
  rookie: '🔰', amateur: '⚡', pro: '🔥', expert: '💎', legend: '👑',
}

const DAILY_TOPICS = [
  'Python', 'Linux', 'World History', 'Space & Astronomy', 'Formula 1',
  'Ancient Civilizations', 'Human Biology', 'Music', 'Geography', 'Mathematics',
  'JavaScript', 'Cybersecurity', 'Food & Cooking', 'Animals', 'Movies & TV',
]
const getDailyTopic = () => {
  const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24))
  return DAILY_TOPICS[dayIndex % DAILY_TOPICS.length]
}

function todayStr() { return new Date().toISOString().split('T')[0] }
function yesterdayStr() {
  const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]
}

export default function HomeScreen() {
  const navigate = useNavigate()
  const { user, setUser, setAuthLoading } = useGameStore()
  if (!user) return null

  const { progress, persona } = user
  const level = progress.level
  const levelColor = LEVEL_COLORS[level]
  const nextLevelXp = (Object.values(LEVEL_THRESHOLDS) as number[]).find(x => x > progress.xp) ?? progress.xp
  const xpPercent = Math.min(100, (progress.xp / nextLevelXp) * 100)

  const streak = progress.dailyChallenge?.streak ?? 0
  const lastCompleted = progress.dailyChallenge?.lastCompleted ?? ''
  const dailyDoneToday = lastCompleted === todayStr()
  const streakAlive = lastCompleted === todayStr() || lastCompleted === yesterdayStr()
  const streakBroken = streak > 0 && !!lastCompleted && lastCompleted < yesterdayStr()
  const dailyTopic = getDailyTopic()

  const handleSignOut = async () => {
    await signOut(); setUser(null); setAuthLoading(false); navigate('/auth')
  }

  return (
    <div className="screen" style={{ paddingTop: 0, gap: 0 }}>

      {/* ── Streak banner ── */}
      <StreakBanner
        streak={streak}
        dailyDoneToday={dailyDoneToday}
        streakAlive={streakAlive}
        streakBroken={streakBroken}
      />

      {/* ── Top bar ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 16px 10px' }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:800, lineHeight:1.1 }}>
            Hey, {persona.name}
          </h2>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
            <span style={{
              fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10,
              background: levelColor + '22', color: levelColor, textTransform:'uppercase', letterSpacing:'0.08em',
            }}>
              {LEVEL_EMOJIS[level]} {level}
            </span>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>{progress.xp.toLocaleString()} XP</span>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{
            background:'var(--card)', border:'1px solid var(--border)',
            borderRadius:'var(--radius-sm)', padding:'6px 12px',
            fontSize:15, fontWeight:700, color:'var(--gold)',
          }}>
            🪙 {progress.coins.toLocaleString()}
          </div>
          <button
            className="btn btn-ghost" style={{ padding:'6px 8px', fontSize:18 }}
            onClick={() => navigate('/profile')}
          >
            👤
          </button>
        </div>
      </div>

      {/* ── XP progress ── */}
      <div style={{ padding:'0 16px 14px' }}>
        <div className="progress-track" style={{ height:6 }}>
          <div className="progress-fill" style={{ width:`${xpPercent}%`, background: levelColor }} />
        </div>
        {level !== 'legend' && (
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
            {(nextLevelXp - progress.xp).toLocaleString()} XP to {level === 'rookie' ? 'Amateur' : level === 'amateur' ? 'Pro' : level === 'pro' ? 'Expert' : 'Legend'}
          </div>
        )}
      </div>

      <div style={{ padding:'0 16px', display:'flex', flexDirection:'column', gap:10 }}>

        {/* ── RACE NOW ── */}
        <button
          className="btn btn-primary btn-full"
          style={{
            fontSize:20, fontWeight:900, padding:'20px',
            borderRadius:'var(--radius-lg)',
            background:'linear-gradient(135deg, #ff6b35, #cc3300)',
            boxShadow:'0 4px 24px rgba(255,107,53,0.4)',
            letterSpacing:'0.04em',
          }}
          onClick={() => navigate('/race-setup')}
        >
          🚦 RACE NOW
        </button>

        {/* ── Daily challenge ── */}
        <DailyCard
          topic={dailyTopic}
          streak={streak}
          done={dailyDoneToday}
          onClick={() => !dailyDoneToday && navigate('/daily')}
        />

        {/* ── Stats row ── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          <StatCard label="Cars" value={`${Math.round(progress.personalBests.cars)}m`} emoji="🏎️" />
          <StatCard label="Bikes" value={`${Math.round(progress.personalBests.bikes)}m`} emoji="🏍️" />
          <StatCard label="Trucks" value={`${Math.round(progress.personalBests.trucks)}m`} emoji="🚛" />
        </div>

        {/* ── Nav ── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <NavCard emoji="🏪" label="Garage" sub="Vehicles & upgrades" onClick={() => navigate('/garage')} />
          <NavCard emoji="📊" label="Profile" sub="Stats & settings" onClick={() => navigate('/profile')} />
        </div>

        {/* ── Sign out ── */}
        <button className="btn btn-ghost btn-full" style={{ fontSize:13, marginTop:4 }} onClick={handleSignOut}>
          Sign out
        </button>
      </div>

    </div>
  )
}

// ── Streak banner ──────────────────────────────────────────────

function StreakBanner({
  streak, dailyDoneToday, streakAlive, streakBroken,
}: { streak: number; dailyDoneToday: boolean; streakAlive: boolean; streakBroken: boolean }) {
  const dots = Array.from({ length: 7 }, (_, i) => i < (streak % 7 || (streak > 0 ? 7 : 0)))
  let bg = 'linear-gradient(135deg, #1a1a2e, #16213e)'
  let borderColor = 'var(--border)'
  let headline = '🔥 Start your first streak!'
  let sub = 'Complete a Daily Challenge to begin'
  let countEl: React.ReactNode = null

  if (streakBroken) {
    bg = 'linear-gradient(135deg, #2a1010, #1a0808)'
    borderColor = '#441111'
    headline = '💔 Streak reset'
    sub = 'You missed a day — start fresh today!'
  } else if (streak > 0 && dailyDoneToday) {
    bg = 'linear-gradient(135deg, #1a2e10, #0f2008)'
    borderColor = '#224411'
    headline = `🔥 ${streak} day streak!`
    sub = "You're on fire — come back tomorrow!"
    countEl = <BigStreak count={streak} color="#22c55e" />
  } else if (streak > 0 && streakAlive) {
    bg = 'linear-gradient(135deg, #2a1a08, #1a0f00)'
    borderColor = '#442200'
    headline = `🔥 ${streak} day streak`
    sub = "Don't break it — play today's challenge!"
    countEl = <BigStreak count={streak} color="#f59e0b" pulse />
  }

  return (
    <div style={{
      background: bg, borderBottom:`1px solid ${borderColor}`,
      padding:'14px 16px', display:'flex', alignItems:'center', gap:14,
    }}>
      {countEl ?? (
        <div style={{ fontSize:36 }}>🔥</div>
      )}
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700, fontSize:15 }}>{headline}</div>
        <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{sub}</div>
        {streak > 0 && (
          <div style={{ display:'flex', gap:4, marginTop:6 }}>
            {dots.map((filled, i) => (
              <div key={i} style={{
                width:18, height:6, borderRadius:3,
                background: filled ? (dailyDoneToday ? '#22c55e' : '#f59e0b') : 'var(--surface)',
                border: `1px solid ${filled ? 'transparent' : 'var(--border)'}`,
              }} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function BigStreak({ count, color, pulse }: { count: number; color: string; pulse?: boolean }) {
  return (
    <div style={{
      minWidth:52, height:52, borderRadius:14,
      background: color + '22', border:`2px solid ${color}44`,
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      animation: pulse ? 'pulse 1.6s ease infinite' : undefined,
    }}>
      <div style={{ fontSize:20, fontWeight:900, color, lineHeight:1 }}>{count}</div>
      <div style={{ fontSize:9, color, opacity:0.8, textTransform:'uppercase', letterSpacing:1 }}>days</div>
    </div>
  )
}

// ── Daily card ─────────────────────────────────────────────────

function DailyCard({ topic, streak, done, onClick }: {
  topic: string; streak: number; done: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={done}
      style={{
        display:'flex', alignItems:'center', gap:14,
        background: done ? 'var(--card)' : 'linear-gradient(135deg, #12122a, #1a1a3a)',
        border: `1px solid ${done ? 'var(--border)' : 'var(--secondary)'}`,
        borderRadius:'var(--radius)', padding:'14px 16px',
        cursor: done ? 'default' : 'pointer',
        textAlign:'left', width:'100%',
        boxShadow: done ? 'none' : '0 2px 16px rgba(78,205,196,0.12)',
      }}
    >
      <div style={{ fontSize:28 }}>{done ? '✅' : '⭐'}</div>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700, fontSize:15, color: done ? 'var(--text-muted)' : 'var(--text)' }}>
          {done ? 'Daily Complete' : 'Daily Challenge'}
        </div>
        <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>
          {done
            ? 'Come back tomorrow'
            : `${topic} · +${300 + Math.min(streak, 10) * 20} 🪙 · Streak: ${streak > 0 ? `${streak} → ${streak + 1}` : 'Start!'}`
          }
        </div>
      </div>
      {!done && <span style={{ color:'var(--secondary)', fontSize:20, fontWeight:700 }}>→</span>}
    </button>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function StatCard({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  return (
    <div className="card" style={{ textAlign:'center', padding:12 }}>
      <div style={{ fontSize:18, marginBottom:3 }}>{emoji}</div>
      <div style={{ fontSize:14, fontWeight:700 }}>{value}</div>
      <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:1 }}>{label}</div>
    </div>
  )
}

function NavCard({ emoji, label, sub, onClick }: {
  emoji: string; label: string; sub: string; onClick: () => void
}) {
  return (
    <div
      className="card"
      style={{ cursor:'pointer', padding:14, display:'flex', alignItems:'center', gap:12 }}
      onClick={onClick}
    >
      <div style={{ fontSize:24 }}>{emoji}</div>
      <div>
        <div style={{ fontWeight:700, fontSize:14 }}>{label}</div>
        <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:1 }}>{sub}</div>
      </div>
    </div>
  )
}
