// Shared mutable object between React (write config) and Phaser (write runtime state).
// React writes once at race start. Phaser writes every frame during race.

export interface RaceBridgeData {
  // ── React → Phaser (set before race starts) ──
  gridPosition: number      // 1-5; determines start delay
  startDelayMs: number      // ms player must wait before accelerating
  playerLevel: number       // 1-5; maps to difficulty easy/medium/hard
  playerColor: number       // unused in new scene (player is always battle-red)
  trackTheme: string        // 'night_city' | 'desert' | 'mountain'

  // ── Phaser → React (updated every frame) ──
  fuelLevel: number         // 0.0 – 1.0
  raceScore: number         // points accumulated in Phaser
  distanceTraveled: number  // pixels traveled
  gameOver: boolean         // fuel hit 0 or all lives lost
  playerLane: number        // 0-1 current lane
  lives: number             // remaining lives (3 = full)
  ammo: number              // remaining shoot ammo

  // ── Phaser → React (events; React clears after reading) ──
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
  playerColor: 0xcc1111,
  trackTheme: 'night_city',

  fuelLevel: 1.0,
  raceScore: 0,
  distanceTraveled: 0,
  gameOver: false,
  raceFinished: false,
  playerLane: 1,
  lives: 3,
  ammo: 10,

  onFuelCollected: null,
  onCrash: null,
  onCheckpoint: null,
}
