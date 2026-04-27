import { VehicleDefinition } from '@/types'

export const VEHICLES: VehicleDefinition[] = [
  // ── Cars ─────────────────────────────────────────────────────
  {
    id: 'city_hatchback',
    name: 'City Hatchback',
    category: 'car',
    maxSpeedKmh: 120,
    acceleration: 'slow',
    handling: 'easy',
    coinCost: 0,
    color: '#4ecdc4',
    emoji: '🚗',
  },
  {
    id: 'street_sedan',
    name: 'Street Sedan',
    category: 'car',
    maxSpeedKmh: 160,
    acceleration: 'medium',
    handling: 'medium',
    coinCost: 500,
    color: '#45b7d1',
    emoji: '🚙',
  },
  {
    id: 'sports_coupe',
    name: 'Sports Coupe',
    category: 'car',
    maxSpeedKmh: 200,
    acceleration: 'fast',
    handling: 'medium',
    coinCost: 1500,
    color: '#f7dc6f',
    emoji: '🏎️',
  },
  {
    id: 'supercar',
    name: 'Supercar',
    category: 'car',
    maxSpeedKmh: 260,
    acceleration: 'very_fast',
    handling: 'hard',
    coinCost: 4000,
    color: '#e74c3c',
    emoji: '🏎️',
  },
  {
    id: 'hypercar',
    name: 'Hypercar',
    category: 'car',
    maxSpeedKmh: 320,
    acceleration: 'insane',
    handling: 'very_hard',
    coinCost: 10000,
    color: '#9b59b6',
    emoji: '🏎️',
  },

  // ── Bikes ────────────────────────────────────────────────────
  {
    id: 'city_scooter',
    name: 'City Scooter',
    category: 'bike',
    maxSpeedKmh: 100,
    acceleration: 'slow',
    handling: 'easy',
    coinCost: 300,
    color: '#2ecc71',
    emoji: '🛵',
  },
  {
    id: 'street_naked',
    name: 'Street Naked',
    category: 'bike',
    maxSpeedKmh: 170,
    acceleration: 'fast',
    handling: 'medium',
    coinCost: 800,
    color: '#1abc9c',
    emoji: '🏍️',
  },
  {
    id: 'sport_bike',
    name: 'Sport Bike',
    category: 'bike',
    maxSpeedKmh: 220,
    acceleration: 'very_fast',
    handling: 'hard',
    coinCost: 2000,
    color: '#3498db',
    emoji: '🏍️',
  },
  {
    id: 'superbike',
    name: 'Superbike',
    category: 'bike',
    maxSpeedKmh: 280,
    acceleration: 'insane',
    handling: 'very_hard',
    coinCost: 5000,
    color: '#e67e22',
    emoji: '🏍️',
  },
  {
    id: 'motogp_prototype',
    name: 'MotoGP Prototype',
    category: 'bike',
    maxSpeedKmh: 340,
    acceleration: 'insane_plus',
    handling: 'extreme',
    coinCost: 12000,
    color: '#ff6b35',
    emoji: '🏍️',
  },

  // ── Trucks ───────────────────────────────────────────────────
  {
    id: 'pickup_truck',
    name: 'Pickup Truck',
    category: 'truck',
    maxSpeedKmh: 90,
    acceleration: 'very_slow',
    handling: 'very_easy',
    coinCost: 200,
    color: '#95a5a6',
    emoji: '🛻',
  },
  {
    id: 'muscle_truck',
    name: 'Muscle Truck',
    category: 'truck',
    maxSpeedKmh: 130,
    acceleration: 'slow',
    handling: 'easy',
    coinCost: 600,
    color: '#7f8c8d',
    emoji: '🚚',
  },
  {
    id: 'race_truck',
    name: 'Race Truck',
    category: 'truck',
    maxSpeedKmh: 170,
    acceleration: 'medium',
    handling: 'medium',
    coinCost: 1800,
    color: '#f39c12',
    emoji: '🚚',
  },
  {
    id: 'monster_truck',
    name: 'Monster Truck',
    category: 'truck',
    maxSpeedKmh: 200,
    acceleration: 'fast',
    handling: 'hard',
    coinCost: 4500,
    color: '#27ae60',
    emoji: '🚛',
  },
  {
    id: 'trophy_truck',
    name: 'Trophy Truck',
    category: 'truck',
    maxSpeedKmh: 240,
    acceleration: 'very_fast',
    handling: 'very_hard',
    coinCost: 9000,
    color: '#d35400',
    emoji: '🚛',
  },
]

export const DEFAULT_VEHICLE_STATE = {
  unlocked: false,
  engineLevel: 0,
  tiresLevel: 0,
  nitroLevel: 0,
}

export const STARTER_VEHICLE_ID = 'city_hatchback'

export const getVehicle = (id: string): VehicleDefinition =>
  VEHICLES.find((v) => v.id === id) ?? VEHICLES[0]

/** Effective max speed in km/h after engine upgrades */
export const effectiveMaxSpeed = (vehicle: VehicleDefinition, engineLevel: number): number =>
  vehicle.maxSpeedKmh * (1 + engineLevel * 0.05)

/** Speed penalty multiplier on wrong answer based on handling tier */
export const handlingPenalty: Record<string, number> = {
  very_easy: 0.05,
  easy: 0.10,
  medium: 0.18,
  hard: 0.28,
  very_hard: 0.38,
  extreme: 0.50,
}

/** Recovery speed multiplier per tick based on acceleration tier */
export const accelerationRecovery: Record<string, number> = {
  very_slow: 0.008,
  slow: 0.014,
  medium: 0.020,
  fast: 0.030,
  very_fast: 0.040,
  insane: 0.055,
  insane_plus: 0.070,
}

export const UPGRADE_COSTS = {
  engine: [200, 400, 800, 1500, 3000],
  tires: [150, 300, 600, 1200, 2500],
  nitro: [180, 350, 700, 1400, 2800],
}
