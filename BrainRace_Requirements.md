# BrainRace — Final Game Requirements Document

---

## Overview

**BrainRace** is a trivia-powered racing game where answering questions correctly controls your vehicle's speed. Answer fast and correctly → speed up and overtake AI opponents. Answer wrong → slow down and get overtaken.

Built as a browser-first web app with a mobile-ready architecture — the same codebase can be wrapped with Capacitor and published to the App Store / Play Store without any rewrite.

---

## Core Concept

- Single-player race against 4 AI opponents on a scrolling track
- Questions are personalized to the player's age, interests, and skill level
- Questions span every topic imaginable — programming, history, science, cooking, memes, sports, anything
- Race duration: 90 seconds
- Player with the greatest distance at race end wins
- No reflexes required — pure knowledge decides the winner

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | React + Vite + TypeScript | Browser-native, Capacitor-wrappable for iOS/Android |
| Game Engine | Phaser.js | HTML5 canvas/WebGL, battle-tested, works in browser and Capacitor |
| Auth | Firebase Auth (email/password) | Google Sign-In added later with one config change |
| Database | Firebase Firestore | Free tier: 50K reads / 20K writes per day |
| Hosting | Vercel | Free tier, zero-config GitHub deploys, serverless functions included |
| Claude API Proxy | Vercel Serverless Function | API key never in the browser; model is configurable via env var |
| Claude Model | claude-haiku-4-5 (default) | Cheapest and fast enough for trivia; swap model via `CLAUDE_MODEL` env var |
| Mobile (future) | Capacitor | Wraps the Vite build into iOS/Android — no code changes needed |
| State Management | Zustand | Lightweight, no boilerplate |

### Cost Profile
- All infrastructure: **free** (Vercel + Firebase free tiers)
- Claude API: **~$0.001 per race** at Haiku pricing (20 questions ≈ negligible tokens)
- Capacitor: **free**, open source

---

## Project Folder Structure

```
brain-race/
  BrainRace_Requirements.md       ← this file
  app/                            ← React + Vite web app
    src/
      game/                       ← Phaser game scenes
      screens/                    ← React screens (onboarding, garage, etc.)
      components/                 ← Shared UI components
      store/                      ← Zustand state
      services/                   ← Firebase, API calls
      types/                      ← TypeScript types
    public/
      assets/                     ← Sprites, sounds, fonts
    index.html
    vite.config.ts
    package.json
  api/                            ← Vercel serverless functions
    questions.ts                  ← Claude API proxy (question generation)
    coins.ts                      ← Coin increment validation
  .env.example
  vercel.json
  capacitor.config.ts             ← Mobile wrapper config (added when ready)
```

---

## Onboarding Flow (First Launch Only)

Persona is captured **before** login or sign-up. It drives all question personalization. Players can update it anytime from Profile Settings.

### Step 1 — Welcome
- App name, tagline: "Race with your brain"
- "Let's set up your profile" subtext
- "Get Started" button

### Step 2 — Basic Info
- Name (text input)
- Date of Birth (date picker — auto-calculates age group)
- Gender (optional): Male / Female / Non-binary / Prefer not to say

### Step 3 — Who Are You? (multi-select tags)

**Life Stage** (auto-filled from DOB, player can override):
Kid (under 13) · Teenager · Young Adult · Adult · Senior

**Your Role** (pick all that apply):
Developer / Engineer · Student · Teacher · Doctor / Healthcare · Artist / Creative · Gamer · Homemaker · Business / Finance · Retired · Just here for fun

**Your Personality** (pick up to 3):
Curious · Competitive · Casual · Funny / Silly · Serious · Explorer

### Step 4 — Interests (multi-select, grouped)

| Group | Topics |
|---|---|
| **Programming & Tech** | Linux, Git, Python, Java, JavaScript, TypeScript, SQL, Docker, Kubernetes, Networking, Cybersecurity, AI / Machine Learning, Data Structures & Algorithms, Web Development, DevOps, Cloud (AWS / GCP / Azure), Mobile Dev, Open Source |
| **Science** | Physics, Chemistry, Biology, Astronomy, Environment & Climate, Human Body |
| **Arts & Culture** | Movies & TV, Music, Art & Design, Literature & Books, Fashion |
| **Sports** | Football, Cricket, Formula 1, Basketball, Olympics, Tennis, eSports |
| **History** | Ancient History, World Wars, Civilizations, Famous People, Modern History |
| **Geography** | World Capitals, Countries & Flags, Oceans & Mountains, World Records |
| **Fun & Silly** | Riddles, Weird & Wild Facts, Would You Rather, Memes & Pop Culture, Animal Facts |
| **Lifestyle** | Food & Cooking, Travel, Health & Fitness, Parenting, Personal Finance |
| **Academic** | Math & Logic, Language & Grammar, Philosophy, General Knowledge |
| **Gaming** | Video Games, Board Games, Game Trivia, Retro Games |

**"Not fussed — surprise me"** option: skips topic selection, Claude picks a balanced mix.

### Step 5 — Question Style
How do you like your questions?
- Easy — keep it chill
- Mix of easy and medium
- Bring the challenge

### Step 6 — Create Account
- Email + Password sign-up
- Persona is saved to Firestore on account creation
- Returning user? "Log In" link

---

## Persona Data Model (Firestore)

```
users/{userId}/
  persona:
    name: string
    dob: string                     // ISO date
    ageGroup: "kid" | "teen" | "youngAdult" | "adult" | "senior"
    gender: string                  // optional
    roles: string[]                 // ["developer", "gamer"]
    personality: string[]           // ["competitive", "curious"]
    interests: string[]             // ["python", "linux", "formula1", "sillyfacts"]
    difficultyPreference: "easy" | "mixed" | "hard"
    onboardingCompleted: boolean
  coins: number                     // authoritative, written by API only
  xp: number
  level: "rookie" | "amateur" | "pro" | "expert" | "legend"
  vehicles: {
    [vehicleId]: {
      unlocked: boolean
      engineLevel: number           // 0-5
      tiresLevel: number            // 0-5
      nitroLevel: number            // 0-5
    }
  }
  selectedVehicle: string
  personalBests: {
    cars: number
    bikes: number
    trucks: number
  }
  dailyChallenge: {
    lastCompleted: string           // ISO date
    streak: number
  }
  questionHistory: string[]         // question IDs seen, for deduplication
```

---

## Question System

### Philosophy
Questions can be about **anything** — from Linux commands to silly animal facts to Formula 1 lap records to ancient Egyptian history. There is no fixed topic list. Claude curates questions appropriate to the player's persona, age, and chosen interests.

### Pre-fetch Strategy
- **20 questions are fetched before the race begins** via the Vercel API route
- No API calls during the race — zero latency on question display
- Questions are queued locally for the race session
- Used question IDs stored in `questionHistory` in Firestore to prevent repeats across sessions
- Within a single session a `Set` tracks used IDs to prevent repeats

### Difficulty by Age Group

| Age Group | Question Style |
|---|---|
| Kid (< 13) | Easy, short sentences, fun topics, max 8 words per question |
| Teenager | Easy + medium, pop culture, gaming, basic science |
| Young Adult | Medium, broad topic range including tech |
| Adult | Medium + hard, full topic range |
| Senior | Easy + medium, familiar history, general knowledge, simple phrasing |

### Topic Mix per Race

| Slice | Source |
|---|---|
| 60% | Player's chosen interest topics |
| 20% | Adjacent / complementary topics (to introduce variety) |
| 10% | Fun / silly wildcard (always included for engagement regardless of persona) |
| 10% | General knowledge baseline |

### Per-Race Topic Picker

On the race setup screen, player can optionally override the mix for that race:
- "Ask me about [specific topic]" — single topic focus (e.g. Python only, Formula 1 only)
- "Surprise me" — use the persona-based mix above
- "Generic" — broad general knowledge, ignores persona interests

### Question Format
- Multiple choice, 4 options (A / B / C / D)
- Timer: 8 seconds per question
- Question text: max 12 words
- Each option: max 5 words
- Every question includes an `explanation` field shown in post-race review

### Vercel API Route — `/api/questions`

**Request (POST):**
```json
{
  "persona": {
    "name": "Mani",
    "ageGroup": "adult",
    "roles": ["developer"],
    "personality": ["competitive", "curious"],
    "interests": ["python", "linux", "formula1"],
    "difficultyPreference": "mixed"
  },
  "raceTopicOverride": "python",   // optional, from per-race picker
  "excludeIds": ["q_abc", "q_xyz"] // already-seen question IDs
}
```

**Claude Prompt:**
```
You are a trivia question curator for a mobile racing game called BrainRace.

Player Profile:
- Name: {name}
- Age Group: {ageGroup}
- Roles: {roles}
- Interests: {interests}
- Personality: {personality}
- Difficulty Preference: {difficultyPreference}
{raceTopicOverride ? `- This race topic focus: {raceTopicOverride}` : ''}

Generate exactly 20 trivia questions personalized for this player.
Rules:
- 60% from their interest topics, 20% adjacent topics, 10% fun/silly wildcard, 10% general knowledge
- If a race topic override is provided, 80% of questions must be from that topic
- Match language and complexity to their age group
- All answers must be factually correct and verifiable
- No repeated questions (exclude IDs: {excludeIds})
- Question text: max 12 words
- Each answer option: max 5 words
- Include a topic tag per question

Return a JSON array only, no extra text:
[
  {
    "id": "q_<uuid>",
    "topic": "Python",
    "question": "What keyword defines a function in Python?",
    "options": ["def", "function", "fn", "define"],
    "correct": "def",
    "explanation": "In Python, 'def' is the keyword used to declare a function."
  }
]
```

**Environment variable:** `CLAUDE_MODEL=claude-haiku-4-5` (swap to any model by changing one env var)

**Response:** Array of 20 question objects, stored in Zustand for the race.

### Offline Fallback
- ~200 questions bundled in `app/src/data/fallback-questions.json`
- Categorised by topic and age group for basic persona matching
- Used when: no network connection or API unavailable
- Small "Offline Mode" badge shown in race UI

---

## Core Game Loop

1. Player lands on Home Screen (or completes onboarding first time)
2. Player taps "Play" or selects a topic for the race
3. Vehicle selection screen
4. 20 questions pre-fetched in background while player confirms vehicle
5. Race begins: player + 4 AI vehicles on scrolling track
6. Question cards appear every ~8 seconds
7. Player answers (or times out) — speed adjusts immediately
8. Race ends at 90 seconds — final position determined by distance
9. Post-race screen: score, coins, wrong answer review

---

## Speed Mechanics

| Action | Effect |
|---|---|
| Correct answer, fast (< 3 sec) | Big speed boost + nitro animation + sound |
| Correct answer, slow (3–6 sec) | Small speed boost |
| Wrong answer | Speed penalty, brief slowdown |
| No answer (timeout) | Slight slowdown |
| 3 wrong answers in a row | Hard brake, 3-second stall |
| Answer streak × 3 | Bonus speed multiplier for next question |

---

## AI Opponents

- 4 AI opponents per race, each with a name and vehicle
- AI speed is deterministic (pseudo-random, seeded per race) — no real intelligence needed
- AI difficulty scales with player's win count (progression)
- Difficulty levels: Easy / Medium / Hard / Expert
- AI never answers questions — their speed is a pre-calculated curve

---

## Vehicle Garage

### Cars

| Name | Max Speed | Acceleration | Handling | Coin Cost |
|---|---|---|---|---|
| City Hatchback | 120 km/h | Slow | Easy | Free (starter) |
| Street Sedan | 160 km/h | Medium | Medium | 500 |
| Sports Coupe | 200 km/h | Fast | Medium | 1,500 |
| Supercar | 260 km/h | Very Fast | Hard | 4,000 |
| Hypercar | 320 km/h | Insane | Very Hard | 10,000 |

### Bikes

| Name | Max Speed | Acceleration | Handling | Coin Cost |
|---|---|---|---|---|
| City Scooter | 100 km/h | Slow | Easy | 300 |
| Street Naked | 170 km/h | Fast | Medium | 800 |
| Sport Bike | 220 km/h | Very Fast | Hard | 2,000 |
| Superbike | 280 km/h | Insane | Very Hard | 5,000 |
| MotoGP Prototype | 340 km/h | Insane+ | Extreme | 12,000 |

### Trucks

| Name | Max Speed | Acceleration | Handling | Coin Cost |
|---|---|---|---|---|
| Pickup Truck | 90 km/h | Very Slow | Very Easy | 200 |
| Muscle Truck | 130 km/h | Slow | Easy | 600 |
| Race Truck | 170 km/h | Medium | Medium | 1,800 |
| Monster Truck | 200 km/h | Fast | Hard | 4,500 |
| Trophy Truck | 240 km/h | Very Fast | Very Hard | 9,000 |

### Vehicle Stats in Gameplay

- **Max Speed**: Top speed at peak answer streak
- **Acceleration**: Recovery speed after a wrong answer
- **Handling**: How much speed is lost on a wrong answer (Easy = small loss, Extreme = large loss)

### Vehicle Upgrades (Per Vehicle, 3 Upgrades × 5 Levels)

| Upgrade | Effect | Cost per Level |
|---|---|---|
| Engine | +5% max speed per level | 200 / 400 / 800 / 1,500 / 3,000 coins |
| Tires | Improves handling by 1 tier per level | 150 / 300 / 600 / 1,200 / 2,500 coins |
| Nitro | +10% acceleration per level | 180 / 350 / 700 / 1,400 / 2,800 coins |

---

## Points & Coins System

### Points (per race, resets)

| Action | Points |
|---|---|
| Correct answer | +100 |
| Correct answer, fast (< 3 sec) | +150 |
| Finish 1st | +500 |
| Finish 2nd | +300 |
| Finish 3rd | +150 |
| Perfect race (all correct) | +1,000 bonus |
| Answer streak × 3 | +50 bonus |

### XP (cumulative, drives level progression)

- +10 XP per question answered (correct or not)
- +50 XP per race completed
- +200 XP for 1st place finish

### Coins (cumulative, never reset — server authoritative)

| Action | Coins |
|---|---|
| Complete any race | +50 |
| Finish 1st place | +150 |
| Daily challenge completed | +300 |
| Perfect race | +200 bonus |
| Win streak × 3 | +100 bonus |
| Win streak × 5 | +250 bonus |

**Anti-cheat:** Coins are never written by the client directly. The client calls `/api/coins` (Vercel serverless function) with a signed race result. The function validates the result and calls the Firestore Admin SDK to increment coins.

---

## Progression System

| Level | XP Required | Unlocks |
|---|---|---|
| Rookie | 0 | Starter track, Easy AI |
| Amateur | 500 | Track skin 2, Medium AI |
| Pro | 1,500 | Track skin 3, Hard AI |
| Expert | 4,000 | Track skin 4, Expert AI |
| Legend | 10,000 | Gold track skin, max AI difficulty |

- Level label and badge shown on Home Screen
- Personal best tracked per vehicle category (cars / bikes / trucks)

---

## Game Screens

### Screen 0 — Onboarding (first launch only)
- 6-step persona wizard
- Step progress indicator
- "Skip interests" option defaults to General Knowledge mix
- Leads to Sign Up screen

### Screen 1 — Home
- Player name + level badge
- Coins display (server value)
- Play button → goes to Race Setup
- Daily Challenge button (shows today's topic)
- Garage button
- Profile / Settings button

### Screen 2 — Race Setup
- Topic picker: choose specific topic / surprise me / generic
- Difficulty reminder (from persona, adjustable)
- Vehicle preview (currently selected)
- "Change Vehicle" link → Vehicle Selection
- "Start Race" button (triggers question pre-fetch)

### Screen 3 — Vehicle Selection
- Tab bar: Cars / Bikes / Trucks
- Grid of vehicle cards (name, speed stat, locked/unlocked, cost)
- Selected vehicle: full stats panel + upgrade button
- "Confirm" button returns to Race Setup

### Screen 4 — Race
- Phaser.js canvas: side-scrolling track with player + 4 AI vehicles
- Question card overlay (slides in from bottom mid-race)
- 4 answer buttons
- Timer bar (8 sec, shrinks in real time)
- Topic badge on question card ("Python", "Formula 1", "Silly")
- Speed-o-meter
- Position indicator (1st – 5th)
- Points + coins ticker
- Offline Mode badge if using fallback questions

### Screen 5 — Post Race
- Final position banner
- Points earned this race
- Coins earned (pending server confirmation)
- XP progress bar
- Wrong answer review: each wrong question → correct answer → explanation
- "Did You Know?" fun fact from the race
- Buttons: Play Again / Go to Garage / Home

### Screen 6 — Garage
- Tabs: Cars / Bikes / Trucks
- Vehicle card grid (locked vehicles shown greyed with coin cost)
- Buy vehicle button (calls `/api/coins` to deduct)
- Upgrade panel per vehicle (shows current level, cost of next level)

### Screen 7 — Daily Challenge
- Today's featured topic (e.g. "Today: Linux")
- Special 90-second race with topic-locked questions
- Bonus coin reward (+300)
- Resets at midnight UTC
- Streak counter

### Screen 8 — Profile & Settings
- Edit persona (name, interests, difficulty, roles)
- Re-run onboarding
- Mute sounds toggle
- Log Out

---

## Sound Design

| Event | Sound |
|---|---|
| Correct answer | Short positive chime |
| Wrong answer | Buzzer |
| Nitro boost | Engine roar |
| Race countdown | 3–2–1–Go beeps |
| Race finish (win) | Fanfare |
| Race finish (lose) | Short jingle |

- All sounds off by default; toggle in Settings
- Haptics added via Capacitor Haptics plugin when running as a native mobile app

---

## Vercel API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/questions` | POST | Claude question generation proxy |
| `/api/coins` | POST | Validate race result and increment coins |

Both routes require a Firebase ID token in the `Authorization` header. The Vercel function verifies the token using Firebase Admin SDK before processing.

---

## Firebase Free Tier Limits (Spark Plan)

| Resource | Free Limit | Our Usage |
|---|---|---|
| Firestore reads | 50,000 / day | ~10 reads per session |
| Firestore writes | 20,000 / day | ~3 writes per race |
| Auth users | Unlimited | — |
| Hosting | N/A (using Vercel) | — |

Firebase Auth and Firestore are used directly from the browser via the Firebase JS SDK — no Cloud Functions needed, no billing required.

---

## Environment Variables

```
# .env (never commit — add to .gitignore)

# Claude API
ANTHROPIC_API_KEY=your_key_here
CLAUDE_MODEL=claude-haiku-4-5        # swap to claude-sonnet-4-6 or any model

# Firebase (client — safe to expose in browser)
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_APP_ID=your_app_id

# Firebase Admin (server only — Vercel env, never in browser)
FIREBASE_ADMIN_PROJECT_ID=your_project_id
FIREBASE_ADMIN_CLIENT_EMAIL=your_service_account_email
FIREBASE_ADMIN_PRIVATE_KEY=your_private_key
```

---

## Development Priority Order

1. Project scaffolding: Vite + React + TypeScript + Phaser.js + Zustand
2. Firebase setup: Auth (email) + Firestore schema
3. Onboarding flow (persona wizard + sign-up)
4. Vercel API route: `/api/questions` with Claude Haiku
5. Core race screen: Phaser track, moving vehicles, question card overlay
6. Speed mechanic tied to answers
7. Post-race screen: score + wrong answer review
8. Vehicle selection screen
9. Garage screen: buy + upgrade vehicles
10. Vercel API route: `/api/coins` with race result validation
11. Daily challenge screen
12. Progression system (XP + levels)
13. Offline fallback question bank
14. Sound effects
15. Polish: animations, transitions, loading states
16. Capacitor setup (when ready to go mobile)

---

## Future (Not in v1)

- Google Sign-In
- Multiplayer (real-time two-player race)
- Ghost mode (race your own personal best as a ghost opponent)
- Topic leaderboards (who scores highest in Python questions globally)
- Push notifications for daily challenges (mobile only via Capacitor)
- Question rating system (player thumbs up/down on questions)
- Social share: "I finished 1st in a Python race!" card
