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

  // 1. Try the Vercel serverless API (works in production / vercel dev)
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
    console.warn('Server API failed, trying direct browser call:', err)
  }

  // 2. Browser-side Anthropic call (local dev with VITE_ANTHROPIC_API_KEY)
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined
  if (apiKey) {
    try {
      const questions = await fetchQuestionsFromBrowser(apiKey, persona, topicOverride, excludeIds)
      if (questions.length >= 5) return { questions, offline: false }
    } catch (err) {
      console.warn('Browser Anthropic call failed, using fallback:', err)
    }
  }

  // 3. Offline fallback
  return { questions: getOfflineQuestions(persona, excludeIds, topicOverride), offline: true }
}

// ── Direct browser-side Anthropic call (for local dev) ──────────
async function fetchQuestionsFromBrowser(
  apiKey: string,
  persona: Persona,
  topicOverride: string | null | undefined,
  excludeIds: string[],
): Promise<Question[]> {
  const topicLine = topicOverride
    ? `This race topic focus: ${topicOverride} (make 80% of questions about this topic)`
    : ''

  const prompt = `You are a trivia question curator for a mobile racing game called BrainRace.

Player Profile:
- Name: ${persona.name}
- Age Group: ${persona.ageGroup}
- Roles: ${persona.roles.join(', ') || 'not specified'}
- Interests: ${persona.interests.join(', ') || 'general knowledge'}
- Difficulty Preference: ${persona.difficultyPreference}
${topicLine}

Generate exactly 20 trivia questions personalized for this player.

Rules:
- ${topicOverride ? `80% of questions must be about "${topicOverride}", 20% from adjacent topics` : '60% from their interest topics, 20% adjacent topics, 20% general knowledge'}
- Match language complexity to their age group
- All answers must be factually correct
- No two questions about the exact same fact
- Question text: max 12 words. Each answer option: max 6 words
- Each question must have exactly 4 options
- The correct answer must be one of the 4 options
- Excluded question IDs (do not reuse): ${excludeIds.slice(0, 20).join(', ') || 'none'}

Return a JSON array only — no markdown, no explanation, just the array:
[{"id":"q_<8chars>","topic":"topic name","question":"Question?","options":["A","B","C","D"],"correct":"A","explanation":"Brief explanation."}]`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-allow-browser': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) throw new Error(`Anthropic API ${response.status}`)

  const data = await response.json()
  const raw  = data.content?.[0]?.text ?? ''
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('No JSON array in response')

  const questions = JSON.parse(match[0]) as Question[]
  return questions.filter(
    (q) => q.id && q.topic && q.question && Array.isArray(q.options) && q.options.length === 4 && q.correct
  )
}

// ── Offline fallback ─────────────────────────────────────────────
const getOfflineQuestions = (persona: Persona, excludeIds: string[], topicOverride?: string | null): Question[] => {
  const all = fallbackQuestions as Question[]
  let available = all.filter((q) => !excludeIds.includes(q.id))
  if (available.length < 10) available = all

  // Topic override: filter strictly by keyword first
  if (topicOverride) {
    const topic   = topicOverride.toLowerCase()
    const matched = available.filter((q) => q.topic.toLowerCase().includes(topic))
    if (matched.length >= 5) {
      const rest = available.filter((q) => !matched.includes(q))
      return shuffled([...matched, ...rest]).slice(0, 20)
    }
  }

  // No override / not enough topic matches — weight by persona interests
  const interests = persona.interests.map((i) => i.toLowerCase())
  const matched   = available.filter((q) => interests.some((i) => q.topic.toLowerCase().includes(i)))
  const rest      = available.filter((q) => !matched.includes(q))
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
