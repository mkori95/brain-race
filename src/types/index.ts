// ─── Persona & User ───────────────────────────────────────────

export type AgeGroup = 'kid' | 'teen' | 'youngAdult' | 'adult' | 'senior'
export type DifficultyPreference = 'easy' | 'mixed' | 'hard'
export type PlayerLevel = 'rookie' | 'amateur' | 'pro' | 'expert' | 'legend'

export interface Persona {
  name: string
  dob: string
  ageGroup: AgeGroup
  gender: string
  roles: string[]
  personality: string[]
  interests: string[]
  difficultyPreference: DifficultyPreference
  onboardingCompleted: boolean
}

export interface PlayerProgress {
  coins: number
  xp: number
  level: PlayerLevel
  vehicles: Record<string, VehicleState>
  selectedVehicle: string
  personalBests: { cars: number; bikes: number; trucks: number }
  dailyChallenge: { lastCompleted: string; streak: number }
  questionHistory: string[]
}

export interface AppUser {
  uid: string
  email: string
  persona: Persona
  progress: PlayerProgress
}

// ─── Vehicles ─────────────────────────────────────────────────

export type VehicleCategory = 'car' | 'bike' | 'truck'
export type AccelerationTier = 'very_slow' | 'slow' | 'medium' | 'fast' | 'very_fast' | 'insane' | 'insane_plus'
export type HandlingTier = 'very_easy' | 'easy' | 'medium' | 'hard' | 'very_hard' | 'extreme'

export interface VehicleDefinition {
  id: string
  name: string
  category: VehicleCategory
  maxSpeedKmh: number
  acceleration: AccelerationTier
  handling: HandlingTier
  coinCost: number
  color: string
  emoji: string
}

export interface VehicleState {
  unlocked: boolean
  engineLevel: number  // 0-5
  tiresLevel: number   // 0-5
  nitroLevel: number   // 0-5
}

// ─── Questions ────────────────────────────────────────────────

export interface Question {
  id: string
  topic: string
  question: string
  options: string[]
  correct: string
  explanation: string
}

export interface WrongAnswer {
  question: Question
  playerAnswer: string
}

// ─── Qualifier ────────────────────────────────────────────────

export type QualiPhase = 'idle' | 'loading' | 'active' | 'result'

export interface QualiAnswer {
  question: Question
  playerAnswer: string | null   // null = timed out
  isCorrect: boolean
  timeSpentMs: number
}

// Grid position → start delay map (ms)
export const GRID_DELAY_MS: Record<number, number> = {
  1: 0,
  2: 800,
  3: 1600,
  4: 2400,
  5: 3200,
}

// AI simulated qualifier scores (correct answers out of 5, by level tier)
export const AI_QUALI_SCORES = [1, 2, 3, 4]  // [Rex, Zara, Bolt, Nova]

// ─── Race ─────────────────────────────────────────────────────

export type RaceStatus = 'idle' | 'preparing' | 'countdown' | 'racing' | 'ended'

export interface RaceResult {
  position: number
  totalVehicles: number
  score: number
  coinsEarned: number
  xpEarned: number
  distanceTraveled: number
  qualiScore: number
  gridPosition: number
  isDaily?: boolean
  newStreak?: number
}

// ─── Store ────────────────────────────────────────────────────

export interface GameState {
  // Auth
  user: AppUser | null
  authLoading: boolean

  // Qualifier
  qualiPhase: QualiPhase
  qualiQuestions: Question[]
  qualiAnswers: QualiAnswer[]
  qualiScore: number        // correct count 0-5
  gridPosition: number      // 1-5 (1 = pole)
  startDelayMs: number      // derived from gridPosition
  raceTopicOverride: string | null

  // Race
  raceStatus: RaceStatus
  raceTimeLeft: number
  raceResult: RaceResult | null
  isOfflineMode: boolean

  // UI
  selectedVehicleId: string
}

export type GameStore = GameState & GameActions

export interface GameActions {
  setUser: (user: AppUser | null) => void
  setAuthLoading: (loading: boolean) => void
  updatePersona: (persona: Persona) => void
  updateProgress: (progress: Partial<PlayerProgress>) => void
  setSelectedVehicle: (vehicleId: string) => void
  setRaceTopicOverride: (topic: string | null) => void

  // Qualifier
  prepareQualifier: () => Promise<void>
  submitQualiAnswer: (answer: string | null, timeSpentMs: number) => void
  finalizeQualifier: () => void

  // Race
  startCountdown: () => void
  startRace: () => void
  tickRace: (deltaMs: number) => void
  endRace: () => void
  resetRace: () => void
}
