import Phaser from 'phaser'
import { raceBridge } from './raceBridge'
import {
  resumeAudio, startEngine, updateEngineSpeed, stopEngine,
  playFuel, playCrash,
} from './audioEngine'

// ─── Canvas ───────────────────────────────────────────────────────
const CW = 480
const CH = 560
// Right HUD panel + game view split (Road Fighter style)
const PANEL_W  = 130             // right HUD panel width
const GAME_W   = CW - PANEL_W   // = 350, road + scenery area
// 4-lane road centered in game view
const ROAD_W   = 180             // 4 × 45px lanes
const LANE_W   = ROAD_W / 4     // 45px per lane
const PLAYER_Y = CH * 0.82
// Progress bar at top of game view
const PROG_H   = 16              // height of top progress strip

// ─── Race ─────────────────────────────────────────────────────────
const FINISH_DIST   = 20000
const CHECKPOINTS   = [5000, 10000, 15000] as const
const CHECKPOINT_FUEL = 0.25

// ─── Speed / gear ─────────────────────────────────────────────────
const COAST_DEC     = 80
const BRAKE_DEC     = 280
const LOW_GEAR_TOP  = 420   // ~200 km/h
const HIGH_GEAR_TOP = 850   // ~408 km/h
const HIGH_GEAR_ACCEL = 480
const LOW_GEAR_ACCEL  = 320
const LATERAL_SPD   = 220

// ─── Road curve (distance-based sections) ─────────────────────────
const CURVE_MAX          = 0.10
const STRAIGHT_DIST_MIN  = 1200
const STRAIGHT_DIST_MAX  = 2800
const CURVE_DIST_MIN     = 700
const CURVE_DIST_MAX     = 1600

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

// ─── Traffic type colors ──────────────────────────────────────────
const YELLOW_COLOR    = 0xddcc22
const RED_COLOR       = 0xcc2222
const BLUE_COLOR      = 0x2255cc
const TRUCK_COLOR     = 0x556633
const FUEL_CAR_COLORS = [0xff4400, 0x00bbff, 0xff00bb, 0x44ff00, 0xff8800]
const INCOMING_COLORS = [0xffcc22, 0xddaa00]

// ─── Theme sky/shoulder colors ────────────────────────────────────
const THEMES: Record<string, { sky: number; shoulder: number; terrain: number; terrainAlt: number; headlights: boolean }> = {
  night_city: { sky: 0x05050f, shoulder: 0x0a0a18, terrain: 0x0d0d22, terrainAlt: 0x080814, headlights: true  },
  desert:     { sky: 0xd4882a, shoulder: 0xc47010, terrain: 0xb85c10, terrainAlt: 0xd4882a, headlights: false },
  mountain:   { sky: 0x0a0a18, shoulder: 0x0d1a0d, terrain: 0x1a4418, terrainAlt: 0x0d2a0d, headlights: true  },
}

// ─── Interfaces ───────────────────────────────────────────────────
interface Car {
  x: number; y: number; vy: number
  laneIdx: number; targetLane: number
  type: 'yellow' | 'red' | 'blue' | 'truck' | 'fuel_car' | 'incoming' | 'cop'
  color: number; dark: number
  alive: boolean; flashT: number
  blockCD: number   // lane-change cooldown for red/blue
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
  private topSpd = HIGH_GEAR_TOP
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

  // ── Road curve (distance-based sections) ─────────────────────
  private curve          = 0
  private curveTo        = 0
  private curveDir: -1 | 0 | 1 = 0   // current section: -1=left 0=straight 1=right
  private nextCurveAt    = 1500       // pd distance when section changes
  private RL             = GAME_W / 2 - ROAD_W / 2   // = 85
  private RR             = GAME_W / 2 + ROAD_W / 2   // = 265

  // ── Race stats ────────────────────────────────────────────────
  private raceElapsed   = 0
  private carsDestroyed = 0

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
  private lowKey!:   Phaser.Input.Keyboard.Key   // Z = low gear
  private highKey!:  Phaser.Input.Keyboard.Key   // X = high gear

  // ── Timers ───────────────────────────────────────────────────
  private tTraffic = 0; private tIncoming = 0
  private tCop     = 0; private tFuel     = 0
  private tBanner = 0

  private difficulty: 'easy' | 'medium' | 'hard' = 'easy'
  private theme = 'night_city'

  constructor() { super({ key: 'RaceScene' }) }

  // ─────────────────────────────────────────────────────────────
  create() {
    this.theme = raceBridge.trackTheme || 'night_city'
    const lvl  = raceBridge.playerLevel
    this.difficulty = lvl <= 2 ? 'easy' : lvl === 3 ? 'medium' : 'hard'

    this.curve = this.curveTo = 0
    this.curveDir   = 0
    this.nextCurveAt = 1500   // first 1500 distance units are straight
    this.RL = GAME_W / 2 - ROAD_W / 2; this.RR = GAME_W / 2 + ROAD_W / 2
    this.raceElapsed   = 0
    this.carsDestroyed = 0
    // Start player in right half, lane 3 (outermost forward lane)
    this.px = this.RL + LANE_W * 3.5

    this.ps = 0; this.pd = 0; this.topSpd = HIGH_GEAR_TOP
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
    this.tCop = si.cop; this.tFuel = si.fuel

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
    this.lowKey   = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z)
    this.highKey  = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X)

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

    this.raceElapsed += dt

    // ── Input ────────────────────────────────────────────────
    const locked  = this.time.now < this.lockUntil
    const highG   = !locked && this.highKey.isDown
    const lowG    = !locked && !highG && this.lowKey.isDown
    const brake   = !locked && this.keys.down.isDown
    const left    = !locked && this.keys.left.isDown
    const right   = !locked && this.keys.right.isDown
    const shoot   = !locked && Phaser.Input.Keyboard.JustDown(this.spaceKey)

    // ── Two-gear speed ────────────────────────────────────────
    if (highG) {
      this.ps = Math.min(this.ps + HIGH_GEAR_ACCEL * dt, HIGH_GEAR_TOP)
    } else if (lowG) {
      // Maintain constant low-gear speed
      const diff = LOW_GEAR_TOP - this.ps
      this.ps += Math.sign(diff) * Math.min(Math.abs(diff), LOW_GEAR_ACCEL * dt)
    } else if (brake) {
      this.ps = Math.max(this.ps - BRAKE_DEC * dt, 0)
    } else {
      this.ps = Math.max(this.ps - COAST_DEC * dt, 0)
    }

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
    // Fuel: time-based drain + extra burn in high gear
    const gearMult  = highG ? 2.2 : lowG ? 1.0 : 0.6
    this.fuel       -= (FUEL_BASE + this.ps * FUEL_SPD) * gearMult * dt
    this.fuel        = Math.max(0, this.fuel)

    // ── Road curve (distance-based sections, only advances when moving) ──
    if (this.ps > 5 && this.pd >= this.nextCurveAt) {
      if (this.curveDir === 0) {
        // Straight → pick a curve direction
        this.curveDir   = Math.random() < 0.5 ? -1 : 1
        this.curveTo    = this.curveDir * CURVE_MAX
        this.nextCurveAt = this.pd + CURVE_DIST_MIN + Math.random() * (CURVE_DIST_MAX - CURVE_DIST_MIN)
      } else {
        // Curve → go straight
        this.curveDir   = 0
        this.curveTo    = 0
        this.nextCurveAt = this.pd + STRAIGHT_DIST_MIN + Math.random() * (STRAIGHT_DIST_MAX - STRAIGHT_DIST_MIN)
      }
    }
    this.curve += (this.curveTo - this.curve) * Math.min(1, dt * 2.2)
    // Drift player laterally with road curve (only when moving)
    if (this.ps > 10) this.px += this.curve * this.scrollSpd * dt * 0.25
    this.px = Math.max(this.RL + PL_W * 0.6, Math.min(this.RR - PL_W * 0.6, this.px))

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
        this.spawnFloat(GAME_W / 2, PLAYER_Y - 55, '+FUEL 25%', '#00ff88')
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
    raceBridge.playerLane       = this.px < GAME_W / 2 ? 0 : 1

    this.drawAll()
  }

  // ─── Spin / failure logic ─────────────────────────────────────
  private onCrash(ex: number, ey: number) {
    if (this.time.now < this.invUntil) return

    this.spinCount++
    this.spinning  = true
    this.spinSpeed = 680
    this.invUntil  = this.time.now + INVINCE_MS
    this.fuel      = Math.max(0, this.fuel - 0.10)   // -10% fuel per crash
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
    return GAME_W / 2 + this.curve * (PLAYER_Y - sy)
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
  private spawnCar(li: number, type: Car['type'], color: number, vy: number): Car {
    const lc = this.allLaneCenters()
    return {
      x: lc[li], y: -30, laneIdx: li, targetLane: li,
      vy, type, color, dark: this.darken(color), alive: true, flashT: 0, blockCD: 0,
    }
  }

  private spawnEntities(dt: number) {
    const si = SPAWNS[this.difficulty]
    const sp = Math.max(this.scrollSpd, 60)  // minimum spawn speed for VY

    // Forward traffic → right 2 lanes (L2, L3)
    this.tTraffic -= dt
    if (this.tTraffic <= 0) {
      const li  = Math.random() < 0.5 ? 2 : 3
      const r   = Math.random()
      let type: Car['type'], color: number, vy: number
      if (r < 0.35) {
        type = 'yellow'; color = YELLOW_COLOR; vy = sp * 0.42
      } else if (r < 0.60) {
        type = 'red'; color = RED_COLOR; vy = sp * 0.45
      } else if (r < 0.80) {
        type = 'blue'; color = BLUE_COLOR; vy = sp * 0.38
      } else {
        type = 'truck'; color = TRUCK_COLOR; vy = sp * 0.28
      }
      this.cars.push(this.spawnCar(li, type, color, vy))
      this.tTraffic = si.traffic * (0.75 + Math.random() * 0.5)
    }

    // Oncoming → left 2 lanes (L0, L1)
    this.tIncoming -= dt
    if (this.tIncoming <= 0) {
      const li  = Math.random() < 0.5 ? 0 : 1
      const col = INCOMING_COLORS[Math.floor(Math.random() * INCOMING_COLORS.length)]
      this.cars.push(this.spawnCar(li, 'incoming', col, sp * 1.8 + 100))
      this.tIncoming = si.incoming * (0.65 + Math.random() * 0.7)
    }

    // Cop → right 2 lanes
    this.tCop -= dt
    if (this.tCop <= 0) {
      const li = Math.random() < 0.5 ? 2 : 3
      this.cars.push(this.spawnCar(li, 'cop', 0x111166, sp * 0.50))
      this.tCop = si.cop * (0.85 + Math.random() * 0.3)
    }

    // Fuel car → any lane (moving pickup, collect to refuel)
    this.tFuel -= dt
    if (this.tFuel <= 0) {
      const li  = Math.floor(Math.random() * 4)
      const col = FUEL_CAR_COLORS[Math.floor(Math.random() * FUEL_CAR_COLORS.length)]
      this.cars.push(this.spawnCar(li, 'fuel_car', col, sp * 0.48))
      this.tFuel = si.fuel * (0.8 + Math.random() * 0.4)
    }
  }

  private moveEntities(dt: number) {
    for (const c of this.cars) {
      c.y += c.vy * dt
      if (c.blockCD > 0) c.blockCD -= dt

      // Red: block player — change lane toward player when close
      if (c.type === 'red' && c.blockCD <= 0 && Math.abs(c.y - PLAYER_Y) < 120) {
        const playerLane = this.px < GAME_W / 2 ? 2 : 3
        if (c.targetLane !== playerLane) {
          c.targetLane = playerLane
          c.blockCD    = 3.0
        }
      }

      // Blue: random aggressive lane change every 2-4s
      if (c.type === 'blue' && c.blockCD <= 0) {
        const newLane = Math.random() < 0.5 ? 2 : 3
        c.targetLane = newLane
        c.blockCD    = 2.0 + Math.random() * 2.0
      }

      // Smooth lateral movement toward targetLane
      if (c.type === 'red' || c.type === 'blue') {
        const targetX = this.roadCenterAt(c.y) - ROAD_W / 2 + LANE_W * (c.targetLane + 0.5)
        const dx = targetX - c.x
        c.x += Math.sign(dx) * Math.min(Math.abs(dx), LATERAL_SPD * 0.7 * dt)
        // Update laneIdx when close to target
        if (Math.abs(dx) < 4) c.laneIdx = c.targetLane
      } else {
        // Track road curve for non-blocking cars
        c.x = this.roadCenterAt(c.y) - ROAD_W / 2 + LANE_W * (c.laneIdx + 0.5)
      }

      if (c.type === 'cop') c.flashT += dt
    }
    for (const b of this.bullets) b.y -= 660 * dt
    this.cars    = this.cars.filter(c => c.alive && c.y < CH + 80)
    this.bullets = this.bullets.filter(b => b.alive && b.y > -20)
    this.fuels   = []  // fuel pickups replaced by fuel_car type
  }

  // ─── Collisions ───────────────────────────────────────────────
  private checkCollisions() {
    const px = this.px, py = PLAYER_Y

    for (const c of this.cars) {
      if (!c.alive) continue
      const hitW = c.type === 'truck' ? CAR_W * 1.6 : CAR_W
      const hitH = c.type === 'truck' ? CAR_H * 1.5 : CAR_H
      if (Math.abs(c.x - px) > PL_W / 2 + hitW / 2 + 2) continue
      if (Math.abs(c.y - py) > PL_H / 2 + hitH / 2 + 2) continue

      if (c.type === 'fuel_car') {
        // Collect fuel car
        c.alive = false
        this.fuel = Math.min(1.0, this.fuel + 0.30)
        this.spawnFloat(c.x, c.y, '+FUEL 30%', '#00ff88')
        this.spawnCollectParticles(c.x, c.y, 0x22cc55)
        playFuel()
        if (raceBridge.onFuelCollected) raceBridge.onFuelCollected()
      } else if (c.type === 'cop') {
        c.alive = false
        const pts = this.difficulty === 'hard' ? 500 : this.difficulty === 'medium' ? 350 : 200
        this.score += pts; this.carsDestroyed++
        this.spawnFloat(c.x, c.y, `+${pts} RAM`, '#ff6600')
        this.spawnCollectParticles(c.x, c.y, 0xff4400)
      } else if (c.type === 'truck') {
        // Trucks: instant life loss (skip spin system)
        c.alive = false
        if (this.time.now >= this.invUntil) {
          this.fuel = Math.max(0, this.fuel - 0.20)  // trucks cost double fuel
          this.failureCount++
          this.invUntil = this.time.now + 3500
          raceBridge.lives = MAX_FAILURES - this.failureCount
          this.spawnCrashParticles(c.x, c.y)
          playCrash(true)
          if (this.failureCount >= MAX_FAILURES) { this.endRace(false); return }
          this.spawnFloat(c.x, c.y, 'TRUCK CRASH!', '#ff2200')
        }
      } else {
        this.onCrash(c.x, c.y)
      }
    }

    // Bullets: can hit yellow/red/blue/truck/incoming, not cop or fuel_car
    for (const b of this.bullets) {
      if (!b.alive) continue
      for (const c of this.cars) {
        if (!c.alive || c.type === 'cop' || c.type === 'fuel_car') continue
        if (Math.abs(c.x - b.x) > LANE_W * 0.55) continue
        if (Math.abs(c.y - b.y) > CAR_H / 2 + PL_H / 2 + 4) continue

        b.alive = false; c.alive = false
        this.carsDestroyed++
        const pts = c.type === 'incoming' ? 150 : c.type === 'truck' ? 300 : 80
        this.score += pts
        this.ammo   = Math.min(START_AMMO, this.ammo + AMMO_ON_KILL)
        this.spawnFloat(c.x, c.y, `+${pts}`, c.type === 'incoming' ? '#00ffcc' : '#ffdd00')
        this.spawnExplosion(c.x, c.y)
        break
      }
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

    const sc  = this.roadScrollY
    const RL  = this.RL
    const RR  = this.RR

    // ── HUD panel background ──────────────────────────────────
    g.fillStyle(0x000000); g.fillRect(GAME_W, 0, PANEL_W, CH)
    // Separator line
    g.fillStyle(0x334455); g.fillRect(GAME_W, 0, 2, CH)

    // ── Both shoulder base — always green (Road Fighter style) ─
    const grassDark = th.headlights ? 0x1a4a18 : 0x2d8020   // darker in night
    const grassMid  = th.headlights ? 0x256020 : 0x3aaa3a
    const grassAlt  = th.headlights ? 0x1e5418 : 0x34963a

    // Base fill (extends 70px past road edges to cover curve shift)
    g.fillStyle(grassDark)
    g.fillRect(0, PROG_H, RL + 70, CH - PROG_H)
    g.fillRect(RR - 70, PROG_H, GAME_W - RR + 70, CH - PROG_H)

    // Scrolling grass texture strips
    const strH = 24, strGap = 18
    const so   = sc % (strH + strGap)
    for (let y = PROG_H - strH + so; y < CH + strH; y += strH + strGap) {
      const even = Math.floor((y - so) / (strH + strGap)) % 2 === 0
      g.fillStyle(even ? grassMid : grassAlt, 0.6)
      g.fillRect(0, y, RL + 70, strH)
      g.fillRect(RR - 70, y, GAME_W - RR + 70, strH)
    }

    // ── LEFT shoulder: railroad + trees + crowd ────────────────
    const lW = RL  // left shoulder width

    // Railroad track (two rails + crossties) — scrolls at 0.6× road speed
    const railOff = (sc * 0.6) % 28
    const rail1 = 18, rail2 = 30  // x positions within left shoulder
    g.fillStyle(0x444434)
    for (let y = PROG_H - 28 + railOff; y < CH; y += 28) {
      g.fillRect(rail1 - 1, y, 16, 4)  // crosstie
    }
    g.fillStyle(0x6e6a58); g.fillRect(rail1, PROG_H, 2, CH - PROG_H)
    g.fillStyle(0x6e6a58); g.fillRect(rail2, PROG_H, 2, CH - PROG_H)

    // Large scrolling trees (Road Fighter bush clusters)
    const treeOff  = sc % 96
    const treeOff2 = (sc * 0.85) % 72
    for (let y = PROG_H - 28 + treeOff; y < CH + 28; y += 96) {
      const tx = lW * 0.72
      g.fillStyle(0x0a2a08); g.fillCircle(tx, y, 13)
      g.fillStyle(0x1a4a18); g.fillCircle(tx - 8, y + 4, 10)
      g.fillStyle(0x2a6a28); g.fillCircle(tx + 7, y + 2, 9)
      g.fillStyle(0x1a5a18); g.fillCircle(tx, y - 8, 9)
    }
    for (let y = PROG_H - 14 + treeOff2; y < CH + 28; y += 72) {
      const tx = lW * 0.5
      g.fillStyle(0x0d300a); g.fillCircle(tx, y, 11)
      g.fillStyle(0x1d5018); g.fillCircle(tx - 6, y + 3, 8)
      g.fillStyle(0x2a6020); g.fillCircle(tx + 5, y - 4, 8)
    }

    // Crowd spectators near road edge
    const shirtCols = [0xee3333, 0x3333ee, 0xeeaa00, 0x33aaee, 0xee33aa, 0xee6600]
    const figSpacing = 20, figOff = (sc * 0.75) % figSpacing
    for (let y = PROG_H + figOff; y < CH; y += figSpacing) {
      const row = Math.floor((y - figOff) / figSpacing)
      for (let fi = 0; fi < 2; fi++) {
        const fx = lW - 16 + fi * 9 + (row % 3) * 3
        const sc2 = shirtCols[(row * 2 + fi) % shirtCols.length]
        g.fillStyle(0xf0c880); g.fillCircle(fx, y - 4, 2)
        g.fillStyle(sc2, 0.9); g.fillRect(fx - 2, y - 2, 4, 5)
        g.fillStyle(0x1a1a1a); g.fillRect(fx - 2, y + 3, 2, 3); g.fillRect(fx, y + 3, 2, 3)
        g.fillStyle(sc2, 0.9); g.fillRect(fx - 4, y - 2, 2, 3); g.fillRect(fx + 2, y - 2, 2, 3)
      }
    }

    // ── RIGHT shoulder: trees + theme details ─────────────────
    const rsX = RR   // right shoulder starts here
    const rW  = GAME_W - RR  // = 85px

    // Scrolling right-side trees
    const rtOff  = sc % 80
    const rtOff2 = (sc * 0.9) % 60
    for (let y = PROG_H - 20 + rtOff; y < CH + 24; y += 80) {
      const tx = rsX + rW * 0.5
      g.fillStyle(0x0a2a08); g.fillCircle(tx, y, 14)
      g.fillStyle(0x1a4a18); g.fillCircle(tx - 9, y + 5, 11)
      g.fillStyle(0x2e6828); g.fillCircle(tx + 8, y + 2, 10)
      g.fillStyle(0x1e5820); g.fillCircle(tx - 3, y - 9, 9)
      g.fillStyle(0x3a7a30); g.fillCircle(tx + 4, y - 5, 7)
    }
    for (let y = PROG_H + rtOff2; y < CH + 24; y += 60) {
      const tx = rsX + rW * 0.8
      g.fillStyle(0x0d300a); g.fillCircle(tx, y, 10)
      g.fillStyle(0x1e5018); g.fillCircle(tx - 5, y + 3, 8)
      g.fillStyle(0x28681e, 0.8); g.fillCircle(tx + 4, y - 3, 7)
    }

    // Night city: lamp posts on right shoulder
    if (th.headlights) {
      const lampSpacing = 88, lampOff = sc % lampSpacing
      for (let y = PROG_H - lampSpacing + lampOff; y < CH + lampSpacing; y += lampSpacing) {
        const lx = rsX + 6
        g.fillStyle(0x334455, 0.9); g.fillRect(lx - 1, y - 20, 2, 24)
        g.fillStyle(0xffffaa, 0.7); g.fillCircle(lx, y - 20, 3)
        g.fillStyle(0xffffaa, 0.06); g.fillCircle(lx, y - 20, 10)
      }
    }

    // ── Progress bar at very top of game view ─────────────────
    const nextCP = ([...CHECKPOINTS, FINISH_DIST] as readonly number[]).find(cp => cp > this.pd) ?? FINISH_DIST
    const lastCP_arr = ([...CHECKPOINTS] as number[]).filter(cp => cp <= this.pd)
    const lastCP = lastCP_arr.length > 0 ? Math.max(...lastCP_arr) : 0
    const segProgress = Math.min(1, (this.pd - lastCP) / (nextCP - lastCP))
    const pbW = GAME_W - 4

    // Background (dark gold)
    g.fillStyle(0x553300); g.fillRect(2, 2, pbW, PROG_H - 4)
    // Filled portion (gold)
    g.fillStyle(0xffcc00); g.fillRect(2, 2, Math.round(pbW * segProgress), PROG_H - 4)
    // Player dot
    g.fillStyle(0xff2200); g.fillCircle(2 + Math.round(pbW * segProgress), PROG_H / 2, 3)
    // Border
    g.lineStyle(1, 0x886600); g.strokeRect(2, 2, pbW, PROG_H - 4)
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

    // Traffic / cop / incoming — typed rendering
    for (const c of this.cars) {
      if (c.type === 'truck') {
        // Trucks: wide, tall
        this.drawCar(g, c.x, c.y, Math.round(CAR_W * 1.6), Math.round(CAR_H * 1.5), c.color, c.dark)
        // Cab stripe
        g.fillStyle(0xaaaaaa, 0.4)
        g.fillRect(c.x - CAR_W * 0.7, c.y - CAR_H * 0.7, CAR_W * 1.4, CAR_H * 0.3)
      } else if (c.type === 'cop') {
        this.drawCar(g, c.x, c.y, CAR_W + 4, CAR_H, c.color, c.dark)
        const fo = Math.floor(c.flashT * 6) % 2 === 0
        g.fillStyle(fo ? 0xff1111 : 0x1111ff); g.fillRect(c.x - 7, c.y - CAR_H / 2 - 5, 14, 5)
        for (let ci = 0; ci < 4; ci++) {
          g.fillStyle(ci % 2 === 0 ? 0xffffff : 0x000000, 0.55)
          g.fillRect(c.x - CAR_W / 2 + ci * 4, c.y + 2, 4, 4)
        }
      } else if (c.type === 'fuel_car') {
        // Fuel car: glowing, multicolor halo
        this.drawCar(g, c.x, c.y, CAR_W, CAR_H, c.color, c.dark)
        const pulse = 0.3 + 0.3 * Math.sin(this.raceElapsed * 6)
        g.fillStyle(c.color, pulse); g.fillCircle(c.x, c.y, 14)
        g.fillStyle(0xffffff, 0.9)
        g.fillRect(c.x - 1, c.y - 5, 2, 10); g.fillRect(c.x - 5, c.y - 1, 10, 2)
      } else if (c.type === 'incoming') {
        this.drawCar(g, c.x, c.y, CAR_W, CAR_H, c.color, c.dark)
        if (c.y > CH * 0.52) {
          g.lineStyle(2, 0xff0000, 0.4); g.strokeRect(c.x - CAR_W / 2 - 2, c.y - CAR_H / 2 - 2, CAR_W + 4, CAR_H + 4)
        }
      } else {
        // yellow / red / blue — standard car
        this.drawCar(g, c.x, c.y, CAR_W, CAR_H, c.color, c.dark)
      }
    }

    // Bullets
    for (const b of this.bullets) {
      g.fillStyle(0xffff00, 0.25); g.fillRect(b.x - 4, b.y - 8, 8, 16)
      g.fillStyle(0xffee33);       g.fillRect(b.x - 1, b.y - 6, 3, 12)
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
  private hudBox(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, labelH: number, bodyH: number, label: string, value: string) {
    // Header bar (blue/teal gradient look)
    g.fillStyle(0x1155aa); g.fillRect(x, y, w, labelH)
    g.fillStyle(0x2277cc, 0.5); g.fillRect(x, y, w, Math.floor(labelH / 2))
    // Body
    g.fillStyle(0x0a0a18); g.fillRect(x, y + labelH, w, bodyH)
    // Border
    g.lineStyle(1, 0x3388ee); g.strokeRect(x, y, w, labelH + bodyH)
    // Texts via canvas (drawn in drawFloatTexts — here we just mark positions)
    // Actually draw via Phaser.GameObjects.Text already in floatPool
    // Return geometry for text positioning
    return { lx: x + w / 2, ly: y + labelH / 2, vx: x + w / 2, vy: y + labelH + bodyH / 2 }
  }

  private drawHud() {
    const g  = this.gHud
    g.clear()

    const px = GAME_W + 4   // panel content left edge
    const pw = PANEL_W - 8  // panel content width

    // ── Right panel ───────────────────────────────────────────

    // SCORE area (top)
    g.fillStyle(0xffdd00)
    // "1UP" label drawn via text objects below

    // ── RANK box ─────────────────────────────────────────────
    const rank = raceBridge.gridPosition ?? 1
    const bx1 = px, by1 = 28, bw = pw, bh1 = 16, bh2 = 28
    g.fillStyle(0x1155aa); g.fillRect(bx1, by1, bw, bh1)
    g.fillStyle(0x2277dd, 0.5); g.fillRect(bx1, by1, bw, Math.floor(bh1 / 2))
    g.fillStyle(0x050510); g.fillRect(bx1, by1 + bh1, bw, bh2)
    g.lineStyle(1, 0x3388ee); g.strokeRect(bx1, by1, bw, bh1 + bh2)

    // ── TIME box ─────────────────────────────────────────────
    const by2 = by1 + bh1 + bh2 + 6
    g.fillStyle(0x1155aa); g.fillRect(bx1, by2, bw, bh1)
    g.fillStyle(0x2277dd, 0.5); g.fillRect(bx1, by2, bw, Math.floor(bh1 / 2))
    g.fillStyle(0x050510); g.fillRect(bx1, by2 + bh1, bw, bh2)
    g.lineStyle(1, 0x3388ee); g.strokeRect(bx1, by2, bw, bh1 + bh2)

    // ── CARS box ─────────────────────────────────────────────
    const by3 = by2 + bh1 + bh2 + 6
    g.fillStyle(0x1155aa); g.fillRect(bx1, by3, bw, bh1)
    g.fillStyle(0x2277dd, 0.5); g.fillRect(bx1, by3, bw, Math.floor(bh1 / 2))
    g.fillStyle(0x050510); g.fillRect(bx1, by3 + bh1, bw, bh2)
    g.lineStyle(1, 0x3388ee); g.strokeRect(bx1, by3, bw, bh1 + bh2)

    // ── SPEED text (km/h) ─────────────────────────────────────
    // drawn via text objects

    // ── RPM + FUEL bars ───────────────────────────────────────
    const barY    = by3 + bh1 + bh2 + 48  // y start of bars
    const barH    = CH - barY - 48         // bar height
    const halfW   = Math.floor(pw / 2) - 2
    const rpmX    = px
    const fuelX   = px + halfW + 4
    const rpmRatio = Math.min(1, this.ps / this.topSpd)
    const fuelRatio = Math.max(0, this.fuel)

    // RPM bar (blue shades)
    g.fillStyle(0x111122); g.fillRect(rpmX, barY, halfW, barH)
    const rpmFill = Math.round(barH * rpmRatio)
    for (let i = 0; i < rpmFill; i += 3) {
      const t   = i / barH
      const col = Phaser.Display.Color.Interpolate.ColorWithColor(
        new Phaser.Display.Color(0x00, 0x44, 0xcc),
        new Phaser.Display.Color(0x00, 0xcc, 0xff),
        100, Math.round(t * 100)
      )
      g.fillStyle(Phaser.Display.Color.GetColor(col.r, col.g, col.b))
      g.fillRect(rpmX, barY + barH - i - 3, halfW, 2)
    }
    g.lineStyle(1, 0x3388ee); g.strokeRect(rpmX, barY, halfW, barH)

    // FUEL bar (brown → orange → red when low)
    g.fillStyle(0x111111); g.fillRect(fuelX, barY, halfW, barH)
    const fuelFill = Math.round(barH * fuelRatio)
    for (let i = 0; i < fuelFill; i += 3) {
      const t   = i / barH
      const col = Phaser.Display.Color.Interpolate.ColorWithColor(
        new Phaser.Display.Color(0x88, 0x33, 0x00),
        new Phaser.Display.Color(0xff, 0x99, 0x00),
        100, Math.round(t * 100)
      )
      g.fillStyle(Phaser.Display.Color.GetColor(col.r, col.g, col.b))
      g.fillRect(fuelX, barY + barH - i - 3, halfW, 2)
    }
    if (this.fuel < 0.20 && Math.floor(this.time.now / 250) % 2 === 0) {
      g.fillStyle(0xff2222, 0.35); g.fillRect(fuelX, barY, halfW, barH)
    }
    g.lineStyle(1, this.fuel < 0.20 ? 0xff2222 : 0x885522); g.strokeRect(fuelX, barY, halfW, barH)

    // Tick marks inside bars (every 25%)
    for (let t = 1; t <= 3; t++) {
      const ty = barY + Math.round(barH * (1 - t * 0.25))
      g.fillStyle(0x000000, 0.6); g.fillRect(rpmX, ty - 1, halfW, 1)
      g.fillStyle(0x000000, 0.6); g.fillRect(fuelX, ty - 1, halfW, 1)
    }

    // ── Speed lines on road (high speed effect) ───────────────
    if (this.ps > 300) {
      const a = Math.min(0.22, (this.ps - 300) / 250)
      for (let i = 0; i < 7; i++) {
        const lx = this.RL + 6 + Math.random() * ROAD_W
        const ly = Math.random() * CH * 0.85
        const lh = 14 + Math.random() * 28
        g.lineStyle(1, 0xffffff, a * (0.3 + Math.random() * 0.5))
        g.lineBetween(lx, ly, lx, ly + lh)
      }
    }

    // ── Low fuel screen border ────────────────────────────────
    if (this.fuel < 0.15 && Math.floor(this.time.now / 280) % 2 === 0) {
      g.lineStyle(3, 0xff2222, 0.6); g.strokeRect(1, 1, GAME_W - 2, CH - 2)
    }

    // ── HUD text (drawn on top via text objects) ──────────────
    this.updateHudTexts(rank, barY, barH, rpmX, fuelX, halfW)
  }

  private _hudTexts: Phaser.GameObjects.Text[] = []

  private updateHudTexts(rank: number, barY: number, barH: number, rpmX: number, fuelX: number, halfW: number) {
    // Lazily create persistent HUD text objects
    if (this._hudTexts.length === 0) {
      const make = (txt: string, sz: string, col: string, x: number, y: number, origin = 0.5) =>
        this.add.text(x, y, txt, { fontSize: sz, fontFamily: 'monospace', fontStyle: 'bold', color: col })
          .setOrigin(origin, 0.5).setDepth(12)
      const px = GAME_W + 4, pw = PANEL_W - 8
      const cx = GAME_W + PANEL_W / 2
      const bx1 = px, by1 = 28, bw = pw, bh1 = 16, bh2 = 28

      this._hudTexts = [
        // 0: "1UP"
        make('1UP', '9px', '#ffffff', cx, 10),
        // 1: score
        make('0', '11px', '#ffdd00', cx, 20),
        // 2: RANK label
        make('RANK', '9px', '#ffffff', cx, by1 + bh1 / 2),
        // 3: RANK value
        make('1', '16px', '#ffdd00', cx, by1 + bh1 + bh2 / 2),
        // 4: TIME label
        make('TIME', '9px', '#ffffff', cx, by1 + bh1 + bh2 + 6 + bh1 / 2),
        // 5: TIME value
        make("0'00\"0", '11px', '#ffffff', cx, by1 + bh1 + bh2 + 6 + bh1 + bh2 / 2),
        // 6: CARS label
        make('CARS', '9px', '#ffffff', cx, by1 + (bh1 + bh2 + 6) * 2 + bh1 / 2),
        // 7: CARS value
        make('0', '16px', '#ffffff', cx, by1 + (bh1 + bh2 + 6) * 2 + bh1 + bh2 / 2),
        // 8: speed text
        make('0 km/h', '13px', '#ff8800', cx, by1 + (bh1 + bh2 + 6) * 3 + 10),
        // 9: RPM label
        make('RPM', '8px', '#8888cc', rpmX + halfW / 2, barY + barH + 8),
        // 10: FUEL label
        make('FUEL', '8px', '#cc8844', fuelX + halfW / 2, barY + barH + 8),
        // 11: km distance
        make('000Km', '10px', '#ffffff', cx, barY + barH + 22),
        // 12: LIVES (spin pips via text)
        make('♥♥♥', '10px', '#ff3333', cx, CH - 12),
      ]
    }

    // Update dynamic values
    const sec  = Math.floor(this.raceElapsed)
    const min  = Math.floor(sec / 60)
    const s    = sec % 60
    const frac = Math.floor((this.raceElapsed - Math.floor(this.raceElapsed)) * 10)
    const timeStr = `${min}'${String(s).padStart(2, '0')}"${frac}`
    const kmH  = Math.round(this.ps * 0.48)
    const km   = Math.round(this.pd / 100)
    const lives = MAX_FAILURES - this.failureCount
    const hearts = '♥'.repeat(lives) + '♡'.repeat(Math.max(0, MAX_FAILURES - lives))

    this._hudTexts[1].setText(String(this.score))
    this._hudTexts[3].setText(String(rank))
    this._hudTexts[5].setText(timeStr)
    this._hudTexts[7].setText(String(this.carsDestroyed))
    this._hudTexts[8].setText(`${kmH} km/h`)
    this._hudTexts[11].setText(`${String(km).padStart(3, '0')}Km`)
    this._hudTexts[12].setText(hearts)
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
  // Use setTimeout loop so game keeps running when browser tab is in background
  fps: { forceSetTimeOut: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
})
