import { create } from 'zustand'
import {
  GameStore,
  AppUser,
  Persona,
  PlayerProgress,
  AIVehicle,
  Question,
  WrongAnswer,
  RaceResult,
  ActiveQuestion,
} from '@/types'
import { fetchQuestions } from '@/services/questions'
import { getVehicle, handlingPenalty, accelerationRecovery, effectiveMaxSpeed } from '@/data/vehicles'
import { raceBridge } from '@/game/raceBridge'
import { addSeenQuestions, saveSelectedVehicle, updateProgress } from '@/services/firestore'
import { getCurrentIdToken } from '@/services/auth'

// ── XP level thresholds ────────────────────────────────────────
const LEVEL_THRESHOLDS = { rookie: 0, amateur: 500, pro: 1500, expert: 4000, legend: 10000 }
const getLevel = (xp: number): AppUser['progress']['level'] => {
  if (xp >= 10000) return 'legend'
  if (xp >= 4000) return 'expert'
  if (xp >= 1500) return 'pro'
  if (xp >= 500) return 'amateur'
  return 'rookie'
}

// ── AI names & configs per difficulty ─────────────────────────
const AI_CONFIGS = [
  { id: 'ai_1', name: 'Rex', speedMultiplier: 0.38, color: '#4ecdc4', vehicleEmoji: '🚗', lane: 1 },
  { id: 'ai_2', name: 'Zara', speedMultiplier: 0.45, color: '#a855f7', vehicleEmoji: '🏎️', lane: 2 },
  { id: 'ai_3', name: 'Bolt', speedMultiplier: 0.52, color: '#22c55e', vehicleEmoji: '🚙', lane: 4 },
  { id: 'ai_4', name: 'Nova', speedMultiplier: 0.58, color: '#ef4444', vehicleEmoji: '🏍️', lane: 5 },
]

const RACE_DURATION_S = 90
const QUESTION_TIME_MS = 8000
const STALL_DURATION_S = 3
const RESULT_FLASH_MS = 1500

// km/h → m/s
const kmhToMs = (kmh: number) => kmh / 3.6

const buildAIVehicles = (): AIVehicle[] =>
  AI_CONFIGS.map((c) => ({ ...c, distance: 0 }))

const useGameStore = create<GameStore>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────
  user: null,
  authLoading: true,
  raceStatus: 'idle',
  currentQuestions: [],
  currentQuestionIndex: 0,
  activeQuestion: null,
  playerSpeed: 0.5,
  playerDistance: 0,
  aiVehicles: buildAIVehicles(),
  raceTimeLeft: RACE_DURATION_S,
  racePoints: 0,
  raceCoins: 0,
  consecutiveWrong: 0,
  answerStreak: 0,
  isStalled: false,
  stallTimeLeft: 0,
  wrongAnswers: [],
  raceResult: null,
  isOfflineMode: false,
  raceTopicOverride: null,
  selectedVehicleId: 'city_hatchback',

  // ── Auth actions ───────────────────────────────────────────
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
    const newProgress = { ...user.progress, ...updates }
    set({ user: { ...user, progress: newProgress } })
  },

  setSelectedVehicle: (vehicleId: string) => {
    set({ selectedVehicleId: vehicleId })
    const { user } = get()
    if (user) saveSelectedVehicle(user.uid, vehicleId).catch(console.error)
  },

  setRaceTopicOverride: (topic: string | null) => set({ raceTopicOverride: topic }),

  // ── Race lifecycle ─────────────────────────────────────────
  prepareRace: async () => {
    const { user, raceTopicOverride } = get()
    set({ raceStatus: 'preparing', raceResult: null })

    const persona = user?.persona ?? {
      name: 'Guest',
      dob: '',
      ageGroup: 'adult' as const,
      gender: '',
      roles: [],
      personality: [],
      interests: [],
      difficultyPreference: 'mixed' as const,
      onboardingCompleted: false,
    }

    const excludeIds = user?.progress.questionHistory ?? []
    const { questions, offline } = await fetchQuestions({
      persona,
      topicOverride: raceTopicOverride,
      excludeIds,
    })

    set({
      currentQuestions: questions,
      currentQuestionIndex: 0,
      isOfflineMode: offline,
    })
  },

  startCountdown: () => set({ raceStatus: 'countdown' }),

  startRace: () => {
    const { currentQuestions } = get()
    const first = currentQuestions[0]
    set({
      raceStatus: 'racing',
      playerSpeed: 0.5,
      playerDistance: 0,
      aiVehicles: buildAIVehicles(),
      raceTimeLeft: RACE_DURATION_S,
      racePoints: 0,
      raceCoins: 0,
      consecutiveWrong: 0,
      answerStreak: 0,
      isStalled: false,
      stallTimeLeft: 0,
      wrongAnswers: [],
      currentQuestionIndex: 0,
      activeQuestion: first
        ? { question: first, phase: 'showing', playerAnswer: null, timeRemainingMs: QUESTION_TIME_MS }
        : null,
    })
    // Sync initial state to Phaser bridge
    raceBridge.playerSpeed = 0.5
    raceBridge.playerDistance = 0
    raceBridge.isNitro = false
    raceBridge.isBraking = false
    raceBridge.isStalled = false
    raceBridge.aiVehicles = buildAIVehicles().map((ai) => ({
      id: ai.id,
      distance: 0,
      speed: ai.speedMultiplier,
      color: parseInt(ai.color.replace('#', ''), 16),
    }))
  },

  // ── Per-tick game logic (called from RaceScreen every 100ms) ──
  tickRace: (deltaMs: number) => {
    const { raceStatus, raceTimeLeft, isStalled, stallTimeLeft, playerSpeed, aiVehicles, selectedVehicleId, user } = get()
    if (raceStatus !== 'racing') return

    const deltaS = deltaMs / 1000
    const newTimeLeft = raceTimeLeft - deltaS

    if (newTimeLeft <= 0) {
      get().endRace()
      return
    }

    // Stall countdown
    let newStalled = isStalled
    let newStallLeft = stallTimeLeft
    if (isStalled) {
      newStallLeft = stallTimeLeft - deltaS
      if (newStallLeft <= 0) {
        newStalled = false
        newStallLeft = 0
      }
    }

    // Speed decay toward base (0.5) when not stalled
    const vehicleDef = getVehicle(selectedVehicleId)
    const engineLevel = user?.progress.vehicles[selectedVehicleId]?.engineLevel ?? 0
    const recovery = accelerationRecovery[vehicleDef.acceleration] ?? 0.02
    const base = 0.5
    let newSpeed = isStalled ? 0 : playerSpeed + (base - playerSpeed) * recovery

    // Clamp
    newSpeed = Math.max(0, Math.min(1, newSpeed))

    // Player distance update
    const maxSpeedMs = kmhToMs(effectiveMaxSpeed(vehicleDef, engineLevel))
    const playerVelocity = newSpeed * maxSpeedMs
    const { playerDistance } = get()
    const newPlayerDist = playerDistance + playerVelocity * deltaS

    // AI distance updates
    const newAI = aiVehicles.map((ai) => {
      const aiMaxSpeedMs = kmhToMs(vehicleDef.maxSpeedKmh) // same vehicle class speed
      const aiVelocity = ai.speedMultiplier * aiMaxSpeedMs
      return { ...ai, distance: ai.distance + aiVelocity * deltaS }
    })

    // Update Phaser bridge
    raceBridge.playerSpeed = newSpeed
    raceBridge.playerDistance = newPlayerDist
    raceBridge.isStalled = newStalled
    raceBridge.aiVehicles = newAI.map((ai) => ({
      id: ai.id,
      distance: ai.distance,
      speed: ai.speedMultiplier,
      color: parseInt(ai.color.replace('#', ''), 16),
    }))

    set({
      playerSpeed: newSpeed,
      playerDistance: newPlayerDist,
      aiVehicles: newAI,
      raceTimeLeft: newTimeLeft,
      isStalled: newStalled,
      stallTimeLeft: newStallLeft,
    })
  },

  // ── Question timer tick (called every 50ms from RaceScreen) ──
  tickQuestion: (deltaMs: number) => {
    const { activeQuestion, raceStatus } = get()
    if (raceStatus !== 'racing' || !activeQuestion) return
    if (activeQuestion.phase !== 'showing') return

    const newTime = activeQuestion.timeRemainingMs - deltaMs
    if (newTime <= 0) {
      // Timeout
      const { playerSpeed, consecutiveWrong, currentQuestionIndex, currentQuestions } = get()
      const newSpeed = Math.max(0.1, playerSpeed - 0.08)
      raceBridge.playerSpeed = newSpeed
      raceBridge.isBraking = true
      setTimeout(() => { raceBridge.isBraking = false }, 500)

      set({
        playerSpeed: newSpeed,
        activeQuestion: { ...activeQuestion, phase: 'timeout', timeRemainingMs: 0 },
        consecutiveWrong: consecutiveWrong + 1,
      })

      setTimeout(() => {
        get()._advanceQuestion(currentQuestionIndex + 1, currentQuestions)
      }, RESULT_FLASH_MS)
    } else {
      set({ activeQuestion: { ...activeQuestion, timeRemainingMs: newTime } })
    }
  },

  answerQuestion: (answer: string) => {
    const { activeQuestion, raceStatus, currentQuestionIndex, currentQuestions } = get()
    if (raceStatus !== 'racing' || !activeQuestion || activeQuestion.phase !== 'showing') return

    const { question } = activeQuestion
    const timeSpentMs = QUESTION_TIME_MS - activeQuestion.timeRemainingMs
    const isCorrect = answer === question.correct
    const isFast = timeSpentMs < 3000
    const {
      playerSpeed, consecutiveWrong, answerStreak, racePoints, selectedVehicleId, user,
    } = get()

    const vehicleDef = getVehicle(selectedVehicleId)
    const tiresLevel = user?.progress.vehicles[selectedVehicleId]?.tiresLevel ?? 0
    const nitroLevel = user?.progress.vehicles[selectedVehicleId]?.nitroLevel ?? 0

    if (isCorrect) {
      const boostBase = isFast ? 0.28 : 0.14
      const nitroBonus = nitroLevel * 0.02
      const newSpeed = Math.min(1, playerSpeed + boostBase + nitroBonus)
      const pointsGain = isFast ? 150 : 100
      const streakBonus = (answerStreak + 1) % 3 === 0 ? 50 : 0
      const newStreak = answerStreak + 1

      raceBridge.playerSpeed = newSpeed
      raceBridge.isNitro = isFast
      if (isFast) setTimeout(() => { raceBridge.isNitro = false }, 1200)

      set({
        playerSpeed: newSpeed,
        consecutiveWrong: 0,
        answerStreak: newStreak,
        racePoints: racePoints + pointsGain + streakBonus,
        activeQuestion: { ...activeQuestion, phase: 'answered_correct', playerAnswer: answer },
      })
    } else {
      const tiresModifier = 1 - tiresLevel * 0.04
      const penaltyBase = handlingPenalty[vehicleDef.handling] ?? 0.18
      const penalty = penaltyBase * tiresModifier
      const newConsecutive = consecutiveWrong + 1
      const shouldStall = newConsecutive >= 3

      let newSpeed = Math.max(0.05, playerSpeed - penalty)
      raceBridge.isBraking = true
      setTimeout(() => { raceBridge.isBraking = false }, 800)

      if (shouldStall) {
        newSpeed = 0
        raceBridge.isStalled = true
        set({
          playerSpeed: 0,
          isStalled: true,
          stallTimeLeft: STALL_DURATION_S,
          consecutiveWrong: 0,
          answerStreak: 0,
          wrongAnswers: [...get().wrongAnswers, { question, playerAnswer: answer }],
          activeQuestion: { ...activeQuestion, phase: 'answered_wrong', playerAnswer: answer },
        })
        setTimeout(() => { raceBridge.isStalled = false }, STALL_DURATION_S * 1000)
      } else {
        set({
          playerSpeed: newSpeed,
          consecutiveWrong: newConsecutive,
          answerStreak: 0,
          wrongAnswers: [...get().wrongAnswers, { question, playerAnswer: answer }],
          activeQuestion: { ...activeQuestion, phase: 'answered_wrong', playerAnswer: answer },
        })
      }
      raceBridge.playerSpeed = newSpeed
    }

    setTimeout(() => {
      get()._advanceQuestion(currentQuestionIndex + 1, currentQuestions)
    }, RESULT_FLASH_MS)
  },

  // Internal — advance to next question
  _advanceQuestion: (nextIndex: number, questions: Question[]) => {
    const next = questions[nextIndex]
    if (!next) {
      set({ activeQuestion: null })
      return
    }
    set({
      currentQuestionIndex: nextIndex,
      activeQuestion: { question: next, phase: 'showing', playerAnswer: null, timeRemainingMs: QUESTION_TIME_MS },
    })
  },

  endRace: () => {
    const { playerDistance, aiVehicles, racePoints, wrongAnswers, currentQuestions, user, selectedVehicleId } = get()

    const allDistances = [
      { id: 'player', distance: playerDistance },
      ...aiVehicles.map((ai) => ({ id: ai.id, distance: ai.distance })),
    ].sort((a, b) => b.distance - a.distance)

    const position = allDistances.findIndex((v) => v.id === 'player') + 1

    const positionPoints = [500, 300, 150, 0, 0][position - 1] ?? 0
    const perfectBonus = wrongAnswers.length === 0 && currentQuestions.length > 0 ? 1000 : 0
    const totalPoints = racePoints + positionPoints + perfectBonus

    const coinsBase = 50
    const positionCoins = position === 1 ? 150 : 0
    const perfectCoins = wrongAnswers.length === 0 ? 200 : 0
    const totalCoins = coinsBase + positionCoins + perfectCoins

    const xpEarned = 50 + (position === 1 ? 200 : 0) + currentQuestions.length * 10

    const topicBreakdown: Record<string, { correct: number; total: number }> = {}
    for (const q of currentQuestions.slice(0, 20)) {
      if (!topicBreakdown[q.topic]) topicBreakdown[q.topic] = { correct: 0, total: 0 }
      topicBreakdown[q.topic].total++
    }
    for (const w of wrongAnswers) {
      if (topicBreakdown[w.question.topic]) {
        // question was answered wrong — correct count stays 0
      }
    }

    const correctAnswers = currentQuestions.length - wrongAnswers.length

    const result: RaceResult = {
      position,
      totalVehicles: 5,
      points: totalPoints,
      coinsEarned: totalCoins,
      xpEarned,
      wrongAnswers,
      totalQuestions: currentQuestions.length,
      correctAnswers,
      playerDistance,
      topicBreakdown,
    }

    set({ raceStatus: 'ended', raceResult: result, activeQuestion: null })

    // Persist progress & coin update via API
    if (user) {
      const newXp = (user.progress.xp ?? 0) + xpEarned
      const newLevel = getLevel(newXp)
      const seenIds = currentQuestions.map((q) => q.id)

      addSeenQuestions(user.uid, seenIds).catch(console.error)
      updateProgress(user.uid, { xp: newXp, level: newLevel }).catch(console.error)

      // Coin update through secure API route
      getCurrentIdToken().then((token) => {
        if (!token) return
        fetch('/api/coins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            uid: user.uid,
            position,
            coinsEarned: totalCoins,
            xpEarned,
            vehicleId: selectedVehicleId,
          }),
        }).catch(console.error)
      })

      const vehicleDef = getVehicle(selectedVehicleId)
      const catKey = vehicleDef.category === 'car' ? 'cars' : vehicleDef.category === 'bike' ? 'bikes' : 'trucks'
      if (playerDistance > (user.progress.personalBests[catKey] ?? 0)) {
        updateProgress(user.uid, {
          personalBests: { ...user.progress.personalBests, [catKey]: playerDistance },
        }).catch(console.error)
      }
    }
  },

  resetRace: () => {
    set({
      raceStatus: 'idle',
      currentQuestions: [],
      currentQuestionIndex: 0,
      activeQuestion: null,
      playerSpeed: 0.5,
      playerDistance: 0,
      aiVehicles: buildAIVehicles(),
      raceTimeLeft: RACE_DURATION_S,
      racePoints: 0,
      raceCoins: 0,
      consecutiveWrong: 0,
      answerStreak: 0,
      isStalled: false,
      stallTimeLeft: 0,
      wrongAnswers: [],
      raceResult: null,
      isOfflineMode: false,
    })
  },

}))

// Attach internal method properly after creation
const store = useGameStore
export default store
export { useGameStore, LEVEL_THRESHOLDS }
