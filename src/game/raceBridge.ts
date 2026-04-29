// Shared mutable object between React (write config) and Phaser (write runtime state).
// React writes once at race start. Phaser writes every frame during race.

export interface RaceBridgeData {
  // ── React → Phaser (set before race starts) ──
  gridPosition: number      // 1-5; determines start delay
  startDelayMs: number      // ms player must wait before accelerating
  playerLevel: number       // 1-5; affects traffic density & speed ceiling
  playerColor: number       // hex color for player car
  trackTheme: string        // 'night_city' | 'desert' | 'mountain'

  // ── Phaser → React (updated every frame) ──
  fuelLevel: number         // 0.0 – 1.0
  raceScore: number         // points accumulated in Phaser
  distanceTraveled: number  // metres
  gameOver: boolean         // fuel hit 0 or player crashed fatally
  playerLane: number        // 0-4 current lane

  // ── Phaser → React (events; React clears after reading) ──
  onCoinCollected: (() => void) | null
  onNitroCollected: (() => void) | null
  onFuelCollected: (() => void) | null
  onCrash: (() => void) | null
  onCheckpoint: (() => void) | null

  // ── Phaser → React (race end states) ──
  raceFinished: boolean   // player crossed finish line
}

export const raceBridge: RaceBridgeData = {
  gridPosition: 3,
  startDelayMs: 1600,
  playerLevel: 1,
  playerColor: 0xff6b35,
  trackTheme: 'night_city',

  fuelLevel: 1.0,
  raceScore: 0,
  distanceTraveled: 0,
  gameOver: false,
  raceFinished: false,
  playerLane: 2,

  onCoinCollected: null,
  onNitroCollected: null,
  onFuelCollected: null,
  onCrash: null,
  onCheckpoint: null,
}
