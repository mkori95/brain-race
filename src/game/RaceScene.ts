import Phaser from 'phaser'
import { raceBridge } from './raceBridge'
import {
  resumeAudio, startEngine, updateEngineSpeed, stopEngine,
  playCoin, playFuel, playNitro, playCrash, playOilSkid,
} from './audioEngine'

// ── Canvas & road ──────────────────────────────────────────────
const CANVAS_W   = 480
const CANVAS_H   = 560
const ROAD_W     = 270
const LANE_COUNT = 5
const LANE_W     = ROAD_W / LANE_COUNT          // 54
const ROAD_LEFT  = (CANVAS_W - ROAD_W) / 2      // 105
const ROAD_RIGHT = ROAD_LEFT + ROAD_W            // 375
const PLAYER_Y   = CANVAS_H * 0.82

// ── Speeds ─────────────────────────────────────────────────────
const BASE_SPEED    = 200
const SPEED_RAMP    = 25
const MAX_SPEED     = 520
const NITRO_BOOST   = 120
const CRASH_PENALTY = 180
const CRASH_RECOVER = 2.5

// ── Car dims ───────────────────────────────────────────────────
const CAR_W = 28
const CAR_H = 48

// ── Colours ────────────────────────────────────────────────────
const C = {
  // Road
  asphalt:      0x14141f,
  neonLane:     0x00ccff,
  neonGlow:     0x004477,
  curbRed:      0xcc2222,
  curbWhite:    0xeeeeee,
  guardrail:    0x445566,
  guardrailPost:0x2a3a4a,
  // Traffic
  trafficSlow:  [0xcc4433, 0x3377bb, 0x33aa55, 0xccaa22, 0x775588] as number[],
  oncoming:     0xffcc00,
  truck:        0x556677,
  // Pickups
  coin:         0xffd700,
  fuel:         0x22cc44,
  nitro:        0x00ccff,
  // FX
  sparkRed:     0xff5500,
  sparkOrange:  0xff9900,
  sparkWhite:   0xffffff,
  sparkYellow:  0xffee00,
  nitroFlame:   0x00eeff,
  exhaust:      0x8899aa,
  smoke:        0x334455,
  coinBurst:    0xffdd00,
  fuelBurst:    0x00ff66,
  // Window lights
  windowWarm:   0xffee88,
  windowCool:   0x88aaff,
}

// ── Types ──────────────────────────────────────────────────────
type TrafficType = 'slow' | 'oncoming' | 'truck'
type PickupType  = 'coin' | 'fuel' | 'nitro' | 'oil'

interface TrafficCar {
  lane: number; y: number; type: TrafficType
  color: number; g: Phaser.GameObjects.Graphics; width: number
}
interface PickupItem {
  lane: number; y: number; type: PickupType
  g: Phaser.GameObjects.Graphics; collected: boolean
}
interface Particle {
  x: number; y: number; vx: number; vy: number
  alpha: number; r: number; color: number
  gravity: number; decay: number
}
interface DashMark { g: Phaser.GameObjects.Graphics; lane: number; y: number }
interface SceneryItem { g: Phaser.GameObjects.Graphics; y: number }
interface CityBuilding { g: Phaser.GameObjects.Graphics; y: number; side: 'left'|'right'; seed: number }

// ── Scene ──────────────────────────────────────────────────────
export default class RaceScene extends Phaser.Scene {

  private bgGfx!:      Phaser.GameObjects.Graphics
  private curbGfx!:    Phaser.GameObjects.Graphics
  private fxGfx!:      Phaser.GameObjects.Graphics
  private playerGfx!:  Phaser.GameObjects.Graphics
  private overlayGfx!: Phaser.GameObjects.Graphics   // screen effects
  private hudGfx!:     Phaser.GameObjects.Graphics

  // Screen effect state
  private pickupNotif: { text: string; color: number; life: number } | null = null
  private fuelWarningPhase = 0

  private dashMarks:    DashMark[]     = []
  private scenery:      SceneryItem[]  = []
  private cityBuildings:CityBuilding[] = []
  private traffic:      TrafficCar[]   = []
  private pickups:      PickupItem[]   = []
  private particles:    Particle[]     = []
  private scoreFloats:  { x:number; y:number; text:Phaser.GameObjects.Text; life:number }[] = []

  private playerLane        = 2
  private playerScreenX     = CANVAS_W / 2
  private laneChangeCooldown = 0
  private spinDuration      = 0
  private spinAngle         = 0
  private invincible        = 0
  private crashRecoverT     = 0

  private keyLeft!:  Phaser.Input.Keyboard.Key
  private keyRight!: Phaser.Input.Keyboard.Key

  private gameSpeed     = 0
  private nitroTimer    = 0
  private fuel          = 1.0
  private score         = 0
  private distance      = 0
  private raceStarted   = false
  private startDelayLeft = 0
  private gameOverFlag  = false
  private elapsedS      = 0
  private spawnTimer    = 0
  private exhaustTimer  = 0

  constructor() { super({ key: 'RaceScene' }) }

  create() {
    this.playerLane     = raceBridge.playerLane
    this.playerScreenX  = this.laneToX(this.playerLane)
    this.startDelayLeft = raceBridge.startDelayMs
    this.fuel           = raceBridge.fuelLevel

    // Sky layer — drawn once, depth 0
    this.drawSky()

    // City parallax buildings, depth 1
    this.buildCityLayer()

    // Road surface, depth 2
    this.bgGfx = this.add.graphics().setDepth(2)
    this.drawBackground()

    // Curb + guardrails, depth 3 (animated)
    this.curbGfx = this.add.graphics().setDepth(3)

    // Neon dash marks, depth 3
    this.buildDashes()

    // Near scenery, depth 4
    this.buildScenery()

    // Particle layer, depth 8
    this.fxGfx = this.add.graphics().setDepth(8)

    // Player, depth 7
    this.playerGfx = this.add.graphics().setDepth(7)

    // Screen overlay (speed lines, vignette, fuel flash), depth 9
    this.overlayGfx = this.add.graphics().setDepth(9)

    // HUD, depth 10
    this.hudGfx = this.add.graphics().setDepth(10)

    this.setupKeys()
    this.setupSpawnEvents()

    // Resume / start audio on first interaction
    this.input.once('pointerdown', () => { resumeAudio(); startEngine() })
    this.input.keyboard!.once('keydown', () => { resumeAudio(); startEngine() })
  }

  // ── Helpers ────────────────────────────────────────────────────
  private laneToX(lane: number) { return ROAD_LEFT + lane * LANE_W + LANE_W / 2 }
  private seededRand(seed: number, n: number) {
    return ((seed * 9301 + n * 49297 + 233) % 233280) / 233280
  }
  private darken(color: number, amt: number) {
    const r = Math.max(0, ((color >> 16) & 0xff) - amt)
    const g = Math.max(0, ((color >>  8) & 0xff) - amt)
    const b = Math.max(0, ( color        & 0xff) - amt)
    return (r << 16) | (g << 8) | b
  }

  // ── Sky (static, drawn once) ───────────────────────────────────
  private drawSky() {
    const g = this.add.graphics().setDepth(0)
    // Gradient bands top→horizon
    const bands = 24
    for (let i = 0; i < bands; i++) {
      const t = i / bands
      const r = Math.round(0x02 + t * 0x06)
      const gv = Math.round(0x02 + t * 0x04)
      const b  = Math.round(0x0f + t * 0x22)
      g.fillStyle((r << 16) | (gv << 8) | b, 1)
      g.fillRect(0, Math.round(i * CANVAS_H / bands), CANVAS_W, Math.ceil(CANVAS_H / bands) + 1)
    }
    // Stars
    for (let i = 0; i < 65; i++) {
      const sx = this.seededRand(i, 1) * CANVAS_W
      const sy = this.seededRand(i, 2) * CANVAS_H * 0.52
      const sr = this.seededRand(i, 3) < 0.25 ? 1.5 : 1
      g.fillStyle(0xffffff, 0.3 + this.seededRand(i, 4) * 0.7)
      g.fillCircle(sx, sy, sr)
    }
    // Neon horizon glow
    g.fillStyle(0x0033aa, 0.12)
    g.fillRect(0, CANVAS_H * 0.38, CANVAS_W, CANVAS_H * 0.15)
  }

  // ── City parallax buildings ─────────────────────────────────
  private buildCityLayer() {
    for (let i = 0; i < 20; i++) {
      this.spawnCityBldAt(i, -200 + i * 55)
    }
  }

  private spawnCityBldAt(seed: number, startY: number) {
    const side = seed % 2 === 0 ? 'left' : 'right'
    const g = this.add.graphics().setDepth(1)
    const cx = side === 'left'
      ? 10 + this.seededRand(seed, 1) * (ROAD_LEFT - 20)
      : ROAD_RIGHT + 10 + this.seededRand(seed, 2) * (CANVAS_W - ROAD_RIGHT - 20)
    this.drawCityBld(g, cx, 0, seed)
    g.y = startY
    this.cityBuildings.push({ g, y: startY, side, seed })
  }

  private drawCityBld(g: Phaser.GameObjects.Graphics, x: number, y: number, seed: number) {
    g.clear()
    const w = 16 + this.seededRand(seed, 4) * 28
    const h = 50 + this.seededRand(seed, 5) * 110
    const bx = x - w / 2
    const shade = 0x08 + Math.round(this.seededRand(seed, 6) * 0x08)
    g.fillStyle((shade << 16) | (shade << 8) | (shade + 0x1a), 1)
    g.fillRect(bx, y - h, w, h)
    // Antenna
    if (this.seededRand(seed, 9) > 0.45) {
      g.fillStyle(0x223344, 1)
      g.fillRect(bx + w / 2 - 1, y - h - 10, 2, 10)
      g.fillStyle(0xff2222, 0.65)
      g.fillCircle(bx + w / 2, y - h - 10, 2)
    }
    // Windows
    const cols = Math.floor(w / 8)
    const rows = Math.floor(h / 10)
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (this.seededRand(seed * 7 + row, col * 3 + 1) < 0.38) continue
        const warm = this.seededRand(seed + row, col + 5) > 0.5
        g.fillStyle(warm ? C.windowWarm : C.windowCool, 0.65 + this.seededRand(seed, row + col) * 0.35)
        g.fillRect(bx + col * 8 + 2, y - h + row * 10 + 2, 4, 5)
      }
    }
  }

  // ── Road surface (only asphalt + edge lines) ────────────────
  private drawBackground() {
    const g = this.bgGfx
    g.fillStyle(C.asphalt, 1)
    g.fillRect(ROAD_LEFT, 0, ROAD_W, CANVAS_H)
    // Subtle banding
    for (let y = 0; y < CANVAS_H; y += 44) {
      g.fillStyle(0x181826, 0.45)
      g.fillRect(ROAD_LEFT, y, ROAD_W, 22)
    }
    // Edge white lines
    g.fillStyle(0xffffff, 0.55)
    g.fillRect(ROAD_LEFT,     0, 2, CANVAS_H)
    g.fillRect(ROAD_RIGHT - 2, 0, 2, CANVAS_H)
  }

  // ── Neon lane dashes ────────────────────────────────────────
  private buildDashes() {
    const DASH_H = 28, GAP = 38, PERIOD = DASH_H + GAP
    const total = Math.ceil(CANVAS_H / PERIOD) + 3
    for (let lane = 0; lane < LANE_COUNT - 1; lane++) {
      const x = ROAD_LEFT + (lane + 1) * LANE_W
      for (let i = 0; i < total; i++) {
        const g = this.add.graphics().setDepth(3)
        // Wide dim glow
        g.fillStyle(C.neonGlow, 0.22)
        g.fillRect(x - 4, 0, 8, DASH_H)
        // Bright core
        g.fillStyle(C.neonLane, 0.75)
        g.fillRect(x - 1, 0, 2, DASH_H)
        g.y = i * PERIOD - PERIOD
        this.dashMarks.push({ g, lane, y: g.y })
      }
    }
  }

  // ── Near roadside scenery ───────────────────────────────────
  private buildScenery() {
    for (let i = 0; i < 14; i++) this.spawnSceneryAt(i, -800 + i * 120)
  }

  private spawnSceneryAt(seed: number, startY: number) {
    const side = seed % 2 === 0 ? 'left' : 'right'
    const type = Math.floor(this.seededRand(seed, 3) * 3)
    const g = this.add.graphics().setDepth(4)
    const cx = side === 'left'
      ? ROAD_LEFT - 28 - this.seededRand(seed, 1) * 38
      : ROAD_RIGHT + 28 + this.seededRand(seed, 2) * 38
    if (type === 0)      this.drawTree(g, cx, 0, seed)
    else if (type === 1) this.drawNearBld(g, cx, 0, seed)
    else                 this.drawLamp(g, cx, 0)
    g.y = startY
    this.scenery.push({ g, y: startY })
  }

  private drawTree(g: Phaser.GameObjects.Graphics, x: number, y: number, seed: number) {
    const s = 0.7 + this.seededRand(seed, 7) * 0.6
    g.fillStyle(0x2a1a08, 1)
    g.fillRect(x - 3 * s, y, 6 * s, 14 * s)
    g.fillStyle(0x0a2e0a, 1)
    g.fillCircle(x, y - 12 * s, 14 * s)
    g.fillStyle(0x104010, 1)
    g.fillCircle(x, y - 18 * s, 10 * s)
  }

  private drawNearBld(g: Phaser.GameObjects.Graphics, x: number, y: number, seed: number) {
    const w = 24 + this.seededRand(seed, 4) * 16
    const h = 36 + this.seededRand(seed, 5) * 28
    g.fillStyle(0x0c0c1e, 1)
    g.fillRect(x - w / 2, y - h, w, h)
    for (let wy = y - h + 6; wy < y - 4; wy += 9) {
      for (let wx = x - w / 2 + 3; wx < x + w / 2 - 5; wx += 9) {
        if (this.seededRand(seed, wy + wx) < 0.4) continue
        g.fillStyle(this.seededRand(seed, wy) > 0.5 ? C.windowWarm : C.windowCool, 0.75)
        g.fillRect(wx, wy, 5, 4)
      }
    }
  }

  private drawLamp(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0x334455, 1)
    g.fillRect(x - 2, y - 32, 4, 32)
    g.fillRect(x - 2, y - 32, 14, 3)
    g.fillStyle(0xffeedd, 0.12)
    g.fillCircle(x + 12, y - 32, 10)
    g.fillStyle(0xffee99, 0.9)
    g.fillCircle(x + 12, y - 32, 4)
    g.fillStyle(0xffffff, 1)
    g.fillCircle(x + 12, y - 32, 2)
  }

  // ── Input ──────────────────────────────────────────────────
  private setupKeys() {
    const kb = this.input.keyboard!
    this.keyLeft  = kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT)
    this.keyRight = kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT)
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.A)
    kb.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    kb.on('keydown-LEFT',  () => this.changeLane(-1))
    kb.on('keydown-RIGHT', () => this.changeLane(1))
    kb.on('keydown-A',     () => this.changeLane(-1))
    kb.on('keydown-D',     () => this.changeLane(1))
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.changeLane(p.x < CANVAS_W / 2 ? -1 : 1)
    })
  }

  private changeLane(dir: number) {
    if (this.laneChangeCooldown > 0 || this.spinDuration > 0 || this.startDelayLeft > 0) return
    const next = Phaser.Math.Clamp(this.playerLane + dir, 0, LANE_COUNT - 1)
    if (next === this.playerLane) return
    this.playerLane = next
    raceBridge.playerLane = next
    this.laneChangeCooldown = 240
  }

  // ── Spawner ────────────────────────────────────────────────
  private setupSpawnEvents() { this.spawnTimer = 1800 }

  private tickSpawner(delta: number) {
    this.spawnTimer -= delta
    if (this.spawnTimer > 0) return
    const sf = Math.min(1, this.gameSpeed / MAX_SPEED)
    this.spawnTimer = Phaser.Math.Linear(2000, 900, sf)
    if (Math.random() < 0.55) this.spawnTraffic()
    else this.spawnPickup()
  }

  private spawnTraffic() {
    const lane = Math.floor(Math.random() * LANE_COUNT)
    const roll = Math.random()
    const type: TrafficType = roll < 0.65 ? 'slow' : roll < 0.88 ? 'oncoming' : 'truck'
    const isTruck = type === 'truck'
    const finalLane = isTruck && lane >= LANE_COUNT - 1 ? lane - 1 : lane
    const color = type === 'oncoming' ? C.oncoming
      : type === 'truck' ? C.truck
      : C.trafficSlow[Math.floor(Math.random() * C.trafficSlow.length)]
    const g = this.add.graphics().setDepth(6)
    const car: TrafficCar = { lane: finalLane, y: -80, type, color, g, width: isTruck ? 2 : 1 }
    this.drawTrafficCar(car)
    this.traffic.push(car)
  }

  private spawnPickup() {
    const lane = Math.floor(Math.random() * LANE_COUNT)
    const roll = Math.random()
    const type: PickupType = roll < 0.45 ? 'coin' : roll < 0.65 ? 'fuel' : roll < 0.82 ? 'nitro' : 'oil'
    const g = this.add.graphics().setDepth(5)
    const item: PickupItem = { lane, y: -60, type, g, collected: false }
    this.drawPickup(item)
    this.pickups.push(item)
  }

  // ── Traffic rendering ──────────────────────────────────────
  private drawTrafficCar(car: TrafficCar) {
    const cx = this.laneToX(car.lane) + (car.width - 1) * LANE_W / 2
    if (car.type === 'slow')     this.drawSedan(car.g, cx, car.y, car.color)
    else if (car.type === 'oncoming') this.drawRacer(car.g, cx, car.y, car.color)
    else                         this.drawTruck(car.g, cx, car.y, car.color)
  }

  private drawSedan(g: Phaser.GameObjects.Graphics, cx: number, y: number, color: number) {
    g.clear()
    const w = CAR_W, h = CAR_H
    g.fillStyle(0x000000, 0.28); g.fillEllipse(cx + 2, y + 6, w + 8, h * 0.22)
    g.fillStyle(color, 1)
    g.fillRoundedRect(cx - w/2, y - h/2, w, h, { tl:5, tr:5, bl:10, br:10 })
    // Cabin
    const cw = w * 0.68, ch = h * 0.36, cy2 = y - h/2 + h * 0.24
    g.fillStyle(this.darken(color, 22), 1)
    g.fillRoundedRect(cx - cw/2, cy2, cw, ch, 5)
    g.fillStyle(0x88ddff, 0.72)
    g.fillRoundedRect(cx - cw/2 + 3, cy2 + 2, cw - 6, ch * 0.44, 3)
    g.fillStyle(0x88ddff, 0.42)
    g.fillRoundedRect(cx - cw/2 + 4, cy2 + ch * 0.58, cw - 8, ch * 0.32, 2)
    this.drawWheels(g, cx, y, w, h)
    g.fillStyle(0xdd0000, 0.85)
    g.fillRect(cx - w/2 + 3, y + h/2 - 5, 8, 4)
    g.fillRect(cx + w/2 - 11, y + h/2 - 5, 8, 4)
  }

  private drawRacer(g: Phaser.GameObjects.Graphics, cx: number, y: number, color: number) {
    g.clear()
    const w = CAR_W + 4, h = CAR_H - 8
    g.fillStyle(0x000000, 0.28); g.fillEllipse(cx + 2, y + 5, w + 8, h * 0.22)
    g.fillStyle(color, 1)
    g.fillRoundedRect(cx - w/2, y - h/2, w, h, { tl:8, tr:8, bl:4, br:4 })
    const cw = w * 0.52, ch = h * 0.26, cy2 = y - h/2 + h * 0.20
    g.fillStyle(0x001833, 1)
    g.fillRoundedRect(cx - cw/2, cy2, cw, ch, 4)
    g.fillStyle(0x88ccff, 0.82)
    g.fillRoundedRect(cx - cw/2 + 2, cy2 + 2, cw - 4, ch * 0.52, 3)
    // Racing stripe
    g.fillStyle(0xffffff, 0.15); g.fillRect(cx - 2, y - h/2, 4, h)
    // Front spoiler
    g.fillStyle(0x111111, 1); g.fillRect(cx - w/2 + 2, y - h/2, w - 4, 4)
    // Headlights (bright, facing player)
    g.fillStyle(0xffffff, 1)
    g.fillCircle(cx - w/2 + 6, y + h/2 - 6, 4)
    g.fillCircle(cx + w/2 - 6, y + h/2 - 6, 4)
    g.fillStyle(0xffffcc, 0.45)
    g.fillCircle(cx - w/2 + 6, y + h/2 - 6, 8)
    g.fillCircle(cx + w/2 - 6, y + h/2 - 6, 8)
    this.drawWheels(g, cx, y, w, h)
  }

  private drawTruck(g: Phaser.GameObjects.Graphics, cx: number, y: number, color: number) {
    g.clear()
    const w = CAR_W * 1.75, h = CAR_H * 1.6
    g.fillStyle(0x000000, 0.32); g.fillEllipse(cx + 3, y + 8, w + 10, h * 0.2)
    // Trailer
    const tH = h * 0.52
    g.fillStyle(color, 1)
    g.fillRoundedRect(cx - w/2, y - h/2 + h * 0.44, w, tH, { tl:2, tr:2, bl:8, br:8 })
    g.lineStyle(1, 0x000000, 0.2)
    g.strokeRect(cx - w/2 + 3, y - h/2 + h * 0.44 + 4, w - 6, tH - 8)
    // Cab
    const cabH = h * 0.46
    g.fillStyle(this.darken(color, 25), 1)
    g.fillRoundedRect(cx - w/2 + 4, y - h/2, w - 8, cabH, { tl:6, tr:6, bl:0, br:0 })
    g.fillStyle(0x88ccff, 0.62)
    g.fillRoundedRect(cx - w/2 + 8, y - h/2 + 4, w - 16, cabH * 0.36, 3)
    // Exhaust stacks
    g.fillStyle(0x334455, 1)
    g.fillRect(cx - w/2 + 1, y - h/2 + cabH * 0.25, 4, cabH * 0.55)
    g.fillRect(cx + w/2 - 5, y - h/2 + cabH * 0.25, 4, cabH * 0.55)
    // Tail lights
    g.fillStyle(0xdd0000, 0.85)
    g.fillRect(cx - w/2 + 4, y + h/2 - 5, 10, 4)
    g.fillRect(cx + w/2 - 14, y + h/2 - 5, 10, 4)
    // 6 wheels
    const ww = 10, wh = 12
    g.fillStyle(0x111111, 1)
    for (const wx of [cx - w/2 - 4, cx + w/2 - 6]) {
      g.fillRoundedRect(wx, y - h/2 + 6, ww, wh, 2)
      g.fillRoundedRect(wx, y, ww, wh, 2)
      g.fillRoundedRect(wx, y + h/2 - wh - 5, ww, wh, 2)
    }
  }

  private drawWheels(g: Phaser.GameObjects.Graphics, cx: number, y: number, w: number, h: number) {
    const ww = 8, wh = 12
    const fy = y - h/2 + 6, ry = y + h/2 - wh - 6
    g.fillStyle(0x111111, 1)
    for (const wx of [cx - w/2 - 5, cx + w/2 - 3]) {
      g.fillRoundedRect(wx, fy, ww, wh, 2)
      g.fillRoundedRect(wx, ry, ww, wh, 2)
    }
    g.fillStyle(0x888888, 1)
    g.fillRect(cx - w/2 - 3, fy + 3, 4, wh - 6)
    g.fillRect(cx + w/2 - 1, fy + 3, 4, wh - 6)
    g.fillRect(cx - w/2 - 3, ry + 3, 4, wh - 6)
    g.fillRect(cx + w/2 - 1, ry + 3, 4, wh - 6)
  }

  // ── Pickup rendering ────────────────────────────────────────
  private drawPickup(item: PickupItem) {
    const g = item.g
    g.clear()
    const cx = this.laneToX(item.lane), cy = item.y

    if (item.type === 'coin') {
      g.fillStyle(C.coin, 0.18); g.fillCircle(cx, cy, 16)
      g.fillStyle(C.coin, 1);    g.fillCircle(cx, cy, 10)
      g.fillStyle(0xffee44, 0.6); g.fillCircle(cx - 2, cy - 2, 5)
      g.fillStyle(0xaa8800, 0.8); g.fillRect(cx - 1, cy - 7, 2, 14)
    } else if (item.type === 'fuel') {
      g.fillStyle(C.fuel, 0.18); g.fillRoundedRect(cx - 12, cy - 14, 24, 26, 6)
      g.fillStyle(C.fuel, 1);    g.fillRoundedRect(cx - 9, cy - 12, 18, 22, 4)
      g.fillStyle(0x008822, 1);  g.fillRect(cx - 4, cy - 16, 8, 5)
      g.fillStyle(0xffffff, 0.7); g.fillRect(cx - 5, cy - 8, 4, 8)
    } else if (item.type === 'nitro') {
      g.fillStyle(C.nitro, 0.18); g.fillTriangle(cx, cy - 18, cx - 14, cy + 12, cx + 14, cy + 12)
      g.fillStyle(C.nitro, 0.9);  g.fillTriangle(cx, cy - 14, cx - 10, cy + 10, cx + 10, cy + 10)
      g.fillStyle(0xffffff, 0.65); g.fillCircle(cx, cy - 2, 5)
    } else {
      g.fillStyle(0x190028, 0.88); g.fillEllipse(cx, cy, 34, 18)
      g.fillStyle(0x4400aa, 0.35); g.fillEllipse(cx - 4, cy - 2, 14, 8)
      g.fillStyle(0x8800ff, 0.18); g.fillEllipse(cx + 3, cy + 2, 10, 5)
    }
  }

  // ── Player car ─────────────────────────────────────────────
  private drawPlayerCar(spin: number) {
    const g = this.playerGfx
    g.clear()
    const x = this.playerScreenX, y = PLAYER_Y
    const color = raceBridge.playerColor || 0xff6b35
    const bw = 30, bh = 52

    g.save()
    g.translateCanvas(x, y)
    if (spin !== 0) g.rotateCanvas(spin)

    // Headlight cones
    if (this.gameSpeed > 30) {
      g.fillStyle(0xffffaa, 0.055)
      g.fillTriangle(-bw/2 + 4, -bh/2, -bw/2 - 22, -bh/2 - 65, -bw/2 + 18, -bh/2 - 65)
      g.fillTriangle( bw/2 - 4, -bh/2,  bw/2 - 18, -bh/2 - 65,  bw/2 + 22, -bh/2 - 65)
    }

    // Drop shadow
    g.fillStyle(0x000000, 0.32); g.fillEllipse(4, 8, bw + 10, bh * 0.26)

    // Body
    g.fillStyle(color, 1)
    g.fillRoundedRect(-bw/2, -bh/2, bw, bh, { tl:6, tr:6, bl:10, br:10 })

    // Hood sheen
    g.fillStyle(0xffffff, 0.10)
    g.fillRoundedRect(-bw/2 + 2, -bh/2, bw - 4, bh * 0.30, { tl:6, tr:6, bl:0, br:0 })

    // Cabin
    const rw = bw * 0.60, rh = bh * 0.42
    g.fillStyle(0x000000, 0.45)
    g.fillRoundedRect(-rw/2, -bh/2 + bh * 0.28, rw, rh, 4)

    // Windshield
    g.fillStyle(0x99ddff, 0.80)
    g.fillRoundedRect(-bw/2 + 5, -bh/2 + 4, bw - 10, bh * 0.21, 3)

    // Rear window
    g.fillStyle(0x99ddff, 0.50)
    g.fillRoundedRect(-bw/2 + 7, bh/2 - bh * 0.26, bw - 14, bh * 0.16, 2)

    // Wheels
    const ww = 8, wh = 13
    const fwy = -bh/2 + 8, rwy = bh/2 - wh - 8
    g.fillStyle(0x111111, 1)
    g.fillRoundedRect(-bw/2 - 5, fwy, ww, wh, 2)
    g.fillRoundedRect( bw/2 - 3, fwy, ww, wh, 2)
    g.fillRoundedRect(-bw/2 - 5, rwy, ww, wh, 2)
    g.fillRoundedRect( bw/2 - 3, rwy, ww, wh, 2)
    g.fillStyle(0x999999, 1)
    g.fillRect(-bw/2 - 3, fwy + 3, 4, wh - 6)
    g.fillRect( bw/2 - 1, fwy + 3, 4, wh - 6)
    g.fillRect(-bw/2 - 3, rwy + 3, 4, wh - 6)
    g.fillRect( bw/2 - 1, rwy + 3, 4, wh - 6)

    // Grille
    g.fillStyle(0x111111, 0.9); g.fillRect(-bw/2 + 4, -bh/2, bw - 8, 4)

    // Headlights
    g.fillStyle(0xffffff, 1)
    g.fillRect(-bw/2 + 3, -bh/2, 9, 4)
    g.fillRect( bw/2 - 12, -bh/2, 9, 4)
    g.fillStyle(0xffffaa, 0.9)
    g.fillRect(-bw/2 + 5, -bh/2 + 1, 5, 2)
    g.fillRect( bw/2 - 10, -bh/2 + 1, 5, 2)

    // Tail lights
    const braking = this.gameSpeed < BASE_SPEED * 0.6
    g.fillStyle(0xcc0000, braking ? 1.0 : 0.35)
    g.fillRect(-bw/2 + 3, bh/2 - 4, bw - 6, 4)
    if (braking) { g.fillStyle(0xff0000, 0.18); g.fillRect(-bw/2 - 2, bh/2 - 8, bw + 4, 10) }

    // Spoiler
    g.fillStyle(0x222222, 1)
    g.fillRect(-bw/2, bh/2, bw, 4)
    g.fillRect(-bw/2, bh/2 + 1, 5, 6)
    g.fillRect( bw/2 - 5, bh/2 + 1, 5, 6)

    // Nitro flame
    if (this.nitroTimer > 0) {
      const flicker = 1 + Math.sin(Date.now() / 28) * 0.14
      g.fillStyle(0x8800ff, 0.65)
      g.fillTriangle(-8, bh/2 + 5, 0, bh/2 + 28 * flicker, 8, bh/2 + 5)
      g.fillStyle(C.nitroFlame, 0.9)
      g.fillTriangle(-6, bh/2 + 5, 0, bh/2 + 22 * flicker, 6, bh/2 + 5)
      g.fillStyle(0xffffff, 0.82)
      g.fillTriangle(-3, bh/2 + 5, 0, bh/2 + 14 * flicker, 3, bh/2 + 5)
    }

    g.restore()
  }

  // ── Exhaust emitter ─────────────────────────────────────────
  private emitExhaust(ds: number) {
    if (!this.raceStarted || this.gameSpeed < 40) return
    this.exhaustTimer -= ds * 1000
    if (this.exhaustTimer > 0) return
    this.exhaustTimer = this.nitroTimer > 0 ? 28 : 75

    const ex = this.playerScreenX, ey = PLAYER_Y + 30

    if (this.nitroTimer > 0) {
      for (let i = 0; i < 3; i++) {
        this.particles.push({
          x: ex + (Math.random() - 0.5) * 8, y: ey,
          vx: (Math.random() - 0.5) * 55, vy: 70 + Math.random() * 70,
          alpha: 0.9, r: 3 + Math.random() * 3,
          color: Math.random() > 0.5 ? C.nitroFlame : 0x8800ff,
          gravity: -15, decay: 1.8,
        })
      }
    } else {
      this.particles.push({
        x: ex + (Math.random() - 0.5) * 6, y: ey,
        vx: (Math.random() - 0.5) * 18, vy: 28 + Math.random() * 28,
        alpha: 0.32, r: 4 + Math.random() * 3,
        color: C.exhaust, gravity: -25, decay: 1.0,
      })
    }
  }

  // ── Curb + guardrails ───────────────────────────────────────
  private renderCurb(speed: number) {
    const g = this.curbGfx
    g.clear()
    const STRIPE = 18, count = Math.ceil(CANVAS_H / STRIPE) + 2
    const phase = (Date.now() / 1000) * speed % (STRIPE * 2)
    for (let i = 0; i < count; i++) {
      const y = i * STRIPE - phase % (STRIPE * 2)
      const isRed = Math.floor((i + Math.floor(phase / STRIPE)) % 2) === 0
      g.fillStyle(isRed ? C.curbRed : C.curbWhite, 1)
      g.fillRect(ROAD_LEFT - 8,  y, 8, STRIPE)
      g.fillRect(ROAD_RIGHT,     y, 8, STRIPE)
    }
    // Guardrail beam
    g.fillStyle(C.guardrail, 0.88)
    g.fillRect(ROAD_LEFT - 18, 0, 3, CANVAS_H)
    g.fillRect(ROAD_RIGHT + 15, 0, 3, CANVAS_H)
    // Neon tint on beam
    g.fillStyle(0x0088ff, 0.10)
    g.fillRect(ROAD_LEFT - 18, 0, 3, CANVAS_H)
    g.fillRect(ROAD_RIGHT + 15, 0, 3, CANVAS_H)
    // Scrolling posts
    const postSpacing = 44
    const postCount   = Math.ceil(CANVAS_H / postSpacing) + 2
    const postPhase   = (Date.now() / 1000) * speed % postSpacing
    for (let i = 0; i < postCount; i++) {
      const py = i * postSpacing - postPhase % postSpacing
      g.fillStyle(C.guardrailPost, 1)
      g.fillRect(ROAD_LEFT - 20, py - 3, 6, 10)
      g.fillRect(ROAD_RIGHT + 14, py - 3, 6, 10)
    }
  }

  // ── HUD (segmented fuel, speed, pickup notif) ───────────────
  private renderHUD(ds: number) {
    const g = this.hudGfx
    g.clear()

    const pct = Math.max(0, raceBridge.fuelLevel)
    const segments = 10
    const segW = 9, segH = 14, segGap = 3
    const totalW = segments * segW + (segments - 1) * segGap
    const barX = 12, barY = CANVAS_H - 22

    // Background pill
    g.fillStyle(0x000000, 0.65)
    g.fillRoundedRect(barX - 4, barY - 4, totalW + 8, segH + 8, 5)

    // Fuel label
    const litCount = Math.round(pct * segments)
    for (let i = 0; i < segments; i++) {
      const lit = i < litCount
      const fuelColor = i < segments * 0.3 ? 0xff3300 : i < segments * 0.5 ? 0xffcc00 : C.fuel
      const sx = barX + i * (segW + segGap)
      g.fillStyle(fuelColor, lit ? 1 : 0.18)
      g.fillRoundedRect(sx, barY, segW, segH, 2)
      // Glow on lit segments
      if (lit && pct < 0.3) {
        g.fillStyle(0xff3300, 0.12)
        g.fillRoundedRect(sx - 1, barY - 1, segW + 2, segH + 2, 3)
      }
    }

    // Speed display (bottom right of fuel bar)
    const speedKmh = Math.round(this.gameSpeed * 0.6)
    g.fillStyle(0x000000, 0.55)
    g.fillRoundedRect(barX + totalW + 8, barY - 2, 52, segH + 4, 4)

    // Nitro indicator (cyan stripe under speed)
    if (this.nitroTimer > 0) {
      const nitroPct = Math.min(1, this.nitroTimer / 3000)
      g.fillStyle(0x00ccff, 0.85)
      g.fillRoundedRect(barX + totalW + 8, barY + segH + 4, 52 * nitroPct, 3, 1)
      g.fillStyle(0x00ccff, 0.18)
      g.fillRoundedRect(barX + totalW + 8, barY + segH + 4, 52, 3, 1)
    }

    // Pickup notification badge (top-right area of canvas)
    if (this.pickupNotif) {
      this.pickupNotif.life -= ds * 1000
      const a = Math.min(1, this.pickupNotif.life / 400)
      if (this.pickupNotif.life > 0) {
        const notifY = 12 + (1 - a) * -8
        const txt = this.pickupNotif.text
        const notifW = txt.length * 8 + 20
        g.fillStyle(this.pickupNotif.color, a * 0.9)
        g.fillRoundedRect(CANVAS_W - notifW - 10, notifY, notifW, 22, 6)
      } else {
        this.pickupNotif = null
      }
    }
  }

  // ── Screen effects (speed lines, nitro vignette, fuel flash) ─
  private renderScreenFX(ds: number) {
    const g = this.overlayGfx
    g.clear()

    // Speed lines: radial streaks when going fast
    const speedFactor = Math.max(0, (this.gameSpeed - 340) / (MAX_SPEED - 340))
    if (speedFactor > 0) {
      const cx = CANVAS_W / 2, cy = CANVAS_H / 2
      const lineCount = 20
      const t = Date.now() / 80
      for (let i = 0; i < lineCount; i++) {
        const angle = (i / lineCount) * Math.PI * 2 + t * 0.02
        const len = 60 + speedFactor * 120
        const x1 = cx + Math.cos(angle) * (80 + speedFactor * 30)
        const y1 = cy + Math.sin(angle) * (80 + speedFactor * 30)
        const x2 = cx + Math.cos(angle) * (80 + speedFactor * 30 + len)
        const y2 = cy + Math.sin(angle) * (80 + speedFactor * 30 + len)
        g.lineStyle(1, 0xffffff, speedFactor * 0.12)
        g.beginPath()
        g.moveTo(x1, y1)
        g.lineTo(x2, y2)
        g.strokePath()
      }
    }

    // Nitro vignette: cyan glow on edges
    if (this.nitroTimer > 0) {
      const a = Math.min(0.35, (this.nitroTimer / 3000) * 0.35)
      const edgeW = 28
      g.fillStyle(0x00ccff, a)
      g.fillRect(0, 0, edgeW, CANVAS_H)
      g.fillRect(CANVAS_W - edgeW, 0, edgeW, CANVAS_H)
      g.fillRect(0, 0, CANVAS_W, edgeW)
      g.fillRect(0, CANVAS_H - edgeW, CANVAS_W, edgeW)
    }

    // Fuel warning: pulsing red border when fuel < 15%
    if (this.fuel < 0.15 && this.fuel > 0) {
      this.fuelWarningPhase += ds * 4
      const a = (Math.sin(this.fuelWarningPhase) * 0.5 + 0.5) * 0.5
      const bw = 8
      g.fillStyle(0xff0000, a)
      g.fillRect(0, 0, CANVAS_W, bw)
      g.fillRect(0, CANVAS_H - bw, CANVAS_W, bw)
      g.fillRect(0, 0, bw, CANVAS_H)
      g.fillRect(CANVAS_W - bw, 0, bw, CANVAS_H)
    }
  }

  // ── Score float text ────────────────────────────────────────
  private addScoreFloat(x: number, y: number, text: string, color = '#ffffff') {
    const t = this.add.text(x, y, text, { fontSize: '14px', color, fontStyle: 'bold' })
      .setOrigin(0.5).setDepth(9)
    this.scoreFloats.push({ x, y, text: t, life: 1200 })
  }

  // ── Collision detection ─────────────────────────────────────
  private checkCollisions() {
    if (this.invincible > 0 || this.spinDuration > 0 || this.gameOverFlag) return
    const px = this.playerScreenX, py = PLAYER_Y
    for (const car of this.traffic) {
      const cx = this.laneToX(car.lane) + (car.width - 1) * LANE_W / 2
      const halfW = (car.width * LANE_W) * 0.45
      const halfH = (car.type === 'truck' ? CAR_H * 1.6 : CAR_H) * 0.5
      if (Math.abs(cx - px) < halfW + CAR_W * 0.45 && Math.abs(car.y - py) < halfH + CAR_H * 0.5) {
        this.triggerCrash(car.type === 'oncoming' ? 'hard' : 'soft')
        break
      }
    }
  }

  private checkPickups() {
    const px = this.playerScreenX, py = PLAYER_Y
    for (const item of this.pickups) {
      if (item.collected) continue
      const cx = this.laneToX(item.lane)
      if (Math.abs(cx - px) < LANE_W * 0.6 && Math.abs(item.y - py) < 28) {
        item.collected = true; item.g.destroy()
        this.applyPickup(item.type, cx, item.y)
      }
    }
    this.pickups = this.pickups.filter(p => !p.collected && p.y < CANVAS_H + 80)
  }

  private applyPickup(type: PickupType, x: number, y: number) {
    switch (type) {
      case 'coin':
        this.score += 50
        this.addScoreFloat(x, y, '+50', '#ffd700')
        this.emitBurst(x, y, C.coinBurst, 0xffaa00, 10)
        this.pickupNotif = { text: '+50 COIN', color: 0xffd700, life: 1200 }
        playCoin()
        raceBridge.onCoinCollected?.()
        break
      case 'fuel':
        raceBridge.fuelLevel = Math.min(1, raceBridge.fuelLevel + 0.28)
        this.addScoreFloat(x, y, 'FUEL!', '#22cc44')
        this.emitBurst(x, y, C.fuelBurst, 0x00aa33, 8)
        this.pickupNotif = { text: 'FUEL +28%', color: 0x22cc44, life: 1200 }
        playFuel()
        raceBridge.onFuelCollected?.()
        break
      case 'nitro':
        this.nitroTimer = 3000
        this.addScoreFloat(x, y, 'NITRO!', '#00ccff')
        this.emitBurst(x, y, C.nitroFlame, 0x0044ff, 8)
        this.pickupNotif = { text: 'NITRO!', color: 0x00ccff, life: 1500 }
        playNitro()
        raceBridge.onNitroCollected?.()
        break
      case 'oil':
        this.triggerCrash('oil')
        this.addScoreFloat(x, y, 'OIL!', '#884488')
        this.pickupNotif = { text: 'OIL SLICK!', color: 0xaa44ff, life: 1000 }
        break
    }
  }

  private emitBurst(x: number, y: number, ca: number, cb: number, count: number) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      const spd = 55 + Math.random() * 100
      this.particles.push({
        x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        alpha: 1, r: 2 + Math.random() * 3,
        color: Math.random() > 0.5 ? ca : cb,
        gravity: 50, decay: 1.6,
      })
    }
  }

  private triggerCrash(severity: 'soft' | 'hard' | 'oil') {
    const spinMs  = severity === 'hard' ? 1000 : severity === 'oil' ? 800 : 500
    const penalty = severity === 'hard' ? CRASH_PENALTY * 1.5 : CRASH_PENALTY
    this.spinDuration  = spinMs
    this.invincible    = spinMs + 500
    this.crashRecoverT = 0
    this.gameSpeed     = Math.max(40, this.gameSpeed - penalty)
    this.fuel          = Math.max(0, this.fuel - (severity === 'hard' ? 0.06 : 0.03))
    this.cameras.main.shake(spinMs * 0.4, severity === 'hard' ? 0.018 : 0.010)
    this.cameras.main.flash(180, 255, severity === 'hard' ? 100 : 20, 20, true)

    const count = severity === 'hard' ? 20 : 10
    const px = this.playerScreenX, py = PLAYER_Y
    const sparkColors = [C.sparkRed, C.sparkOrange, C.sparkWhite, C.sparkYellow]
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const spd = 80 + Math.random() * 200
      this.particles.push({
        x: px, y: py,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 80,
        alpha: 1, r: 2 + Math.random() * 3,
        color: sparkColors[Math.floor(Math.random() * 4)],
        gravity: 180, decay: 2.0,
      })
    }
    if (severity === 'oil') {
      for (let i = 0; i < 8; i++) {
        this.particles.push({
          x: px + (Math.random() - 0.5) * 40, y: py + (Math.random() - 0.5) * 30,
          vx: (Math.random() - 0.5) * 50, vy: -(20 + Math.random() * 40),
          alpha: 0.6, r: 8 + Math.random() * 10,
          color: C.smoke, gravity: -8, decay: 0.65,
        })
      }
      playOilSkid()
    } else {
      playCrash(severity === 'hard')
    }
    raceBridge.onCrash?.()
  }

  // ── Scroll helpers ──────────────────────────────────────────
  private scrollDashes(speed: number, ds: number) {
    const PERIOD = 28 + 38
    for (const m of this.dashMarks) {
      m.y += speed * ds; m.g.y = m.y
      if (m.y > CANVAS_H + PERIOD) {
        m.y -= (Math.ceil(CANVAS_H / PERIOD) + 3) * PERIOD; m.g.y = m.y
      }
    }
  }

  private scrollScenery(speed: number, ds: number) {
    for (const obj of this.scenery) {
      obj.y += speed * ds; obj.g.y = obj.y
      if (obj.y > CANVAS_H + 100) { obj.y = -120 - Math.random() * 80; obj.g.y = obj.y }
    }
  }

  private scrollCity(speed: number, ds: number) {
    const citySpeed = speed * 0.18
    for (const bld of this.cityBuildings) {
      bld.y += citySpeed * ds; bld.g.y = bld.y
      if (bld.y > CANVAS_H + 160) {
        bld.y = -220 - Math.random() * 100; bld.g.y = bld.y
        bld.seed = Math.floor(Math.random() * 9999)
        const cx = bld.side === 'left'
          ? 10 + this.seededRand(bld.seed, 1) * (ROAD_LEFT - 20)
          : ROAD_RIGHT + 10 + this.seededRand(bld.seed, 2) * (CANVAS_W - ROAD_RIGHT - 20)
        this.drawCityBld(bld.g, cx, 0, bld.seed)
      }
    }
  }

  private scrollTraffic(speed: number, ds: number) {
    for (const car of this.traffic) {
      const relSpeed = car.type === 'oncoming' ? speed * 1.6
        : car.type === 'truck' ? speed * 0.35 : speed * 0.45
      car.y += relSpeed * ds
      this.drawTrafficCar(car)
    }
    this.traffic = this.traffic.filter(c => { if (c.y > CANVAS_H + 100) { c.g.destroy(); return false } return true })
  }

  private scrollPickups(speed: number, ds: number) {
    for (const item of this.pickups) {
      item.y += speed * ds; item.g.y = item.y
      this.drawPickup(item)
    }
  }

  // ── Particles ───────────────────────────────────────────────
  private updateParticles(ds: number) {
    this.fxGfx.clear()
    this.particles = this.particles.filter(p => {
      p.x += p.vx * ds; p.y += p.vy * ds
      p.vy += p.gravity * ds; p.alpha -= p.decay * ds
      if (p.alpha <= 0) return false
      this.fxGfx.fillStyle(p.color, p.alpha)
      this.fxGfx.fillCircle(p.x, p.y, p.r * Math.max(0.1, p.alpha))
      return true
    })
  }

  private updateScoreFloats(ds: number) {
    this.scoreFloats = this.scoreFloats.filter(sf => {
      sf.life -= ds * 1000; sf.y -= 30 * ds
      sf.text.setPosition(sf.x, sf.y).setAlpha(sf.life / 1200)
      if (sf.life <= 0) { sf.text.destroy(); return false }
      return true
    })
  }

  // ── Main update ─────────────────────────────────────────────
  update(_t: number, delta: number) {
    if (this.gameOverFlag) return
    const ds = delta / 1000
    this.elapsedS += ds

    if (this.startDelayLeft > 0) {
      this.startDelayLeft -= delta
      const idleSpeed = 60
      this.scrollDashes(idleSpeed, ds)
      this.scrollScenery(idleSpeed, ds)
      this.scrollCity(idleSpeed, ds)
      this.renderCurb(idleSpeed)
      this.drawPlayerCar(0)
      this.renderHUD(ds)
      this.renderScreenFX(ds)
      return
    }
    this.raceStarted = true

    const speedTarget = Math.min(MAX_SPEED, BASE_SPEED + Math.floor(this.elapsedS / 30) * SPEED_RAMP)
    const nitroSpeed  = this.nitroTimer > 0 ? NITRO_BOOST : 0
    if (this.crashRecoverT < CRASH_RECOVER && this.spinDuration <= 0) this.crashRecoverT += ds
    const crashFactor = this.spinDuration > 0 ? 0.15 : Math.min(1, this.crashRecoverT / CRASH_RECOVER)
    this.gameSpeed = Phaser.Math.Linear(this.gameSpeed, (speedTarget + nitroSpeed) * crashFactor, ds * 3)

    if (this.laneChangeCooldown > 0) this.laneChangeCooldown -= delta
    if (this.invincible > 0)         this.invincible -= delta
    if (this.nitroTimer > 0)         this.nitroTimer -= delta
    if (this.spinDuration > 0) { this.spinDuration -= delta; this.spinAngle += ds * Math.PI * 4 }
    else this.spinAngle = 0

    this.playerScreenX += (this.laneToX(this.playerLane) - this.playerScreenX) * Math.min(1, ds * 12)

    const fuelDrain = (0.0012 + this.gameSpeed / MAX_SPEED * 0.002) * ds
    this.fuel = Math.max(0, this.fuel - fuelDrain)
    raceBridge.fuelLevel = this.fuel
    if (this.fuel <= 0) {
      this.gameSpeed = Math.max(0, this.gameSpeed - 80 * ds)
      if (this.gameSpeed < 5) { this.gameOverFlag = true; raceBridge.gameOver = true; return }
    }

    this.distance += this.gameSpeed * ds * 0.05
    this.score    += this.gameSpeed * ds * 0.4
    raceBridge.distanceTraveled = this.distance
    raceBridge.raceScore        = Math.round(this.score)

    this.tickSpawner(delta)
    this.scrollDashes(this.gameSpeed, ds)
    this.scrollScenery(this.gameSpeed, ds)
    this.scrollCity(this.gameSpeed, ds)
    this.renderCurb(this.gameSpeed)
    this.scrollTraffic(this.gameSpeed, ds)
    this.scrollPickups(this.gameSpeed, ds)
    this.checkCollisions()
    this.checkPickups()
    this.emitExhaust(ds)
    this.drawPlayerCar(this.spinDuration > 0 ? this.spinAngle : 0)
    this.updateParticles(ds)
    this.updateScoreFloats(ds)
    this.renderScreenFX(ds)
    this.renderHUD(ds)

    // Update engine audio
    updateEngineSpeed(this.gameSpeed / MAX_SPEED)
  }

  shutdown() {
    stopEngine()
  }
}

// ── Phaser config ───────────────────────────────────────────────
export const PHASER_CONFIG = (parent: string): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  width: CANVAS_W,
  height: CANVAS_H,
  backgroundColor: '#02020f',
  parent,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: CANVAS_W,
    height: CANVAS_H,
    expandParent: true,
  },
  scene: [RaceScene],
  audio: { disableWebAudio: false },
  powerPreference: 'high-performance',
})
