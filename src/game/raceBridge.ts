export interface RaceBridgeData {
  playerSpeed: number        // 0.0 – 1.0 multiplier
  playerDistance: number     // metres
  playerLane: number         // 0-4, controlled by Phaser input
  isNitro: boolean
  isBraking: boolean
  isStalled: boolean
  aiVehicles: {
    id: string
    distance: number
    speed: number
    color: number            // Phaser hex integer e.g. 0x4ecdc4
  }[]
}

export const raceBridge: RaceBridgeData = {
  playerSpeed: 0.5,
  playerDistance: 0,
  playerLane: 2,
  isNitro: false,
  isBraking: false,
  isStalled: false,
  aiVehicles: [],
}
