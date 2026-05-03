import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'
import * as admin from 'firebase-admin'

// ── Firebase Admin init (once) ────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    }),
  })
}

// ── Claude client ─────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = process.env.CLAUDE_MODEL ?? 'claude-haiku-4-5-20251001'

// ── Types ─────────────────────────────────────────────────────
interface Persona {
  name: string
  ageGroup: string
  roles: string[]
  personality: string[]
  interests: string[]
  difficultyPreference: string
}

interface RequestBody {
  persona: Persona
  raceTopicOverride?: string | null
  excludeIds?: string[]
}

// ── Handler ───────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Auth
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (token) {
    try {
      await admin.auth().verifyIdToken(token)
    } catch {
      return res.status(401).json({ error: 'Invalid auth token' })
    }
  }

  const { persona, raceTopicOverride, excludeIds = [] } = req.body as RequestBody

  if (!persona) return res.status(400).json({ error: 'Missing persona' })

  const prompt = raceTopicOverride
    ? `You are a trivia question curator for a racing game called BrainRace.

Generate exactly 20 trivia questions. ALL 20 questions must be about "${raceTopicOverride}" — no exceptions, no other topics.

Rules:
- Every single question must be specifically about ${raceTopicOverride}
- The "topic" field in every question must be exactly "${raceTopicOverride}"
- Match difficulty to: ${persona.difficultyPreference}
- Match language complexity to age group: ${persona.ageGroup}
- All answers must be factually correct
- No two questions about the exact same fact
- Question text: max 12 words. Each answer option: max 6 words
- Each question must have exactly 4 options
- Randomize which position holds the correct answer — do NOT always put it first
- The "correct" field must be the full text of the correct option (not a letter like A/B/C/D)
- Excluded question IDs (do not reuse): ${excludeIds.slice(0, 20).join(', ') || 'none'}

Return a JSON array only — no markdown, no explanation, just the array:
[{"id":"q_<8chars>","topic":"${raceTopicOverride}","question":"Question?","options":["Wrong answer","Also wrong","Correct answer here","Another wrong"],"correct":"Correct answer here","explanation":"Brief explanation."}]`
    : `You are a trivia question curator for a racing game called BrainRace.

Player Profile:
- Name: ${persona.name}
- Age Group: ${persona.ageGroup}
- Roles: ${persona.roles.join(', ') || 'not specified'}
- Interests: ${persona.interests.join(', ') || 'general knowledge'}
- Personality: ${persona.personality.join(', ') || 'curious'}
- Difficulty Preference: ${persona.difficultyPreference}

Generate exactly 20 trivia questions personalized for this player.

Rules:
- 60% from their interest topics, 20% adjacent topics, 10% fun/silly wildcard, 10% general knowledge
- Match language complexity to their age group (kid = very simple, teen = moderate, adult/senior = normal)
- All answers must be factually correct and verifiable
- No two questions should be about the exact same fact
- Question text: max 12 words. Each answer option: max 6 words
- Each question must have exactly 4 options
- Randomize which position holds the correct answer — do NOT always put it first
- The "correct" field must be the full text of the correct option (not a letter like A/B/C/D)
- Excluded question IDs (do not reuse): ${excludeIds.slice(0, 20).join(', ') || 'none'}

Return a JSON array only — no markdown, no explanation, just the array:
[{"id":"q_<8chars>","topic":"topic name","question":"Question?","options":["Wrong answer","Correct answer here","Also wrong","Another wrong"],"correct":"Correct answer here","explanation":"Brief explanation."}]`

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array found in response')

    const questions = JSON.parse(jsonMatch[0])

    if (!Array.isArray(questions) || questions.length < 5) {
      throw new Error('Invalid question array returned')
    }

    // Validate each question has required fields
    const valid = questions.filter(
      (q) =>
        q.id && q.topic && q.question && Array.isArray(q.options) &&
        q.options.length === 4 && q.correct && q.explanation
    )

    return res.status(200).json(valid)
  } catch (err) {
    console.error('Question generation error:', err)
    return res.status(500).json({ error: 'Failed to generate questions' })
  }
}
