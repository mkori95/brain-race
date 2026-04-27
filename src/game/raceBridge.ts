/**
 * Shared mutable object that React writes to and the Phaser scene reads every frame.
 * No events, no subscriptions — Phaser reads directly each update() tick.
 */
export interface RaceBridgeData {
  playerSpeed: number        // 0.0 – 1.0 multiplier
  playerDistance: number     // metres
  isNitro: boolean
  isBraking: boolean
  isStalled: boolean
  aiVehicles: {
    id: string
    distance: number
    speed: number            // 0.0 – 1.0 multiplier
    color: number            // Phaser hex integer e.g. 0x4ecdc4
  }[]
}

export const raceBridge: RaceBridgeData = {
  playerSpeed: 0.5,
  playerDistance: 0,
  isNitro: false,
  isBraking: false,
  isStalled: false,
  aiVehicles: [],
}
