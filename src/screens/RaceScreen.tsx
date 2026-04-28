import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Phaser from 'phaser'
import { useGameStore } from '@/store/useGameStore'
import { PHASER_CONFIG } from '@/game/RaceScene'
import { raceBridge } from '@/game/raceBridge'

const TICK_MS = 250

export default function RaceScreen() {
  const navigate    = useNavigate()
  const gameRef     = useRef<Phaser.Game | null>(null)
  const tickRef     = useRef<number | null>(null)

  const {
    raceStatus, raceTimeLeft, raceResult, gridPosition, startDelayMs,
    startRace, tickRace, endRace,
  } = useGameStore()

  // ── Mount Phaser & kick off race ────────────────────────────
  useEffect(() => {
    const game = new Phaser.Game(PHASER_CONFIG('phaser-race-container'))
    gameRef.current = game

    // Small delay for Phaser to mount
    const t = window.setTimeout(() => startRace(), 300)
    return () => {
      clearTimeout(t)
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

  const displayTime = Math.max(0, Math.ceil(raceTimeLeft))
  const delayLabel  = startDelayMs > 0 ? `P${gridPosition} — ${(startDelayMs / 1000).toFixed(1)}s delay` : `P${gridPosition} — Pole Position`

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', background: '#080814',
      maxWidth: 480, margin: '0 auto', overflow: 'hidden',
    }}>
      {/* ── Top HUD strip ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 16px', background: 'rgba(0,0,0,0.7)',
        borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, color: '#aaa' }}>{delayLabel}</span>
        <span style={{ fontSize: 20, fontWeight: 900, color: raceTimeLeft <= 10 ? '#ef4444' : '#fff' }}>
          {displayTime}s
        </span>
        <span style={{ fontSize: 13, color: '#ffd700' }}>
          🏆 {Math.round(raceBridge.raceScore)}
        </span>
      </div>

      {/* ── Phaser canvas (fills remaining space) ── */}
      <div
        id="phaser-race-container"
        style={{ flex: 1, width: '100%', background: '#080814', position: 'relative', overflow: 'hidden' }}
      />
    </div>
  )
}
