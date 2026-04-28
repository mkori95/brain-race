import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/store/useGameStore'
import { GRID_DELAY_MS } from '@/types'

const QUESTION_TIME_MS = 15000
const TICK_MS = 100

const GRID_LABEL = ['', '🥇 Pole Position', '🥈 2nd on Grid', '🥉 3rd on Grid', '4th on Grid', '5th on Grid']
const DELAY_LABEL = ['No delay', '0.8s delay', '1.6s delay', '2.4s delay', '3.2s delay']

export default function QualiScreen() {
  const navigate = useNavigate()
  const {
    qualiPhase, qualiQuestions, qualiAnswers,
    prepareQualifier, submitQualiAnswer, finalizeQualifier,
    gridPosition, qualiScore, startCountdown,
  } = useGameStore()

  const [timeMs, setTimeMs] = useState(QUESTION_TIME_MS)
  const [chosen, setChosen] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)
  const questionIdx = qualiAnswers.length

  // Load questions on mount
  useEffect(() => {
    prepareQualifier()
  }, [prepareQualifier])

  // Timer per question
  useEffect(() => {
    if (qualiPhase !== 'active') return
    if (chosen !== null) return   // already answered, wait for next question
    setTimeMs(QUESTION_TIME_MS)

    timerRef.current = window.setInterval(() => {
      setTimeMs(prev => {
        if (prev <= TICK_MS) {
          // Timeout — submit null answer
          clearInterval(timerRef.current!)
          submitQualiAnswer(null, QUESTION_TIME_MS)
          setChosen('__timeout__')
          return 0
        }
        return prev - TICK_MS
      })
    }, TICK_MS)

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [qualiPhase, questionIdx, chosen, submitQualiAnswer])

  // Advance to next question after showing result
  useEffect(() => {
    if (chosen === null) return
    const allAnswered = questionIdx >= qualiQuestions.length - 1
    const t = window.setTimeout(() => {
      setChosen(null)
      if (allAnswered) {
        finalizeQualifier()
      }
    }, 900)
    return () => clearTimeout(t)
  }, [chosen, questionIdx, qualiQuestions.length, finalizeQualifier])

  const handleAnswer = useCallback((option: string) => {
    if (chosen !== null) return
    clearInterval(timerRef.current!)
    const timeSpent = QUESTION_TIME_MS - timeMs
    submitQualiAnswer(option, timeSpent)
    setChosen(option)
  }, [chosen, timeMs, submitQualiAnswer])

  const handleGoToRace = () => {
    startCountdown()
    navigate('/race')
  }

  // ── Loading ────────────────────────────────────────────────────
  if (qualiPhase === 'idle' || qualiPhase === 'loading') {
    return (
      <div style={styles.screen}>
        <div style={{ fontSize: 40 }}>🧠</div>
        <div style={{ color: 'var(--text-muted)', marginTop: 12 }}>Loading qualification...</div>
      </div>
    )
  }

  // ── Results screen ─────────────────────────────────────────────
  if (qualiPhase === 'result') {
    const delay = GRID_DELAY_MS[gridPosition]
    return (
      <div style={styles.screen}>
        <div style={styles.resultHeader}>
          <div style={{ fontSize: 48 }}>🏁</div>
          <h2 style={{ margin: '8px 0 4px', fontSize: 24 }}>Qualification Done!</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            {qualiScore}/5 correct
          </div>
        </div>

        <div style={styles.gridCard}>
          <div style={{ fontSize: 36 }}>{['', '🥇', '🥈', '🥉', '4️⃣', '5️⃣'][gridPosition]}</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8 }}>{GRID_LABEL[gridPosition]}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>
            {delay === 0 ? 'You start first — no delay!' : `Start penalty: ${DELAY_LABEL[gridPosition - 1]}`}
          </div>
        </div>

        {/* Score breakdown */}
        <div style={styles.breakdown}>
          {qualiAnswers.map((a, i) => (
            <div key={i} style={styles.breakdownRow}>
              <span style={{ fontSize: 16 }}>{a.isCorrect ? '✅' : a.playerAnswer === null ? '⏱️' : '❌'}</span>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.question.question.slice(0, 55)}…
              </span>
            </div>
          ))}
        </div>

        <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleGoToRace}>
          🚦 Start Race
        </button>
      </div>
    )
  }

  // ── Active question ────────────────────────────────────────────
  const question = qualiQuestions[questionIdx]
  if (!question) return null

  const timerPct = (timeMs / QUESTION_TIME_MS) * 100
  const timerColor = timerPct > 50 ? 'var(--success)' : timerPct > 25 ? 'var(--warning)' : 'var(--error)'
  const lastAnswer = qualiAnswers[questionIdx]

  return (
    <div style={styles.screen}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
          Qualification Round
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          {qualiQuestions.map((_, i) => (
            <div key={i} style={{
              width: 28, height: 6, borderRadius: 3,
              background: i < qualiAnswers.length
                ? (qualiAnswers[i].isCorrect ? 'var(--success)' : 'var(--error)')
                : i === questionIdx ? 'var(--accent)' : 'var(--surface-3)',
            }} />
          ))}
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
          Question {questionIdx + 1} of {qualiQuestions.length}
        </div>
      </div>

      {/* Timer bar */}
      <div style={{ height: 5, background: 'var(--surface-2)', borderRadius: 3, margin: '0 20px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${timerPct}%`,
          background: timerColor,
          transition: 'width 0.1s linear, background 0.3s',
          borderRadius: 3,
        }} />
      </div>
      <div style={{ textAlign: 'center', fontSize: 13, color: timerColor, marginTop: 4 }}>
        {Math.ceil(timeMs / 1000)}s
      </div>

      {/* Topic badge */}
      <div style={{ padding: '0 20px', marginTop: 8 }}>
        <span className="topic-badge">{question.topic}</span>
      </div>

      {/* Question text */}
      <div style={styles.questionText}>{question.question}</div>

      {/* Options */}
      <div style={styles.options}>
        {question.options.map((opt, i) => {
          const isChosen = chosen === opt
          const isTimeout = chosen === '__timeout__'
          const isCorrect = opt === question.correct
          let bg = 'var(--surface-2)'
          let border = '1px solid var(--border)'
          if (chosen !== null) {
            if (isCorrect) { bg = 'rgba(34,197,94,0.2)'; border = '1px solid var(--success)' }
            else if (isChosen && !isCorrect) { bg = 'rgba(239,68,68,0.2)'; border = '1px solid var(--error)' }
          }
          return (
            <button
              key={i}
              onClick={() => handleAnswer(opt)}
              disabled={chosen !== null}
              style={{
                ...styles.optionBtn,
                background: bg,
                border,
                opacity: chosen !== null && !isCorrect && !isChosen ? 0.5 : 1,
              }}
            >
              <span style={styles.optionLabel}>{['A', 'B', 'C', 'D'][i]}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>{opt}</span>
              {chosen !== null && isCorrect && <span>✅</span>}
              {isChosen && !isCorrect && <span>❌</span>}
              {isTimeout && isCorrect && <span style={{ color: 'var(--text-muted)' }}>←</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  screen: {
    display: 'flex', flexDirection: 'column', height: '100vh',
    background: 'var(--bg)', maxWidth: 480, margin: '0 auto',
    padding: '20px 0', gap: 12, overflowY: 'auto',
  },
  header: {
    padding: '0 20px', display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  questionText: {
    padding: '0 20px',
    fontSize: 18, fontWeight: 700, lineHeight: 1.4,
    color: 'var(--text-primary)',
  },
  options: {
    display: 'flex', flexDirection: 'column', gap: 10, padding: '0 20px', flex: 1,
  },
  optionBtn: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
    fontSize: 14, color: 'var(--text)', transition: 'all 0.15s',
    textAlign: 'left', width: '100%',
  },
  optionLabel: {
    width: 28, height: 28, borderRadius: '50%',
    background: 'var(--surface-3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 700, flexShrink: 0,
  },
  resultHeader: {
    textAlign: 'center', padding: '20px 20px 0',
  },
  gridCard: {
    margin: '0 20px',
    background: 'var(--surface-2)', borderRadius: 16, padding: '24px',
    textAlign: 'center', border: '1px solid var(--border)',
  },
  breakdown: {
    display: 'flex', flexDirection: 'column', gap: 8, padding: '0 20px',
  },
  breakdownRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px',
  },
}
