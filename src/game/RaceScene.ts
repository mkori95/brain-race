import Phaser from 'phaser'
import { raceBridge } from './raceBridge'
import {
  resumeAudio, startEngine, updateEngineSpeed, stopEngine,
  playFuel, playCrash,   // eslint-disable-line @typescript-eslint/no-unused-vars
} from './audioEngine'

// ─── Canvas ───────────────────────────────────────────────────────
const CW = 480
const CH = 560
const ROAD_W    = 200
const ROAD_L    = (CW - ROAD_W) / 2   // 140
const ROAD_R    = ROAD_L + ROAD_W      // 340
const LANE_W    = ROAD_W / 2           // 100
const MINIMAP_W = 22
const PLAYER_Y  = CH * 0.82            // ~459

// ─── Race ─────────────────────────────────────────────────────────
const FINISH_DIST  = 20000
const CHECKPOINTS  = [5000, 10000, 15000] as const
const CHECKPOINT_FUEL = 0.25

// ─── Speed ────────────────────────────────────────────────────────
const ACCEL      = 260   // px/s²
const COAST_DEC  = 55    // px/s² coast
const BRAKE_DEC  = 220   // px/s² brake
const TOP_SPEED  = 500
const SPEED_RAMP = 15    // added to top speed every ramp interval
const RAMP_EVERY = 30    // seconds

// ─── Lives / ammo ────────────────────────────────────────────────
const START_LIVES  = 3
const START_AMMO   = 10
const AMMO_ON_KILL = 3
const MAX_AMMO     = 20
const INVINCE_MS   = 2500

// ─── Fuel ────────────────────────────────────────────────────────
const FUEL_BASE  = 0.0045   // per second
const FUEL_SPD   = 0.000012 // per (px/s) per second

// ─── AI ──────────────────────────────────────────────────────────
const DIST_SCALE  = 0.012  // (ai.dist - player.dist) × this = screen Y offset
const AI_NAMES    = ['Rex', 'Zara', 'Bolt', 'Nova']
const AI_SPD_EASY   = [0.82, 0.84, 0.86, 0.88]
const AI_SPD_MED    = [0.93, 0.97, 1.00, 1.03]
const AI_SPD_HARD   = [1.01, 1.04, 1.06, 1.08]

// ─── Car dims ────────────────────────────────────────────────────
const CAR_W = 22
const CAR_H = 38

// ─── Theme configs ───────────────────────────────────────────────
const THEMES: Record<string, { sky: number; asphalt: number; band: number; curbA: number; curbB: number; lane: number; shoulder: number }> = {
  night_city: { sky: 0x05050f, asphalt: 0x14141f, band: 0x0e0e18, curbA: 0xcc2222, curbB: 0xdddddd, lane: 0x00ccff, shoulder: 0x0a0a14 },
  desert:     { sky: 0x2a1a08, asphalt: 0x7a6040, band: 0x5a4828, curbA: 0xcc6611, curbB: 0xe8d8a0, lane: 0xffaa22, shoulder: 0x1a1008 },
  mountain:   { sky: 0x0a0a18, asphalt: 0x303040, band: 0x242430, curbA: 0xddddee, curbB: 0x778899, lane: 0x88aaff, shoulder: 0x080812 },
}

// ─── Spawn intervals (seconds) ────────────────────────────────────
const SPAWNS = {
  easy:   { traffic: 2.6, incoming: 5.5, cop: 11.0, fuel: 14.0 },
  medium: { traffic: 1.9, incoming: 3.8, cop:  7.5, fuel: 12.0 },
  hard:   { traffic: 1.3, incoming: 2.6, cop:  5.5, fuel: 11.0 },
}

// ─── Traffic colors ───────────────────────────────────────────────
const TRAFFIC_COLORS = [0x558855, 0x885555, 0x555588, 0x887755, 0x558877]

// ─── Interfaces ───────────────────────────────────────────────────
interface Car {
  x: number; y: number; vy: number
  lane: number
  type: 'traffic' | 'incoming' | 'cop'
  color: number; dark: number
  alive: boolean
  flashT: number
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
  // ── Player state ─────────────────────────────────────────────
  private px     = 0        // screen X
  private ptx    = 0        // target X (for smooth lane switch)
  private pl     = 1        // current lane 0|1
  private ps     = 0        // speed px/s
  private pd     = 0        // distance traveled px
  private topSpd = TOP_SPEED

  private lives = START_LIVES
  private ammo  = START_AMMO
  private fuel  = 1.0
  private score = 0

  private started    = false
  private ended      = false
  private lockUntil  = 0    // timestamp when player controls unlock
  private invUntil   = 0    // invincibility end timestamp
  private spinning   = false
  private spinAngle  = 0
  private spinSpeed  = 0

  // ── Curve / scroll ────────────────────────────────────────────
  private ct         = 0    // curve time
  private curvePow   = 0    // -1..1
  private bgScrollX  = 0    // accumulated horizontal scenery offset
  private roadScrollY = 0   // 0..CH scrolling road texture

  private cpPassed = new Set<number>()

  // ── Graphics layers ───────────────────────────────────────────
  private gBg!:   Phaser.GameObjects.Graphics
  private gRoad!: Phaser.GameObjects.Graphics
  private gEnt!:  Phaser.GameObjects.Graphics
  private gHud!:  Phaser.GameObjects.Graphics

  // ── Text objects ──────────────────────────────────────────────
  private bannerTxt!:   Phaser.GameObjects.Text
  private finishTxt!:   Phaser.GameObjects.Text
  private floatPool:    Phaser.GameObjects.Text[] = []

  // ── Entities ──────────────────────────────────────────────────
  private cars:      Car[]       = []
  private bullets:   Bullet[]    = []
  private fuels:     FuelPick[]  = []
  private particles: Particle[]  = []
  private ais:       AIRacer[]   = []
  private floats:    FloatText[] = []

  // ── Input ─────────────────────────────────────────────────────
  private keys!:     Phaser.Types.Input.Keyboard.CursorKeys
  private spaceKey!: Phaser.Input.Keyboard.Key

  // ── Timers ────────────────────────────────────────────────────
  private tTraffic  = 0
  private tIncoming = 0
  private tCop      = 0
  private tFuel     = 0
  private tRamp     = RAMP_EVERY
  private tBanner   = 0

  private difficulty: 'easy' | 'medium' | 'hard' = 'easy'
  private theme = 'night_city'

  constructor() { super({ key: 'RaceScene' }) }

  // ─────────────────────────────────────────────────────────────
  create() {
    this.theme = raceBridge.trackTheme || 'night_city'
    const lvl = raceBridge.playerLevel
    this.difficulty = lvl <= 2 ? 'easy' : lvl === 3 ? 'medium' : 'hard'

    const lc = this.lc()
    this.pl = 1; this.px = lc[1]; this.ptx = lc[1]
    this.ps = 0; this.pd = 0
    this.fuel   = 1.0 - (raceBridge.gridPosition - 1) * 0.05
    this.lives  = START_LIVES
    this.ammo   = START_AMMO
    this.score  = 0
    this.topSpd = TOP_SPEED
    this.lockUntil  = this.time.now + raceBridge.startDelayMs
    this.started    = false
    this.ended      = false
    this.spinning   = false
    this.spinAngle  = 0
    this.tBanner    = 0
    this.ct         = 0; this.curvePow = 0; this.bgScrollX = 0; this.roadScrollY = 0
    this.cpPassed.clear()
    this.cars = []; this.bullets = []; this.fuels = []
    this.particles = []; this.ais = []; this.floats = []

    // AI setup
    const spdTable = this.difficulty === 'easy' ? AI_SPD_EASY : this.difficulty === 'medium' ? AI_SPD_MED : AI_SPD_HARD
    this.ais = AI_NAMES.map((name, i) => ({
      dist: -(i + 1) * 300,       // start behind player
      lane: i % 2,
      name,
      speedFactor: spdTable[i],
      alive: true,
    }))

    // Spawn timers
    const si = SPAWNS[this.difficulty]
    this.tTraffic = si.traffic; this.tIncoming = si.incoming
    this.tCop = si.cop; this.tFuel = si.fuel

    // Graphics
    this.gBg   = this.add.graphics().setDepth(0)
    this.gRoad = this.add.graphics().setDepth(1)
    this.gEnt  = this.add.graphics().setDepth(2)
    this.gHud  = this.add.graphics().setDepth(10)

    // Banner / finish text
    this.bannerTxt = this.add.text(CW / 2, CH * 0.42, 'READY...', {
      fontSize: '44px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#ffffff', stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(20)

    this.finishTxt = this.add.text(CW / 2, CH * 0.40, 'FINISH!', {
      fontSize: '52px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#ffd700', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(20).setVisible(false)

    // Float text pool (8 reusable text objects)
    for (let i = 0; i < 8; i++) {
      this.floatPool.push(
        this.add.text(0, 0, '', {
          fontSize: '14px', fontFamily: 'monospace', fontStyle: 'bold',
          color: '#ffdd00', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 0.5).setDepth(15).setVisible(false)
      )
    }

    this.keys     = this.input.keyboard!.createCursorKeys()
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

    // Init bridge
    raceBridge.fuelLevel       = this.fuel
    raceBridge.raceScore       = 0
    raceBridge.distanceTraveled = 0
    raceBridge.lives           = this.lives
    raceBridge.ammo            = this.ammo
    raceBridge.playerLane      = this.pl
    raceBridge.gameOver        = false
    raceBridge.raceFinished    = false

    resumeAudio()
    startEngine()
  }

  // ─────────────────────────────────────────────────────────────
  update(_time: number, delta: number) {
    const dt = delta / 1000

    // ── Start banner (first ~2.8s) ───────────────────────────
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

    // ── Input ────────────────────────────────────────────────
    const locked = this.time.now < this.lockUntil
    const up    = !locked && this.keys.up.isDown
    const down  = !locked && this.keys.down.isDown
    const left  = !locked && Phaser.Input.Keyboard.JustDown(this.keys.left)
    const right = !locked && Phaser.Input.Keyboard.JustDown(this.keys.right)
    const shoot = !locked && Phaser.Input.Keyboard.JustDown(this.spaceKey)

    // Speed
    if (up)        this.ps = Math.min(this.ps + ACCEL * dt, this.topSpd)
    else if (down) this.ps = Math.max(this.ps - BRAKE_DEC * dt, 0)
    else           this.ps = Math.max(this.ps - COAST_DEC * dt, 0)

    // Lane switch
    const lc = this.lc()
    if (left  && this.pl > 0) { this.pl--; this.ptx = lc[this.pl] }
    if (right && this.pl < 1) { this.pl++; this.ptx = lc[this.pl] }
    this.px += (this.ptx - this.px) * Math.min(1, dt * 9)

    // Shoot
    if (shoot && this.ammo > 0) {
      this.bullets.push({ x: this.px, y: PLAYER_Y - CAR_H / 2, alive: true })
      this.ammo = Math.max(0, this.ammo - 1)
    }

    // Fuel drain
    this.fuel -= (FUEL_BASE + this.ps * FUEL_SPD) * dt
    this.fuel  = Math.max(0, this.fuel)

    // Distance + scroll
    this.pd += this.ps * dt
    this.roadScrollY = (this.roadScrollY + this.ps * dt) % CH

    // Speed ramp
    this.tRamp -= dt
    if (this.tRamp <= 0) { this.topSpd = Math.min(this.topSpd + SPEED_RAMP, 620); this.tRamp = RAMP_EVERY }

    // Curve
    this.ct      += dt
    this.curvePow = Math.sin(this.ct * 0.38) * 0.7
    this.bgScrollX += this.curvePow * this.ps * dt * 0.12
    this.bgScrollX  = Math.max(-90, Math.min(90, this.bgScrollX))

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
        this.spawnFloat(ROAD_L + ROAD_W / 2, PLAYER_Y - 55, '+FUEL 25%', '#00ff88')
        if (raceBridge.onCheckpoint) raceBridge.onCheckpoint()
      }
    }

    // ── Race end conditions ──────────────────────────────────
    if (this.pd >= FINISH_DIST) { this.endRace(true);  return }
    if (this.fuel <= 0)         { this.endRace(false); return }

    // ── Entities ─────────────────────────────────────────────
    this.spawnEntities(dt)
    this.moveEntities(dt)
    this.checkCollisions()
    this.updateAI(dt)
    this.updateParticles(dt)
    this.updateFloats(dt)

    // ── Audio ─────────────────────────────────────────────────
    updateEngineSpeed(this.ps / this.topSpd)

    // ── Bridge sync ──────────────────────────────────────────
    raceBridge.fuelLevel        = this.fuel
    raceBridge.raceScore        = this.score
    raceBridge.distanceTraveled = this.pd
    raceBridge.lives            = this.lives
    raceBridge.ammo             = this.ammo
    raceBridge.playerLane       = this.pl

    this.drawAll()
  }

  // ─── Lane helpers ─────────────────────────────────────────────
  private lc(): [number, number] {
    return [ROAD_L + LANE_W / 2, ROAD_R - LANE_W / 2]
  }

  // ─── Crash / death ────────────────────────────────────────────
  private onCrash(carX: number, carY: number) {
    if (this.time.now < this.invUntil) return
    this.lives--
    playCrash(true)
    this.spawnCrashParticles(carX, carY)
    if (raceBridge.onCrash) raceBridge.onCrash()
    if (this.lives <= 0) {
      this.endRace(false)
      return
    }
    this.invUntil  = this.time.now + INVINCE_MS
    this.spinning  = true
    this.spinSpeed = 700
    this.fuel = Math.max(this.fuel, 0.05)
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

  // ─── Spawn entities ───────────────────────────────────────────
  private spawnEntities(dt: number) {
    const si = SPAWNS[this.difficulty]
    const lc = this.lc()

    this.tTraffic -= dt
    if (this.tTraffic <= 0) {
      const lane = Math.random() < 0.5 ? 0 : 1
      const col  = TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)]
      this.cars.push({
        x: lc[lane], y: -44, lane,
        vy: Math.max(30, this.ps * 0.42),
        type: 'traffic', color: col, dark: this.darken(col), alive: true, flashT: 0,
      })
      this.tTraffic = si.traffic * (0.75 + Math.random() * 0.5)
    }

    this.tIncoming -= dt
    if (this.tIncoming <= 0) {
      const lane = Math.random() < 0.5 ? 0 : 1
      this.cars.push({
        x: lc[lane], y: -44, lane,
        vy: this.ps * 1.75 + 80,
        type: 'incoming', color: 0xffbb00, dark: 0xaa7700, alive: true, flashT: 0,
      })
      this.tIncoming = si.incoming * (0.65 + Math.random() * 0.7)
    }

    this.tCop -= dt
    if (this.tCop <= 0) {
      const lane = Math.random() < 0.5 ? 0 : 1
      this.cars.push({
        x: lc[lane], y: -44, lane,
        vy: Math.max(20, this.ps * 0.5),
        type: 'cop', color: 0x111166, dark: 0x080840, alive: true, flashT: 0,
      })
      this.tCop = si.cop * (0.85 + Math.random() * 0.3)
    }

    this.tFuel -= dt
    if (this.tFuel <= 0) {
      const lane = Math.random() < 0.5 ? 0 : 1
      this.fuels.push({ x: lc[lane], y: -30, vy: Math.max(20, this.ps * 0.42), alive: true })
      this.tFuel = si.fuel * (0.8 + Math.random() * 0.4)
    }
  }

  private moveEntities(dt: number) {
    for (const c of this.cars)  { c.y += c.vy * dt; if (c.type === 'cop') c.flashT += dt }
    for (const b of this.bullets) b.y -= 620 * dt
    for (const f of this.fuels) f.y += f.vy * dt
    this.cars    = this.cars.filter(c => c.alive && c.y < CH + 60)
    this.bullets = this.bullets.filter(b => b.alive && b.y > -20)
    this.fuels   = this.fuels.filter(f => f.alive && f.y < CH + 40)
  }

  // ─── Collisions ───────────────────────────────────────────────
  private checkCollisions() {
    const px = this.px, py = PLAYER_Y
    const hw = CAR_W / 2 + 2, hh = CAR_H / 2 + 2

    for (const c of this.cars) {
      if (!c.alive) continue
      if (Math.abs(c.x - px) > hw + CAR_W / 2) continue
      if (Math.abs(c.y - py) > hh + CAR_H / 2) continue

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

    // Bullets vs incoming
    for (const b of this.bullets) {
      if (!b.alive) continue
      for (const c of this.cars) {
        if (!c.alive || c.type !== 'incoming') continue
        if (Math.abs(c.x - b.x) > CAR_W / 2 + 4) continue
        if (Math.abs(c.y - b.y) > CAR_H / 2 + 4) continue
        b.alive = false
        c.alive = false
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
      if (Math.abs(f.x - px) > CAR_W / 2 + 16) continue
      if (Math.abs(f.y - py) > CAR_H / 2 + 16) continue
      f.alive = false
      this.fuel = Math.min(1.0, this.fuel + 0.25)
      this.spawnFloat(f.x, f.y, '+FUEL', '#00ff88')
      this.spawnCollectParticles(f.x, f.y, 0x22cc55)
      playFuel()
      if (raceBridge.onFuelCollected) raceBridge.onFuelCollected()
    }
  }

  // ─── AI ───────────────────────────────────────────────────────
  private updateAI(dt: number) {
    for (const ai of this.ais) {
      ai.dist += this.ps * ai.speedFactor * dt
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
      const a   = (Math.PI * 2 * i) / 10
      const spd = 70 + Math.random() * 130
      this.particles.push({
        x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        life: 0.6 + Math.random() * 0.4,
        size: 3 + Math.random() * 3,
        color: cols[Math.floor(Math.random() * cols.length)],
      })
    }
  }

  private spawnCollectParticles(x: number, y: number, color: number) {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6 - Math.PI / 2
      this.particles.push({
        x, y, vx: Math.cos(a) * 55, vy: Math.sin(a) * 55 - 20,
        life: 0.5, size: 4, color,
      })
    }
  }

  // ─── Float texts ──────────────────────────────────────────────
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
    g.fillStyle(th.sky)
    g.fillRect(0, 0, CW, CH)

    // Far scenery (shifts with curve)
    const ox = this.bgScrollX * 0.35
    if (this.theme === 'night_city') {
      // City buildings on both shoulders
      const bldColors = [0x111122, 0x0f0f20, 0x141428]
      for (let i = 0; i < 5; i++) {
        const bx = ((i * 80 + ox + 300) % 400) - 50
        const bh = 60 + (i * 23) % 80
        g.fillStyle(bldColors[i % 3])
        g.fillRect(bx, CH * 0.2 - bh, 28 + (i % 3) * 8, bh)
      }
      for (let i = 0; i < 4; i++) {
        const bx = ROAD_R + ((i * 90 + ox * 0.5 + 60) % 160)
        const bh = 50 + (i * 31) % 70
        g.fillStyle(bldColors[i % 3])
        g.fillRect(bx, CH * 0.18 - bh, 25 + (i % 3) * 7, bh)
      }
    } else if (this.theme === 'desert') {
      // Sand dunes
      g.fillStyle(0x6b4a20)
      const dh = CH * 0.28 + Math.sin(ox * 0.018) * 15
      g.fillTriangle(0, CH * 0.55, 0 + ox * 0.2, dh, ROAD_L, CH * 0.55)
      g.fillTriangle(ROAD_R, CH * 0.55, ROAD_R + 40 - ox * 0.15, dh + 10, CW, CH * 0.55)
    } else {
      // Mountain peaks
      g.fillStyle(0x1a1a30)
      g.fillTriangle(0, CH * 0.55, ROAD_L * 0.4 + ox * 0.1, CH * 0.12, ROAD_L, CH * 0.55)
      g.fillStyle(0x141428)
      g.fillTriangle(ROAD_R, CH * 0.55, ROAD_R + 30 - ox * 0.08, CH * 0.16, CW, CH * 0.55)
      // Snow caps
      g.fillStyle(0xddddee, 0.6)
      g.fillTriangle(ROAD_L * 0.4 + ox * 0.1 - 18, CH * 0.20, ROAD_L * 0.4 + ox * 0.1, CH * 0.12, ROAD_L * 0.4 + ox * 0.1 + 18, CH * 0.20)
    }

    // Shoulders (left and right of road)
    g.fillStyle(th.shoulder)
    g.fillRect(MINIMAP_W, 0, ROAD_L - MINIMAP_W, CH)
    g.fillRect(ROAD_R, 0, CW - ROAD_R, CH)
  }

  private drawRoad() {
    const g  = this.gRoad
    const th = THEMES[this.theme] ?? THEMES.night_city
    const sc = this.roadScrollY
    g.clear()

    // Road surface
    g.fillStyle(th.asphalt)
    g.fillRect(ROAD_L, 0, ROAD_W, CH)

    // Scrolling bands
    const bandH = 38, bandGap = 76
    const bOffset = sc % (bandH + bandGap)
    g.fillStyle(th.band)
    for (let y = -bandH + bOffset; y < CH + bandH; y += bandH + bandGap) {
      g.fillRect(ROAD_L, y, ROAD_W, bandH)
    }

    // Lane divider (dashed)
    const lx      = ROAD_L + LANE_W
    const dashH   = 22, dashGap = 18
    const dOffset = sc % (dashH + dashGap)
    g.fillStyle(th.lane)
    for (let y = -dashH + dOffset; y < CH + dashH; y += dashH + dashGap) {
      g.fillRect(lx - 1, y, 2, dashH)
    }

    // Curbs
    const curbW = 9, curbH = 18
    const cOffset = sc % (curbH * 2)
    for (let y = -curbH + cOffset; y < CH + curbH; y += curbH * 2) {
      g.fillStyle(th.curbA)
      g.fillRect(ROAD_L - curbW, y, curbW, curbH)
      g.fillRect(ROAD_R,         y, curbW, curbH)
      g.fillStyle(th.curbB)
      g.fillRect(ROAD_L - curbW, y + curbH, curbW, curbH)
      g.fillRect(ROAD_R,         y + curbH, curbW, curbH)
    }
  }

  // ─── Car drawing util ─────────────────────────────────────────
  private drawCar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, dark: number) {
    const hw = w / 2, hh = h / 2
    // Shadow
    g.fillStyle(0x000000, 0.3)
    g.fillEllipse(x + 2, y + hh - 3, w + 6, 9)
    // Body
    g.fillStyle(dark)
    g.fillRoundedRect(x - hw, y - hh, w, h, 3)
    g.fillStyle(color)
    g.fillRoundedRect(x - hw + 1, y - hh + 1, w - 2, h * 0.68, 3)
    // Windshield
    g.fillStyle(0x88ccff, 0.55)
    g.fillRect(x - hw + 3, y - hh + 3, w - 6, h * 0.26)
    // Tail/headlights
    g.fillStyle(0xff2200)
    g.fillRect(x - hw + 2, y - hh + 1, 4, 3)
    g.fillRect(x + hw - 6, y - hh + 1, 4, 3)
    g.fillStyle(0xffee88)
    g.fillRect(x - hw + 2, y + hh - 5, 5, 4)
    g.fillRect(x + hw - 7, y + hh - 5, 5, 4)
  }

  // ─── Player battle car ────────────────────────────────────────
  private drawPlayer(g: Phaser.GameObjects.Graphics) {
    const invincible = this.time.now < this.invUntil
    if (invincible && Math.floor(this.time.now / 110) % 2 === 0) return

    const x = this.px
    const y = PLAYER_Y
    const hw = CAR_W / 2 + 2
    const hh = CAR_H / 2 + 2
    const ang = this.spinning ? this.spinAngle : 0

    // Apply spin offset (simple lateral wobble)
    const sx = this.spinning ? Math.sin(ang * 0.0174) * 18 : 0

    // Shadow
    g.fillStyle(0x000000, 0.35)
    g.fillEllipse(x + sx + 3, y + hh - 2, CAR_W + 10, 12)

    // Side armor plates
    g.fillStyle(0x771111)
    g.fillRect(x + sx - hw, y - hh + 8, 5, CAR_H - 16)
    g.fillRect(x + sx + hw - 5, y - hh + 8, 5, CAR_H - 16)

    // Main body
    g.fillStyle(0xcc1111)
    g.fillRoundedRect(x + sx - hw + 5, y - hh, CAR_W - 4, CAR_H, 4)
    g.fillStyle(0x991111)
    g.fillRoundedRect(x + sx - hw + 7, y - hh + 4, CAR_W - 8, CAR_H - 8, 3)

    // Cockpit
    g.fillStyle(0x001a33, 0.85)
    g.fillRect(x + sx - 7, y - hh + 7, 14, 11)

    // Roof turret
    g.fillStyle(0x333333)
    g.fillRect(x + sx - 5, y - hh + 2, 10, 9)
    g.fillCircle(x + sx, y - hh + 6, 5)
    // Barrel
    g.fillStyle(0x111111)
    g.fillRect(x + sx - 1, y - hh - 5, 2, 9)

    // Headlights
    g.fillStyle(0xffee88, 0.9)
    g.fillRect(x + sx - 9, y + hh - 7, 6, 5)
    g.fillRect(x + sx + 3, y + hh - 7, 6, 5)

    // Headlight cones
    g.fillStyle(0xffee88, 0.12)
    g.fillTriangle(x + sx - 6, y + hh - 5, x + sx - 26, y + hh + 32, x + sx, y + hh + 32)
    g.fillTriangle(x + sx + 6, y + hh - 5, x + sx + 26, y + hh + 32, x + sx, y + hh + 32)

    // Exhaust
    if (this.ps > 60) {
      const alpha = Math.min(0.45, this.ps / 300)
      g.fillStyle(0x445566, alpha)
      const ey = y - hh - 4
      g.fillCircle(x + sx - 6, ey, 3 + Math.random() * 3)
      g.fillCircle(x + sx + 6, ey, 3 + Math.random() * 2)
    }
  }

  // ─── All entities ─────────────────────────────────────────────
  private drawEntities() {
    const g = this.gEnt
    g.clear()

    // AI racers (behind/ahead of player based on dist)
    const lc = this.lc()
    for (const ai of this.ais) {
      const sy = PLAYER_Y - (ai.dist - this.pd) * DIST_SCALE
      if (sy < -60 || sy > CH + 60) continue
      this.drawCar(g, lc[ai.lane % 2], sy, CAR_W, CAR_H, 0x2255ff, 0x1133aa)
    }

    // Traffic / incoming / cop
    for (const c of this.cars) {
      if (c.type === 'cop') {
        this.drawCar(g, c.x, c.y, CAR_W + 4, CAR_H, c.color, c.dark)
        // Flashing police bar
        const flashOn = Math.floor(c.flashT * 6) % 2 === 0
        g.fillStyle(flashOn ? 0xff1111 : 0x1111ff)
        g.fillRect(c.x - 8, c.y - CAR_H / 2 - 6, 16, 6)
        // Checkerboard stripe
        for (let ci = 0; ci < 4; ci++) {
          g.fillStyle(ci % 2 === 0 ? 0xffffff : 0x000000, 0.6)
          g.fillRect(c.x - CAR_W / 2 + ci * 5, c.y + 2, 5, 5)
        }
      } else if (c.type === 'incoming') {
        this.drawCar(g, c.x, c.y, CAR_W, CAR_H, c.color, c.dark)
        // Danger outline when close
        if (c.y > CH * 0.55) {
          g.lineStyle(2, 0xff0000, 0.5)
          g.strokeRect(c.x - CAR_W / 2 - 3, c.y - CAR_H / 2 - 3, CAR_W + 6, CAR_H + 6)
        }
      } else {
        this.drawCar(g, c.x, c.y, CAR_W, CAR_H, c.color, c.dark)
      }
    }

    // Bullets
    for (const b of this.bullets) {
      g.fillStyle(0xffff00, 0.3)
      g.fillRect(b.x - 5, b.y - 9, 10, 18)
      g.fillStyle(0xffee33)
      g.fillRect(b.x - 2, b.y - 7, 4, 14)
    }

    // Fuel pickups
    for (const f of this.fuels) {
      g.fillStyle(0x22cc55)
      g.fillCircle(f.x, f.y, 13)
      g.fillStyle(0x116622)
      g.fillCircle(f.x, f.y, 10)
      g.fillStyle(0xffffff)
      g.fillRect(f.x - 1, f.y - 6, 2, 12)
      g.fillRect(f.x - 6, f.y - 1, 12, 2)
    }

    // Player (drawn last so it's on top)
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
    g.fillStyle(0x080810)
    g.fillRect(0, 0, MINIMAP_W, CH)
    g.lineStyle(1, 0x222233)
    g.strokeRect(0, 0, MINIMAP_W, CH)

    // Start (bottom)
    g.fillStyle(0x00ff44)
    g.fillRect(3, CH - 9, MINIMAP_W - 6, 7)

    // Finish (top, checkerboard pattern)
    for (let ci = 0; ci < 4; ci++) {
      g.fillStyle(ci % 2 === 0 ? 0xffffff : 0x000000)
      g.fillRect(3 + ci * 4, 2, 4, 7)
    }

    // Checkpoints
    g.fillStyle(0x00ccff)
    for (const cp of CHECKPOINTS) {
      const cy = CH - (cp / FINISH_DIST) * CH
      g.fillRect(3, cy - 1, MINIMAP_W - 6, 2)
    }

    // Player dot
    const pRatio = Math.min(1, this.pd / FINISH_DIST)
    const pDotY  = CH - pRatio * (CH - 12) - 6
    g.fillStyle(0xff2222)
    g.fillCircle(MINIMAP_W / 2, pDotY, 5)
    // Pulse ring
    if (Math.floor(this.time.now / 400) % 2 === 0) {
      g.lineStyle(1, 0xff2222, 0.5)
      g.strokeCircle(MINIMAP_W / 2, pDotY, 8)
    }

    // ── Fuel bar (right edge) ────────────────────────────────
    const fbX = CW - 13, fbY = 44, fbH = CH - 88, fbW = 7
    g.fillStyle(0x111111)
    g.fillRect(fbX, fbY, fbW, fbH)
    const fh    = Math.round(fbH * this.fuel)
    const fcol  = this.fuel < 0.20 ? 0xff2222 : this.fuel < 0.40 ? 0xffaa00 : 0x22cc55
    g.fillStyle(fcol)
    g.fillRect(fbX, fbY + fbH - fh, fbW, fh)
    g.lineStyle(1, 0x334455)
    g.strokeRect(fbX, fbY, fbW, fbH)
    // Fuel label
    g.fillStyle(0x888888)
    g.fillRect(fbX - 1, fbY - 10, 9, 8)  // tiny "F" block placeholder

    // ── Speed bar (bottom of road) ───────────────────────────
    const sRatio = this.ps / this.topSpd
    g.fillStyle(0x111111)
    g.fillRect(ROAD_L, CH - 10, ROAD_W, 7)
    g.fillStyle(0x00ccff)
    g.fillRect(ROAD_L, CH - 10, Math.round(ROAD_W * sRatio), 7)

    // ── Low fuel red border pulse ────────────────────────────
    if (this.fuel < 0.15 && Math.floor(this.time.now / 280) % 2 === 0) {
      g.lineStyle(3, 0xff2222, 0.65)
      g.strokeRect(MINIMAP_W + 1, 1, CW - MINIMAP_W - 2, CH - 2)
    }

    // ── Speed lines ──────────────────────────────────────────
    if (this.ps > 360) {
      const a = Math.min(0.25, (this.ps - 360) / 180)
      for (let i = 0; i < 8; i++) {
        const lx = ROAD_L + 10 + Math.random() * ROAD_W
        const ly = Math.random() * CH * 0.85
        const lh = 18 + Math.random() * 36
        g.lineStyle(1, 0xffffff, a * (0.3 + Math.random() * 0.4))
        g.lineBetween(lx, ly, lx, ly + lh)
      }
    }

    // ── Checkpoint flash overlay ─────────────────────────────
    // (handled via React onCheckpoint callback)
  }

  // ─── Float text rendering ─────────────────────────────────────
  private drawFloatTexts() {
    const used = Math.min(this.floats.length, this.floatPool.length)
    for (let i = 0; i < this.floatPool.length; i++) {
      const t = this.floatPool[i]
      if (i < used) {
        const f = this.floats[this.floats.length - 1 - i]  // newest on top
        t.setPosition(f.x, f.y)
        t.setText(f.text)
        t.setStyle({ color: f.color, fontSize: '14px', fontFamily: 'monospace', fontStyle: 'bold' })
        t.setAlpha(Math.max(0, f.alpha))
        t.setVisible(true)
      } else {
        t.setVisible(false)
      }
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────
  private darken(col: number): number {
    const r = ((col >> 16) & 0xff) >> 1
    const g = ((col >> 8)  & 0xff) >> 1
    const b = (col         & 0xff) >> 1
    return (r << 16) | (g << 8) | b
  }

  shutdown() {
    stopEngine()
  }
}

// ─── Phaser config export ────────────────────────────────────────
export const PHASER_CONFIG = (containerId: string): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  width: CW,
  height: CH,
  backgroundColor: '#05050f',
  parent: containerId,
  scene: RaceScene,
  audio: { disableWebAudio: false },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
})
