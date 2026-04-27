import { useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Phaser from 'phaser'
import { useGameStore } from '@/store/useGameStore'
import { PHASER_CONFIG } from '@/game/RaceScene'
import { getVehicle, effectiveMaxSpeed } from '@/data/vehicles'

const TICK_MS = 100          // race physics tick
const QUESTION_TICK_MS = 50  // question timer tick

const KEYS = ['A', 'B', 'C', 'D']

const phaseColors = {
  answered_correct: 'var(--success)',
  answered_wrong: 'var(--error)',
  timeout: 'var(--warning)',
}

export default function RaceScreen() {
  const navigate = useNavigate()
  const gameRef = useRef<Phaser.Game | null>(null)
  const raceTimerRef = useRef<number | null>(null)
  const questionTimerRef = useRef<number | null>(null)

  const {
    raceStatus, activeQuestion, playerSpeed, raceTimeLeft, isStalled, stallTimeLeft,
    aiVehicles, playerDistance, racePoints, isOfflineMode, answerStreak,
    selectedVehicleId, user, startRace, startCountdown, tickRace, tickQuestion, answerQuestion, endRace,
  } = useGameStore()

  const vehicle = getVehicle(selectedVehicleId)
  const engineLevel = user?.progress.vehicles[selectedVehicleId]?.engineLevel ?? 0
  const actualSpeedKmh = Math.round(playerSpeed * effectiveMaxSpeed(vehicle, engineLevel))

  // Sort all racers by distance to get position
  const allDistances = [
    { id: 'player', distance: playerDistance },
    ...aiVehicles.map((ai) => ({ id: ai.id, distance: ai.distance })),
  ].sort((a, b) => b.distance - a.distance)
  const position = allDistances.findIndex((v) => v.id === 'player') + 1

  // ── Mount Phaser ─────────────────────────────────────────
  useEffect(() => {
    const game = new Phaser.Game(PHASER_CONFIG('phaser-race-container'))
    gameRef.current = game

    // Small delay to let Phaser mount then start countdown
    const t = window.setTimeout(() => startCountdown(), 200)

    return () => {
      clearTimeout(t)
      game.destroy(true)
      gameRef.current = null
    }
  }, [startCountdown])

  // ── Countdown → Race start ───────────────────────────────
  useEffect(() => {
    if (raceStatus !== 'countdown') return
    const t = window.setTimeout(() => startRace(), 3200)
    return () => clearTimeout(t)
  }, [raceStatus, startRace])

  // ── Race tick ─────────────────────────────────────────────
  useEffect(() => {
    if (raceStatus !== 'racing') return
    raceTimerRef.current = window.setInterval(() => tickRace(TICK_MS), TICK_MS)
    return () => { if (raceTimerRef.current) clearInterval(raceTimerRef.current) }
  }, [raceStatus, tickRace])

  // ── Question timer tick ───────────────────────────────────
  useEffect(() => {
    if (raceStatus !== 'racing') return
    questionTimerRef.current = window.setInterval(() => tickQuestion(QUESTION_TICK_MS), QUESTION_TICK_MS)
    return () => { if (questionTimerRef.current) clearInterval(questionTimerRef.current) }
  }, [raceStatus, tickQuestion])

  // ── Race ended → navigate ─────────────────────────────────
  useEffect(() => {
    if (raceStatus === 'ended') navigate('/post-race', { replace: true })
  }, [raceStatus, navigate])

  const handleAnswer = useCallback((option: string) => {
    if (!activeQuestion || activeQuestion.phase !== 'showing') return
    answerQuestion(option)
  }, [activeQuestion, answerQuestion])

  const timerPct = activeQuestion ? (activeQuestion.timeRemainingMs / 8000) * 100 : 0
  const timerColor = timerPct > 50 ? 'var(--success)' : timerPct > 25 ? 'var(--warning)' : 'var(--error)'

  const isAnswered = activeQuestion && activeQuestion.phase !== 'showing'
  const posLabel = ['🥇', '🥈', '🥉', '4th', '5th'][position - 1] ?? `${position}th`

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--bg)',
        overflow: 'hidden',
        maxWidth: 480,
        margin: '0 auto',
      }}
    >
      {/* ── HUD ──────────────────────────────────────────── */}
      <div className="race-hud">
        <div className="stat-badge">
          <span className="speedometer">{actualSpeedKmh}<span>km/h</span></span>
        </div>
        <div style={{ textAlign: 'center' }}>
          {raceStatus === 'countdown' && (
            <CountdownOverlay />
          )}
          <div style={{ fontWeight: 900, fontSize: 22, color: raceTimeLeft <= 10 ? 'var(--error)' : 'var(--text)' }}>
            {Math.ceil(raceTimeLeft)}s
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>REMAINING</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{posLabel}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>POSITION</div>
        </div>
      </div>

      {/* Extra HUD row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '6px 14px',
          background: 'rgba(10,10,26,0.85)',
          fontSize: 13,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span style={{ color: 'var(--gold)' }}>🏆 {racePoints} pts</span>
        {answerStreak >= 2 && <span style={{ color: 'var(--warning)' }}>🔥 {answerStreak} streak</span>}
        {isStalled && <span style={{ color: 'var(--error)' }}>⛔ STALLED {Math.ceil(stallTimeLeft)}s</span>}
        {isOfflineMode && <span className="offline-badge">OFFLINE</span>}
        <span style={{ color: 'var(--text-muted)' }}>{Math.round(playerDistance)}m</span>
      </div>

      {/* ── Phaser Canvas ────────────────────────────────── */}
      <div
        id="phaser-race-container"
        style={{ width: '100%', flex: '0 0 auto', background: '#0a0a1a', position: 'relative' }}
      />

      {/* Nitro flash overlay */}
      {activeQuestion?.phase === 'answered_correct' && (
        <div
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(34,197,94,0.06)',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />
      )}

      {/* ── Question area ────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeQuestion ? (
          <div className="question-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Topic + timer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="topic-badge">{activeQuestion.question.topic}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {Math.ceil(activeQuestion.timeRemainingMs / 1000)}s
              </span>
            </div>

            {/* Timer bar */}
            <div className="timer-track">
              <div
                className="timer-fill"
                style={{ width: `${timerPct}%`, background: timerColor }}
              />
            </div>

            {/* Question text */}
            <p
              style={{
                fontWeight: 700,
                fontSize: 16,
                lineHeight: 1.4,
                color: isAnswered
                  ? phaseColors[activeQuestion.phase as keyof typeof phaseColors] ?? 'var(--text)'
                  : 'var(--text)',
              }}
            >
              {activeQuestion.question.question}
            </p>

            {/* Answer buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activeQuestion.question.options.map((opt, i) => {
                const key = KEYS[i]
                const isCorrect = opt === activeQuestion.question.correct
                const isChosen = opt === activeQuestion.playerAnswer
                let btnClass = 'answer-btn'
                if (isAnswered) {
                  if (isCorrect) btnClass += ' correct'
                  else if (isChosen) btnClass += ' wrong'
                }
                return (
                  <button
                    key={opt}
                    className={btnClass}
                    onClick={() => handleAnswer(opt)}
                    disabled={!!isAnswered}
                  >
                    <span className="answer-key">{key}</span>
                    {opt}
                    {isAnswered && isCorrect && <span style={{ marginLeft: 'auto' }}>✓</span>}
                  </button>
                )
              })}
            </div>

            {/* Feedback flash */}
            {activeQuestion.phase === 'answered_correct' && (
              <div style={{ textAlign: 'center', color: 'var(--success)', fontWeight: 700, fontSize: 14 }}>
                ✅ Correct! Speed boost!
              </div>
            )}
            {activeQuestion.phase === 'answered_wrong' && (
              <div style={{ textAlign: 'center', color: 'var(--error)', fontWeight: 700, fontSize: 14 }}>
                ❌ Wrong! Slowing down...
              </div>
            )}
            {activeQuestion.phase === 'timeout' && (
              <div style={{ textAlign: 'center', color: 'var(--warning)', fontWeight: 700, fontSize: 14 }}>
                ⏱️ Time's up! Slight penalty.
              </div>
            )}
          </div>
        ) : (
          <div className="center" style={{ flex: 1, flexDirection: 'column', gap: 8, color: 'var(--text-muted)' }}>
            {raceStatus === 'racing' && <p style={{ fontSize: 14 }}>Next question coming...</p>}
            {raceStatus === 'countdown' && <p style={{ fontSize: 14 }}>Get ready!</p>}
          </div>
        )}
      </div>
    </div>
  )
}

function CountdownOverlay() {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontSize: 80, fontWeight: 900, color: 'var(--primary)', animation: 'pulse 1s infinite' }}>
        🚦
      </div>
    </div>
  )
}
