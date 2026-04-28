import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/store/useGameStore'
import { GRID_DELAY_MS } from '@/types'

const QUESTION_TIME_MS = 15000
const TICK_MS = 100

const GRID_LABEL = ['', '🥇 Pole Position', '🥈 2nd on Grid', '🥉 3rd on Grid', '4th on Grid', '5th on Grid']
const DELAY_LABEL = ['No delay', '0.8s delay', '1.6s delay', '2.4s delay', '3.2s delay']
const OPTION_KEYS = ['A', 'B', 'C', 'D']

// ── Confetti ─────────────────────────────────────────────────
const CONFETTI_COLORS = ['#ffd700','#ff6b35','#4ecdc4','#ffffff','#ff4488','#00ff88','#aa88ff']

function Confetti() {
  const pieces = useRef(
    Array.from({ length: 36 }, (_, i) => ({
      id: i,
      left: 5 + Math.random() * 90,
      delay: Math.random() * 0.7,
      duration: 1.4 + Math.random() * 1.2,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 6,
      circle: Math.random() > 0.5,
      angle: Math.random() * 360,
    }))
  ).current
  return (
    <div style={{ position:'fixed', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none', zIndex:999, overflow:'hidden' }}>
      {pieces.map(p => (
        <div key={p.id} style={{
          position:'absolute',
          top: `${-10 + Math.random() * 20}%`,
          left: `${p.left}%`,
          width: p.size, height: p.size,
          borderRadius: p.circle ? '50%' : '2px',
          background: p.color,
          transform: `rotate(${p.angle}deg)`,
          animation: `confettiFall ${p.duration}s ease-out ${p.delay}s both`,
        }} />
      ))}
    </div>
  )
}

// ── Circular SVG timer ────────────────────────────────────────
function CircleTimer({ pct, seconds, color }: { pct: number; seconds: number; color: string }) {
  const r = 36, cx = 44, cy = 44
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - pct / 100)
  return (
    <svg width={88} height={88} style={{ display:'block' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface)" strokeWidth={7} />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth={7}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition:'stroke-dashoffset 0.1s linear, stroke 0.3s' }}
      />
      <text x={cx} y={cy + 6} textAnchor="middle" fill={color} fontSize={20} fontWeight="bold"
        style={{ fontFamily:'-apple-system, sans-serif' }}>
        {seconds}
      </text>
    </svg>
  )
}

export default function QualiScreen() {
  const navigate = useNavigate()
  const {
    qualiPhase, qualiQuestions, qualiAnswers,
    prepareQualifier, submitQualiAnswer, finalizeQualifier,
    gridPosition, qualiScore, startCountdown,
  } = useGameStore()

  const [timeMs, setTimeMs] = useState(QUESTION_TIME_MS)
  const [chosen, setChosen] = useState<string | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const timerRef = useRef<number | null>(null)
  // Pending answer: stored locally so store update is deferred until after feedback animation
  const pendingRef = useRef<{ option: string | null; spent: number } | null>(null)
  const questionIdx = qualiAnswers.length

  useEffect(() => { prepareQualifier() }, [prepareQualifier])

  useEffect(() => {
    if (qualiPhase !== 'active') return
    if (chosen !== null) return
    setTimeMs(QUESTION_TIME_MS)
    timerRef.current = window.setInterval(() => {
      setTimeMs(prev => {
        if (prev <= TICK_MS) {
          clearInterval(timerRef.current!)
          pendingRef.current = { option: null, spent: QUESTION_TIME_MS }
          setChosen('__timeout__')
          return 0
        }
        return prev - TICK_MS
      })
    }, TICK_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [qualiPhase, questionIdx, chosen, submitQualiAnswer])

  useEffect(() => {
    if (chosen === null) return
    // questionIdx is still the *current* index because submitQualiAnswer hasn't been called yet
    const isLast = questionIdx >= qualiQuestions.length - 1
    const t = window.setTimeout(() => {
      if (pendingRef.current) {
        submitQualiAnswer(pendingRef.current.option, pendingRef.current.spent)
        pendingRef.current = null
      }
      setChosen(null)
      if (isLast) finalizeQualifier()
    }, 900)
    return () => clearTimeout(t)
  }, [chosen, questionIdx, qualiQuestions.length, submitQualiAnswer, finalizeQualifier])

  // Confetti when result appears and P1
  useEffect(() => {
    if (qualiPhase === 'result' && gridPosition === 1) {
      setShowConfetti(true)
      const t = window.setTimeout(() => setShowConfetti(false), 3500)
      return () => clearTimeout(t)
    }
  }, [qualiPhase, gridPosition])

  const handleAnswer = useCallback((option: string) => {
    if (chosen !== null) return
    clearInterval(timerRef.current!)
    pendingRef.current = { option, spent: QUESTION_TIME_MS - timeMs }
    setChosen(option)
  }, [chosen, timeMs])

  const handleGoToRace = () => { startCountdown(); navigate('/race') }

  // ── Loading ──
  if (qualiPhase === 'idle' || qualiPhase === 'loading') {
    return (
      <div style={S.screen}>
        <div style={{ textAlign:'center', marginTop:'auto', marginBottom:'auto' }}>
          <div style={{ fontSize:56, marginBottom:16 }}>🧠</div>
          <div style={{ color:'var(--text-muted)', fontSize:16 }}>Generating your qualifier…</div>
          <div style={{ marginTop:20, width:40, height:4, background:'var(--primary)', borderRadius:2, margin:'20px auto 0', animation:'pulse 1s ease infinite' }} />
        </div>
      </div>
    )
  }

  // ── Results ──
  if (qualiPhase === 'result') {
    const delay = GRID_DELAY_MS[gridPosition]
    const isP1 = gridPosition === 1
    const gridColors = ['', '#ffd700', '#c0c0c0', '#cd7f32', 'var(--text-muted)', 'var(--text-muted)']
    return (
      <div style={S.screen}>
        {showConfetti && <Confetti />}
        <div style={{ textAlign:'center', padding:'28px 20px 0', animation:'fadeIn 0.4s ease both' }}>
          <div style={{ fontSize:64 }}>{['','🥇','🥈','🥉','4️⃣','5️⃣'][gridPosition]}</div>
          <h2 style={{ fontSize:26, fontWeight:900, marginTop:8 }}>{GRID_LABEL[gridPosition]}</h2>
          <div style={{
            display:'inline-block', marginTop:8,
            background: (gridColors[gridPosition] ?? 'var(--surface)') + '22',
            color: gridColors[gridPosition] ?? 'var(--text-muted)',
            borderRadius:20, padding:'4px 14px', fontSize:13, fontWeight:700,
          }}>
            {delay === 0 ? 'No start delay — GO!' : `+${(delay/1000).toFixed(1)}s start delay`}
          </div>
        </div>

        <div style={{ padding:'16px 20px 0', display:'flex', gap:10 }}>
          <div className="card" style={{ flex:1, textAlign:'center', padding:14, animation:'slideUp 0.3s 0.1s both' }}>
            <div style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1 }}>Score</div>
            <div style={{ fontSize:28, fontWeight:900, color:'var(--gold)', marginTop:4 }}>{qualiScore}/5</div>
          </div>
          <div className="card" style={{ flex:1, textAlign:'center', padding:14, animation:'slideUp 0.3s 0.15s both' }}>
            <div style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1 }}>Grid</div>
            <div style={{ fontSize:28, fontWeight:900, color: gridColors[gridPosition] ?? 'var(--text)', marginTop:4 }}>P{gridPosition}</div>
          </div>
          {isP1 && (
            <div className="card" style={{ flex:1, textAlign:'center', padding:14, animation:'slideUp 0.3s 0.2s both', border:'1px solid var(--gold)', background:'rgba(255,215,0,0.06)' }}>
              <div style={{ fontSize:11, color:'var(--gold)', textTransform:'uppercase', letterSpacing:1 }}>Bonus</div>
              <div style={{ fontSize:22, fontWeight:900, color:'var(--gold)', marginTop:4 }}>🚀 GO!</div>
            </div>
          )}
        </div>

        <div style={{ padding:'12px 20px 0', display:'flex', flexDirection:'column', gap:6 }}>
          {qualiAnswers.map((a, i) => (
            <div key={i} style={{
              display:'flex', alignItems:'center', gap:10,
              background:'var(--surface)', borderRadius:10, padding:'10px 12px',
              border:`1px solid ${a.isCorrect ? 'rgba(34,197,94,0.3)' : a.playerAnswer === null ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
              animation:`slideUp 0.25s ${0.05 * i + 0.2}s both`,
            }}>
              <span style={{ fontSize:16 }}>{a.isCorrect ? '✅' : a.playerAnswer === null ? '⏱️' : '❌'}</span>
              <span style={{ flex:1, fontSize:12, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {a.question.question.slice(0, 60)}…
              </span>
              <span style={{ fontSize:11, color:'var(--text-muted)', flexShrink:0 }}>
                {(a.timeSpentMs / 1000).toFixed(1)}s
              </span>
            </div>
          ))}
        </div>

        <div style={{ padding:'16px 20px 0', marginTop:'auto' }}>
          <button
            className="btn btn-primary btn-full btn-lg"
            style={{ fontWeight:900, letterSpacing:'0.04em', animation:'slideUp 0.3s 0.35s both' }}
            onClick={handleGoToRace}
          >
            🚦 Start Race
          </button>
        </div>
      </div>
    )
  }

  // ── Active question ──
  const question = qualiQuestions[questionIdx]
  if (!question) return null

  const timerPct = (timeMs / QUESTION_TIME_MS) * 100
  const timerColor = timerPct > 60 ? 'var(--success)' : timerPct > 30 ? 'var(--warning)' : 'var(--error)'
  const timerSeconds = Math.ceil(timeMs / 1000)

  return (
    <div style={S.screen}>
      {/* Header */}
      <div style={{ padding:'16px 20px 0', display:'flex', alignItems:'center', gap:14 }}>
        <CircleTimer pct={timerPct} seconds={timerSeconds} color={timerColor} />
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1 }}>
            Qualification Round
          </div>
          <div style={{ fontSize:15, fontWeight:700, marginTop:4 }}>
            Question {questionIdx + 1} / {qualiQuestions.length}
          </div>
          <div style={{ display:'flex', gap:5, marginTop:6 }}>
            {qualiQuestions.map((_, i) => (
              <div key={i} style={{
                height:5, flex:1, borderRadius:3,
                background: i < qualiAnswers.length
                  ? (qualiAnswers[i].isCorrect ? 'var(--success)' : 'var(--error)')
                  : i === questionIdx ? timerColor : 'var(--surface)',
                transition:'background 0.2s',
              }} />
            ))}
          </div>
        </div>
      </div>

      {/* Topic + Question */}
      <div style={{ padding:'14px 20px 0' }}>
        <span className="topic-badge">{question.topic}</span>
        <p style={{ fontSize:18, fontWeight:700, lineHeight:1.45, marginTop:10, color:'var(--text)' }}>
          {question.question}
        </p>
      </div>

      {/* Options */}
      <div style={{ padding:'12px 20px 0', display:'flex', flexDirection:'column', gap:9, flex:1 }}>
        {question.options.map((opt, i) => {
          const isChosen = chosen === opt
          const isTimeout = chosen === '__timeout__'
          const isCorrect = opt === question.correct
          const revealed = chosen !== null

          let borderColor = 'var(--border)'
          let bg = 'var(--surface)'
          let anim = `slideUp 0.2s ${i * 0.05}s both`
          let keyBg = 'var(--border)'
          let keyColor = 'var(--text)'
          let icon: React.ReactNode = null

          if (revealed) {
            if (isCorrect) {
              borderColor = 'var(--success)'
              bg = 'rgba(34,197,94,0.18)'
              anim = 'scorePop 0.35s ease both'
              keyBg = 'var(--success)'
              keyColor = '#fff'
              icon = <span style={{ fontSize:20, lineHeight:1 }}>✅</span>
            } else if (isChosen) {
              borderColor = 'var(--error)'
              bg = 'rgba(239,68,68,0.15)'
              anim = 'shake 0.35s ease'
              keyBg = 'var(--error)'
              keyColor = '#fff'
              icon = <span style={{ fontSize:20, lineHeight:1 }}>❌</span>
            } else if (isTimeout && isCorrect) {
              icon = <span style={{ fontSize:14, color:'var(--text-muted)' }}>←</span>
            }
          }

          return (
            <button
              key={i}
              className="answer-btn"
              onClick={() => handleAnswer(opt)}
              disabled={revealed}
              style={{
                opacity: revealed && !isCorrect && !isChosen ? 0.38 : 1,
                animation: anim,
                borderColor, background: bg,
                transition: revealed ? 'none' : 'all 0.12s',
              }}
            >
              <span className="answer-key" style={{ background: keyBg, color: keyColor, transition:'background 0.2s' }}>
                {OPTION_KEYS[i]}
              </span>
              <span style={{ flex:1, textAlign:'left' }}>{opt}</span>
              {icon}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  screen: {
    display:'flex', flexDirection:'column', height:'100vh',
    background:'var(--bg)', maxWidth:480, margin:'0 auto',
    padding:'0 0 20px', overflowY:'auto',
  },
}
