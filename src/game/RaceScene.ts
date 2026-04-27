import Phaser from 'phaser'
import { raceBridge } from './raceBridge'

// ── Canvas & road layout ──────────────────────────────────────────
const CANVAS_W = 480
const CANVAS_H = 320
const ROAD_W = 270
const LANE_COUNT = 5
const LANE_W = ROAD_W / LANE_COUNT          // 54px per lane
const ROAD_LEFT = (CANVAS_W - ROAD_W) / 2  // 105px margin each side
const ROAD_RIGHT = ROAD_LEFT + ROAD_W
const PLAYER_Y = CANVAS_H * 0.76
const PX_PER_M = 0.20                       // px per metre distance diff (AI positioning)
const MAX_SCROLL = 400                       // px/sec at player speed = 1.0
const LANE_SNAP_SPEED = 10                  // multiplier for smooth lane transition

// ── Car dimensions ────────────────────────────────────────────────
const CAR_W = 26
const CAR_H = 44

// ── Colours ───────────────────────────────────────────────────────
const C = {
  sky: 0x080814,
  grass: 0x1d4a20,
  grassStripe: 0x163819,
  asphalt: 0x21212e,
  asphaltShade: 0x1a1a28,
  curbRed: 0xcc2222,
  curbWhite: 0xeeeeee,
  laneDash: 0xffffff,
  edgeLine: 0xffffff,
  player: 0xff6b35,
  nitroFlame: 0x00ffff,
  stall: 0x778899,
  treeTrunk: 0x5a3820,
  treeGreen: 0x2e7a2e,
  treeGreenDark: 0x1e5a1e,
  treeHighlight: 0x3d9e3d,
  buildingA: 0x1e1e3a,
  buildingB: 0x2a2040,
  buildingRoof: 0x151530,
  window: 0xffee88,
  windowOff: 0x333355,
  lamp: 0x9999aa,
  lampGlow: 0xffffcc,
  barrier: 0xcc4422,
  barrierStripe: 0xffffff,
}

// ── Scenery item types ────────────────────────────────────────────
type SceneryType = 'tree' | 'building' | 'lamp' | 'barrier'

interface SceneryItem {
  g: Phaser.GameObjects.Graphics
  type: SceneryType
  side: 'left' | 'right'
  localX: number   // x within the side strip
  y: number
  seed: number     // deterministic randomness per object
}

interface DashMark {
  g: Phaser.GameObjects.Graphics
  lane: number     // divider to the right of this lane (0..3)
  y: number
}

export class RaceScene extends Phaser.Scene {
  // Rendering layers
  private bgGfx!: Phaser.GameObjects.Graphics
  private curbGfx!: Phaser.GameObjects.Graphics
  private roadGfx!: Phaser.GameObjects.Graphics
  private fxGfx!: Phaser.GameObjects.Graphics

  // Scrolling elements
  private dashMarks: DashMark[] = []
  private scenery: SceneryItem[] = []

  // Vehicles
  private carGfx: Phaser.GameObjects.Graphics[] = []
  private carLabels: Phaser.GameObjects.Text[] = []

  // Player state
  private playerLane = 2
  private playerScreenX = 0
  private laneChangeCooldown = 0

  // Manual speed keys (held each frame)
  private keyUp!: Phaser.Input.Keyboard.Key
  private keyDown!: Phaser.Input.Keyboard.Key
  private keyW!: Phaser.Input.Keyboard.Key
  private keyS!: Phaser.Input.Keyboard.Key

  // Nitro particles
  private particles: { x: number; y: number; vy: number; alpha: number; r: number }[] = []

  constructor() { super({ key: 'RaceScene' }) }

  create() {
    this.playerScreenX = this.laneToX(this.playerLane)

    // Layer order: bg → road → scenery draws on bg layer → fx on top → cars on top
    this.bgGfx = this.add.graphics()
    this.curbGfx = this.add.graphics()
    this.roadGfx = this.add.graphics()
    this.fxGfx = this.add.graphics()

    this.drawBackground()
    this.buildRoadStripes()
    this.buildScenery()
    this.buildCars()
    this.setupKeys()
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private laneToX(lane: number): number {
    return ROAD_LEFT + lane * LANE_W + LANE_W / 2
  }

  // Seeded pseudo-random for stable object shapes
  private seededRand(seed: number, n: number): number {
    return ((seed * 9301 + n * 49297 + 233) % 233280) / 233280
  }

  // ── Static background ────────────────────────────────────────────

  private drawBackground() {
    const g = this.bgGfx
    g.clear()

    // Sky fill
    g.fillStyle(C.sky, 1)
    g.fillRect(0, 0, CANVAS_W, CANVAS_H)

    // Grass strips (left + right)
    g.fillStyle(C.grass, 1)
    g.fillRect(0, 0, ROAD_LEFT, CANVAS_H)
    g.fillRect(ROAD_RIGHT, 0, CANVAS_W - ROAD_RIGHT, CANVAS_H)

    // Grass texture bands
    for (let y = 0; y < CANVAS_H; y += 32) {
      g.fillStyle(C.grassStripe, 0.35)
      g.fillRect(0, y, ROAD_LEFT, 6)
      g.fillRect(ROAD_RIGHT, y, CANVAS_W - ROAD_RIGHT, 6)
    }

    // Asphalt road
    g.fillStyle(C.asphalt, 1)
    g.fillRect(ROAD_LEFT, 0, ROAD_W, CANVAS_H)

    // Subtle asphalt shading alternation
    for (let y = 0; y < CANVAS_H; y += 60) {
      g.fillStyle(C.asphaltShade, 0.18)
      g.fillRect(ROAD_LEFT, y, ROAD_W, 30)
    }

    // White edge lines
    g.fillStyle(C.edgeLine, 0.9)
    g.fillRect(ROAD_LEFT, 0, 3, CANVAS_H)
    g.fillRect(ROAD_RIGHT - 3, 0, 3, CANVAS_H)
  }

  // ── Scrolling road dashes ─────────────────────────────────────────

  private buildRoadStripes() {
    const DASH_H = 28
    const GAP = 38
    const PERIOD = DASH_H + GAP
    const count = Math.ceil(CANVAS_H / PERIOD) + 3

    // 4 lane dividers
    for (let lane = 0; lane < LANE_COUNT - 1; lane++) {
      const x = ROAD_LEFT + (lane + 1) * LANE_W
      for (let i = 0; i < count; i++) {
        const g = this.add.graphics()
        g.fillStyle(C.laneDash, lane === 2 ? 0.55 : 0.22)  // centre line brighter
        g.fillRect(-1, 0, 2, DASH_H)
        g.x = x
        g.y = i * PERIOD - PERIOD
        this.dashMarks.push({ g, lane, y: g.y })
      }
    }
  }

  // ── Scenery ───────────────────────────────────────────────────────

  private buildScenery() {
    const SIDE_W = ROAD_LEFT   // 105px each side
    const total = 24           // 12 per side

    for (let i = 0; i < total; i++) {
      const side: 'left' | 'right' = i % 2 === 0 ? 'left' : 'right'
      const seed = i * 137 + 1
      const types: SceneryType[] = ['tree', 'tree', 'tree', 'building', 'lamp', 'barrier']
      const type = types[Math.floor(this.seededRand(seed, 0) * types.length)]

      let localX: number
      if (type === 'lamp') localX = side === 'left' ? ROAD_LEFT - 14 : ROAD_RIGHT + 14
      else if (type === 'barrier') localX = side === 'left' ? ROAD_LEFT - 8 : ROAD_RIGHT + 8
      else localX = side === 'left'
        ? 8 + this.seededRand(seed, 1) * (SIDE_W - 36)
        : ROAD_RIGHT + 8 + this.seededRand(seed, 1) * (SIDE_W - 36)

      const g = this.add.graphics()
      this.drawScenery(g, type, seed)

      const startY = (i / total) * CANVAS_H * 1.6 - CANVAS_H * 0.2
      g.x = localX
      g.y = startY

      this.scenery.push({ g, type, side, localX, y: startY, seed })
    }
  }

  private drawScenery(g: Phaser.GameObjects.Graphics, type: SceneryType, seed: number) {
    g.clear()
    const r1 = this.seededRand(seed, 2)
    const r2 = this.seededRand(seed, 3)
    const r3 = this.seededRand(seed, 4)

    if (type === 'tree') {
      const radius = 14 + r1 * 8
      // Trunk
      g.fillStyle(C.treeTrunk, 1)
      g.fillRect(-3, 0, 6, 10)
      // Shadow layer
      g.fillStyle(C.treeGreenDark, 1)
      g.fillCircle(0, -radius * 0.6, radius)
      // Main canopy
      g.fillStyle(C.treeGreen, 1)
      g.fillCircle(-r1 * 4 + 2, -radius * 0.7, radius * 0.85)
      // Highlight
      g.fillStyle(C.treeHighlight, 0.6)
      g.fillCircle(-2, -radius * 0.85, radius * 0.55)

    } else if (type === 'building') {
      const bw = 28 + Math.floor(r1 * 22)
      const bh = 38 + Math.floor(r2 * 52)
      const color = r3 > 0.5 ? C.buildingA : C.buildingB
      // Body
      g.fillStyle(color, 1)
      g.fillRect(-bw / 2, -bh, bw, bh)
      // Roof
      g.fillStyle(C.buildingRoof, 1)
      g.fillRect(-bw / 2, -bh, bw, 5)
      // Windows grid
      const cols = Math.max(1, Math.floor(bw / 10) - 1)
      const rows = Math.max(1, Math.floor(bh / 13) - 1)
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const wx = -bw / 2 + 5 + col * 10
          const wy = -bh + 8 + row * 13
          const lit = this.seededRand(seed + row * 10 + col, 5) > 0.35
          g.fillStyle(lit ? C.window : C.windowOff, lit ? 0.85 : 0.5)
          g.fillRect(wx, wy, 6, 8)
        }
      }

    } else if (type === 'lamp') {
      // Post
      g.fillStyle(C.lamp, 1)
      g.fillRect(-2, -46, 4, 46)
      // Arm
      g.fillRect(-2, -46, 18, 3)
      // Lamp head
      g.fillStyle(C.lamp, 1)
      g.fillRect(12, -50, 10, 6)
      // Glow
      g.fillStyle(C.lampGlow, 0.9)
      g.fillCircle(17, -47, 4)
      g.fillStyle(C.lampGlow, 0.15)
      g.fillCircle(17, -47, 14)

    } else if (type === 'barrier') {
      // Armco barrier blocks
      for (let i = 0; i < 3; i++) {
        const y = i * 18
        g.fillStyle(i % 2 === 0 ? C.barrierStripe : C.barrier, 1)
        g.fillRect(-6, y, 12, 16)
      }
    }
  }

  // ── Cars ──────────────────────────────────────────────────────────

  private buildCars() {
    // Player (index 0)
    const pg = this.add.graphics()
    this.carGfx.push(pg)
    this.carLabels.push(
      this.add.text(0, 0, 'YOU', { fontSize: '8px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5, 0.5)
    )

    // AI (indices 1-4)
    const names = ['REX', 'ZARA', 'BOLT', 'NOVA']
    for (let i = 0; i < 4; i++) {
      const g = this.add.graphics()
      this.carGfx.push(g)
      this.carLabels.push(
        this.add.text(0, 0, names[i], { fontSize: '7px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5, 0.5)
      )
    }
  }

  private drawCar(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number,
    color: number,
    isPlayer: boolean,
    isBraking: boolean
  ) {
    g.clear()
    const w = CAR_W + (isPlayer ? 4 : 0)
    const h = CAR_H + (isPlayer ? 6 : 0)

    // Drop shadow
    g.fillStyle(0x000000, 0.4)
    g.fillRoundedRect(x - w / 2 + 4, y - h / 2 + 5, w, h, 6)

    // Body
    g.fillStyle(color, 1)
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 6)

    // Roof panel (darker centre stripe)
    g.fillStyle(0x000000, 0.22)
    g.fillRoundedRect(x - w / 2 + 5, y - h / 2 + 8, w - 10, h - 16, 3)

    // Windshield (front, near top of car since it faces up)
    g.fillStyle(0x99ccff, 0.7)
    g.fillRoundedRect(x - w / 2 + 5, y - h / 2 + 5, w - 10, h * 0.28, 3)

    // Rear window
    g.fillStyle(0x99ccff, 0.4)
    g.fillRoundedRect(x - w / 2 + 6, y + h / 2 - h * 0.24, w - 12, h * 0.18, 2)

    // Wheels (top-down view — stick out from sides)
    g.fillStyle(0x111111, 1)
    const ww = 7, wh = 11
    // front left / right
    g.fillRoundedRect(x - w / 2 - 4, y - h / 2 + 7, ww, wh, 2)
    g.fillRoundedRect(x + w / 2 - 3, y - h / 2 + 7, ww, wh, 2)
    // rear left / right
    g.fillRoundedRect(x - w / 2 - 4, y + h / 2 - 18, ww, wh, 2)
    g.fillRoundedRect(x + w / 2 - 3, y + h / 2 - 18, ww, wh, 2)

    // Headlights (front)
    g.fillStyle(0xffffcc, 1)
    g.fillCircle(x - w / 2 + 5, y - h / 2 + 3, 3)
    g.fillCircle(x + w / 2 - 5, y - h / 2 + 3, 3)

    // Tail lights (rear) — always dim red, bright when braking
    g.fillStyle(0xcc2222, isBraking ? 1 : 0.5)
    g.fillRect(x - w / 2 + 4, y + h / 2 - 4, 8, 3)
    g.fillRect(x + w / 2 - 12, y + h / 2 - 4, 8, 3)
  }

  // ── Input ─────────────────────────────────────────────────────────

  private setupKeys() {
    this.input.keyboard!.on('keydown-LEFT',  () => this.changeLane(-1))
    this.input.keyboard!.on('keydown-RIGHT', () => this.changeLane(1))
    this.input.keyboard!.on('keydown-A',     () => this.changeLane(-1))
    this.input.keyboard!.on('keydown-D',     () => this.changeLane(1))

    // Held keys for boost / brake
    const kb = this.input.keyboard!
    this.keyUp   = kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP)
    this.keyDown = kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN)
    this.keyW    = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W)
    this.keyS    = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S)

    // Touch: tap left half = go left, right half = go right
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.changeLane(p.x < CANVAS_W / 2 ? -1 : 1)
    })
  }

  private changeLane(dir: number) {
    if (this.laneChangeCooldown > 0) return
    const next = Phaser.Math.Clamp(this.playerLane + dir, 0, LANE_COUNT - 1)
    if (next === this.playerLane) return
    this.playerLane = next
    raceBridge.playerLane = next
    this.laneChangeCooldown = 280  // ms
  }

  // ── Update loop ───────────────────────────────────────────────────

  update(_t: number, delta: number) {
    const ds = delta / 1000
    if (this.laneChangeCooldown > 0) this.laneChangeCooldown -= delta

    // Smooth player X toward target lane
    const targetX = this.laneToX(this.playerLane)
    this.playerScreenX += (targetX - this.playerScreenX) * Math.min(1, ds * LANE_SNAP_SPEED)

    // Manual boost / brake (held keys) — visual only, doesn't affect race distance
    const boosting = this.keyUp?.isDown || this.keyW?.isDown
    const braking  = this.keyDown?.isDown || this.keyS?.isDown
    if (boosting && !raceBridge.isNitro) raceBridge.isNitro = true
    if (!boosting && raceBridge.isNitro) raceBridge.isNitro = false
    if (braking && !raceBridge.isBraking) raceBridge.isBraking = true
    if (!braking && raceBridge.isBraking) raceBridge.isBraking = false

    const speedFactor = boosting ? 1.35 : braking ? 0.55 : 1.0
    const scrollSpeed = raceBridge.playerSpeed * MAX_SCROLL * speedFactor

    this.scrollDashes(scrollSpeed, ds)
    this.scrollScenery(scrollSpeed, ds)
    this.renderCurb(scrollSpeed)
    this.renderCars()
    this.renderFx(delta)
  }

  // ── Curb (animated red/white stripes) ────────────────────────────

  private curbOffset = 0

  private renderCurb(scrollSpeed: number) {
    // Recompute offset each frame (not accumulated — recalc from scrollOffset)
    // We'll animate it by tracking a simple phase
    // Called after update so we just use the current frame
    this.curbGfx.clear()

    const STRIPE = 18
    const count = Math.ceil(CANVAS_H / STRIPE) + 2
    const phase = (Date.now() / 1000) * scrollSpeed % (STRIPE * 2)

    for (let i = 0; i < count; i++) {
      const y = i * STRIPE - phase % (STRIPE * 2)
      const isRed = Math.floor((i + Math.floor(phase / STRIPE)) % 2) === 0

      // Left curb strip
      this.curbGfx.fillStyle(isRed ? C.curbRed : C.curbWhite, 1)
      this.curbGfx.fillRect(ROAD_LEFT - 8, y, 8, STRIPE)

      // Right curb strip
      this.curbGfx.fillStyle(isRed ? C.curbRed : C.curbWhite, 1)
      this.curbGfx.fillRect(ROAD_RIGHT, y, 8, STRIPE)
    }
  }

  private scrollDashes(speed: number, ds: number) {
    const DASH_H = 28
    const GAP = 38
    const PERIOD = DASH_H + GAP
    const total = Math.ceil(CANVAS_H / PERIOD) + 3

    for (const m of this.dashMarks) {
      m.y += speed * ds
      m.g.y = m.y
      if (m.y > CANVAS_H + DASH_H) {
        m.y -= total * PERIOD
        m.g.y = m.y
      }
    }
  }

  private scrollScenery(speed: number, ds: number) {
    for (const obj of this.scenery) {
      obj.y += speed * ds
      obj.g.y = obj.y
      if (obj.y > CANVAS_H + 80) {
        obj.y = -80 - Math.random() * 120
        obj.g.y = obj.y
      }
    }
  }

  // ── Car rendering ─────────────────────────────────────────────────

  private readonly AI_LANES = [0, 1, 3, 4]

  private renderCars() {
    const bridge = raceBridge

    // Draw AI cars first (player draws on top)
    bridge.aiVehicles.forEach((ai, i) => {
      const g = this.carGfx[i + 1]
      const label = this.carLabels[i + 1]
      if (!g) return

      const ax = this.laneToX(this.AI_LANES[i] ?? i)
      const distDiff = ai.distance - bridge.playerDistance
      const ay = PLAYER_Y - distDiff * PX_PER_M

      if (ay < -60 || ay > CANVAS_H + 60) {
        g.clear()
        label?.setVisible(false)
        return
      }

      label?.setVisible(true)
      this.drawCar(g, ax, ay, ai.color, false, false)
      label?.setPosition(ax, ay)
    })

    // Draw player
    const color = bridge.isStalled
      ? C.stall
      : bridge.isNitro
      ? C.nitroFlame
      : C.player

    this.drawCar(this.carGfx[0], this.playerScreenX, PLAYER_Y, color, true, bridge.isBraking)
    this.carLabels[0]?.setPosition(this.playerScreenX, PLAYER_Y)

    // Nitro particle spawn
    if (bridge.isNitro && Math.random() < 0.6) {
      this.particles.push({
        x: this.playerScreenX + (Math.random() - 0.5) * CAR_W,
        y: PLAYER_Y + CAR_H / 2 + 4,
        vy: 80 + Math.random() * 120,
        alpha: 1,
        r: 3 + Math.random() * 3,
      })
    }
  }

  // ── Nitro FX ─────────────────────────────────────────────────────

  private renderFx(delta: number) {
    this.fxGfx.clear()

    this.particles = this.particles.filter(p => p.alpha > 0.02)
    for (const p of this.particles) {
      p.y += p.vy * (delta / 1000)
      p.alpha -= delta / 400
      p.r *= 0.98
      this.fxGfx.fillStyle(0x00ddff, Math.max(0, p.alpha))
      this.fxGfx.fillCircle(p.x, p.y, p.r)
    }

    if (raceBridge.isNitro) {
      this.fxGfx.fillStyle(0x00ffff, 0.07)
      this.fxGfx.fillCircle(this.playerScreenX, PLAYER_Y, 55)
    }

    if (raceBridge.isStalled) {
      this.fxGfx.lineStyle(2, 0xff4444, 0.5)
      this.fxGfx.strokeCircle(this.playerScreenX, PLAYER_Y, 30 + Math.sin(Date.now() / 120) * 8)
    }
  }
}

export const PHASER_CONFIG = (parent: string): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  width: CANVAS_W,
  height: CANVAS_H,
  backgroundColor: '#080814',
  parent,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [RaceScene],
  audio: { disableWebAudio: false },
  powerPreference: 'high-performance',
})
