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

  // 2. Vite dev proxy → Anthropic (local dev only; proxy defined in vite.config.ts)
  try {
    const questions = await fetchQuestionsFromBrowser('', persona, topicOverride, excludeIds)
    if (questions.length >= 5) return { questions, offline: false }
  } catch (err) {
    console.warn('Anthropic proxy call failed, using fallback:', err)
  }

  // 3. Offline fallback
  return { questions: getOfflineQuestions(persona, excludeIds, topicOverride), offline: true }
}

// ── Direct Anthropic call via Vite dev proxy (no CORS) ──────────
// In local dev, /anthropic-proxy/* is forwarded server-side by vite.config.ts
// In production, /api/questions (Vercel serverless) handles this instead
async function fetchQuestionsFromBrowser(
  _apiKey: string,
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

  // Use same-origin proxy — Vite dev server forwards this to Anthropic server-side
  const response = await fetch('/anthropic-proxy/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
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

// Maps specific topic labels to broader fallback category keywords
const TOPIC_CATEGORY_MAP: Record<string, string[]> = {
  python:                  ['programming'],
  java:                    ['programming'],
  javascript:              ['programming'],
  react:                   ['programming'],
  typescript:              ['programming'],
  docker:                  ['programming'],
  sql:                     ['programming'],
  'ai / machine learning': ['ai', 'programming'],
  'formula 1':             ['sports'],
  'food & cooking':        ['fun & silly'],
  astronomy:               ['science'],
  'movies & tv':           ['fun & silly', 'general knowledge'],
  gaming:                  ['fun & silly'],
}

// ── Offline fallback ─────────────────────────────────────────────
const getOfflineQuestions = (persona: Persona, excludeIds: string[], topicOverride?: string | null): Question[] => {
  const all = fallbackQuestions as Question[]
  let available = all.filter((q) => !excludeIds.includes(q.id))
  if (available.length < 10) available = all

  if (topicOverride) {
    const topic = topicOverride.toLowerCase()

    // 1. Exact topic keyword match
    let matched = available.filter((q) => q.topic.toLowerCase().includes(topic))

    // 2. If not enough, try mapped categories
    if (matched.length < 5) {
      const cats = TOPIC_CATEGORY_MAP[topic] ?? []
      if (cats.length > 0) {
        matched = available.filter((q) =>
          cats.some((cat) => q.topic.toLowerCase().includes(cat))
        )
      }
    }

    if (matched.length >= 5) {
      const rest = available.filter((q) => !matched.includes(q))
      return [...shuffled(matched), ...shuffled(rest)].slice(0, 20)
    }
  }

  // No override / not enough topic matches — weight by persona interests
  const interests = persona.interests.map((i) => i.toLowerCase())
  const matched   = available.filter((q) => interests.some((i) => q.topic.toLowerCase().includes(i)))
  const rest      = available.filter((q) => !matched.includes(q))
  return [...shuffled(matched), ...shuffled(rest)].slice(0, 20)
}

const shuffled = <T>(arr: T[]): T[] => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
