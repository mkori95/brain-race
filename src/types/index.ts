// ─── Persona & User ───────────────────────────────────────────

export type AgeGroup = 'kid' | 'teen' | 'youngAdult' | 'adult' | 'senior'
export type DifficultyPreference = 'easy' | 'mixed' | 'hard'
export type PlayerLevel = 'rookie' | 'amateur' | 'pro' | 'expert' | 'legend'

export interface Persona {
  name: string
  dob: string                    // ISO date string
  ageGroup: AgeGroup
  gender: string                 // optional, empty string if not set
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
  color: string        // hex color for Phaser rendering
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

// ─── Race ─────────────────────────────────────────────────────

export type RaceStatus = 'idle' | 'preparing' | 'countdown' | 'racing' | 'ended'

export interface AIVehicle {
  id: string
  name: string
  speedMultiplier: number   // constant speed throughout race
  distance: number          // meters travelled
  color: string
  vehicleEmoji: string
  lane: number              // 1-5 (player always lane 3)
}

export interface RaceResult {
  position: number
  totalVehicles: number
  points: number
  coinsEarned: number
  xpEarned: number
  wrongAnswers: WrongAnswer[]
  totalQuestions: number
  correctAnswers: number
  playerDistance: number
  topicBreakdown: Record<string, { correct: number; total: number }>
}

export type QuestionPhase = 'showing' | 'answered_correct' | 'answered_wrong' | 'timeout' | 'between'

export interface ActiveQuestion {
  question: Question
  phase: QuestionPhase
  playerAnswer: string | null
  timeRemainingMs: number
}

// ─── Daily Challenge ──────────────────────────────────────────

export interface DailyChallenge {
  date: string       // YYYY-MM-DD
  topic: string
  topicLabel: string
  coinReward: number
}

// ─── Store ────────────────────────────────────────────────────

export interface GameState {
  // Auth
  user: AppUser | null
  authLoading: boolean

  // Race
  raceStatus: RaceStatus
  currentQuestions: Question[]
  currentQuestionIndex: number
  activeQuestion: ActiveQuestion | null
  playerSpeed: number          // 0.0 to 1.0 multiplier
  playerDistance: number       // metres
  aiVehicles: AIVehicle[]
  raceTimeLeft: number         // seconds
  racePoints: number
  raceCoins: number
  consecutiveWrong: number
  answerStreak: number
  isStalled: boolean
  stallTimeLeft: number
  wrongAnswers: WrongAnswer[]
  raceResult: RaceResult | null
  isOfflineMode: boolean
  raceTopicOverride: string | null

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
  prepareRace: () => Promise<void>
  startCountdown: () => void
  startRace: () => void
  tickRace: (deltaMs: number) => void
  tickQuestion: (deltaMs: number) => void
  answerQuestion: (answer: string) => void
  endRace: () => void
  resetRace: () => void
  _advanceQuestion: (nextIndex: number, questions: Question[]) => void
}
