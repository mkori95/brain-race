import { create } from 'zustand'
import {
  GameStore,
  AppUser,
  Persona,
  PlayerProgress,
  QualiAnswer,
  RaceResult,
  QualiPhase,
  TrackThemeName,
  AI_QUALI_SCORES,
  GRID_DELAY_MS,
} from '@/types'
import { fetchQuestions } from '@/services/questions'
import { getVehicle } from '@/data/vehicles'
import { raceBridge } from '@/game/raceBridge'
import { addSeenQuestions, saveSelectedVehicle, updateProgress } from '@/services/firestore'
import { getCurrentIdToken } from '@/services/auth'

// ── XP level thresholds ────────────────────────────────────────
export const LEVEL_THRESHOLDS = { rookie: 0, amateur: 500, pro: 1500, expert: 4000, legend: 10000 }
const getLevel = (xp: number): AppUser['progress']['level'] => {
  if (xp >= 10000) return 'legend'
  if (xp >= 4000) return 'expert'
  if (xp >= 1500) return 'pro'
  if (xp >= 500) return 'amateur'
  return 'rookie'
}

const levelToNumber = (level: AppUser['progress']['level']): number =>
  ({ rookie: 1, amateur: 2, pro: 3, expert: 4, legend: 5 }[level] ?? 1)

const RACE_DURATION_S = 90
const QUALI_QUESTION_COUNT = 5

// ── Initial state ──────────────────────────────────────────────
const INITIAL_STATE = {
  user: null as AppUser | null,
  authLoading: true,

  qualiPhase: 'idle' as QualiPhase,
  qualiQuestions: [] as import('@/types').Question[],
  qualiAnswers: [] as QualiAnswer[],
  qualiScore: 0,
  gridPosition: 3,
  startDelayMs: GRID_DELAY_MS[3],
  raceTopicOverride: null as string | null,

  raceStatus: 'idle' as import('@/types').RaceStatus,
  raceTimeLeft: RACE_DURATION_S,
  raceResult: null as RaceResult | null,
  isOfflineMode: false,

  selectedVehicleId: 'city_hatchback',
  trackTheme: 'night_city' as TrackThemeName,
}

// ── Store ──────────────────────────────────────────────────────
const useGameStore = create<GameStore>((set, get) => ({
  ...INITIAL_STATE,

  // ── Auth ──────────────────────────────────────────────────────
  setUser: (user: AppUser | null) => {
    set({ user, selectedVehicleId: user?.progress.selectedVehicle ?? 'city_hatchback' })
  },
  setAuthLoading: (authLoading: boolean) => set({ authLoading }),

  updatePersona: (persona: Persona) => {
    const { user } = get()
    if (!user) return
    set({ user: { ...user, persona } })
  },

  updateProgress: (updates: Partial<PlayerProgress>) => {
    const { user } = get()
    if (!user) return
    set({ user: { ...user, progress: { ...user.progress, ...updates } } })
  },

  setSelectedVehicle: (vehicleId: string) => {
    set({ selectedVehicleId: vehicleId })
    const { user } = get()
    if (user) saveSelectedVehicle(user.uid, vehicleId).catch(console.error)
  },

  setRaceTopicOverride: (topic: string | null) => set({ raceTopicOverride: topic }),
  setTrackTheme: (theme: TrackThemeName) => set({ trackTheme: theme }),

  // ── Qualifier ─────────────────────────────────────────────────

  prepareQualifier: async () => {
    set({ qualiPhase: 'loading', qualiAnswers: [], qualiScore: 0 })
    const { user, raceTopicOverride } = get()
    const persona = user?.persona ?? {
      name: 'Guest', dob: '', ageGroup: 'adult' as const, gender: '',
      roles: [], personality: [], interests: [],
      difficultyPreference: 'mixed' as const, onboardingCompleted: false,
    }
    const { questions, offline } = await fetchQuestions({
      persona,
      topicOverride: raceTopicOverride,
      excludeIds: user?.progress.questionHistory ?? [],
    })
    set({
      qualiQuestions: questions.slice(0, QUALI_QUESTION_COUNT),
      qualiPhase: 'active',
      isOfflineMode: offline,
    })
  },

  submitQualiAnswer: (answer: string | null, timeSpentMs: number) => {
    const { qualiQuestions, qualiAnswers } = get()
    const idx = qualiAnswers.length
    const question = qualiQuestions[idx]
    if (!question) return
    const isCorrect = answer !== null && answer === question.correct
    const newAnswers: QualiAnswer[] = [
      ...qualiAnswers,
      { question, playerAnswer: answer, isCorrect, timeSpentMs },
    ]
    set({ qualiAnswers: newAnswers })
  },

  finalizeQualifier: () => {
    const { qualiAnswers, user } = get()
    const qualiScore = qualiAnswers.filter(a => a.isCorrect).length

    // Compare player score to AI simulated scores to determine grid
    const allScores = [qualiScore, ...AI_QUALI_SCORES]
    const sorted = [...allScores].sort((a, b) => b - a)
    const gridPosition = sorted.indexOf(qualiScore) + 1

    const startDelayMs = GRID_DELAY_MS[gridPosition] ?? GRID_DELAY_MS[5]

    const playerLevel = levelToNumber(user?.progress.level ?? 'rookie')

    // Persist seen question IDs
    if (user) {
      addSeenQuestions(user.uid, qualiAnswers.map(a => a.question.id)).catch(console.error)
    }

    set({ qualiScore, gridPosition, startDelayMs, qualiPhase: 'result' })

    // Pre-configure bridge for race
    raceBridge.gridPosition = gridPosition
    raceBridge.startDelayMs = startDelayMs
    raceBridge.playerLevel = playerLevel
    raceBridge.trackTheme = get().trackTheme
    const vehicleDef = getVehicle(get().selectedVehicleId)
    raceBridge.playerColor = parseInt(vehicleDef.color.replace('#', ''), 16)
  },

  // ── Race ──────────────────────────────────────────────────────

  startCountdown: () => set({ raceStatus: 'countdown' }),

  startRace: () => {
    // Reset bridge runtime state
    raceBridge.fuelLevel = 1.0 - (raceBridge.gridPosition - 1) * 0.05  // P5 = 80% fuel
    raceBridge.raceScore = 0
    raceBridge.distanceTraveled = 0
    raceBridge.gameOver = false
    raceBridge.raceFinished = false
    raceBridge.playerLane = 1
    raceBridge.lives = 3
    raceBridge.ammo  = 10
    raceBridge.onFuelCollected = null
    raceBridge.onCrash = null
    raceBridge.onCheckpoint = null

    set({ raceStatus: 'racing', raceTimeLeft: RACE_DURATION_S, raceResult: null })
  },

  tickRace: (_deltaMs: number) => {
    const { raceStatus } = get()
    if (raceStatus !== 'racing') return
    if (raceBridge.gameOver || raceBridge.raceFinished) {
      get().endRace()
    }
  },

  endRace: () => {
    const { user, selectedVehicleId, gridPosition, qualiScore, raceTopicOverride } = get()
    const score = raceBridge.raceScore
    const distance = raceBridge.distanceTraveled

    const position = Math.max(1, gridPosition)

    // Daily challenge: increment streak if this was a topic-override race
    const todayStr = new Date().toISOString().split('T')[0]
    const yesterdayStr = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0] })()
    const isDaily = raceTopicOverride !== null
    let streakBonus = 0
    let newStreak = user?.progress.dailyChallenge?.streak ?? 0
    if (isDaily && user) {
      const last = user.progress.dailyChallenge?.lastCompleted ?? ''
      if (last !== todayStr) {
        // Only count consecutive days
        newStreak = last === yesterdayStr ? newStreak + 1 : 1
        streakBonus = 300 + Math.min(newStreak - 1, 10) * 20  // base 300 + 20 per day up to day 10
      }
    }

    const coinsEarned = 50 + Math.floor(score / 100) + (position === 1 ? 150 : 0) + streakBonus
    const xpEarned = 50 + (position === 1 ? 200 : 0) + qualiScore * 20 + (isDaily ? 100 : 0)

    const result: RaceResult = {
      position,
      totalVehicles: 5,
      score,
      coinsEarned,
      xpEarned,
      distanceTraveled: distance,
      qualiScore,
      gridPosition,
      isDaily,
      newStreak: isDaily ? newStreak : undefined,
    }

    set({ raceStatus: 'ended', raceResult: result })

    if (user) {
      const newXp = (user.progress.xp ?? 0) + xpEarned
      const newLevel = getLevel(newXp)
      // Persist streak update if daily race
      const progressUpdates: Partial<import('@/types').PlayerProgress> = { xp: newXp, level: newLevel }
      if (isDaily) {
        const last = user.progress.dailyChallenge?.lastCompleted ?? ''
        if (last !== todayStr) {
          progressUpdates.dailyChallenge = { lastCompleted: todayStr, streak: newStreak }
          set({ user: { ...user, progress: { ...user.progress, ...progressUpdates } } })
        }
      }
      updateProgress(user.uid, progressUpdates).catch(console.error)

      getCurrentIdToken().then((token) => {
        if (!token) return
        fetch('/api/coins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ uid: user.uid, position, coinsEarned, xpEarned, vehicleId: selectedVehicleId }),
        }).catch(console.error)
      })

      const vehicleDef = getVehicle(selectedVehicleId)
      const catKey = vehicleDef.category === 'car' ? 'cars' : vehicleDef.category === 'bike' ? 'bikes' : 'trucks'
      if (distance > (user.progress.personalBests[catKey] ?? 0)) {
        updateProgress(user.uid, {
          personalBests: { ...user.progress.personalBests, [catKey]: Math.round(distance) },
        }).catch(console.error)
      }
    }
  },

  resetRace: () => set({
    raceStatus: 'idle',
    raceResult: null,
    raceTimeLeft: RACE_DURATION_S,
    qualiPhase: 'idle',
    qualiAnswers: [],
    qualiScore: 0,
    gridPosition: 3,
    startDelayMs: GRID_DELAY_MS[3],
  }),

  // Abandon mid-race: resets everything without awarding XP/coins/streak
  quitRace: () => {
    raceBridge.gameOver = false
    raceBridge.raceFinished = false
    set({
      raceStatus: 'idle',
      raceResult: null,
      raceTimeLeft: RACE_DURATION_S,
      qualiPhase: 'idle',
      qualiAnswers: [],
      qualiScore: 0,
      gridPosition: 3,
      startDelayMs: GRID_DELAY_MS[3],
    })
  },
}))

const store = { getState: useGameStore.getState, setState: useGameStore.setState }
export default store
export { useGameStore }
