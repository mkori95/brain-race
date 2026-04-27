import type { VercelRequest, VercelResponse } from '@vercel/node'
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

const db = admin.firestore()

interface RacePayload {
  uid: string
  position: number
  coinsEarned: number
  xpEarned: number
  vehicleId: string
}

interface BuyPayload {
  uid: string
  action: 'buy_vehicle'
  cost: number
  vehicleId: string
}

type RequestBody = RacePayload | BuyPayload

// ── Coin limits per race (anti-cheat caps) ────────────────────
const MAX_COINS_PER_RACE = 500
const MAX_RACE_FREQUENCY_MS = 60_000  // at least 60s between valid race submissions

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Verify Firebase ID token
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Missing auth token' })

  let decodedToken: admin.auth.DecodedIdToken
  try {
    decodedToken = await admin.auth().verifyIdToken(token)
  } catch {
    return res.status(401).json({ error: 'Invalid auth token' })
  }

  const body = req.body as RequestBody

  // Ensure token UID matches request UID
  if (decodedToken.uid !== body.uid) {
    return res.status(403).json({ error: 'UID mismatch' })
  }

  const userRef = db.doc(`users/${body.uid}`)

  // ── Buy vehicle ──────────────────────────────────────────────
  if ('action' in body && body.action === 'buy_vehicle') {
    const cost = body.cost
    if (!cost || cost < 0) return res.status(400).json({ error: 'Invalid cost' })

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef)
      if (!snap.exists) return res.status(404).json({ error: 'User not found' })

      const data = snap.data()!
      const currentCoins: number = data.progress?.coins ?? 0
      if (currentCoins < cost) return res.status(400).json({ error: 'Insufficient coins' })

      tx.update(userRef, { 'progress.coins': admin.firestore.FieldValue.increment(-cost) })
      return res.status(200).json({ newCoins: currentCoins - cost })
    })
  }

  // ── Race result ───────────────────────────────────────────────
  const { position, coinsEarned } = body as RacePayload

  // Validate coin amount is plausible
  if (coinsEarned < 0 || coinsEarned > MAX_COINS_PER_RACE) {
    return res.status(400).json({ error: 'Invalid coin amount' })
  }
  if (position < 1 || position > 5) {
    return res.status(400).json({ error: 'Invalid position' })
  }

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef)
    if (!snap.exists) return res.status(404).json({ error: 'User not found' })

    const data = snap.data()!
    const lastRaceAt: number = data.progress?.lastRaceAt ?? 0
    const now = Date.now()

    if (now - lastRaceAt < MAX_RACE_FREQUENCY_MS) {
      return res.status(429).json({ error: 'Too many race submissions' })
    }

    tx.update(userRef, {
      'progress.coins': admin.firestore.FieldValue.increment(coinsEarned),
      'progress.lastRaceAt': now,
    })

    return res.status(200).json({ coinsAdded: coinsEarned })
  })
}
