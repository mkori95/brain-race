import Phaser from 'phaser'
import { raceBridge } from './raceBridge'

const LANE_COUNT = 5
const PLAYER_LANE = 2   // 0-indexed, middle lane
const PLAYER_SCREEN_X = 220
const DISTANCE_SCALE = 0.4  // pixels per metre of distance difference
const STRIPE_SPEED = 180    // pixels per second at full speed (1.0 multiplier)
const VEHICLE_W = 56
const VEHICLE_H = 26

// Phaser hex colours
const COLORS = {
  road: 0x1a1a2e,
  roadDark: 0x12122a,
  laneLine: 0x3a3a5a,
  laneLineBright: 0x5a5a8a,
  player: 0xff6b35,
  playerGlow: 0xffaa00,
  nitro: 0x00ffff,
  brake: 0xff2222,
  stall: 0x888888,
  stripe: 0x4a4a6a,
  ground: 0x0a0a1a,
}

export class RaceScene extends Phaser.Scene {
  private laneHeight!: number
  private stripes: Phaser.GameObjects.Graphics[] = []
  private stripeOffsets: number[] = []
  private vehicleGraphics: Phaser.GameObjects.Graphics[] = []  // 0 = player, 1-4 = AI
  private vehicleLabels: Phaser.GameObjects.Text[] = []
  private speedLineGraphics!: Phaser.GameObjects.Graphics
  private glowGraphics!: Phaser.GameObjects.Graphics
  private nitroParticles: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number }[] = []

  constructor() {
    super({ key: 'RaceScene' })
  }

  create() {
    const { width, height } = this.scale

    this.laneHeight = height / LANE_COUNT

    // Background
    this.add.rectangle(width / 2, height / 2, width, height, COLORS.roadDark)

    // Road stripes (dashed lane markers)
    this.speedLineGraphics = this.add.graphics()
    this.glowGraphics = this.add.graphics()

    this.createRoadStripes()
    this.createVehicles()
  }

  private createRoadStripes() {
    const { width, height } = this.scale
    const stripeCount = 12
    const stripeW = 32
    const stripeH = 4
    const gap = width / stripeCount

    // Lane dividers — static horizontal lines between lanes
    const laneLines = this.add.graphics()
    for (let lane = 1; lane < LANE_COUNT; lane++) {
      const y = lane * this.laneHeight
      laneLines.lineStyle(1, COLORS.laneLine, 0.5)
      laneLines.lineBetween(0, y, width, y)
    }

    // Scrolling road stripes per lane (centre of each lane)
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      for (let s = 0; s < stripeCount; s++) {
        const g = this.add.graphics()
        g.fillStyle(COLORS.stripe, 0.4)
        g.fillRect(0, -stripeH / 2, stripeW, stripeH)
        g.x = s * gap
        g.y = this.laneY(lane)
        this.stripes.push(g)
        this.stripeOffsets.push(s * gap)
      }
    }
  }

  private createVehicles() {
    // Player vehicle (index 0)
    const playerG = this.add.graphics()
    this.vehicleGraphics.push(playerG)

    const playerLabel = this.add.text(0, 0, 'YOU', {
      fontSize: '9px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5)
    this.vehicleLabels.push(playerLabel)

    // AI vehicles (indices 1-4)
    for (let i = 0; i < 4; i++) {
      const g = this.add.graphics()
      this.vehicleGraphics.push(g)

      const names = ['REX', 'ZARA', 'BOLT', 'NOVA']
      const label = this.add.text(0, 0, names[i], {
        fontSize: '9px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5, 0.5)
      this.vehicleLabels.push(label)
    }
  }

  private laneY(lane: number): number {
    return lane * this.laneHeight + this.laneHeight / 2
  }

  update(_time: number, delta: number) {
    const deltaS = delta / 1000
    this.updateStripes(deltaS)
    this.updateVehicles()
    this.updateGlow()
    this.updateNitroParticles(delta)
  }

  private updateStripes(deltaS: number) {
    const { width } = this.scale
    const speed = raceBridge.playerSpeed * STRIPE_SPEED
    const stripeCount = 12
    const gap = width / stripeCount

    for (let i = 0; i < this.stripes.length; i++) {
      const g = this.stripes[i]
      g.x -= speed * deltaS
      if (g.x < -40) g.x += stripeCount * gap
    }
  }

  private updateVehicles() {
    const { width } = this.scale
    const bridge = raceBridge

    // Calculate normalised position for each vehicle
    const allDistances = [
      { id: 'player', dist: bridge.playerDistance },
      ...bridge.aiVehicles.map((ai) => ({ id: ai.id, dist: ai.distance })),
    ]
    const maxDist = Math.max(...allDistances.map((v) => v.dist), 1)
    const minDist = Math.min(...allDistances.map((v) => v.dist), 0)
    const range = maxDist - minDist || 1

    const normPos = (dist: number) =>
      (dist - minDist) / range  // 0 = last place, 1 = leader

    const screenX = (dist: number) => 80 + normPos(dist) * (width - 160)

    // Player vehicle
    const playerX = screenX(bridge.playerDistance)
    const playerY = this.laneY(PLAYER_LANE)
    const playerColor = bridge.isStalled
      ? COLORS.stall
      : bridge.isNitro
      ? COLORS.nitro
      : COLORS.player

    this.drawVehicle(this.vehicleGraphics[0], playerX, playerY, playerColor, true)
    this.vehicleLabels[0].setPosition(playerX, playerY)

    // Spawn nitro particles when boosted
    if (bridge.isNitro && Math.random() < 0.4) {
      this.nitroParticles.push({
        x: playerX - VEHICLE_W / 2,
        y: playerY + (Math.random() - 0.5) * 14,
        vx: -(60 + Math.random() * 80),
        vy: (Math.random() - 0.5) * 30,
        life: 400,
        maxLife: 400,
      })
    }

    // AI vehicles
    const aiLanes = [0, 1, 3, 4]  // skip PLAYER_LANE (2)
    bridge.aiVehicles.forEach((ai, i) => {
      const g = this.vehicleGraphics[i + 1]
      if (!g) return
      const aiX = screenX(ai.distance)
      const aiY = this.laneY(aiLanes[i] ?? i)
      this.drawVehicle(g, aiX, aiY, ai.color, false)
      this.vehicleLabels[i + 1]?.setPosition(aiX, aiY)
    })
  }

  private drawVehicle(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, isPlayer: boolean) {
    g.clear()
    const w = isPlayer ? VEHICLE_W + 4 : VEHICLE_W
    const h = isPlayer ? VEHICLE_H + 2 : VEHICLE_H

    // Shadow
    g.fillStyle(0x000000, 0.3)
    g.fillRoundedRect(x - w / 2 + 3, y - h / 2 + 3, w, h, 5)

    // Body
    g.fillStyle(color, 1)
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 5)

    // Windshield
    g.fillStyle(0xaaddff, 0.6)
    g.fillRoundedRect(x + 2, y - h / 2 + 4, w * 0.3, h - 8, 2)

    // Wheels
    g.fillStyle(0x222222, 1)
    const ww = 7, wh = 5
    g.fillRect(x - w / 2 + 4, y - h / 2 - 2, ww, wh)
    g.fillRect(x - w / 2 + 4, y + h / 2 - 3, ww, wh)
    g.fillRect(x + w / 2 - 11, y - h / 2 - 2, ww, wh)
    g.fillRect(x + w / 2 - 11, y + h / 2 - 3, ww, wh)

    // Brake lights for player
    if (isPlayer && raceBridge.isBraking) {
      g.fillStyle(0xff0000, 0.9)
      g.fillRect(x - w / 2 + 1, y - 4, 5, 8)
    }

    // Headlights
    g.fillStyle(0xffffaa, 0.9)
    g.fillCircle(x + w / 2 - 2, y - 5, 2)
    g.fillCircle(x + w / 2 - 2, y + 5, 2)
  }

  private updateGlow() {
    this.glowGraphics.clear()
    if (!raceBridge.isNitro) return

    const { width } = this.scale
    const allDists = [raceBridge.playerDistance, ...raceBridge.aiVehicles.map((a) => a.distance)]
    const maxD = Math.max(...allDists, 1)
    const minD = Math.min(...allDists, 0)
    const range = maxD - minD || 1
    const playerX = 80 + ((raceBridge.playerDistance - minD) / range) * (width - 160)
    const playerY = this.laneY(PLAYER_LANE)

    this.glowGraphics.fillStyle(0x00ffff, 0.12)
    this.glowGraphics.fillCircle(playerX, playerY, 60)
  }

  private updateNitroParticles(delta: number) {
    this.speedLineGraphics.clear()
    this.nitroParticles = this.nitroParticles.filter((p) => p.life > 0)

    for (const p of this.nitroParticles) {
      p.x += p.vx * (delta / 1000)
      p.y += p.vy * (delta / 1000)
      p.life -= delta
      const alpha = p.life / p.maxLife
      this.speedLineGraphics.fillStyle(0x00ccff, alpha * 0.8)
      this.speedLineGraphics.fillCircle(p.x, p.y, 3 * alpha)
    }
  }
}

export const PHASER_CONFIG = (parent: string): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  width: 800,
  height: 280,
  backgroundColor: '#0a0a1a',
  parent,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [RaceScene],
  audio: { disableWebAudio: false },
  powerPreference: 'high-performance',
})
