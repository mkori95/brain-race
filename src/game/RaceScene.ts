import Phaser from 'phaser'
import { raceBridge } from './raceBridge'

// ── Canvas & road ──────────────────────────────────────────────
const CANVAS_W   = 480
const CANVAS_H   = 560
const ROAD_W     = 270
const LANE_COUNT = 5
const LANE_W     = ROAD_W / LANE_COUNT          // 54
const ROAD_LEFT  = (CANVAS_W - ROAD_W) / 2      // 105
const ROAD_RIGHT = ROAD_LEFT + ROAD_W            // 375
const PLAYER_Y   = CANVAS_H * 0.82

// ── Speeds (px/sec) ────────────────────────────────────────────
const BASE_SPEED     = 200   // starting scroll speed
const SPEED_RAMP     = 25    // px/sec added per 30 s
const MAX_SPEED      = 520
const NITRO_BOOST    = 120
const CRASH_PENALTY  = 180   // immediate speed loss on collision
const CRASH_RECOVER  = 2.5   // seconds to recover speed after crash

// ── Car dimensions ─────────────────────────────────────────────
const CAR_W = 28
const CAR_H = 48

// ── Colours ────────────────────────────────────────────────────
const C = {
  grass:        0x1d4a20,
  grassStripe:  0x163819,
  asphalt:      0x21212e,
  curbRed:      0xcc2222,
  curbWhite:    0xeeeeee,
  laneDash:     0xffffff,
  // traffic
  trafficSlow:  [0xcc4433, 0x4488cc, 0x44aa66, 0xccaa33, 0x886699],
  oncoming:     0xffcc00,
  truck:        0x778899,
  // pickups
  coin:         0xffd700,
  fuel:         0x22cc44,
  nitro:        0x00ccff,
  oil:          0x221122,
  // fx
  sparkRed:     0xff4422,
  sparkWhite:   0xffffff,
  nitroFlame:   0x00eeff,
}

// ── Entity types ───────────────────────────────────────────────
type TrafficType = 'slow' | 'oncoming' | 'truck'
type PickupType  = 'coin' | 'fuel' | 'nitro' | 'oil'

interface TrafficCar {
  lane: number
  y: number
  type: TrafficType
  color: number
  g: Phaser.GameObjects.Graphics
  label?: Phaser.GameObjects.Text
  width: number   // lane-span (1 or 2 for truck)
}

interface PickupItem {
  lane: number
  y: number
  type: PickupType
  g: Phaser.GameObjects.Graphics
  collected: boolean
}

interface Particle {
  x: number; y: number
  vx: number; vy: number
  alpha: number; r: number
  color: number
}

interface DashMark {
  g: Phaser.GameObjects.Graphics
  lane: number; y: number
}

interface SceneryItem {
  g: Phaser.GameObjects.Graphics
  y: number
  side: 'left' | 'right'
}

// ── Road Fighter Race Scene ────────────────────────────────────
export default class RaceScene extends Phaser.Scene {

  // Graphics layers
  private bgGfx!:   Phaser.GameObjects.Graphics
  private curbGfx!: Phaser.GameObjects.Graphics
  private fxGfx!:   Phaser.GameObjects.Graphics
  private playerGfx!: Phaser.GameObjects.Graphics
  private hudGfx!:  Phaser.GameObjects.Graphics

  // Scrolling road
  private dashMarks: DashMark[] = []
  private scenery:   SceneryItem[] = []

  // Traffic & pickups
  private traffic: TrafficCar[] = []
  private pickups: PickupItem[] = []
  private particles: Particle[] = []

  // Player
  private playerLane     = 2
  private playerScreenX  = CANVAS_W / 2
  private laneChangeCooldown = 0
  private spinDuration   = 0        // ms — spinning after crash
  private spinAngle      = 0
  private invincible     = 0        // ms — can't be hit again
  private crashRecoverT  = 0        // seconds counting up after crash

  // Keys
  private keyLeft!:  Phaser.Input.Keyboard.Key
  private keyRight!: Phaser.Input.Keyboard.Key
  private keyA!:     Phaser.Input.Keyboard.Key
  private keyD!:     Phaser.Input.Keyboard.Key

  // Game state
  private gameSpeed      = 0         // px/sec scroll
  private nitroTimer     = 0         // ms remaining
  private fuel           = 1.0       // 0-1
  private score          = 0
  private distance       = 0         // metres
  private raceStarted    = false
  private startDelayLeft = 0         // ms remaining before player moves
  private gameOverFlag   = false
  private elapsedS       = 0         // total seconds played
  private spawnTimer     = 0         // ms until next spawn
  private scoreFloats: { x: number; y: number; text: Phaser.GameObjects.Text; life: number }[] = []

  constructor() { super({ key: 'RaceScene' }) }

  create() {
    this.playerLane    = raceBridge.playerLane
    this.playerScreenX = this.laneToX(this.playerLane)
    this.startDelayLeft = raceBridge.startDelayMs
    this.fuel          = raceBridge.fuelLevel   // already set by store (based on grid position)

    this.bgGfx     = this.add.graphics()
    this.curbGfx   = this.add.graphics()
    this.fxGfx     = this.add.graphics()
    this.hudGfx    = this.add.graphics()
    this.playerGfx = this.add.graphics()

    this.drawBackground()
    this.buildDashes()
    this.buildScenery()
    this.setupKeys()
    this.setupSpawnEvents()
  }

  // ── Helpers ───────────────────────────────────────────────────

  private laneToX(lane: number) {
    return ROAD_LEFT + lane * LANE_W + LANE_W / 2
  }

  private seededRand(seed: number, n: number) {
    return ((seed * 9301 + n * 49297 + 233) % 233280) / 233280
  }

  // ── Background (static) ───────────────────────────────────────

  private drawBackground() {
    const g = this.bgGfx
    g.fillStyle(C.grass, 1)
    g.fillRect(0, 0, CANVAS_W, CANVAS_H)
    // Grass texture stripes
    for (let y = 0; y < CANVAS_H; y += 32) {
      g.fillStyle(C.grassStripe, 0.4)
      g.fillRect(0, y, ROAD_LEFT, 16)
      g.fillRect(ROAD_RIGHT, y, CANVAS_W - ROAD_RIGHT, 16)
    }
    // Road surface
    g.fillStyle(C.asphalt, 1)
    g.fillRect(ROAD_LEFT, 0, ROAD_W, CANVAS_H)
    // Asphalt texture
    g.fillStyle(0x1a1a28, 0.35)
    g.fillRect(ROAD_LEFT, 0, ROAD_W, CANVAS_H)
    // Edge white lines
    g.fillStyle(0xffffff, 0.8)
    g.fillRect(ROAD_LEFT,    0, 3, CANVAS_H)
    g.fillRect(ROAD_RIGHT-3, 0, 3, CANVAS_H)
  }

  // ── Dashed lane dividers ──────────────────────────────────────

  private buildDashes() {
    const DASH_H = 28, GAP = 38, PERIOD = DASH_H + GAP
    const total = Math.ceil(CANVAS_H / PERIOD) + 3
    for (let lane = 0; lane < LANE_COUNT - 1; lane++) {
      const x = ROAD_LEFT + (lane + 1) * LANE_W
      for (let i = 0; i < total; i++) {
        const g = this.add.graphics()
        g.fillStyle(C.laneDash, 0.25)
        g.fillRect(x - 1, 0, 2, DASH_H)
        g.y = i * PERIOD - PERIOD
        this.dashMarks.push({ g, lane, y: g.y })
      }
    }
  }

  // ── Roadside scenery ──────────────────────────────────────────

  private buildScenery() {
    for (let i = 0; i < 14; i++) {
      this.spawnSceneryAt(i, -800 + i * 120)
    }
  }

  private spawnSceneryAt(seed: number, startY: number) {
    const side = seed % 2 === 0 ? 'left' : 'right'
    const type = Math.floor(this.seededRand(seed, 3) * 3)  // 0=tree,1=building,2=lamp
    const g = this.add.graphics()
    const cx = side === 'left'
      ? ROAD_LEFT - 30 - this.seededRand(seed, 1) * 40
      : ROAD_RIGHT + 30 + this.seededRand(seed, 2) * 40

    if (type === 0) this.drawTree(g, cx, 0, seed)
    else if (type === 1) this.drawBuilding(g, cx, 0, seed)
    else this.drawLamp(g, cx, 0)

    g.y = startY
    this.scenery.push({ g, y: startY, side })
  }

  private drawTree(g: Phaser.GameObjects.Graphics, x: number, y: number, seed: number) {
    const s = 0.7 + this.seededRand(seed, 7) * 0.6
    g.fillStyle(0x5a3820, 1)
    g.fillRect(x - 3 * s, y, 6 * s, 14 * s)
    g.fillStyle(0x1e5a1e, 1)
    g.fillCircle(x, y - 12 * s, 14 * s)
    g.fillStyle(0x2e7a2e, 1)
    g.fillCircle(x, y - 18 * s, 11 * s)
    g.fillStyle(0x3d9e3d, 0.6)
    g.fillCircle(x - 4 * s, y - 20 * s, 7 * s)
  }

  private drawBuilding(g: Phaser.GameObjects.Graphics, x: number, y: number, seed: number) {
    const w = 28 + this.seededRand(seed, 4) * 18
    const h = 40 + this.seededRand(seed, 5) * 30
    g.fillStyle(0x1e1e3a, 1)
    g.fillRect(x - w / 2, y - h, w, h)
    g.fillStyle(0x151530, 1)
    g.fillRect(x - w / 2, y - h, w, 4)
    for (let wy = y - h + 8; wy < y - 4; wy += 10) {
      for (let wx = x - w / 2 + 4; wx < x + w / 2 - 6; wx += 10) {
        g.fillStyle(this.seededRand(seed, wy) > 0.5 ? 0xffee88 : 0x333355, 1)
        g.fillRect(wx, wy, 6, 5)
      }
    }
  }

  private drawLamp(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0x9999aa, 1)
    g.fillRect(x - 2, y - 28, 4, 28)
    g.fillStyle(0xffffcc, 0.9)
    g.fillCircle(x, y - 28, 5)
  }

  // ── Input ─────────────────────────────────────────────────────

  private setupKeys() {
    const kb = this.input.keyboard!
    this.keyLeft  = kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT)
    this.keyRight = kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT)
    this.keyA     = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A)
    this.keyD     = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D)

    // One-shot lane keys
    kb.on('keydown-LEFT',  () => this.changeLane(-1))
    kb.on('keydown-RIGHT', () => this.changeLane(1))
    kb.on('keydown-A',     () => this.changeLane(-1))
    kb.on('keydown-D',     () => this.changeLane(1))

    // Touch: swipe left/right half
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.changeLane(p.x < CANVAS_W / 2 ? -1 : 1)
    })
  }

  private changeLane(dir: number) {
    if (this.laneChangeCooldown > 0 || this.spinDuration > 0) return
    if (this.startDelayLeft > 0) return
    const next = Phaser.Math.Clamp(this.playerLane + dir, 0, LANE_COUNT - 1)
    if (next === this.playerLane) return
    this.playerLane = next
    raceBridge.playerLane = next
    this.laneChangeCooldown = 240
  }

  // ── Spawn system ──────────────────────────────────────────────

  private setupSpawnEvents() {
    this.spawnTimer = 1800
  }

  private tickSpawner(delta: number) {
    this.spawnTimer -= delta
    if (this.spawnTimer > 0) return
    const speedFactor = Math.min(1, this.gameSpeed / MAX_SPEED)
    // Interval shrinks as speed increases: 2s → 0.9s
    this.spawnTimer = Phaser.Math.Linear(2000, 900, speedFactor)

    const roll = Math.random()
    if (roll < 0.55) this.spawnTraffic()
    else this.spawnPickup()
  }

  private spawnTraffic() {
    const lane = Math.floor(Math.random() * LANE_COUNT)
    const roll = Math.random()
    const type: TrafficType = roll < 0.65 ? 'slow' : roll < 0.88 ? 'oncoming' : 'truck'
    const isTruck = type === 'truck'
    // Avoid spawning truck if it would go off-road
    const finalLane = isTruck && lane >= LANE_COUNT - 1 ? lane - 1 : lane

    const color = type === 'oncoming'
      ? C.oncoming
      : type === 'truck'
      ? C.truck
      : (C.trafficSlow[Math.floor(Math.random() * C.trafficSlow.length)] as number)

    const g = this.add.graphics()
    const car: TrafficCar = { lane: finalLane, y: -80, type, color, g, width: isTruck ? 2 : 1 }
    this.drawTrafficCar(car)
    this.traffic.push(car)
  }

  private spawnPickup() {
    const lane = Math.floor(Math.random() * LANE_COUNT)
    const roll = Math.random()
    const type: PickupType = roll < 0.45 ? 'coin' : roll < 0.65 ? 'fuel' : roll < 0.82 ? 'nitro' : 'oil'
    const g = this.add.graphics()
    const item: PickupItem = { lane, y: -60, type, g, collected: false }
    this.drawPickup(item)
    this.pickups.push(item)
  }

  // ── Traffic rendering ─────────────────────────────────────────

  private drawTrafficCar(car: TrafficCar) {
    const g = car.g
    g.clear()
    const lanes = car.width
    const totalW = lanes * LANE_W
    const cx = this.laneToX(car.lane) + (lanes - 1) * LANE_W / 2
    const w = Math.min(CAR_W * lanes, totalW - 8)
    const h = car.type === 'truck' ? CAR_H * 1.6 : CAR_H
    const color = car.color
    const y = car.y

    // Shadow
    g.fillStyle(0x000000, 0.25)
    g.fillEllipse(cx + 3, y + 5, w + 6, h * 0.3)

    // Body
    g.fillStyle(color, 1)
    g.fillRoundedRect(cx - w / 2, y - h / 2, w, h, { tl: 6, tr: 6, bl: 10, br: 10 })

    // Roof
    const rw = w * 0.58
    g.fillStyle(0x000000, 0.35)
    if (car.type === 'truck') {
      g.fillRect(cx - rw / 2, y - h / 2 + 4, rw, h * 0.3)
    } else {
      g.fillRoundedRect(cx - rw / 2, y - h / 2 + h * 0.28, rw, h * 0.38, 4)
    }

    // Windshield
    g.fillStyle(0x88ccff, 0.65)
    g.fillRoundedRect(cx - w / 2 + 5, y - h / 2 + 4, w - 10, h * 0.19, 3)

    // Wheels
    const ww = 8, wh = 11
    const fwy = y - h / 2 + 8, rwy = y + h / 2 - wh - 8
    g.fillStyle(0x111111, 1)
    g.fillRoundedRect(cx - w / 2 - 5, fwy, ww, wh, 2)
    g.fillRoundedRect(cx + w / 2 - 3, fwy, ww, wh, 2)
    g.fillRoundedRect(cx - w / 2 - 5, rwy, ww, wh, 2)
    g.fillRoundedRect(cx + w / 2 - 3, rwy, ww, wh, 2)

    // Tail lights (facing player = visible rear)
    g.fillStyle(car.type === 'oncoming' ? 0xffcc44 : 0xcc0000, 0.9)
    g.fillRect(cx - w / 2 + 3, y + h / 2 - 4, w - 6, 4)

    // Headlights (oncoming = bright)
    if (car.type === 'oncoming') {
      g.fillStyle(0xffffff, 1)
      g.fillRect(cx - w / 2 + 4, y - h / 2, 8, 4)
      g.fillRect(cx + w / 2 - 12, y - h / 2, 8, 4)
    }
  }

  // ── Pickup rendering ──────────────────────────────────────────

  private drawPickup(item: PickupItem) {
    const g = item.g
    g.clear()
    const cx = this.laneToX(item.lane)
    const cy = item.y
    const t = Date.now() / 800  // bob animation phase

    if (item.type === 'coin') {
      g.fillStyle(C.coin, 1)
      g.fillCircle(cx, cy, 10)
      g.fillStyle(0xffee44, 0.5)
      g.fillCircle(cx - 2, cy - 2, 5)
      g.fillStyle(0xaa8800, 0.8)
      g.fillRect(cx - 1, cy - 7, 2, 14)
    } else if (item.type === 'fuel') {
      g.fillStyle(C.fuel, 1)
      g.fillRoundedRect(cx - 9, cy - 12, 18, 22, 4)
      g.fillStyle(0x00aa33, 1)
      g.fillRect(cx - 4, cy - 16, 8, 5)
      g.fillStyle(0xffffff, 0.7)
      g.fillRect(cx - 5, cy - 8, 4, 8)
    } else if (item.type === 'nitro') {
      g.fillStyle(C.nitro, 0.9)
      g.fillTriangle(cx, cy - 14, cx - 10, cy + 10, cx + 10, cy + 10)
      g.fillStyle(0xffffff, 0.6)
      g.fillCircle(cx, cy - 2, 5)
    } else {  // oil
      g.fillStyle(C.oil, 0.85)
      g.fillEllipse(cx, cy, 32, 16)
      g.fillStyle(0x4400aa, 0.3)
      g.fillEllipse(cx - 4, cy - 2, 14, 8)
    }
    g.y = Math.sin(t) * 3  // gentle bob
  }

  // ── Player car ────────────────────────────────────────────────

  private drawPlayerCar(spin: number) {
    const g = this.playerGfx
    g.clear()
    const x = this.playerScreenX
    const y = PLAYER_Y
    const color = raceBridge.playerColor || 0xff6b35
    const bw = 30, bh = 52

    g.save()
    g.translateCanvas(x, y)
    if (spin !== 0) {
      g.rotateCanvas(spin)
    }

    // Shadow
    g.fillStyle(0x000000, 0.3)
    g.fillEllipse(3, 5, bw + 6, bh * 0.3)

    // Body
    g.fillStyle(color, 1)
    g.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, { tl: 6, tr: 6, bl: 10, br: 10 })

    // Hood stripe
    g.fillStyle(0xffffff, 0.08)
    g.fillRoundedRect(-bw / 2 + 2, -bh / 2, bw - 4, bh * 0.32, { tl: 6, tr: 6, bl: 0, br: 0 })

    // Roof
    const rw = bw * 0.60, rh = bh * 0.42
    g.fillStyle(0x000000, 0.4)
    g.fillRoundedRect(-rw / 2, -bh / 2 + bh * 0.28, rw, rh, 4)

    // Windshield
    g.fillStyle(0x88ccff, 0.75)
    g.fillRoundedRect(-bw / 2 + 5, -bh / 2 + 4, bw - 10, bh * 0.21, 3)

    // Rear window
    g.fillStyle(0x88ccff, 0.45)
    g.fillRoundedRect(-bw / 2 + 7, bh / 2 - bh * 0.26, bw - 14, bh * 0.16, 2)

    // Wheels
    const ww = 8, wh = 13
    const fwy = -bh / 2 + 8, rwy = bh / 2 - wh - 8
    g.fillStyle(0x111111, 1)
    g.fillRoundedRect(-bw / 2 - 5, fwy, ww, wh, 2)
    g.fillRoundedRect(bw / 2 - 3, fwy, ww, wh, 2)
    g.fillRoundedRect(-bw / 2 - 5, rwy, ww, wh, 2)
    g.fillRoundedRect(bw / 2 - 3, rwy, ww, wh, 2)
    g.fillStyle(0x999999, 1)
    g.fillRect(-bw / 2 - 3, fwy + 3, ww - 4, wh - 6)
    g.fillRect(bw / 2 - 1, fwy + 3, ww - 4, wh - 6)
    g.fillRect(-bw / 2 - 3, rwy + 3, ww - 4, wh - 6)
    g.fillRect(bw / 2 - 1, rwy + 3, ww - 4, wh - 6)

    // Grille
    g.fillStyle(0x111111, 0.9)
    g.fillRect(-bw / 2 + 4, -bh / 2, bw - 8, 4)

    // Headlights
    g.fillStyle(0xffffff, 1)
    g.fillRect(-bw / 2 + 4, -bh / 2, 8, 4)
    g.fillRect(bw / 2 - 12, -bh / 2, 8, 4)
    g.fillStyle(0xffffaa, 0.9)
    g.fillRect(-bw / 2 + 6, -bh / 2 + 1, 4, 2)
    g.fillRect(bw / 2 - 10, -bh / 2 + 1, 4, 2)

    // Tail lights
    const braking = this.gameSpeed < BASE_SPEED * 0.6
    g.fillStyle(0xcc0000, braking ? 1.0 : 0.35)
    g.fillRect(-bw / 2 + 3, bh / 2 - 4, bw - 6, 4)

    // Spoiler
    g.fillStyle(0x222222, 1)
    g.fillRect(-bw / 2, bh / 2, bw, 4)
    g.fillRect(-bw / 2, bh / 2 + 1, 5, 6)
    g.fillRect(bw / 2 - 5, bh / 2 + 1, 5, 6)

    // Nitro flame
    if (this.nitroTimer > 0) {
      g.fillStyle(C.nitroFlame, 0.9)
      g.fillTriangle(-6, bh / 2 + 8, 0, bh / 2 + 22, 6, bh / 2 + 8)
      g.fillStyle(0xffffff, 0.6)
      g.fillTriangle(-3, bh / 2 + 8, 0, bh / 2 + 16, 3, bh / 2 + 8)
    }

    g.restore()
  }

  // ── Curb ─────────────────────────────────────────────────────

  private renderCurb(speed: number) {
    this.curbGfx.clear()
    const STRIPE = 18
    const count  = Math.ceil(CANVAS_H / STRIPE) + 2
    const phase  = (Date.now() / 1000) * speed % (STRIPE * 2)
    for (let i = 0; i < count; i++) {
      const y      = i * STRIPE - phase % (STRIPE * 2)
      const isRed  = Math.floor((i + Math.floor(phase / STRIPE)) % 2) === 0
      this.curbGfx.fillStyle(isRed ? C.curbRed : C.curbWhite, 1)
      this.curbGfx.fillRect(ROAD_LEFT - 8,  y, 8, STRIPE)
      this.curbGfx.fillRect(ROAD_RIGHT,     y, 8, STRIPE)
    }
  }

  // ── HUD (on canvas) ───────────────────────────────────────────

  private renderHUD() {
    const g = this.hudGfx
    g.clear()

    // Fuel bar background
    const barX = 12, barY = CANVAS_H - 22, barW = 120, barH = 12
    g.fillStyle(0x000000, 0.55)
    g.fillRoundedRect(barX - 2, barY - 2, barW + 4, barH + 4, 4)
    // Fuel fill
    const pct = Math.max(0, raceBridge.fuelLevel)
    const fuelColor = pct > 0.5 ? C.fuel : pct > 0.25 ? 0xffcc00 : 0xff3300
    g.fillStyle(fuelColor, 1)
    g.fillRoundedRect(barX, barY, barW * pct, barH, 3)
    // Fuel segments
    g.lineStyle(1, 0x000000, 0.3)
    for (let i = 1; i < 4; i++) {
      g.strokeRect(barX + barW * i / 4, barY, 1, barH)
    }

    // Score
    const scoreStr = `${Math.round(this.score)}`
    const scoreX = CANVAS_W - 12 - scoreStr.length * 9
    g.fillStyle(0x000000, 0.5)
    g.fillRoundedRect(scoreX - 6, CANVAS_H - 24, scoreStr.length * 9 + 12, 18, 4)
    this.hudGfx.setDepth(10)
  }

  // ── Score float text ──────────────────────────────────────────

  private addScoreFloat(x: number, y: number, text: string, color = '#ffffff') {
    const t = this.add.text(x, y, text, { fontSize: '14px', color, fontStyle: 'bold' }).setOrigin(0.5)
    this.scoreFloats.push({ x, y, text: t, life: 1200 })
  }

  // ── Collision detection ───────────────────────────────────────

  private checkCollisions() {
    if (this.invincible > 0 || this.spinDuration > 0 || this.gameOverFlag) return

    const px = this.playerScreenX
    const py = PLAYER_Y

    for (const car of this.traffic) {
      const cx = this.laneToX(car.lane) + (car.width - 1) * LANE_W / 2
      const cy = car.y
      const halfW = (car.width * LANE_W) * 0.45
      const halfH = (car.type === 'truck' ? CAR_H * 1.6 : CAR_H) * 0.5

      if (Math.abs(cx - px) < halfW + CAR_W * 0.45 &&
          Math.abs(cy - py) < halfH + CAR_H * 0.5) {
        this.triggerCrash(car.type === 'oncoming' ? 'hard' : 'soft')
        break
      }
    }
  }

  private checkPickups() {
    const px = this.playerScreenX
    const py = PLAYER_Y

    for (const item of this.pickups) {
      if (item.collected) continue
      const cx = this.laneToX(item.lane)
      if (Math.abs(cx - px) < LANE_W * 0.6 && Math.abs(item.y - py) < 28) {
        item.collected = true
        item.g.destroy()
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
        raceBridge.onCoinCollected?.()
        break
      case 'fuel':
        raceBridge.fuelLevel = Math.min(1, raceBridge.fuelLevel + 0.28)
        this.addScoreFloat(x, y, 'FUEL!', '#22cc44')
        raceBridge.onFuelCollected?.()
        break
      case 'nitro':
        this.nitroTimer = 3000
        this.addScoreFloat(x, y, 'NITRO!', '#00ccff')
        raceBridge.onNitroCollected?.()
        break
      case 'oil':
        this.triggerCrash('oil')
        this.addScoreFloat(x, y, 'OIL!', '#884488')
        break
    }
  }

  private triggerCrash(severity: 'soft' | 'hard' | 'oil') {
    const spinMs  = severity === 'hard' ? 1000 : severity === 'oil' ? 800 : 500
    const penalty = severity === 'hard' ? CRASH_PENALTY * 1.5 : CRASH_PENALTY
    this.spinDuration    = spinMs
    this.invincible      = spinMs + 500
    this.crashRecoverT   = 0
    this.gameSpeed       = Math.max(40, this.gameSpeed - penalty)
    this.fuel            = Math.max(0, this.fuel - (severity === 'hard' ? 0.06 : 0.03))

    // Camera shake & screen flash
    this.cameras.main.shake(spinMs * 0.4, severity === 'hard' ? 0.018 : 0.010)
    this.cameras.main.flash(180, 255, severity === 'hard' ? 100 : 20, 20, true)

    // Sparks
    const sparks = severity === 'hard' ? 14 : 7
    for (let i = 0; i < sparks; i++) {
      this.particles.push({
        x: this.playerScreenX, y: PLAYER_Y,
        vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200,
        alpha: 1, r: 3 + Math.random() * 3,
        color: i % 2 === 0 ? C.sparkRed : C.sparkWhite,
      })
    }

    raceBridge.onCrash?.()
  }

  // ── Scrolling helpers ─────────────────────────────────────────

  private scrollDashes(speed: number, ds: number) {
    const DASH_H = 28, GAP = 38, PERIOD = DASH_H + GAP
    for (const m of this.dashMarks) {
      m.y += speed * ds
      m.g.y = m.y
      if (m.y > CANVAS_H + PERIOD) {
        m.y -= (Math.ceil(CANVAS_H / PERIOD) + 3) * PERIOD
        m.g.y = m.y
      }
    }
  }

  private scrollScenery(speed: number, ds: number) {
    for (const obj of this.scenery) {
      obj.y += speed * ds
      obj.g.y = obj.y
      if (obj.y > CANVAS_H + 100) {
        obj.y = -120 - Math.random() * 80
        obj.g.y = obj.y
      }
    }
  }

  private scrollTraffic(speed: number, ds: number) {
    for (const car of this.traffic) {
      const relSpeed = car.type === 'oncoming'
        ? speed * 1.6          // oncoming comes faster
        : car.type === 'truck'
        ? speed * 0.35         // trucks are slow
        : speed * 0.45         // slow traffic
      car.y += relSpeed * ds

      // Redraw at new position
      const cx = this.laneToX(car.lane)
      car.g.y = car.y - car.y  // reset graphics offset, redraw absolute
      this.drawTrafficCar(car)
    }
    // Remove off-screen
    this.traffic = this.traffic.filter(c => {
      if (c.y > CANVAS_H + 100) { c.g.destroy(); return false }
      return true
    })
  }

  private scrollPickups(speed: number, ds: number) {
    for (const item of this.pickups) {
      item.y += speed * ds
      item.g.y = item.y
      this.drawPickup(item)  // redraw for bob animation
    }
  }

  // ── Particles ─────────────────────────────────────────────────

  private updateParticles(ds: number) {
    this.fxGfx.clear()
    this.particles = this.particles.filter(p => {
      p.x += p.vx * ds
      p.y += p.vy * ds
      p.vy += 200 * ds   // gravity
      p.alpha -= ds * 2
      if (p.alpha <= 0) return false
      this.fxGfx.fillStyle(p.color, p.alpha)
      this.fxGfx.fillCircle(p.x, p.y, p.r * p.alpha)
      return true
    })
  }

  // ── Score floats ──────────────────────────────────────────────

  private updateScoreFloats(ds: number) {
    this.scoreFloats = this.scoreFloats.filter(sf => {
      sf.life -= ds * 1000
      sf.y -= 30 * ds
      sf.text.setPosition(sf.x, sf.y)
      sf.text.setAlpha(sf.life / 1200)
      if (sf.life <= 0) { sf.text.destroy(); return false }
      return true
    })
  }

  // ── Main update ───────────────────────────────────────────────

  update(_t: number, delta: number) {
    if (this.gameOverFlag) return
    const ds = delta / 1000
    this.elapsedS += ds

    // ── Start delay ──
    if (this.startDelayLeft > 0) {
      this.startDelayLeft -= delta
      // Scroll road slowly to show alive, but player is frozen
      const idleSpeed = 60
      this.scrollDashes(idleSpeed, ds)
      this.scrollScenery(idleSpeed, ds)
      this.renderCurb(idleSpeed)
      this.drawPlayerCar(0)
      this.renderHUD()
      return
    }
    this.raceStarted = true

    // ── Game speed ramp ──
    const speedTarget = Math.min(
      MAX_SPEED,
      BASE_SPEED + Math.floor(this.elapsedS / 30) * SPEED_RAMP,
    )
    const nitroSpeed = this.nitroTimer > 0 ? NITRO_BOOST : 0
    // Crash recovery: speed ramps back up over CRASH_RECOVER seconds
    if (this.crashRecoverT < CRASH_RECOVER && this.spinDuration <= 0) {
      this.crashRecoverT += ds
    }
    const crashFactor = this.spinDuration > 0
      ? 0.15
      : Math.min(1, this.crashRecoverT / CRASH_RECOVER)
    this.gameSpeed = Phaser.Math.Linear(
      this.gameSpeed,
      (speedTarget + nitroSpeed) * crashFactor,
      ds * 3,
    )

    // ── Cooldowns ──
    if (this.laneChangeCooldown > 0) this.laneChangeCooldown -= delta
    if (this.invincible > 0)         this.invincible -= delta
    if (this.nitroTimer > 0)         this.nitroTimer -= delta
    if (this.spinDuration > 0) {
      this.spinDuration -= delta
      this.spinAngle += ds * Math.PI * 4
    } else {
      this.spinAngle = 0
    }

    // ── Smooth lane ──
    const targetX = this.laneToX(this.playerLane)
    this.playerScreenX += (targetX - this.playerScreenX) * Math.min(1, ds * 12)

    // ── Fuel drain ──
    const fuelDrain = (0.0012 + this.gameSpeed / MAX_SPEED * 0.002) * ds
    this.fuel = Math.max(0, this.fuel - fuelDrain)
    raceBridge.fuelLevel = this.fuel
    if (this.fuel <= 0) {
      this.gameSpeed = Math.max(0, this.gameSpeed - 80 * ds)
      if (this.gameSpeed < 5) {
        this.gameOverFlag = true
        raceBridge.gameOver = true
        return
      }
    }

    // ── Distance & score ──
    const metersPerPx = 0.05
    this.distance += this.gameSpeed * ds * metersPerPx
    this.score    += this.gameSpeed * ds * 0.4   // base score from driving
    raceBridge.distanceTraveled = this.distance
    raceBridge.raceScore        = Math.round(this.score)

    // ── Spawner ──
    this.tickSpawner(delta)

    // ── Render road ──
    this.scrollDashes(this.gameSpeed, ds)
    this.scrollScenery(this.gameSpeed, ds)
    this.renderCurb(this.gameSpeed)

    // ── Traffic & pickups ──
    this.scrollTraffic(this.gameSpeed, ds)
    this.scrollPickups(this.gameSpeed, ds)

    // ── Collisions ──
    this.checkCollisions()
    this.checkPickups()

    // ── Player ──
    const spinRad = this.spinDuration > 0 ? this.spinAngle : 0
    this.drawPlayerCar(spinRad)

    // ── Particles & floats ──
    this.updateParticles(ds)
    this.updateScoreFloats(ds)

    // ── HUD ──
    this.renderHUD()
  }
}

// ── Phaser game config ─────────────────────────────────────────
export const PHASER_CONFIG = (parent: string): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  width: CANVAS_W,
  height: CANVAS_H,
  backgroundColor: '#080814',
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
