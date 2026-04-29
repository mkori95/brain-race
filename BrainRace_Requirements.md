# BrainRace — Game Requirements Document
**Last updated: 2026-04-29**

---

## Overview

**BrainRace** is a trivia-powered top-down racing game.

- **Brain phase (Qualifier):** Answer 5 questions before each race. Your score determines your starting grid position and delay — think smarter, start first.
- **Race phase:** Pure reflex driving — Road Fighter style. Dodge traffic, collect pickups, manage your fuel meter. No questions during the race.

Built as a browser-first web app, Capacitor-wrappable for iOS/Android without any code changes.

---

## Core Concept

```
Qualifier Quiz (5 Qs, 15s each)
        ↓
Grid Position 1–5 (better quiz score = pole position, earlier start)
        ↓
90-Second Road Fighter Race
  - Dodge traffic (slow cars, oncoming cars, trucks)
  - Collect pickups (coins, fuel, nitro, oil slicks)
  - Manage draining fuel meter
        ↓
Post-Race: Score, XP, Coins, Personal Bests
```

**Key design principle:** Brain and reflex are fully separated. The quiz is pure knowledge. The race is pure driving. Mixing them hurt both.

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | React + Vite + TypeScript | Browser-native, Capacitor-wrappable |
| Game Engine | Phaser 3 (WebGL) | Top-down scroller, HTML5 canvas |
| Auth | Firebase Auth (email/password) | Google Sign-In later |
| Database | Firebase Firestore | Free Spark plan |
| Realtime (Phase 2) | Firebase Realtime Database | Multiplayer race sync |
| Hosting | Vercel | Free tier, serverless functions |
| Claude API Proxy | Vercel Serverless `/api/questions` | API key never in browser |
| Claude Model | `claude-haiku-4-5` default | Swap via `CLAUDE_MODEL` env var |
| State | Zustand | `src/store/useGameStore.ts` |
| Mobile (future) | Capacitor | Wraps Vite build for iOS/Android |

### Cost Profile
- All infrastructure: **free** (Vercel + Firebase free tiers)
- Claude API: **~$0.001 per race** at Haiku pricing
- Capacitor: **free**, open source

---

## Implementation Status (as of 2026-04-29)

### ✅ Phase 1 — Scaffold (complete)
- Project structure, Vite + React + TypeScript + Phaser 3 + Zustand
- Firebase Auth + Firestore integration (JS SDK)
- Onboarding flow (5-step persona wizard)
- Auth screen (sign up / log in)
- Home screen, Profile screen, Garage screen, Daily Challenge screen
- Vehicle selection (cars, bikes, trucks) with upgrade panel
- Vercel serverless routes (`/api/questions`, `/api/coins`)
- Offline fallback question bank (~200 questions)
- All TypeScript compiling clean

### ✅ Phase 2 — Road Fighter Redesign (complete)
- Pre-race Qualifier: 5 questions, 15s timer, circular SVG progress arc
- Grid position determined by score vs AI scores `[1, 2, 3, 4]`
- `GRID_DELAY_MS = { 1:0, 2:800, 3:1600, 4:2400, 5:3200 }`
- P5 also starts with 80% fuel as additional penalty
- Road Fighter race scene (`src/game/RaceScene.ts`)
- Traffic: `slow` (same-direction), `oncoming` (head-on, yellow), `truck` (2-lane wide)
- Pickups: `coin` (+50 score), `fuel` (+28% fuel), `nitro` (3s speed boost), `oil` (spin crash)
- Fuel meter drains continuously — empty = game over
- Crash physics: spin + invincibility frames + camera shake + spark particles
- Speed ramp: 200→520 px/s over 90s (+25 every 30s)
- `raceBridge` pattern for Phaser ↔ React state sharing
- QualiScreen, RaceScreen (HUD), PostRaceScreen all updated
- Questions pool auto-resets when exhausted (pool < 10 → use all)
- Dev server confirmed working end-to-end in browser

### ✅ Phase 3 — Visual Overhaul (complete as of 2026-04-29)
All 10 items done — see detail section below.

### 📋 Phase 4 — Multiplayer (planned)
See below.

---

## Phase 3 — Visual Overhaul (✅ Complete)

### Goal
Rich, atmospheric visuals that feel polished and fun — while keeping the top-down 2D perspective in Phaser 3.

**Visual reference:** Road Fighter (arcade classic) + Deadly Descent (particle richness, atmospheric environments).

### What Was Delivered

---

### 3A — Environment & Road ✅
- Dark asphalt road with subtle banding; edge white lines
- **Track themes (3, player-selectable in RaceSetupScreen):**
  1. **Night City** — dark navy sky + stars + neon horizon, dark asphalt, cyan lane dashes, red/white curbs, city building silhouettes with glowing windows, lamp posts + urban scenery
  2. **Desert Highway** — warm orange-amber sky with sun disc, sandy tan road, orange curbs, warm yellow dashes, mesa/dune background, cacti + rocks on roadside
  3. **Mountain Pass** — deep purple-blue sky + stars, gray concrete road, lavender dashes, white/silver curbs, snow-capped mountain peaks background, pine trees + snow rocks
- Theme config drives: sky gradient, road color, curb color pair, lane dash color, guardrail tint, background element draw function, near scenery draw function
- Animated red/white (or themed) curb stripes, scrolling guardrail posts + beam with colored glow tint
- `raceBridge.trackTheme` set from store before race; `RaceScene.create()` builds `ThemeConfig` from it

### 3B — Vehicle Art ✅
- **Player car:** headlight projection cones, drop shadow, windshield, hood sheen, rear spoiler, exhaust trail, nitro triple-flame (purple/cyan/white core), crash spin + lateral drift
- **Traffic sedan:** raised cabin, windshield, taillights, side wheels
- **Oncoming racer:** low profile, racing stripe, bright forward headlights with glow halos
- **Truck:** cab + trailer distinction, exhaust stacks, 6-wheel layout
- All vehicles: `CAR_W=20, CAR_H=34` (smaller = better gameplay visibility)
- Hit traffic car is destroyed/spliced immediately on collision

### 3C — Particle Systems ✅
| Event | Effect |
|---|---|
| Player exhaust (continuous) | Grey/blue smoke puffs from rear; nitro = blue flame particles |
| Nitro active | Triple exhaust color: purple / cyan / white core; 3s continuous burst |
| Coin collected | Gold/amber radial burst (10 particles) |
| Fuel collected | Green burst (8 particles) |
| Crash (soft) | Orange spark burst (10 sparks) + speed penalty |
| Crash (hard) | Large orange+red spark burst (20 sparks) + heavy penalty |
| Oil slick | Purple smoke puffs (8 large slow particles) |
| Score float | "+50", "FUEL!", "NITRO!" floating text rising from pickup position |

### 3D — Screen & Camera Effects ✅
| Trigger | Effect |
|---|---|
| Any crash | Camera shake (400ms soft, ~900ms hard) |
| Hard crash | Camera flash (orange-red tint) |
| Nitro active | Cyan glow vignette on all 4 screen edges |
| Speed > 340 px/s | Radial speed lines (20 streaks, opacity + length tied to speed) |
| Fuel < 15% | Pulsing red border around full screen |
| Checkpoint hit | Green camera flash + "+CHECKPOINT +10s" notification |
| Finish line crossed | White camera flash + "🏁 FINISH!" notification |
| Qualifier P1 | Confetti shower (36 pieces, random colors + sizes) |

### 3E — HUD ✅
- **Top strip (React overlay):** ✕ quit button, P{n}·delay label, centered countdown timer (red + pulse when ≤15s), score, checkpoint count badge
- **In-canvas HUD:**
  - Segmented fuel gauge (10 segments, color-coded green→yellow→red)
  - Speedometer text box (km/h, positioned right of fuel bar)
  - Nitro bar (under speed box, shown when nitro active)
  - Mini-map (14×110px top-right, player dot + 4 AI dots + checkpoint marks)
  - Pickup notification badge (slides up from top-center, fades after 1.2–2.2s)
  - Score float text at pickup position

### 3F — Qualifier Screen Polish ✅
- Circular SVG countdown timer (r=36, color transitions green→yellow→red)
- Staggered answer card slide-in animations
- Correct answer: green background + `scorePop` bounce + green key badge
- Wrong answer: red background + `shake` animation + red key badge
- Timeout: correct answer highlighted with arrow indicator
- Results page: confetti on P1, grid position emoji + color, question breakdown cards
- Back button ("← Home") in question header and results page

### 3G — Sound Design ✅
All sounds implemented in `src/game/audioEngine.ts` via Web Audio API (no audio files):
| Event | Sound |
|---|---|
| Engine (continuous) | Oscillator hum, frequency tracks speed |
| Coin | Bright ping (880Hz) |
| Fuel | Lower "glug" tone |
| Nitro | Rising engine roar spike |
| Crash (soft) | Low thud burst |
| Crash (hard) | Harsher low-frequency hit |
| Oil skid | Descending skid tone |

Audio lifecycle: lazy-init on first user gesture; `stopEngine()` called explicitly in `RaceScreen` useEffect cleanup AND `handleQuit()` — not just via Phaser lifecycle — to guarantee silence on all exit paths.

### Phase 3 Additional Fixes Delivered
- **Coin pickup collision fix:** `drawPickup` draws at local `cy=0`; `g.y = item.y` already positions in world space. Previous double-positioning placed visuals off-screen.
- **Qualifier deferred-answer pattern:** `pendingRef` stores answer locally; Zustand `submitQualiAnswer` deferred 900ms to allow animation to run against the correct question index.
- **`quitRace()` store action:** resets state without awarding XP/coins/streak. Quit dialog in `RaceScreen` with "No XP, coins, or streak will be saved" message.
- **Back buttons:** on QualiScreen active question + results page; navigates to `/home` and resets race state.
- **Checkpoints:** 4 checkpoints at distance 350/750/1200/1800 units (+10s each); finish line at 2500. Neon green lines scroll toward player (1 game unit = 20 screen pixels). Finish line = checkerboard pattern.
- **Mini-map:** top-right 14×110px panel; player dot (theme color), 4 simulated AI dots, checkpoint markers.

---

## Phase 4 — Multiplayer (Firebase Realtime DB)

### Design
- Up to 4 players race simultaneously on the same Road Fighter track
- Each player does their own qualifier first (same 5 questions fetched per session)
- Race is synchronized — all players start at the same UTC timestamp
- Each player drives independently (their own traffic, their own pickups)
- Ghost overlays: other players' cars visible on your screen as semi-transparent outlines
- Position calculated by distance — all distances synced to Realtime DB every 500ms

### Firebase Realtime DB Schema
```
races/{raceId}/
  startAt: number (UTC ms)
  players/{uid}/
    displayName: string
    vehicleId: string
    distance: number (updated ~2/s)
    fuel: number
    score: number
    finished: boolean
    gridPosition: number
```

### Implementation Notes
- Room creation: first player creates raceId, shares link/code
- All players must complete qualifier before host can start race
- Race start is locked to `startAt` timestamp (all clients count down to same moment)
- Ghost car positions interpolated client-side from DB updates
- Position leaderboard shown live on HUD during race

---

## Qualifier System (Detail)

### Flow
1. Player lands on QualiScreen (navigated from RaceSetup or DailyChallenge)
2. 5 questions fetched via `fetchQuestions()` — personalized or topic-locked
3. 15s per question; timer shown as shrinking bar (Phase 3: circular arc)
4. No answer in 15s → `null` recorded (counted as wrong)
5. After Q5, `finalizeQualifier()` runs:
   - Compare player score (0-5) vs `AI_QUALI_SCORES = [1, 2, 3, 4]`
   - All scores sorted descending → player rank = `gridPosition`
   - `GRID_DELAY_MS = { 1:0, 2:800, 3:1600, 4:2400, 5:3200 }`
   - P5 additional penalty: starts race with 80% fuel
6. Result screen shows grid position + question breakdown
7. "🚦 Start Race" navigates to `/race` (triggers Phaser scene with configured bridge)

### AI Grid Scores
| AI Name | Score |
|---|---|
| Rex | 1/5 |
| Zara | 2/5 |
| Bolt | 3/5 |
| Nova | 4/5 |

Scoring 5/5 → P1 (no delay). Scoring 0/5 → P5 (3.2s delay + 80% fuel).

---

## Race Mechanics (Detail)

### raceBridge Pattern
`src/game/raceBridge.ts` — shared mutable singleton

```typescript
// React → Phaser (set before race starts)
gridPosition: number
startDelayMs: number
playerLevel: number     // affects traffic density (Phase 3)
playerColor: number     // hex int for player car color

// Phaser → React (updated every frame)
fuelLevel: number       // 0.0–1.0
raceScore: number
distanceTraveled: number
gameOver: boolean
playerLane: number

// Event callbacks (React sets before race, Phaser fires)
onCoinCollected: (() => void) | null
onNitroCollected: (() => void) | null
onFuelCollected: (() => void) | null
onCrash: (() => void) | null
```

### Traffic System
| Type | Direction | Relative Speed | Width | Color |
|---|---|---|---|---|
| `slow` | Same as player | 45% of road speed | 1 lane | Earth tones |
| `oncoming` | Head-on | 160% of road speed | 1 lane | Bright yellow |
| `truck` | Same as player | 35% of road speed | 2 lanes | Dark grey |

Spawn interval shrinks from 2000ms → 900ms as game speed increases.

### Pickup System
| Type | Effect | Rarity |
|---|---|---|
| `coin` | +50 score | Common |
| `fuel` | +28% fuel bar | Common |
| `nitro` | 3s speed boost | Uncommon |
| `oil` | Spin crash (same as soft crash) | Uncommon |

### Speed Ramp
```
BASE_SPEED = 200 px/s
MAX_SPEED  = 520 px/s
Every 30s: +25 px/s
```

### Crash Severity
| Severity | Trigger | Spin Duration | Speed Penalty |
|---|---|---|---|
| Soft | Glancing hit, oil slick | 500ms | 60% of CRASH_PENALTY |
| Hard | Direct collision with traffic | 1000ms | Full CRASH_PENALTY (180) |

After spin: 500ms invincibility frames (car flashes).

### Fuel Drain
- Drains at a rate tuned so ~80s of full-throttle driving depletes tank
- Nitro boost drains fuel 2× faster during 3s boost
- Grid position P5 starts at 80% fuel (added race pressure)
- Fuel pickup: +28% instant refill

### Level-Based Difficulty (bridge.playerLevel — TODO in Phase 3)
| Level | Traffic Density | Speed Ceiling |
|---|---|---|
| Rookie | Sparse | 350 px/s |
| Amateur | Normal | 420 px/s |
| Pro | Dense | 480 px/s |
| Expert | Very Dense | 520 px/s |
| Legend | Maximum | 520 px/s + faster trucks |

---

## Onboarding Flow

### Step 1 — Welcome
- "Race with your brain" tagline, "Get Started" button

### Step 2 — Basic Info
- Name (text), Date of Birth (auto-calculates age group), Gender (optional)

### Step 3 — Who Are You?
- Life Stage (auto from DOB, overrideable)
- Role (multi-select): Developer, Student, Teacher, Doctor, Artist, Gamer, Business, Retired, Fun
- Personality (pick up to 3): Curious, Competitive, Casual, Funny, Serious, Explorer

### Step 4 — Interests
| Group | Topics |
|---|---|
| Programming & Tech | Linux, Python, JavaScript, TypeScript, SQL, Docker, Networking, Cybersecurity, AI/ML, DSA, DevOps, Cloud |
| Science | Physics, Chemistry, Biology, Astronomy, Environment |
| Arts & Culture | Movies & TV, Music, Art, Literature, Fashion |
| Sports | Football, Cricket, Formula 1, Basketball, Olympics, Tennis, eSports |
| History | Ancient History, World Wars, Civilizations, Famous People |
| Geography | World Capitals, Countries, Flags, Mountains |
| Fun & Silly | Riddles, Weird Facts, Would You Rather, Memes, Animal Facts |
| Lifestyle | Food, Travel, Health, Finance |
| Academic | Math, Logic, Language, Philosophy |
| Gaming | Video Games, Board Games, Retro Games |

"Not fussed — surprise me" option: Claude picks a balanced mix.

### Step 5 — Question Style
Easy / Mixed / Challenge

### Step 6 — Create Account
- Email + Password sign-up
- Persona saved to Firestore on account creation

---

## Question System

### Pre-Race Fetch (Qualifier)
- 5 questions fetched per qualifier run
- Personalized via persona, excludes `questionHistory`
- Pool auto-resets when exhausted (available < 10 → use all)
- Topic can be overridden from RaceSetup or DailyChallenge

### Vercel API Route — `/api/questions`

**Claude Prompt:**
```
You are a trivia question curator for a mobile racing game called BrainRace.

Player Profile:
- Name: {name}
- Age Group: {ageGroup}
- Roles: {roles}
- Interests: {interests}
- Difficulty: {difficultyPreference}
{topicOverride ? `- This race topic: {topicOverride}` : ''}

Generate exactly 5 trivia questions personalized for this player.
Rules:
- 60% interest topics, 20% adjacent, 10% fun/silly, 10% general knowledge
- If topic override: 80% from that topic
- All answers factually correct
- Question text: max 12 words. Each option: max 5 words.
- Exclude IDs: {excludeIds}

Return JSON array only:
[{
  "id": "q_<uuid>",
  "topic": "Python",
  "question": "What keyword defines a function in Python?",
  "options": ["def","function","fn","define"],
  "correct": "def",
  "explanation": "In Python, 'def' declares a function."
}]
```

### Offline Fallback
~200 questions in `src/data/fallback-questions.json`, categorised by topic and age group.
Used when: no network or API unavailable. "Offline Mode" badge shown in race UI.

---

## Vehicle Garage

### Cars
| Name | Max Speed | Handling | Coin Cost |
|---|---|---|---|
| City Hatchback | 120 km/h | Easy | Free (starter) |
| Street Sedan | 160 km/h | Medium | 500 |
| Sports Coupe | 200 km/h | Medium | 1,500 |
| Supercar | 260 km/h | Hard | 4,000 |
| Hypercar | 320 km/h | Very Hard | 10,000 |

### Bikes
| Name | Max Speed | Handling | Coin Cost |
|---|---|---|---|
| City Scooter | 100 km/h | Easy | 300 |
| Street Naked | 170 km/h | Medium | 800 |
| Sport Bike | 220 km/h | Hard | 2,000 |
| Superbike | 280 km/h | Very Hard | 5,000 |
| MotoGP Prototype | 340 km/h | Extreme | 12,000 |

### Trucks
| Name | Max Speed | Handling | Coin Cost |
|---|---|---|---|
| Pickup Truck | 90 km/h | Very Easy | 200 |
| Muscle Truck | 130 km/h | Easy | 600 |
| Race Truck | 170 km/h | Medium | 1,800 |
| Monster Truck | 200 km/h | Hard | 4,500 |
| Trophy Truck | 240 km/h | Very Hard | 9,000 |

### Vehicle Upgrades (3 types × 5 levels)
| Upgrade | Effect | Cost/Level |
|---|---|---|
| Engine | +5% max in-game speed | 200/400/800/1500/3000 |
| Tires | +1 handling tier | 150/300/600/1200/2500 |
| Nitro | +10% boost duration | 180/350/700/1400/2800 |

---

## Points, XP & Coins

### Race Score (per race, resets)
| Action | Points |
|---|---|
| Coin pickup | +50 |
| Qualifier bonus (each correct) | +100 × qualiScore |
| Finish 1st | +500 |
| Finish 2nd | +250 |
| Finish 3rd | +100 |
| Perfect qualifier (5/5) | +500 bonus |

### XP (cumulative)
- +50 XP per race completed
- +200 XP for 1st place
- +20 XP per correct qualifier answer

### Coins (cumulative, server-authoritative)
| Action | Coins |
|---|---|
| Complete any race | +50 |
| Finish 1st | +150 |
| Daily challenge completed | +300 |
| Perfect qualifier | +100 bonus |

---

## Progression System

| Level | XP | Unlocks |
|---|---|---|
| Rookie | 0 | Default track, sparse traffic |
| Amateur | 500 | Track skin 2, normal traffic |
| Pro | 1,500 | Track skin 3, dense traffic |
| Expert | 4,000 | Track skin 4, heavy traffic |
| Legend | 10,000 | Gold track, max traffic + faster trucks |

---

## Screen Map

| Route | Screen | Status |
|---|---|---|
| `/onboarding` | 6-step persona wizard | ✅ Built |
| `/auth` | Sign up / Log in | ✅ Built |
| `/home` | Dashboard, play button | ✅ Built |
| `/race-setup` | Topic picker, vehicle preview | ✅ Built |
| `/vehicles` | Garage vehicle selection | ✅ Built |
| `/qualify` | 5-question qualifier quiz | ✅ Built |
| `/race` | Road Fighter Phaser scene + React HUD | ✅ Built |
| `/post-race` | Score, XP, coins results | ✅ Built |
| `/garage` | Buy + upgrade vehicles | ✅ Built |
| `/daily` | Daily challenge | ✅ Built |
| `/profile` | Edit persona, settings | ✅ Built |

---

## Environment Variables

```bash
# Claude API (Vercel only — never in browser)
ANTHROPIC_API_KEY=your_key
CLAUDE_MODEL=claude-haiku-4-5

# Firebase Client (safe for browser — VITE_ prefix)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_APP_ID=...

# Firebase Admin (Vercel only — for /api/coins validation)
FIREBASE_ADMIN_PROJECT_ID=...
FIREBASE_ADMIN_CLIENT_EMAIL=...
FIREBASE_ADMIN_PRIVATE_KEY=...
```

---

## Worktree Path (CRITICAL)

All source file edits must go to the **worktree**, not the main project dir:

```
✅ /brain-race/.claude/worktrees/dreamy-heisenberg-012535/src/...
❌ /brain-race/src/...
```

Git branch: `claude/dreamy-heisenberg-012535`

---

## Future (Not in v1)

- Google Sign-In
- Ghost mode (race your own personal best)
- Topic leaderboards (who scores highest in Python globally)
- Push notifications for daily challenges (Capacitor)
- Question rating system (thumbs up/down)
- Social share card: "I finished 1st in a Python race!"
- Capacitor build for iOS/Android App Store
