import Phaser from 'phaser'
import { raceBridge } from './raceBridge'
import {
  resumeAudio, startEngine, updateEngineSpeed, stopEngine,
  playFuel, playCrash,
} from './audioEngine'

// ─── Canvas ───────────────────────────────────────────────────────
const CW = 480
const CH = 560
const ROAD_W    = 200
const LANE_W    = ROAD_W / 2          // 100
const MINIMAP_W = 22
const PLAYER_Y  = CH * 0.82           // ~459

// ─── Race ─────────────────────────────────────────────────────────
const FINISH_DIST  = 20000
const CHECKPOINTS  = [5000, 10000, 15000] as const
const CHECKPOINT_FUEL = 0.25

// ─── Speed ────────────────────────────────────────────────────────
const ACCEL        = 240   // px/s² forward
const COAST_DEC    = 50    // px/s² coast
const BRAKE_DEC    = 200   // px/s² brake
const TOP_SPEED    = 500
const LATERAL_SPD  = 210   // px/s continuous left/right drag
const BASE_SCROLL  = 160   // minimum road scroll speed (always on)
const SPEED_RAMP   = 15    // added to top speed every interval
const RAMP_EVERY   = 30    // seconds

// ─── Lives / ammo ────────────────────────────────────────────────
const START_LIVES  = 3
const START_AMMO   = 10
const AMMO_ON_KILL = 3
const MAX_AMMO     = 20
const INVINCE_MS   = 2500

// ─── Fuel ────────────────────────────────────────────────────────
const FUEL_BASE  = 0.0045
const FUEL_SPD   = 0.000012

// ─── Cars ────────────────────────────────────────────────────────
const CAR_W = 14   // smaller Road Fighter style
const CAR_H = 24
const PL_W  = 16   // player slightly bigger
const PL_H  = 28

// ─── AI ──────────────────────────────────────────────────────────
const DIST_SCALE  = 0.013
const AI_NAMES    = ['Rex', 'Zara', 'Bolt', 'Nova']
const AI_SPD_EASY  = [0.82, 0.85, 0.87, 0.90]
const AI_SPD_MED   = [0.93, 0.97, 1.01, 1.04]
const AI_SPD_HARD  = [1.02, 1.05, 1.07, 1.09]

// ─── Themes ───────────────────────────────────────────────────────
const THEMES: Record<string, {
  sky: number; asphalt: number; band: number
  curbA: number; curbB: number; lane: number; shoulder: number
}> = {
  night_city: { sky: 0x05050f, asphalt: 0x14141f, band: 0x0d0d18, curbA: 0xcc2222, curbB: 0xdddddd, lane: 0x00ccff, shoulder: 0x080812 },
  desert:     { sky: 0x2a1a08, asphalt: 0x7a6040, band: 0x5a4828, curbA: 0xcc6611, curbB: 0xe8d8a0, lane: 0xffaa22, shoulder: 0x180e04 },
  mountain:   { sky: 0x0a0a18, asphalt: 0x2c2c3a, band: 0x222230, curbA: 0xddddee, curbB: 0x778899, lane: 0x88aaff, shoulder: 0x060610 },
}

// ─── Spawns ───────────────────────────────────────────────────────
const SPAWNS = {
  easy:   { traffic: 2.6, incoming: 5.5, cop: 11.0, fuel: 14.0 },
  medium: { traffic: 1.9, incoming: 3.8, cop:  7.5, fuel: 12.0 },
  hard:   { traffic: 1.3, incoming: 2.6, cop:  5.5, fuel: 11.0 },
}

const TRAFFIC_COLORS = [0x558855, 0x885555, 0x555588, 0x887755, 0x558877]

// ─── Interfaces ───────────────────────────────────────────────────
interface Car {
  x: number; y: number; vy: number
  lane: number
  type: 'traffic' | 'incoming' | 'cop'
  color: number; dark: number
  alive: boolean; flashT: number
}

interface Bullet   { x: number; y: number; alive: boolean }
interface FuelPick { x: number; y: number; vy: number; alive: boolean }

interface Particle {
  x: number; y: number; vx: number; vy: number
  life: number; size: number; color: number
}

interface AIRacer {
  dist: number; lane: number; name: string
  speedFactor: number; alive: boolean
}

interface FloatText {
  x: number; y: number; text: string; vy: number; alpha: number; color: string
}

// ═════════════════════════════════════════════════════════════════
class RaceScene extends Phaser.Scene {
  // ── Player ───────────────────────────────────────────────────
  private px      = 0     // current screen X
  private ps      = 0     // forward speed px/s
  private pd      = 0     // distance traveled
  private topSpd  = TOP_SPEED

  private lives   = START_LIVES
  private ammo    = START_AMMO
  private fuel    = 1.0
  private score   = 0

  private started    = false
  private ended      = false
  private lockUntil  = 0
  private invUntil   = 0
  private spinning   = false
  private spinAngle  = 0
  private spinSpeed  = 0

  // ── Road curve ───────────────────────────────────────────────
  private roadCX     = CW / 2   // current road center X
  private roadCXTo   = CW / 2   // target road center X
  private curveT     = 0
  private RL         = 0        // computed left edge each frame
  private RR         = 0        // computed right edge each frame

  // ── Scroll ───────────────────────────────────────────────────
  private roadScrollY = 0
  private scrollSpd   = BASE_SCROLL   // max(ps, BASE_SCROLL)

  // ── Track progress ───────────────────────────────────────────
  private cpPassed = new Set<number>()

  // ── Graphics layers ──────────────────────────────────────────
  private gBg!:   Phaser.GameObjects.Graphics
  private gRoad!: Phaser.GameObjects.Graphics
  private gEnt!:  Phaser.GameObjects.Graphics
  private gHud!:  Phaser.GameObjects.Graphics

  private bannerTxt!: Phaser.GameObjects.Text
  private finishTxt!: Phaser.GameObjects.Text
  private floatPool:  Phaser.GameObjects.Text[] = []

  // ── Entities ─────────────────────────────────────────────────
  private cars:      Car[]       = []
  private bullets:   Bullet[]    = []
  private fuels:     FuelPick[]  = []
  private particles: Particle[]  = []
  private ais:       AIRacer[]   = []
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

    this.roadCX  = CW / 2; this.roadCXTo = CW / 2; this.curveT = 0
    this.RL = CW / 2 - ROAD_W / 2; this.RR = CW / 2 + ROAD_W / 2
    this.px = this.RR - LANE_W / 2    // start in right lane
    this.ps = 0; this.pd = 0; this.topSpd = TOP_SPEED
    this.fuel   = 1.0 - (raceBridge.gridPosition - 1) * 0.05
    this.lives  = START_LIVES; this.ammo = START_AMMO; this.score = 0
    this.lockUntil = this.time.now + raceBridge.startDelayMs
    this.started = false; this.ended = false
    this.spinning = false; this.spinAngle = 0; this.spinSpeed = 0
    this.roadScrollY = 0; this.scrollSpd = BASE_SCROLL; this.tBanner = 0
    this.cpPassed.clear()
    this.cars = []; this.bullets = []; this.fuels = []
    this.particles = []; this.ais = []; this.floats = []

    const si = SPAWNS[this.difficulty]
    this.tTraffic = si.traffic; this.tIncoming = si.incoming
    this.tCop = si.cop; this.tFuel = si.fuel; this.tRamp = RAMP_EVERY

    const spdT = this.difficulty === 'easy' ? AI_SPD_EASY : this.difficulty === 'medium' ? AI_SPD_MED : AI_SPD_HARD
    this.ais = AI_NAMES.map((name, i) => ({
      dist: -(i + 1) * 300, lane: i % 2, name,
      speedFactor: spdT[i], alive: true,
    }))

    this.gBg   = this.add.graphics().setDepth(0)
    this.gRoad = this.add.graphics().setDepth(1)
    this.gEnt  = this.add.graphics().setDepth(2)
    this.gHud  = this.add.graphics().setDepth(10)

    this.bannerTxt = this.add.text(CW / 2, CH * 0.42, 'READY...', {
      fontSize: '44px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#ffffff', stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(20)

    this.finishTxt = this.add.text(CW / 2, CH * 0.40, 'FINISH!', {
      fontSize: '52px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#ffd700', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(20).setVisible(false)

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
    raceBridge.lives            = this.lives
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

    // ── Road curve ───────────────────────────────────────────
    this.curveT  += dt
    this.roadCXTo = CW / 2 + Math.sin(this.curveT * 0.28) * 55
    this.roadCX  += (this.roadCXTo - this.roadCX) * Math.min(1, dt * 1.1)
    this.RL       = this.roadCX - ROAD_W / 2
    this.RR       = this.roadCX + ROAD_W / 2

    // ── Input ────────────────────────────────────────────────
    const locked = this.time.now < this.lockUntil
    const up    = !locked && this.keys.up.isDown
    const down  = !locked && this.keys.down.isDown
    const left  = !locked && this.keys.left.isDown
    const right = !locked && this.keys.right.isDown
    const shoot = !locked && Phaser.Input.Keyboard.JustDown(this.spaceKey)

    // Forward speed
    if (up)        this.ps = Math.min(this.ps + ACCEL * dt, this.topSpd)
    else if (down) this.ps = Math.max(this.ps - BRAKE_DEC * dt, 0)
    else           this.ps = Math.max(this.ps - COAST_DEC * dt, 0)

    // Continuous lateral drag (Road Fighter style)
    if (left)  this.px -= LATERAL_SPD * dt
    if (right) this.px += LATERAL_SPD * dt
    // Clamp to road
    this.px = Math.max(this.RL + PL_W * 0.6, Math.min(this.RR - PL_W * 0.6, this.px))

    // Shoot
    if (shoot && this.ammo > 0) {
      this.bullets.push({ x: this.px, y: PLAYER_Y - PL_H / 2, alive: true })
      this.ammo = Math.max(0, this.ammo - 1)
    }

    // ── Physics ──────────────────────────────────────────────
    this.scrollSpd   = Math.max(this.ps, BASE_SCROLL)
    this.roadScrollY = (this.roadScrollY + this.scrollSpd * dt) % CH
    this.pd         += this.ps * dt
    this.fuel       -= (FUEL_BASE + this.ps * FUEL_SPD) * dt
    this.fuel        = Math.max(0, this.fuel)

    this.tRamp -= dt
    if (this.tRamp <= 0) { this.topSpd = Math.min(this.topSpd + SPEED_RAMP, 640); this.tRamp = RAMP_EVERY }

    // Crash spin
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
        this.spawnFloat(this.RL + ROAD_W / 2, PLAYER_Y - 55, '+FUEL 25%', '#00ff88')
        if (raceBridge.onCheckpoint) raceBridge.onCheckpoint()
      }
    }

    if (this.pd >= FINISH_DIST) { this.endRace(true);  return }
    if (this.fuel <= 0)         { this.endRace(false); return }

    // ── Entities ─────────────────────────────────────────────
    this.spawnEntities(dt)
    this.moveEntities(dt)
    this.checkCollisions()
    this.updateAI(dt)
    this.updateParticles(dt)
    this.updateFloats(dt)

    updateEngineSpeed(this.ps / this.topSpd)

    raceBridge.fuelLevel        = this.fuel
    raceBridge.raceScore        = this.score
    raceBridge.distanceTraveled = this.pd
    raceBridge.lives            = this.lives
    raceBridge.ammo             = this.ammo
    raceBridge.playerLane       = this.px < this.roadCX ? 0 : 1

    this.drawAll()
  }

  // ─── Crash / end ──────────────────────────────────────────────
  private onCrash(ex: number, ey: number) {
    if (this.time.now < this.invUntil) return
    this.lives--
    playCrash(true)
    this.spawnCrashParticles(ex, ey)
    if (raceBridge.onCrash) raceBridge.onCrash()
    if (this.lives <= 0) { this.endRace(false); return }
    this.invUntil  = this.time.now + INVINCE_MS
    this.spinning  = true
    this.spinSpeed = 700
    this.fuel      = Math.max(this.fuel, 0.06)
    raceBridge.lives = this.lives
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

  // ─── Lane helpers ─────────────────────────────────────────────
  private lc(): [number, number] {
    return [this.RL + LANE_W / 2, this.RR - LANE_W / 2]
  }

  // ─── Spawn ────────────────────────────────────────────────────
  private spawnEntities(dt: number) {
    const si  = SPAWNS[this.difficulty]
    const lc  = this.lc()

    this.tTraffic -= dt
    if (this.tTraffic <= 0) {
      const lane = Math.random() < 0.5 ? 0 : 1
      const col  = TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)]
      this.cars.push({
        x: lc[lane], y: -30, lane,
        vy: this.scrollSpd * 0.42,
        type: 'traffic', color: col, dark: this.darken(col), alive: true, flashT: 0,
      })
      this.tTraffic = si.traffic * (0.75 + Math.random() * 0.5)
    }

    this.tIncoming -= dt
    if (this.tIncoming <= 0) {
      const lane = Math.random() < 0.5 ? 0 : 1
      // Incoming cars travel DOWN the screen (toward player) at high speed
      this.cars.push({
        x: lc[lane], y: -30, lane,
        vy: this.scrollSpd * 1.75 + 100,
        type: 'incoming', color: 0xffbb00, dark: 0xaa7700, alive: true, flashT: 0,
      })
      this.tIncoming = si.incoming * (0.65 + Math.random() * 0.7)
    }

    this.tCop -= dt
    if (this.tCop <= 0) {
      const lane = Math.random() < 0.5 ? 0 : 1
      this.cars.push({
        x: lc[lane], y: -30, lane,
        vy: this.scrollSpd * 0.50,
        type: 'cop', color: 0x111166, dark: 0x080840, alive: true, flashT: 0,
      })
      this.tCop = si.cop * (0.85 + Math.random() * 0.3)
    }

    this.tFuel -= dt
    if (this.tFuel <= 0) {
      const lane = Math.random() < 0.5 ? 0 : 1
      this.fuels.push({ x: lc[lane], y: -28, vy: this.scrollSpd * 0.42, alive: true })
      this.tFuel = si.fuel * (0.8 + Math.random() * 0.4)
    }
  }

  private moveEntities(dt: number) {
    for (const c of this.cars)    { c.y += c.vy * dt; if (c.type === 'cop') c.flashT += dt }
    for (const b of this.bullets)   b.y -= 640 * dt
    for (const f of this.fuels)     f.y += f.vy * dt
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

      if (c.type === 'cop') {
        c.alive = false
        const pts = this.difficulty === 'hard' ? 500 : this.difficulty === 'medium' ? 350 : 200
        this.score += pts
        this.spawnFloat(c.x, c.y, `+${pts}`, '#ff6600')
        this.spawnCollectParticles(c.x, c.y, 0xff4400)
      } else {
        c.alive = false
        this.onCrash(c.x, c.y)
      }
    }

    // Bullets vs incoming — wider X detection (half lane width)
    for (const b of this.bullets) {
      if (!b.alive) continue
      for (const c of this.cars) {
        if (!c.alive || c.type !== 'incoming') continue
        if (Math.abs(c.x - b.x) > LANE_W * 0.52) continue     // wide lane detection
        if (Math.abs(c.y - b.y) > CAR_H / 2 + PL_H / 2) continue
        b.alive = false; c.alive = false
        this.score += 150
        this.ammo   = Math.min(MAX_AMMO, this.ammo + AMMO_ON_KILL)
        this.spawnFloat(c.x, c.y, '+150 KILL', '#00ffcc')
        this.spawnCrashParticles(c.x, c.y)
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

  private updateAI(dt: number) {
    for (const ai of this.ais) ai.dist += this.ps * ai.speedFactor * dt
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt }
    this.particles = this.particles.filter(p => p.life > 0)
  }

  private updateFloats(dt: number) {
    for (const f of this.floats) { f.y += f.vy * dt; f.alpha -= dt * 1.5 }
    this.floats = this.floats.filter(f => f.alpha > 0)
  }

  private spawnCrashParticles(x: number, y: number) {
    const cols = [0xff4400, 0xffaa00, 0xffffff, 0xff0000]
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI * 2 * i) / 10
      const s = 70 + Math.random() * 130
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.7 + Math.random() * 0.4, size: 2 + Math.random() * 3, color: cols[i % 4] })
    }
  }

  private spawnCollectParticles(x: number, y: number, color: number) {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6 - Math.PI / 2
      this.particles.push({ x, y, vx: Math.cos(a) * 50, vy: Math.sin(a) * 50 - 18, life: 0.5, size: 3, color })
    }
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

    // Shoulders (fill around road)
    g.fillStyle(th.shoulder)
    g.fillRect(MINIMAP_W, 0, this.RL - MINIMAP_W, CH)
    g.fillRect(this.RR, 0, CW - this.RR, CH)

    // Far scenery (shifts slightly opposite to road curve)
    const ox = (CW / 2 - this.roadCX) * 0.4

    if (this.theme === 'night_city') {
      const bcs = [0x111122, 0x0f0f1e, 0x141428]
      for (let i = 0; i < 4; i++) {
        const bx = ((i * 85 + ox * 0.6 + 280) % 360) + MINIMAP_W - 40
        const bh = 55 + (i * 27) % 70
        g.fillStyle(bcs[i % 3])
        g.fillRect(bx, CH * 0.2 - bh, 25 + (i % 3) * 7, bh)
      }
      for (let i = 0; i < 3; i++) {
        const bx = this.RR + ((i * 75 + ox * 0.3 + 20) % 140)
        const bh = 45 + (i * 31) % 65
        g.fillStyle(bcs[i % 3])
        if (bx < CW - 14) g.fillRect(bx, CH * 0.18 - bh, 22 + (i % 3) * 6, bh)
      }
    } else if (this.theme === 'desert') {
      g.fillStyle(0x6b4a20)
      const dh = CH * 0.28 + Math.sin(ox * 0.02) * 12
      g.fillTriangle(MINIMAP_W, CH * 0.55, MINIMAP_W + (this.RL - MINIMAP_W) / 2 + ox * 0.15, dh, this.RL, CH * 0.55)
    } else {
      g.fillStyle(0x1a1a30)
      const pk = CH * 0.13 + ox * 0.04
      g.fillTriangle(MINIMAP_W, CH * 0.55, this.RL * 0.5, pk, this.RL, CH * 0.55)
      g.fillStyle(0x141428)
      g.fillTriangle(this.RR, CH * 0.55, this.RR + (CW - this.RR) * 0.4, pk + 20, CW - 14, CH * 0.55)
      g.fillStyle(0xeeeeff, 0.55)
      g.fillTriangle(this.RL * 0.5 - 14, CH * 0.20, this.RL * 0.5, pk, this.RL * 0.5 + 14, CH * 0.20)
    }
  }

  private drawRoad() {
    const g  = this.gRoad
    const th = THEMES[this.theme] ?? THEMES.night_city
    const sc = this.roadScrollY
    g.clear()

    // Road surface
    g.fillStyle(th.asphalt); g.fillRect(this.RL, 0, ROAD_W, CH)

    // Scrolling bands
    const bandH = 36, bandGap = 72
    const bo    = sc % (bandH + bandGap)
    g.fillStyle(th.band)
    for (let y = -bandH + bo; y < CH + bandH; y += bandH + bandGap) {
      g.fillRect(this.RL, y, ROAD_W, bandH)
    }

    // Lane divider (dashed center)
    const lx    = this.RL + LANE_W
    const dashH = 20, dashGap = 16
    const do_   = sc % (dashH + dashGap)
    g.fillStyle(th.lane)
    for (let y = -dashH + do_; y < CH + dashH; y += dashH + dashGap) {
      g.fillRect(lx - 1, y, 2, dashH)
    }

    // Curbs (left and right)
    const curbW = 8, curbH = 16, co = sc % (curbH * 2)
    for (let y = -curbH + co; y < CH + curbH; y += curbH * 2) {
      g.fillStyle(th.curbA)
      g.fillRect(this.RL - curbW, y, curbW, curbH)
      g.fillRect(this.RR,          y, curbW, curbH)
      g.fillStyle(th.curbB)
      g.fillRect(this.RL - curbW, y + curbH, curbW, curbH)
      g.fillRect(this.RR,          y + curbH, curbW, curbH)
    }
  }

  // ─── Generic car sprite ───────────────────────────────────────
  private drawCar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, dark: number) {
    const hw = w / 2, hh = h / 2
    // Shadow
    g.fillStyle(0x000000, 0.28); g.fillEllipse(x + 1, y + hh - 2, w + 4, 7)
    // Body
    g.fillStyle(dark);  g.fillRoundedRect(x - hw, y - hh, w, h, 2)
    g.fillStyle(color); g.fillRoundedRect(x - hw + 1, y - hh + 1, w - 2, h * 0.65, 2)
    // Windshield
    g.fillStyle(0x88ccff, 0.5); g.fillRect(x - hw + 2, y - hh + 2, w - 4, h * 0.24)
    // Tail / headlights
    g.fillStyle(0xff2200); g.fillRect(x - hw + 1, y - hh + 1, 3, 2); g.fillRect(x + hw - 4, y - hh + 1, 3, 2)
    g.fillStyle(0xffee88); g.fillRect(x - hw + 1, y + hh - 4, 4, 3); g.fillRect(x + hw - 5, y + hh - 4, 4, 3)
  }

  // ─── Player battle car (smaller) ─────────────────────────────
  private drawPlayer(g: Phaser.GameObjects.Graphics) {
    const invincible = this.time.now < this.invUntil
    if (invincible && Math.floor(this.time.now / 110) % 2 === 0) return

    const x  = this.px
    const y  = PLAYER_Y
    const sx = this.spinning ? Math.sin(this.spinAngle * 0.0174) * 16 : 0
    const hw = PL_W / 2
    const hh = PL_H / 2

    // Shadow
    g.fillStyle(0x000000, 0.32); g.fillEllipse(x + sx + 2, y + hh - 2, PL_W + 8, 10)

    // Side armor
    g.fillStyle(0x661111)
    g.fillRect(x + sx - hw - 3, y - hh + 5, 3, PL_H - 10)
    g.fillRect(x + sx + hw,     y - hh + 5, 3, PL_H - 10)

    // Body
    g.fillStyle(0xcc1111); g.fillRoundedRect(x + sx - hw, y - hh, PL_W, PL_H, 3)
    g.fillStyle(0x881111); g.fillRoundedRect(x + sx - hw + 2, y - hh + 3, PL_W - 4, PL_H - 6, 2)

    // Cockpit
    g.fillStyle(0x001a33, 0.85); g.fillRect(x + sx - 4, y - hh + 5, 8, 8)

    // Roof turret
    g.fillStyle(0x2a2a2a); g.fillRect(x + sx - 3, y - hh + 1, 6, 7)
    // Barrel
    g.fillStyle(0x111111); g.fillRect(x + sx - 1, y - hh - 4, 2, 7)

    // Headlights
    g.fillStyle(0xffee88, 0.9)
    g.fillRect(x + sx - 6, y + hh - 5, 4, 3)
    g.fillRect(x + sx + 2, y + hh - 5, 4, 3)

    // Headlight cones
    g.fillStyle(0xffee88, 0.10)
    g.fillTriangle(x + sx - 4, y + hh - 4, x + sx - 20, y + hh + 26, x + sx, y + hh + 26)
    g.fillTriangle(x + sx + 4, y + hh - 4, x + sx + 20, y + hh + 26, x + sx, y + hh + 26)

    // Exhaust
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
    const g  = this.gEnt
    g.clear()
    const lc = this.lc()

    // AI racers
    for (const ai of this.ais) {
      const sy = PLAYER_Y - (ai.dist - this.pd) * DIST_SCALE
      if (sy < -60 || sy > CH + 60) continue
      this.drawCar(g, lc[ai.lane % 2], sy, CAR_W, CAR_H, 0x2255ff, 0x1133aa)
    }

    // Traffic / cop / incoming
    for (const c of this.cars) {
      if (c.type === 'cop') {
        this.drawCar(g, c.x, c.y, CAR_W + 4, CAR_H, c.color, c.dark)
        // Flashing light bar
        const fo = Math.floor(c.flashT * 6) % 2 === 0
        g.fillStyle(fo ? 0xff1111 : 0x1111ff); g.fillRect(c.x - 7, c.y - CAR_H / 2 - 5, 14, 5)
        // Checkered stripe
        for (let ci = 0; ci < 4; ci++) {
          g.fillStyle(ci % 2 === 0 ? 0xffffff : 0x000000, 0.55)
          g.fillRect(c.x - CAR_W / 2 + ci * 4, c.y + 2, 4, 4)
        }
      } else if (c.type === 'incoming') {
        this.drawCar(g, c.x, c.y, CAR_W, CAR_H, c.color, c.dark)
        // Danger outline when close
        if (c.y > CH * 0.52) {
          g.lineStyle(2, 0xff0000, 0.45); g.strokeRect(c.x - CAR_W / 2 - 2, c.y - CAR_H / 2 - 2, CAR_W + 4, CAR_H + 4)
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

    // Start flag
    g.fillStyle(0x00ff44); g.fillRect(3, CH - 9, MINIMAP_W - 6, 7)

    // Finish checkerboard
    for (let ci = 0; ci < 4; ci++) {
      g.fillStyle(ci % 2 === 0 ? 0xffffff : 0x000000)
      g.fillRect(3 + ci * 4, 2, 4, 7)
    }

    // Checkpoints
    g.fillStyle(0x00ccff)
    for (const cp of CHECKPOINTS) {
      const cy = CH - (cp / FINISH_DIST) * (CH - 14) - 7
      g.fillRect(3, cy - 1, MINIMAP_W - 6, 2)
    }

    // Player dot + pulse
    const pRatio = Math.min(1, this.pd / FINISH_DIST)
    const pDotY  = CH - pRatio * (CH - 18) - 9
    g.fillStyle(0xff2222); g.fillCircle(MINIMAP_W / 2, pDotY, 4)
    if (Math.floor(this.time.now / 450) % 2 === 0) {
      g.lineStyle(1, 0xff2222, 0.45); g.strokeCircle(MINIMAP_W / 2, pDotY, 7)
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

    // ── Low fuel border flash ────────────────────────────────
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
