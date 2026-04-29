import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Phaser from 'phaser'
import { useGameStore } from '@/store/useGameStore'
import { PHASER_CONFIG } from '@/game/RaceScene'
import { raceBridge } from '@/game/raceBridge'
import { stopEngine } from '@/game/audioEngine'

const TICK_MS = 250
const CHECKPOINT_BONUS_S = 10

export default function RaceScreen() {
  const navigate = useNavigate()
  const gameRef  = useRef<Phaser.Game | null>(null)
  const tickRef  = useRef<number | null>(null)
  const [showQuit, setShowQuit] = useState(false)
  const [checkpointFlash, setCheckpointFlash] = useState(false)
  const [checkpointCount, setCheckpointCount] = useState(0)

  const {
    raceStatus, raceTimeLeft, gridPosition, startDelayMs,
    startRace, tickRace, quitRace,
  } = useGameStore()

  // ── Mount Phaser ────────────────────────────────────────────
  useEffect(() => {
    const game = new Phaser.Game(PHASER_CONFIG('phaser-race-container'))
    gameRef.current = game
    const t = window.setTimeout(() => startRace(), 300)
    return () => {
      clearTimeout(t)
      stopEngine()          // always kill audio on unmount — don't rely on Phaser lifecycle
      game.destroy(true)
      gameRef.current = null
    }
  }, [startRace])

  // ── Race tick ───────────────────────────────────────────────
  useEffect(() => {
    if (raceStatus !== 'racing') return
    tickRef.current = window.setInterval(() => tickRace(TICK_MS), TICK_MS)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [raceStatus, tickRace])

  // ── Navigate when ended ─────────────────────────────────────
  useEffect(() => {
    if (raceStatus === 'ended') navigate('/post-race', { replace: true })
  }, [raceStatus, navigate])

  // ── Wire checkpoint callback ────────────────────────────────
  useEffect(() => {
    raceBridge.onCheckpoint = () => {
      // Add bonus time directly to store state
      useGameStore.setState(s => ({ raceTimeLeft: s.raceTimeLeft + CHECKPOINT_BONUS_S }))
      setCheckpointCount(n => n + 1)
      setCheckpointFlash(true)
      window.setTimeout(() => setCheckpointFlash(false), 800)
    }
    return () => { raceBridge.onCheckpoint = null }
  }, [])

  const handleQuit = () => {
    if (tickRef.current) clearInterval(tickRef.current)
    stopEngine()
    quitRace()
    navigate('/home', { replace: true })
  }

  const displayTime = Math.max(0, Math.ceil(raceTimeLeft))
  const isLow = displayTime <= 15
  const posLabel = startDelayMs > 0
    ? `P${gridPosition} · ${(startDelayMs / 1000).toFixed(1)}s`
    : `P${gridPosition} · POLE`

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', background: '#080814',
      maxWidth: 480, margin: '0 auto', overflow: 'hidden',
    }}>

      {/* ── Top HUD strip ── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '6px 12px', gap: 6,
        background: 'rgba(0,0,0,0.75)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        {/* Quit button */}
        <button
          onClick={() => setShowQuit(true)}
          style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6, color: '#aaa', fontSize: 14, fontWeight: 700,
            padding: '3px 8px', cursor: 'pointer', lineHeight: 1,
          }}
        >✕</button>

        {/* Grid pos */}
        <span style={{ fontSize: 12, color: '#aaa', minWidth: 68 }}>{posLabel}</span>

        {/* Timer — centre */}
        <span style={{
          flex: 1, textAlign: 'center', fontSize: 22, fontWeight: 900,
          color: isLow ? '#ef4444' : '#ffffff',
          animation: isLow ? 'pulse 0.5s ease infinite' : undefined,
        }}>
          {displayTime}s
        </span>

        {/* Score */}
        <span style={{ fontSize: 12, color: '#ffd700', minWidth: 60, textAlign: 'right' }}>
          🏆 {Math.round(raceBridge.raceScore)}
        </span>

        {/* Checkpoint count badge */}
        {checkpointCount > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#00ff88',
            background: 'rgba(0,255,136,0.12)', borderRadius: 4,
            padding: '2px 5px',
          }}>
            ✓{checkpointCount}
          </span>
        )}
      </div>

      {/* ── Checkpoint flash overlay ── */}
      {checkpointFlash && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none',
          background: 'rgba(0,255,136,0.08)',
          border: '2px solid rgba(0,255,136,0.4)',
          animation: 'fadeIn 0.1s ease both',
        }} />
      )}

      {/* ── Phaser canvas ── */}
      <div
        id="phaser-race-container"
        style={{ flex: 1, width: '100%', background: '#080814', position: 'relative', overflow: 'hidden' }}
      />

      {/* ── Quit confirmation dialog ── */}
      {showQuit && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.78)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: '28px 24px',
            maxWidth: 320, width: '100%', textAlign: 'center',
            animation: 'slideUp 0.2s ease both',
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🏁</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Quit this race?</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 22 }}>
              No XP, coins, or streak progress will be saved.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <button
                className="btn btn-error btn-full"
                onClick={handleQuit}
              >
                Quit Race
              </button>
              <button
                className="btn btn-outline btn-full"
                onClick={() => setShowQuit(false)}
              >
                Keep Racing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
