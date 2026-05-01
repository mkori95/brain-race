import Phaser from 'phaser'
import { raceBridge } from './raceBridge'
import {
  resumeAudio, startEngine, updateEngineSpeed, stopEngine,
  playFuel, playCrash,
} from './audioEngine'

// ─── Canvas ───────────────────────────────────────────────────────
const CW = 480
const CH = 560
// 4-lane road: 2 forward (right) + 2 oncoming (left) + center divider
const ROAD_W   = 280        // 4 × 70px lanes
const LANE_W   = ROAD_W / 4 // 70px per lane
const MINIMAP_W = 22
const PLAYER_Y  = CH * 0.82

// ─── Race ─────────────────────────────────────────────────────────
const FINISH_DIST   = 20000
const CHECKPOINTS   = [5000, 10000, 15000] as const
const CHECKPOINT_FUEL = 0.25

// ─── Speed ────────────────────────────────────────────────────────
const ACCEL       = 240
const COAST_DEC   = 50
const BRAKE_DEC   = 200
const TOP_SPEED   = 500
const LATERAL_SPD = 220   // continuous drag px/s
const BASE_SCROLL = 0
const SPEED_RAMP  = 15
const RAMP_EVERY  = 30

// ─── Spin / failure system ────────────────────────────────────────
const MAX_SPINS    = 3    // spins per life before respawn
const MAX_FAILURES = 3    // respawns before game over
const INVINCE_MS   = 2500

// ─── Cars ────────────────────────────────────────────────────────
const CAR_W = 14
const CAR_H = 24
const PL_W  = 16
const PL_H  = 28

// ─── Ammo ────────────────────────────────────────────────────────
const START_AMMO   = 10000
const AMMO_ON_KILL = 5

// ─── Fuel ────────────────────────────────────────────────────────
const FUEL_BASE = 0.0045
const FUEL_SPD  = 0.000012

// ─── Road colors (Road Fighter style: gray + white) ───────────────
const ROAD_ASPHALT  = 0x6e6e6e
const ROAD_BAND     = 0x646464
const LANE_WHITE    = 0xffffff
const CENTER_YELLOW = 0xffdd00
const CURB_RED      = 0xcc2222
const CURB_WHITE    = 0xeeeeee

// ─── Marker world distances ───────────────────────────────────────
const MARKER_DISTS  = [0, ...CHECKPOINTS, FINISH_DIST] as const
const MARKER_LABELS = ['START', 'CHECKPOINT', 'CHECKPOINT', 'CHECKPOINT', 'FINISH'] as const

// ─── Spawn intervals (per difficulty) ────────────────────────────
const SPAWNS = {
  easy:   { traffic: 2.6, incoming: 5.5, cop: 11.0, fuel: 14.0 },
  medium: { traffic: 1.9, incoming: 3.8, cop:  7.5, fuel: 12.0 },
  hard:   { traffic: 1.3, incoming: 2.6, cop:  5.5, fuel: 11.0 },
}

const TRAFFIC_COLORS = [0x558855, 0x885555, 0x555588, 0x887755, 0x558877]

// ─── Theme sky/shoulder colors ────────────────────────────────────
const THEMES: Record<string, { sky: number; shoulder: number; terrain: number; terrainAlt: number; headlights: boolean }> = {
  night_city: { sky: 0x05050f, shoulder: 0x0a0a18, terrain: 0x0d0d22, terrainAlt: 0x080814, headlights: true  },
  desert:     { sky: 0xd4882a, shoulder: 0xc47010, terrain: 0xb85c10, terrainAlt: 0xd4882a, headlights: false },
  mountain:   { sky: 0x0a0a18, shoulder: 0x0d1a0d, terrain: 0x1a4418, terrainAlt: 0x0d2a0d, headlights: true  },
}

// ─── Interfaces ───────────────────────────────────────────────────
interface Car {
  x: number; y: number; vy: number
  laneIdx: number                         // 0-3; used to track road curve
  type: 'traffic' | 'incoming' | 'cop'
  color: number; dark: number
  alive: boolean; flashT: number
}

interface Bullet   { x: number; y: number; alive: boolean }
interface FuelPick { x: number; y: number; vy: number; laneIdx: number; alive: boolean }

interface Particle {
  x: number; y: number; vx: number; vy: number
  life: number; size: number; color: number
}

interface FloatText {
  x: number; y: number; text: string; vy: number; alpha: number; color: string
}

// ═════════════════════════════════════════════════════════════════
class RaceScene extends Phaser.Scene {
  // ── Player ───────────────────────────────────────────────────
  private px     = 0
  private ps     = 0
  private pd     = 0
  private topSpd = TOP_SPEED
  private ammo   = START_AMMO
  private fuel   = 1.0
  private score  = 0

  // ── Spin/failure system ──────────────────────────────────────
  private spinCount    = 0   // spins this life (0→MAX_SPINS-1)
  private failureCount = 0   // total failures (respawns used)
  private invUntil     = 0
  private spinning     = false
  private spinAngle    = 0
  private spinSpeed    = 0

  // ── State flags ──────────────────────────────────────────────
  private started   = false
  private ended     = false
  private lockUntil = 0

  // ── Road curve (per-scanline perspective) ────────────────────
  private curve      = 0
  private curveTo    = 0
  private curveAngle = 0
  private RL         = CW / 2 - ROAD_W / 2
  private RR         = CW / 2 + ROAD_W / 2

  // ── Scroll ───────────────────────────────────────────────────
  private roadScrollY = 0
  private scrollSpd   = 0

  // ── Track ────────────────────────────────────────────────────
  private cpPassed = new Set<number>()

  // ── Graphics layers ──────────────────────────────────────────
  private gBg!:   Phaser.GameObjects.Graphics
  private gRoad!: Phaser.GameObjects.Graphics
  private gEnt!:  Phaser.GameObjects.Graphics
  private gHud!:  Phaser.GameObjects.Graphics

  // ── Text objects ─────────────────────────────────────────────
  private bannerTxt!:   Phaser.GameObjects.Text
  private finishTxt!:   Phaser.GameObjects.Text
  private markerTexts:  Phaser.GameObjects.Text[] = []
  private floatPool:    Phaser.GameObjects.Text[] = []

  // ── Entities ─────────────────────────────────────────────────
  private cars:      Car[]       = []
  private bullets:   Bullet[]    = []
  private fuels:     FuelPick[]  = []
  private particles: Particle[]  = []
  private floats:    FloatText[] = []

  // ── Input ────────────────────────────────────────────────────
  private keys!:     Phaser.Types.Input.Keyboard.CursorKeys
  private spaceKey!: Phaser.Input.Keyboard.Key

  // ── Timers ───────────────────────────────────────────────────
  private tTraffic = 0; private tIncoming = 0
  private tCop     = 0; private tFuel     = 0
  private tRamp    = RAMP_EVERY; private tBanner = 0

  private difficulty: 'easy' | 'medium' | 'hard' = 'easy'
  private theme = 'night_city'

  constructor() { super({ key: 'RaceScene' }) }

  // ─────────────────────────────────────────────────────────────
  create() {
    this.theme = raceBridge.trackTheme || 'night_city'
    const lvl  = raceBridge.playerLevel
    this.difficulty = lvl <= 2 ? 'easy' : lvl === 3 ? 'medium' : 'hard'

    this.curve = this.curveTo = this.curveAngle = 0
    this.RL = CW / 2 - ROAD_W / 2; this.RR = CW / 2 + ROAD_W / 2
    // Start player in right half, lane 3 (outermost forward lane)
    this.px = this.RR - LANE_W / 2

    this.ps = 0; this.pd = 0; this.topSpd = TOP_SPEED
    this.fuel         = 1.0 - (raceBridge.gridPosition - 1) * 0.05
    this.ammo         = START_AMMO
    this.score        = 0
    this.spinCount    = 0
    this.failureCount = 0
    this.invUntil     = 0
    this.spinning     = false
    this.spinAngle    = 0
    this.lockUntil    = this.time.now + raceBridge.startDelayMs
    this.started      = false
    this.ended        = false
    this.roadScrollY  = 0
    this.scrollSpd    = 0
    this.tBanner      = 0
    this.cpPassed.clear()
    this.cars = []; this.bullets = []; this.fuels = []
    this.particles = []; this.floats = []

    const si = SPAWNS[this.difficulty]
    this.tTraffic = si.traffic; this.tIncoming = si.incoming
    this.tCop = si.cop; this.tFuel = si.fuel; this.tRamp = RAMP_EVERY

    this.gBg   = this.add.graphics().setDepth(0)
    this.gRoad = this.add.graphics().setDepth(1)
    this.gEnt  = this.add.graphics().setDepth(2)
    this.gHud  = this.add.graphics().setDepth(10)

    // Start / finish banners
    this.bannerTxt = this.add.text(CW / 2, CH * 0.42, 'READY...', {
      fontSize: '44px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#ffffff', stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(20)

    this.finishTxt = this.add.text(CW / 2, CH * 0.40, 'FINISH!', {
      fontSize: '52px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#ffd700', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(20).setVisible(false)

    // Road marker texts (START, CHECKPOINT×3, FINISH)
    const mColors = ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#000000']
    for (let i = 0; i < MARKER_LABELS.length; i++) {
      this.markerTexts.push(
        this.add.text(0, 0, MARKER_LABELS[i], {
          fontSize: MARKER_LABELS[i] === 'CHECKPOINT' ? '13px' : '17px',
          fontFamily: 'monospace', fontStyle: 'bold', color: mColors[i],
        }).setOrigin(0.5, 0.5).setDepth(3).setVisible(false)
      )
    }

    // Float text pool
    for (let i = 0; i < 8; i++) {
      this.floatPool.push(
        this.add.text(0, 0, '', {
          fontSize: '13px', fontFamily: 'monospace', fontStyle: 'bold',
          color: '#ffdd00', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 0.5).setDepth(15).setVisible(false)
      )
    }

    this.keys     = this.input.keyboard!.createCursorKeys()
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

    raceBridge.fuelLevel        = this.fuel
    raceBridge.raceScore        = 0
    raceBridge.distanceTraveled = 0
    raceBridge.lives            = MAX_FAILURES
    raceBridge.ammo             = this.ammo
    raceBridge.playerLane       = 1
    raceBridge.gameOver         = false
    raceBridge.raceFinished     = false

    resumeAudio()
    startEngine()
  }

  // ─────────────────────────────────────────────────────────────
  update(_time: number, delta: number) {
    const dt = delta / 1000

    // ── Banner countdown ─────────────────────────────────────
    this.tBanner += dt
    if (!this.started) {
      if      (this.tBanner < 1.2) { this.bannerTxt.setText('READY...'); this.bannerTxt.setStyle({ color: '#ffffff' }) }
      else if (this.tBanner < 2.0) { this.bannerTxt.setText('SET...') }
      else if (this.tBanner < 2.8) { this.bannerTxt.setText('GO!'); this.bannerTxt.setStyle({ color: '#00ff88' }) }
      else                          { this.bannerTxt.setVisible(false); this.started = true }
      this.drawAll()
      return
    }
    if (this.ended) { this.drawAll(); return }

    // ── Road curve (scanline perspective) ───────────────────
    this.curveAngle += dt * 0.22
    this.curveTo     = Math.sin(this.curveAngle) * 0.12
    this.curve      += (this.curveTo - this.curve) * Math.min(1, dt * 1.6)
    this.px         += this.curve * this.scrollSpd * dt * 0.3

    // ── Input ────────────────────────────────────────────────
    const locked = this.time.now < this.lockUntil
    const up     = !locked && this.keys.up.isDown
    const down   = !locked && this.keys.down.isDown
    const left   = !locked && this.keys.left.isDown
    const right  = !locked && this.keys.right.isDown
    const shoot  = !locked && Phaser.Input.Keyboard.JustDown(this.spaceKey)

    // Forward speed
    if (up)        this.ps = Math.min(this.ps + ACCEL * dt, this.topSpd)
    else if (down) this.ps = Math.max(this.ps - BRAKE_DEC * dt, 0)
    else           this.ps = Math.max(this.ps - COAST_DEC * dt, 0)

    // Lateral drag
    if (left)  this.px -= LATERAL_SPD * dt
    if (right) this.px += LATERAL_SPD * dt
    this.px = Math.max(this.RL + PL_W * 0.6, Math.min(this.RR - PL_W * 0.6, this.px))

    // Shoot
    if (shoot && this.ammo > 0) {
      this.bullets.push({ x: this.px, y: PLAYER_Y - PL_H / 2, alive: true })
      this.ammo = Math.max(0, this.ammo - 1)
    }

    // ── Physics ──────────────────────────────────────────────
    this.scrollSpd   = this.ps
    this.roadScrollY = (this.roadScrollY + this.scrollSpd * dt) % CH
    this.pd         += this.ps * dt
    this.fuel       -= (FUEL_BASE + this.ps * FUEL_SPD) * dt
    this.fuel        = Math.max(0, this.fuel)

    this.tRamp -= dt
    if (this.tRamp <= 0) { this.topSpd = Math.min(this.topSpd + SPEED_RAMP, 640); this.tRamp = RAMP_EVERY }

    // Crash spin animation
    if (this.spinning) {
      this.spinAngle += this.spinSpeed * dt
      this.spinSpeed  *= (1 - dt * 3.5)
      if (Math.abs(this.spinSpeed) < 8) { this.spinning = false; this.spinAngle = 0 }
    }

    // ── Checkpoints ─────────────────────────────────────────
    for (const cp of CHECKPOINTS) {
      if (!this.cpPassed.has(cp) && this.pd >= cp) {
        this.cpPassed.add(cp)
        this.fuel = Math.min(1.0, this.fuel + CHECKPOINT_FUEL)
        this.spawnFloat(CW / 2, PLAYER_Y - 55, '+FUEL 25%', '#00ff88')
        if (raceBridge.onCheckpoint) raceBridge.onCheckpoint()
      }
    }

    if (this.pd >= FINISH_DIST) { this.endRace(true);  return }
    if (this.fuel <= 0)         { this.endRace(false); return }

    this.spawnEntities(dt)
    this.moveEntities(dt)
    this.checkCollisions()
    this.updateParticles(dt)
    this.updateFloats(dt)

    updateEngineSpeed(this.ps / this.topSpd)

    raceBridge.fuelLevel        = this.fuel
    raceBridge.raceScore        = this.score
    raceBridge.distanceTraveled = this.pd
    raceBridge.lives            = MAX_FAILURES - this.failureCount
    raceBridge.ammo             = this.ammo
    raceBridge.playerLane       = this.px < CW / 2 ? 0 : 1

    this.drawAll()
  }

  // ─── Spin / failure logic ─────────────────────────────────────
  private onCrash(ex: number, ey: number) {
    if (this.time.now < this.invUntil) return

    this.spinCount++
    this.spinning  = true
    this.spinSpeed = 680
    this.invUntil  = this.time.now + INVINCE_MS
    this.spawnCrashParticles(ex, ey)
    playCrash(true)
    if (raceBridge.onCrash) raceBridge.onCrash()

    if (this.spinCount >= MAX_SPINS) {
      // Life used up → respawn
      this.spinCount = 0
      this.failureCount++
      raceBridge.lives = MAX_FAILURES - this.failureCount

      if (this.failureCount >= MAX_FAILURES) {
        this.endRace(false)
        return
      }
      // Respawn: extra invincibility + partial refuel
      this.invUntil = this.time.now + 3500
      this.fuel     = Math.max(this.fuel, 0.30)
      this.spawnFloat(this.px, PLAYER_Y - 40, 'RESPAWN', '#ff8800')
    }
  }

  private endRace(win: boolean) {
    if (this.ended) return
    this.ended = true
    stopEngine()
    if (win) {
      this.finishTxt.setVisible(true)
      this.time.delayedCall(1800, () => { raceBridge.raceFinished = true })
    } else {
      raceBridge.gameOver = true
    }
  }

  // ─── Scanline road center ─────────────────────────────────────
  private roadCenterAt(sy: number): number {
    return CW / 2 + this.curve * (PLAYER_Y - sy)
  }

  // ─── Lane helpers ─────────────────────────────────────────────
  // All 4 lane centers at spawn y (top of screen)
  private allLaneCenters(sy = -30): [number, number, number, number] {
    const rl = this.roadCenterAt(sy) - ROAD_W / 2
    return [
      rl + LANE_W * 0.5,
      rl + LANE_W * 1.5,
      rl + LANE_W * 2.5,
      rl + LANE_W * 3.5,
    ]
  }

  // ─── Spawn ────────────────────────────────────────────────────
  private spawnEntities(dt: number) {
    const si = SPAWNS[this.difficulty]
    const lc = this.allLaneCenters()

    // Forward traffic → right 2 lanes (L2, L3)
    this.tTraffic -= dt
    if (this.tTraffic <= 0) {
      const li  = Math.random() < 0.5 ? 2 : 3
      const col = TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)]
      this.cars.push({
        x: lc[li], y: -30, laneIdx: li,
        vy: this.scrollSpd * 0.40,
        type: 'traffic', color: col, dark: this.darken(col), alive: true, flashT: 0,
      })
      this.tTraffic = si.traffic * (0.75 + Math.random() * 0.5)
    }

    // Oncoming → left 2 lanes (L0, L1) — come from top, move DOWN fast
    this.tIncoming -= dt
    if (this.tIncoming <= 0) {
      const li = Math.random() < 0.5 ? 0 : 1
      this.cars.push({
        x: lc[li], y: -30, laneIdx: li,
        vy: this.scrollSpd * 1.8 + 100,
        type: 'incoming', color: 0xffbb00, dark: 0xaa7700, alive: true, flashT: 0,
      })
      this.tIncoming = si.incoming * (0.65 + Math.random() * 0.7)
    }

    // Cop → right 2 lanes (L2, L3)
    this.tCop -= dt
    if (this.tCop <= 0) {
      const li = Math.random() < 0.5 ? 2 : 3
      this.cars.push({
        x: lc[li], y: -30, laneIdx: li,
        vy: this.scrollSpd * 0.50,
        type: 'cop', color: 0x111166, dark: 0x080840, alive: true, flashT: 0,
      })
      this.tCop = si.cop * (0.85 + Math.random() * 0.3)
    }

    // Fuel pickup → any lane
    this.tFuel -= dt
    if (this.tFuel <= 0) {
      const li = Math.floor(Math.random() * 4)
      this.fuels.push({ x: lc[li], y: -28, vy: this.scrollSpd * 0.40, laneIdx: li, alive: true })
      this.tFuel = si.fuel * (0.8 + Math.random() * 0.4)
    }
  }

  private moveEntities(dt: number) {
    for (const c of this.cars) {
      c.y += c.vy * dt
      // Track road curve: x = lane center at car's current screen y
      c.x = this.roadCenterAt(c.y) - ROAD_W / 2 + LANE_W * (c.laneIdx + 0.5)
      if (c.type === 'cop') c.flashT += dt
    }
    for (const b of this.bullets) b.y -= 660 * dt
    for (const f of this.fuels) {
      f.y += f.vy * dt
      f.x = this.roadCenterAt(f.y) - ROAD_W / 2 + LANE_W * (f.laneIdx + 0.5)
    }
    this.cars    = this.cars.filter(c => c.alive && c.y < CH + 50)
    this.bullets = this.bullets.filter(b => b.alive && b.y > -20)
    this.fuels   = this.fuels.filter(f => f.alive && f.y < CH + 40)
  }

  // ─── Collisions ───────────────────────────────────────────────
  private checkCollisions() {
    const px = this.px, py = PLAYER_Y

    for (const c of this.cars) {
      if (!c.alive) continue
      if (Math.abs(c.x - px) > PL_W / 2 + CAR_W / 2 + 2) continue
      if (Math.abs(c.y - py) > PL_H / 2 + CAR_H / 2 + 2) continue

      c.alive = false
      if (c.type === 'cop') {
        // Ram cop → points, no life loss
        const pts = this.difficulty === 'hard' ? 500 : this.difficulty === 'medium' ? 350 : 200
        this.score += pts
        this.spawnFloat(c.x, c.y, `+${pts} RAM`, '#ff6600')
        this.spawnCollectParticles(c.x, c.y, 0xff4400)
      } else {
        this.onCrash(c.x, c.y)
      }
    }

    // Bullets hit ALL car types (not cop — you ram those)
    for (const b of this.bullets) {
      if (!b.alive) continue
      for (const c of this.cars) {
        if (!c.alive || c.type === 'cop') continue
        // Wide x-detection: bullet in same lane area
        if (Math.abs(c.x - b.x) > LANE_W * 0.55) continue
        if (Math.abs(c.y - b.y) > CAR_H / 2 + PL_H / 2 + 4) continue

        b.alive = false; c.alive = false
        const pts = c.type === 'incoming' ? 150 : 80
        this.score += pts
        this.ammo   = Math.min(START_AMMO, this.ammo + AMMO_ON_KILL)
        this.spawnFloat(c.x, c.y, `+${pts}`, c.type === 'incoming' ? '#00ffcc' : '#ffdd00')
        this.spawnExplosion(c.x, c.y)
        break
      }
    }

    // Fuel pickups
    for (const f of this.fuels) {
      if (!f.alive) continue
      if (Math.abs(f.x - px) > PL_W + 12) continue
      if (Math.abs(f.y - py) > PL_H + 12) continue
      f.alive = false
      this.fuel = Math.min(1.0, this.fuel + 0.25)
      this.spawnFloat(f.x, f.y, '+FUEL', '#00ff88')
      this.spawnCollectParticles(f.x, f.y, 0x22cc55)
      playFuel()
      if (raceBridge.onFuelCollected) raceBridge.onFuelCollected()
    }
  }

  // ─── Particles ────────────────────────────────────────────────
  private updateParticles(dt: number) {
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt }
    this.particles = this.particles.filter(p => p.life > 0)
  }

  private spawnCrashParticles(x: number, y: number) {
    const cols = [0xff4400, 0xffaa00, 0xffffff, 0xff0000]
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI * 2 * i) / 10
      const s = 70 + Math.random() * 130
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.7 + Math.random() * 0.4, size: 2 + Math.random() * 3, color: cols[i % 4] })
    }
  }

  private spawnExplosion(x: number, y: number) {
    // Bigger burst for bullet kills
    const cols = [0xff8800, 0xffff00, 0xffffff, 0xff4400, 0xff0000]
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI * 2 * i) / 16
      const s = 100 + Math.random() * 180
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.5, size: 3 + Math.random() * 4, color: cols[i % 5] })
    }
  }

  private spawnCollectParticles(x: number, y: number, color: number) {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6 - Math.PI / 2
      this.particles.push({ x, y, vx: Math.cos(a) * 50, vy: Math.sin(a) * 50 - 18, life: 0.5, size: 3, color })
    }
  }

  private updateFloats(dt: number) {
    for (const f of this.floats) { f.y += f.vy * dt; f.alpha -= dt * 1.5 }
    this.floats = this.floats.filter(f => f.alpha > 0)
  }

  private spawnFloat(x: number, y: number, text: string, color: string) {
    this.floats.push({ x, y, text, vy: -65, alpha: 1, color })
  }

  // ─── Draw ─────────────────────────────────────────────────────
  private drawAll() {
    this.drawBackground()
    this.drawRoad()
    this.drawEntities()
    this.drawHud()
    this.drawFloatTexts()
  }

  private drawBackground() {
    const g  = this.gBg
    const th = THEMES[this.theme] ?? THEMES.night_city
    g.clear()

    // Sky
    g.fillStyle(th.sky); g.fillRect(0, 0, CW, CH)

    // Distant scenery (right side / sky area)
    if (this.theme === 'night_city') {
      const bcs = [0x111122, 0x0f0f1e, 0x141428]
      for (let i = 0; i < 4; i++) {
        const bx = ((i * 80 + 280) % 340) + MINIMAP_W - 30
        const bh = 50 + (i * 25) % 65
        if (bx > this.RR + 4) {
          g.fillStyle(bcs[i % 3]); g.fillRect(bx, CH * 0.2 - bh, 22 + (i % 3) * 6, bh)
        }
      }
    } else if (this.theme === 'desert') {
      g.fillStyle(0xffdd44, 0.85); g.fillCircle(this.RR + 30, CH * 0.14, 18)
      g.fillStyle(0xffee88, 0.25); g.fillCircle(this.RR + 30, CH * 0.14, 26)
      g.fillStyle(0xc86a18)
      g.fillTriangle(this.RR, CH * 0.58, this.RR + 60, CH * 0.31, CW, CH * 0.58)
      g.fillStyle(0xd47820)
      g.fillTriangle(this.RR + 20, CH * 0.58, this.RR + 90, CH * 0.38, CW, CH * 0.58)
    } else {
      g.fillStyle(0x1a1a30)
      g.fillTriangle(this.RR, CH * 0.55, this.RR + (CW - this.RR) * 0.4, CH * 0.13, CW - 14, CH * 0.55)
      g.fillStyle(0xeeeeff, 0.5)
      g.fillTriangle(this.RR + 30, CH * 0.21, this.RR + 50, CH * 0.13, this.RR + 70, CH * 0.21)
    }

    // Right shoulder — theme colored (start 60px early to cover curve gaps)
    const sc      = this.roadScrollY
    const strH    = 28, strGap = 20
    const so      = sc % (strH + strGap)
    const rShoulderX = this.RR - 60
    g.fillStyle(th.shoulder); g.fillRect(rShoulderX, 0, CW - rShoulderX, CH)
    for (let y = -strH + so; y < CH + strH; y += strH + strGap) {
      const even = Math.floor((y - so) / (strH + strGap)) % 2 === 0
      g.fillStyle(even ? th.terrain : th.terrainAlt, 0.7)
      g.fillRect(rShoulderX, y, CW - rShoulderX, strH)
    }

    // Right shoulder theme details
    if (this.theme === 'mountain') {
      const treeSpacing = 48, treeOff = sc % treeSpacing
      for (let y = -treeSpacing + treeOff; y < CH + treeSpacing; y += treeSpacing) {
        const rx = this.RR + (CW - this.RR) * 0.4
        g.fillStyle(0x2a5c2a, 0.8); g.fillTriangle(rx - 7, y + 4, rx, y - 14, rx + 7, y + 4)
        g.fillStyle(0x1a3a1a, 0.7); g.fillTriangle(rx - 5, y + 2, rx, y - 10, rx + 5, y + 2)
        g.fillStyle(0x3a2a18, 0.9); g.fillRect(rx - 2, y + 4, 4, 8)
      }
    } else if (this.theme === 'desert') {
      const cactiSpacing = 80, cactiOff = (sc * 0.8) % cactiSpacing
      for (let y = -cactiSpacing + cactiOff; y < CH + cactiSpacing; y += cactiSpacing) {
        const rx = this.RR + (CW - this.RR) * 0.45
        g.fillStyle(0x5a7a30, 0.75)
        g.fillRect(rx - 2, y - 14, 4, 20)
        g.fillRect(rx - 8, y - 8,  6, 3)
        g.fillRect(rx + 2, y - 6,  6, 3)
      }
    } else {
      // Night city: lamp post on right shoulder only
      const lampSpacing = 96, lampOff = sc % lampSpacing
      for (let y = -lampSpacing + lampOff; y < CH + lampSpacing; y += lampSpacing) {
        const rx = this.RR + 4
        g.fillStyle(0x334455, 0.9); g.fillRect(rx, y - 18, 2, 22)
        g.fillStyle(0xffffaa, 0.6); g.fillCircle(rx + 1, y - 18, 3)
        g.fillStyle(0xffffaa, 0.08); g.fillCircle(rx + 1, y - 18, 9)
      }
    }

    // Left shoulder — always green grass with crowd spectators
    // Extra 60px covers the max road curve shift so no sky bleeds through
    const lShoulderW = this.RL - MINIMAP_W + 60
    g.fillStyle(0x2d7020); g.fillRect(MINIMAP_W, 0, lShoulderW, CH)
    for (let y = -strH + so; y < CH + strH; y += strH + strGap) {
      const even = Math.floor((y - so) / (strH + strGap)) % 2 === 0
      g.fillStyle(even ? 0x3a8c3a : 0x2d7020, 0.85)
      g.fillRect(MINIMAP_W, y, lShoulderW, strH)
    }
    // Scrolling crowd figures
    const shirtCols = [0xee3333, 0x3333ee, 0xeeaa00, 0x33aaee, 0xee33aa]
    const figSpacing = 22, figOff = (sc * 0.75) % figSpacing
    for (let y = -figSpacing + figOff; y < CH + figSpacing; y += figSpacing) {
      const row = Math.floor((y - figOff + figSpacing * 2) / figSpacing)
      for (let fi = 0; fi < 2; fi++) {
        const fx = MINIMAP_W + 8 + fi * 11 + (row % 2) * 5
        const sc2 = shirtCols[(row * 2 + fi) % shirtCols.length]
        g.fillStyle(0xf0c880); g.fillCircle(fx, y - 5, 2)
        g.fillStyle(sc2, 0.9); g.fillRect(fx - 2, y - 3, 4, 5)
        g.fillStyle(0x1a1a1a); g.fillRect(fx - 2, y + 2, 2, 4); g.fillRect(fx, y + 2, 2, 4)
        g.fillStyle(sc2, 0.9); g.fillRect(fx - 4, y - 3, 2, 3); g.fillRect(fx + 2, y - 3, 2, 3)
      }
    }
  }

  private drawRoad() {
    const g  = this.gRoad
    const sc = this.roadScrollY
    g.clear()

    // Per-scanline Road Fighter perspective effect
    // Each 4px strip: road shifts based on curve × distance from player
    const STRIP  = 4
    const B_CYC  = 108   // band: 36 dark + 72 light
    const CB_CYC = 32    // curb: 16 red + 16 white
    const D_CYC  = 36    // dash: 20 on + 16 off

    for (let sy = 0; sy < CH; sy += STRIP) {
      const cx  = this.roadCenterAt(sy)
      const rl  = cx - ROAD_W / 2

      // Road surface with scrolling bands
      const bpos = ((sy + sc) % B_CYC + B_CYC) % B_CYC
      g.fillStyle(bpos < 36 ? ROAD_BAND : ROAD_ASPHALT)
      g.fillRect(rl, sy, ROAD_W, STRIP)

      // Curbs (red/white alternating)
      const cpos = ((sy + sc) % CB_CYC + CB_CYC) % CB_CYC
      g.fillStyle(cpos < 16 ? CURB_RED : CURB_WHITE)
      g.fillRect(rl - 8, sy, 8, STRIP)
      g.fillRect(rl + ROAD_W, sy, 8, STRIP)

      // Center double-yellow divider
      g.fillStyle(CENTER_YELLOW)
      g.fillRect(rl + LANE_W * 2 - 3, sy, 2, STRIP)
      g.fillRect(rl + LANE_W * 2 + 1, sy, 2, STRIP)

      // Dashed lane markings
      const dpos = ((sy + sc) % D_CYC + D_CYC) % D_CYC
      if (dpos < 20) {
        g.fillStyle(LANE_WHITE, 0.85)
        g.fillRect(rl + LANE_W     - 1, sy, 2, STRIP)
        g.fillRect(rl + LANE_W * 3 - 1, sy, 2, STRIP)
      }
    }

    // Road markers painted on road surface
    this.drawRoadMarkers(g)
  }

  // ─── Road markers painted on road ─────────────────────────────
  private drawRoadMarkers(g: Phaser.GameObjects.Graphics) {
    for (let i = 0; i < MARKER_DISTS.length; i++) {
      const dist = MARKER_DISTS[i]
      const sy   = PLAYER_Y - (dist - this.pd)
      if (sy < -50 || sy > CH + 50) { this.markerTexts[i].setVisible(false); continue }

      const label    = MARKER_LABELS[i]
      const isFinish = label === 'FINISH'
      const isStart  = label === 'START'
      const cx       = this.roadCenterAt(sy)
      const rl       = cx - ROAD_W / 2

      // Wide stripe across road
      const stripeColor = isFinish ? 0x111111 : isStart ? 0x222277 : 0x227722
      g.fillStyle(stripeColor, 0.85)
      g.fillRect(rl, sy - 18, ROAD_W, 36)

      // Thin white border lines on stripe
      g.fillStyle(0xffffff, 0.7)
      g.fillRect(rl, sy - 18, ROAD_W, 2)
      g.fillRect(rl, sy + 16, ROAD_W, 2)

      // Oval background
      const ovalW = label === 'CHECKPOINT' ? 140 : 112
      const ovalH = 30
      const ovalColor = isFinish ? 0xffd700 : isStart ? 0x4444ff : 0x00aa44
      g.fillStyle(ovalColor)
      g.fillEllipse(cx, sy, ovalW, ovalH)

      // Oval border
      g.lineStyle(2, 0xffffff, 0.9)
      g.strokeEllipse(cx, sy, ovalW, ovalH)

      // Position text
      this.markerTexts[i].setPosition(cx, sy).setVisible(true)
    }
  }

  // ─── Generic car ──────────────────────────────────────────────
  private drawCar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, dark: number) {
    const hw = w / 2, hh = h / 2
    g.fillStyle(0x000000, 0.28); g.fillEllipse(x + 1, y + hh - 2, w + 4, 7)
    g.fillStyle(dark);  g.fillRoundedRect(x - hw, y - hh, w, h, 2)
    g.fillStyle(color); g.fillRoundedRect(x - hw + 1, y - hh + 1, w - 2, h * 0.65, 2)
    g.fillStyle(0x88ccff, 0.5); g.fillRect(x - hw + 2, y - hh + 2, w - 4, h * 0.24)
    g.fillStyle(0xff2200); g.fillRect(x - hw + 1, y - hh + 1, 3, 2); g.fillRect(x + hw - 4, y - hh + 1, 3, 2)
    g.fillStyle(0xffee88); g.fillRect(x - hw + 1, y + hh - 4, 4, 3); g.fillRect(x + hw - 5, y + hh - 4, 4, 3)
  }

  // ─── Player battle car ────────────────────────────────────────
  private drawPlayer(g: Phaser.GameObjects.Graphics) {
    const invincible = this.time.now < this.invUntil
    if (invincible && Math.floor(this.time.now / 110) % 2 === 0) return

    const x  = this.px
    const y  = PLAYER_Y
    const sx = this.spinning ? Math.sin(this.spinAngle * 0.0174) * 16 : 0
    const hw = PL_W / 2
    const hh = PL_H / 2

    g.fillStyle(0x000000, 0.32); g.fillEllipse(x + sx + 2, y + hh - 2, PL_W + 8, 10)
    g.fillStyle(0x661111)
    g.fillRect(x + sx - hw - 3, y - hh + 5, 3, PL_H - 10)
    g.fillRect(x + sx + hw,     y - hh + 5, 3, PL_H - 10)
    g.fillStyle(0xcc1111); g.fillRoundedRect(x + sx - hw, y - hh, PL_W, PL_H, 3)
    g.fillStyle(0x881111); g.fillRoundedRect(x + sx - hw + 2, y - hh + 3, PL_W - 4, PL_H - 6, 2)
    g.fillStyle(0x001a33, 0.85); g.fillRect(x + sx - 4, y - hh + 5, 8, 8)
    g.fillStyle(0x2a2a2a); g.fillRect(x + sx - 3, y - hh + 1, 6, 7)
    g.fillStyle(0x111111); g.fillRect(x + sx - 1, y - hh - 4, 2, 7)
    const th = THEMES[this.theme] ?? THEMES.night_city
    // Taillights at rear (always visible)
    g.fillStyle(0xff2200, 0.9)
    g.fillRect(x + sx - 6, y + hh - 5, 4, 3)
    g.fillRect(x + sx + 2, y + hh - 5, 4, 3)
    // Headlights at front, night themes only
    if (th.headlights) {
      g.fillStyle(0xffee88, 0.9)
      g.fillRect(x + sx - 5, y - hh + 1, 3, 2)
      g.fillRect(x + sx + 2, y - hh + 1, 3, 2)
      g.fillStyle(0xffee88, 0.08)
      g.fillTriangle(x + sx - 3, y - hh, x + sx - 16, y - hh - 30, x + sx + 2, y - hh - 30)
      g.fillTriangle(x + sx + 3, y - hh, x + sx + 16, y - hh - 30, x + sx - 2, y - hh - 30)
    }
    if (this.ps > 70) {
      const al = Math.min(0.4, this.ps / 280)
      const ey = y - hh - 3
      g.fillStyle(0x445566, al)
      g.fillCircle(x + sx - 4, ey, 2 + Math.random() * 2)
      g.fillCircle(x + sx + 4, ey, 2 + Math.random() * 2)
    }
  }

  // ─── All entities ─────────────────────────────────────────────
  private drawEntities() {
    const g = this.gEnt
    g.clear()

    // Traffic / cop / incoming
    for (const c of this.cars) {
      if (c.type === 'cop') {
        this.drawCar(g, c.x, c.y, CAR_W + 4, CAR_H, c.color, c.dark)
        const fo = Math.floor(c.flashT * 6) % 2 === 0
        g.fillStyle(fo ? 0xff1111 : 0x1111ff); g.fillRect(c.x - 7, c.y - CAR_H / 2 - 5, 14, 5)
        for (let ci = 0; ci < 4; ci++) {
          g.fillStyle(ci % 2 === 0 ? 0xffffff : 0x000000, 0.55)
          g.fillRect(c.x - CAR_W / 2 + ci * 4, c.y + 2, 4, 4)
        }
      } else if (c.type === 'incoming') {
        this.drawCar(g, c.x, c.y, CAR_W, CAR_H, c.color, c.dark)
        if (c.y > CH * 0.52) {
          g.lineStyle(2, 0xff0000, 0.4); g.strokeRect(c.x - CAR_W / 2 - 2, c.y - CAR_H / 2 - 2, CAR_W + 4, CAR_H + 4)
        }
      } else {
        this.drawCar(g, c.x, c.y, CAR_W, CAR_H, c.color, c.dark)
      }
    }

    // Bullets
    for (const b of this.bullets) {
      g.fillStyle(0xffff00, 0.25); g.fillRect(b.x - 4, b.y - 8, 8, 16)
      g.fillStyle(0xffee33);       g.fillRect(b.x - 1, b.y - 6, 3, 12)
    }

    // Fuel pickups
    for (const f of this.fuels) {
      g.fillStyle(0x22cc55); g.fillCircle(f.x, f.y, 11)
      g.fillStyle(0x116622); g.fillCircle(f.x, f.y, 8)
      g.fillStyle(0xffffff); g.fillRect(f.x - 1, f.y - 5, 2, 10); g.fillRect(f.x - 5, f.y - 1, 10, 2)
    }

    // Player
    this.drawPlayer(g)

    // Particles
    for (const p of this.particles) {
      g.fillStyle(p.color, Math.max(0, p.life))
      g.fillCircle(p.x, p.y, p.size * Math.max(0, p.life))
    }
  }

  // ─── HUD ──────────────────────────────────────────────────────
  private drawHud() {
    const g = this.gHud
    g.clear()

    // ── Mini-map (left strip) ────────────────────────────────
    g.fillStyle(0x080810); g.fillRect(0, 0, MINIMAP_W, CH)
    g.lineStyle(1, 0x1a1a2a); g.strokeRect(0, 0, MINIMAP_W, CH)
    g.fillStyle(0x00ff44); g.fillRect(3, CH - 9, MINIMAP_W - 6, 7)
    for (let ci = 0; ci < 4; ci++) {
      g.fillStyle(ci % 2 === 0 ? 0xffffff : 0x000000)
      g.fillRect(3 + ci * 4, 2, 4, 7)
    }
    g.fillStyle(0x00ccff)
    for (const cp of CHECKPOINTS) {
      const cy = CH - (cp / FINISH_DIST) * (CH - 14) - 7
      g.fillRect(3, cy - 1, MINIMAP_W - 6, 2)
    }
    const pRatio = Math.min(1, this.pd / FINISH_DIST)
    const pDotY  = CH - pRatio * (CH - 18) - 9
    g.fillStyle(0xff2222); g.fillCircle(MINIMAP_W / 2, pDotY, 4)
    if (Math.floor(this.time.now / 450) % 2 === 0) {
      g.lineStyle(1, 0xff2222, 0.45); g.strokeCircle(MINIMAP_W / 2, pDotY, 7)
    }

    // ── Spin counter (below minimap, above HUD) ───────────────
    // Draw spinCount pips (small circles) at bottom left
    for (let i = 0; i < MAX_SPINS; i++) {
      const filled = i < this.spinCount
      g.fillStyle(filled ? 0xff8800 : 0x333344)
      g.fillCircle(MINIMAP_W / 2, CH - 24 + i * 8, 3)
    }

    // ── Fuel bar (right edge) ────────────────────────────────
    const fbX = CW - 12, fbY = 42, fbH = CH - 84, fbW = 6
    g.fillStyle(0x0f0f0f); g.fillRect(fbX, fbY, fbW, fbH)
    const fh   = Math.round(fbH * this.fuel)
    const fcol = this.fuel < 0.20 ? 0xff2222 : this.fuel < 0.40 ? 0xffaa00 : 0x22cc55
    g.fillStyle(fcol); g.fillRect(fbX, fbY + fbH - fh, fbW, fh)
    g.lineStyle(1, 0x334455); g.strokeRect(fbX, fbY, fbW, fbH)

    // ── Speed bar (bottom of road) ───────────────────────────
    const sRatio = this.ps / this.topSpd
    g.fillStyle(0x111111); g.fillRect(this.RL, CH - 9, ROAD_W, 6)
    g.fillStyle(0x00ccff); g.fillRect(this.RL, CH - 9, Math.round(ROAD_W * sRatio), 6)

    // ── Low fuel border ──────────────────────────────────────
    if (this.fuel < 0.15 && Math.floor(this.time.now / 280) % 2 === 0) {
      g.lineStyle(3, 0xff2222, 0.65); g.strokeRect(MINIMAP_W + 1, 1, CW - MINIMAP_W - 2, CH - 2)
    }

    // ── Speed lines ──────────────────────────────────────────
    if (this.ps > 360) {
      const a = Math.min(0.22, (this.ps - 360) / 200)
      for (let i = 0; i < 8; i++) {
        const lx = this.RL + 8 + Math.random() * ROAD_W
        const ly = Math.random() * CH * 0.88
        const lh = 15 + Math.random() * 30
        g.lineStyle(1, 0xffffff, a * (0.3 + Math.random() * 0.4)); g.lineBetween(lx, ly, lx, ly + lh)
      }
    }
  }

  private drawFloatTexts() {
    const used = Math.min(this.floats.length, this.floatPool.length)
    for (let i = 0; i < this.floatPool.length; i++) {
      const t = this.floatPool[i]
      if (i < used) {
        const f = this.floats[this.floats.length - 1 - i]
        t.setPosition(f.x, f.y).setText(f.text).setStyle({ color: f.color }).setAlpha(Math.max(0, f.alpha)).setVisible(true)
      } else {
        t.setVisible(false)
      }
    }
  }

  private darken(col: number): number {
    return ((((col >> 16) & 0xff) >> 1) << 16) | ((((col >> 8) & 0xff) >> 1) << 8) | ((col & 0xff) >> 1)
  }

  shutdown() { stopEngine() }
}

// ─── Phaser config ────────────────────────────────────────────────
export const PHASER_CONFIG = (containerId: string): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  width: CW,
  height: CH,
  backgroundColor: '#05050f',
  parent: containerId,
  scene: RaceScene,
  audio: { disableWebAudio: false },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
})
