import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/store/useGameStore'

const POS_MESSAGES: Record<number, string> = {
  1: 'CHAMPION! Unbeatable!',
  2: 'So close! Great drive!',
  3: 'On the podium!',
  4: 'Almost there!',
  5: 'Every race sharpens you!',
}
const POS_COLORS = ['', '#ffd700', '#c0c0c0', '#cd7f32', 'var(--text-muted)', 'var(--text-muted)']

export default function PostRaceScreen() {
  const navigate = useNavigate()
  const { raceResult, resetRace, user } = useGameStore()

  if (!raceResult) { navigate('/home', { replace: true }); return null }

  const {
    position, totalVehicles, score, coinsEarned, xpEarned,
    distanceTraveled, qualiScore, gridPosition, isDaily, newStreak,
  } = raceResult

  const posColor = POS_COLORS[position] ?? 'var(--text-muted)'
  const handlePlayAgain = () => { resetRace(); navigate('/race-setup') }
  const handleHome      = () => { resetRace(); navigate('/home') }

  return (
    <div className="screen" style={{ paddingTop:24, gap:0 }}>

      {/* ── Position banner ── */}
      <div style={{ textAlign:'center', marginBottom:20, animation:'fadeIn 0.4s ease both' }}>
        <div style={{
          fontSize:72, fontWeight:900, lineHeight:1,
          background:`linear-gradient(135deg, ${posColor}, ${posColor}88)`,
          WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
        }}>
          {position}<span style={{ fontSize:36 }}>/{totalVehicles}</span>
        </div>
        <h1 style={{ fontSize:19, fontWeight:800, marginTop:8, color:'var(--text)' }}>
          {['','🏆','🥈','🥉','',''][position] || ''} {POS_MESSAGES[position] ?? 'Great race!'}
        </h1>
      </div>

      {/* ── Daily streak milestone ── */}
      {isDaily && newStreak !== undefined && (
        <div style={{
          margin:'0 0 16px',
          background:'linear-gradient(135deg, #1a2e10, #0f2008)',
          border:'1px solid rgba(34,197,94,0.4)',
          borderRadius:'var(--radius)', padding:'14px 16px',
          display:'flex', alignItems:'center', gap:14,
          animation:'slideUp 0.35s 0.1s both',
        }}>
          <div style={{ fontSize:36 }}>🔥</div>
          <div>
            <div style={{ fontWeight:800, fontSize:16, color:'var(--success)' }}>
              {newStreak === 1 ? 'Streak started!' : `${newStreak} day streak!`}
            </div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>
              Daily challenge complete · +300{newStreak > 1 ? `+${Math.min(newStreak-1,10)*20}` : ''} bonus coins
            </div>
          </div>
          <div style={{
            marginLeft:'auto', fontSize:24, fontWeight:900,
            color:'var(--success)', minWidth:40, textAlign:'center',
          }}>
            {newStreak}
          </div>
        </div>
      )}

      {/* ── Stats grid ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
        <StatCard label="Race Score"  value={score.toLocaleString()}             icon="🏁" color="var(--accent)"   delay={0}   />
        <StatCard label="Coins"       value={`+${coinsEarned}`}                  icon="🪙" color="var(--gold)"     delay={0.05}/>
        <StatCard label="XP Earned"   value={`+${xpEarned}`}                     icon="⚡" color="var(--secondary)" delay={0.1} />
        <StatCard label="Distance"    value={`${Math.round(distanceTraveled)}m`}  icon="📏" color="var(--text)"     delay={0.15}/>
        <StatCard label="Qualifier"   value={`${qualiScore}/5`}                  icon="🧠" color="var(--success)"  delay={0.2} />
        <StatCard label="Grid Start"  value={`P${gridPosition}`}                 icon="🏎️" color={gridPosition === 1 ? 'var(--gold)' : 'var(--text-muted)'} delay={0.25}/>
      </div>

      {/* ── XP/level progress if user available ── */}
      {user && (() => {
        const xp = user.progress.xp
        const nextBreak: Record<string, number> = { rookie:500, amateur:1500, pro:4000, expert:10000 }
        const next = nextBreak[user.progress.level]
        if (!next) return null
        const pct = Math.min(100, (xp / next) * 100)
        return (
          <div className="card" style={{ marginBottom:16, padding:14, animation:'slideUp 0.3s 0.3s both' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:12 }}>
              <span style={{ color:'var(--text-muted)' }}>XP progress</span>
              <span style={{ fontWeight:700 }}>{xp.toLocaleString()} / {next.toLocaleString()}</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width:`${pct}%` }} />
            </div>
          </div>
        )
      })()}

      {/* ── CTAs ── */}
      <div style={{ display:'flex', flexDirection:'column', gap:9, marginTop:'auto' }}>
        <button className="btn btn-primary btn-full btn-lg" onClick={handlePlayAgain}
          style={{ animation:'slideUp 0.3s 0.35s both', fontWeight:900 }}>
          🔄 Race Again
        </button>
        <button className="btn btn-outline btn-full" onClick={handleHome}
          style={{ animation:'slideUp 0.3s 0.4s both' }}>
          🏠 Back to Home
        </button>
        <button className="btn btn-ghost btn-full" style={{ fontSize:13, animation:'slideUp 0.3s 0.45s both' }}
          onClick={() => { resetRace(); navigate('/garage') }}>
          🏪 Garage
        </button>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon, color, delay }: {
  label: string; value: string; icon: string; color: string; delay: number
}) {
  return (
    <div className="card" style={{ textAlign:'center', padding:14, animation:`slideUp 0.25s ${delay}s both` }}>
      <div style={{ fontSize:18, marginBottom:4 }}>{icon}</div>
      <div style={{ fontSize:20, fontWeight:800, color }}>{value}</div>
      <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:2, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</div>
    </div>
  )
}
