import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Phaser from 'phaser'
import { useGameStore } from '@/store/useGameStore'
import { PHASER_CONFIG } from '@/game/RaceScene'
import { raceBridge } from '@/game/raceBridge'
import { stopEngine } from '@/game/audioEngine'

const TICK_MS = 250

interface HudState {
  lives: number
  ammo: number
  score: number
  fuel: number
}

export default function RaceScreen() {
  const navigate  = useNavigate()
  const gameRef   = useRef<Phaser.Game | null>(null)
  const tickRef   = useRef<number | null>(null)
  const [showQuit, setShowQuit]               = useState(false)
  const [checkpointFlash, setCheckpointFlash] = useState(false)
  const [hud, setHud] = useState<HudState>({ lives: 3, ammo: 10, score: 0, fuel: 1 })

  const { raceStatus, gridPosition, startDelayMs, startRace, tickRace, quitRace } = useGameStore()

  // ── Mount Phaser ─────────────────────────────────────────────
  useEffect(() => {
    const game = new Phaser.Game(PHASER_CONFIG('phaser-race-container'))
    gameRef.current = game
    const t = window.setTimeout(() => startRace(), 300)
    return () => {
      clearTimeout(t)
      stopEngine()
      game.destroy(true)
      gameRef.current = null
    }
  }, [startRace])

  // ── Race tick — poll bridge & check for end ──────────────────
  useEffect(() => {
    if (raceStatus !== 'racing') return
    tickRef.current = window.setInterval(() => {
      setHud({
        lives: raceBridge.lives,
        ammo:  raceBridge.ammo,
        score: Math.round(raceBridge.raceScore),
        fuel:  raceBridge.fuelLevel,
      })
      tickRace(TICK_MS)
    }, TICK_MS)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [raceStatus, tickRace])

  // ── Navigate when ended ──────────────────────────────────────
  useEffect(() => {
    if (raceStatus === 'ended') navigate('/post-race', { replace: true })
  }, [raceStatus, navigate])

  // ── Checkpoint callback ──────────────────────────────────────
  useEffect(() => {
    raceBridge.onCheckpoint = () => {
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

  const posLabel = startDelayMs > 0
    ? `P${gridPosition} · ${(startDelayMs / 1000).toFixed(1)}s delay`
    : `P${gridPosition} · POLE`

  const livesArr = Array.from({ length: 3 }, (_, i) => i < hud.lives)
  const fuelPct  = Math.round(hud.fuel * 100)
  const fuelColor = hud.fuel < 0.2 ? '#ef4444' : hud.fuel < 0.4 ? '#f59e0b' : '#22c55e'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', background: '#080814',
      maxWidth: 480, margin: '0 auto', overflow: 'hidden',
    }}>

      {/* ── Top HUD strip ────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '6px 10px', gap: 8,
        background: 'rgba(0,0,0,0.80)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        {/* Quit */}
        <button
          onClick={() => setShowQuit(true)}
          style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6, color: '#aaa', fontSize: 14, fontWeight: 700,
            padding: '3px 8px', cursor: 'pointer', lineHeight: 1, flexShrink: 0,
          }}
        >✕</button>

        {/* Grid pos */}
        <span style={{ fontSize: 11, color: '#aaa', flexShrink: 0 }}>{posLabel}</span>

        {/* Lives */}
        <span style={{ fontSize: 16, letterSpacing: 2, flexShrink: 0 }}>
          {livesArr.map((alive, i) => (
            <span key={i} style={{ color: alive ? '#ef4444' : '#333', marginRight: 1 }}>♥</span>
          ))}
        </span>

        {/* Score — centre */}
        <span style={{
          flex: 1, textAlign: 'center', fontSize: 18, fontWeight: 900, color: '#ffd700',
        }}>
          {hud.score.toLocaleString()}
        </span>

        {/* Fuel % */}
        <span style={{ fontSize: 12, color: fuelColor, flexShrink: 0, minWidth: 38, textAlign: 'right' }}>
          ⛽{fuelPct}%
        </span>

        {/* Ammo */}
        <span style={{
          fontSize: 12, color: hud.ammo > 3 ? '#00ccff' : '#ef4444',
          flexShrink: 0, minWidth: 30, textAlign: 'right',
        }}>
          🔫{hud.ammo}
        </span>
      </div>

      {/* ── Checkpoint flash overlay ─────────────────────────── */}
      {checkpointFlash && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none',
          background: 'rgba(0,255,136,0.06)',
          border: '3px solid rgba(0,255,136,0.45)',
          animation: 'fadeIn 0.1s ease both',
        }} />
      )}

      {/* ── Phaser canvas ──────────────────────────────────────── */}
      <div
        id="phaser-race-container"
        style={{ flex: 1, width: '100%', background: '#05050f', position: 'relative', overflow: 'hidden' }}
      />

      {/* ── Quit confirmation dialog ──────────────────────────── */}
      {showQuit && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.80)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 24,
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
              <button className="btn btn-error btn-full" onClick={handleQuit}>Quit Race</button>
              <button className="btn btn-outline btn-full" onClick={() => setShowQuit(false)}>Keep Racing</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
