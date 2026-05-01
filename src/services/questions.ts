import { Question, Persona } from '@/types'
import fallbackQuestions from '@/data/fallback-questions.json'
import { getCurrentIdToken } from './auth'

interface FetchQuestionsOptions {
  persona: Persona
  topicOverride?: string | null
  excludeIds?: string[]
}

export const fetchQuestions = async (opts: FetchQuestionsOptions): Promise<{ questions: Question[]; offline: boolean }> => {
  const { persona, topicOverride, excludeIds = [] } = opts

  try {
    const token = await getCurrentIdToken()
    const response = await fetch('/api/questions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ persona, raceTopicOverride: topicOverride, excludeIds }),
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) throw new Error(`API error: ${response.status}`)

    const data = await response.json()
    const questions: Question[] = Array.isArray(data) ? data : data.questions ?? []

    if (questions.length < 10) throw new Error('Too few questions returned')

    return { questions, offline: false }
  } catch (err) {
    console.warn('Question API failed, using fallback:', err)
    return { questions: getOfflineQuestions(persona, excludeIds, topicOverride), offline: true }
  }
}

const getOfflineQuestions = (persona: Persona, excludeIds: string[], topicOverride?: string | null): Question[] => {
  const all = fallbackQuestions as Question[]
  let available = all.filter((q) => !excludeIds.includes(q.id))
  if (available.length < 10) available = all

  // Topic override takes priority — filter strictly by topic keyword
  if (topicOverride) {
    const topic = topicOverride.toLowerCase()
    const matched = available.filter((q) => q.topic.toLowerCase().includes(topic))
    // If enough topic-matching questions exist, use them; otherwise pad with rest
    if (matched.length >= 5) {
      const rest = available.filter((q) => !matched.includes(q))
      return shuffled([...matched, ...rest]).slice(0, 20)
    }
  }

  // No override — weight by persona interests
  const interests = persona.interests.map((i) => i.toLowerCase())
  const matched = available.filter((q) =>
    interests.some((i) => q.topic.toLowerCase().includes(i))
  )
  const rest = available.filter((q) => !matched.includes(q))
  return shuffled([...matched, ...rest]).slice(0, 20)
}

const shuffled = <T>(arr: T[]): T[] => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
