# BrainRace — Game Requirements Document
**Last updated: 2026-05-02**

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
Road Fighter Race (fuel-limited, no timer)
  - 4-lane road: 2 oncoming (left) + 2 forward (right) + center divider
  - Shoot oncoming + traffic cars with SPACE bar
  - Ram cop cars for bonus points
  - 3 lives (each = 3 spins → respawn; 3 respawns = game over)
  - Collect fuel pickups + hit checkpoints for +25% fuel
  - Race ends: finish line (dist 20000) OR fuel = 0
        ↓
Post-Race: Score, XP, Coins, Personal Bests
```

**Key design principle:** Brain and reflex are fully separated. The quiz is pure knowledge. The race is pure driving.

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
| Claude Model | `claude-haiku-4-5-20251001` default | Swap via `CLAUDE_MODEL` env var |
| State | Zustand | `src/store/useGameStore.ts` |
| Mobile (future) | Capacitor | Wraps Vite build for iOS/Android |

### Cost Profile
- All infrastructure: **free** (Vercel + Firebase free tiers)
- Claude API: **~$0.001 per race** at Haiku pricing
- Capacitor: **free**, open source

---

## Implementation Status (as of 2026-04-30)

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

### ✅ Phase 2 — Qualifier + Race Scaffold (complete)
- Pre-race Qualifier: 5 questions, 15s timer, circular SVG progress arc
- Grid position determined by score vs AI scores `[1, 2, 3, 4]`
- `GRID_DELAY_MS = { 1:0, 2:800, 3:1600, 4:2400, 5:3200 }`
- P5 starts with 80% fuel as additional penalty
- Basic Road Fighter race scene (`src/game/RaceScene.ts`)
- `raceBridge` pattern for Phaser ↔ React state sharing
- QualiScreen, RaceScreen (HUD), PostRaceScreen all built

### ✅ Phase 3 — Road Fighter Redesign + Visual Overhaul + Mechanics (complete as of 2026-05-02)
Full redesign — see detail section below. Latest commits also fixed: road-static-when-stopped, two-gear driving (Z/↑ + X), typed traffic AI, topic question offline expansion.

### 📋 Phase 4 — Polish & Gameplay Depth (planned)
### 📋 Phase 5 — Multiplayer (planned)
See below.

---

## Phase 3 — Road Fighter Redesign + Visual Overhaul + Mechanics (✅ Complete as of 2026-05-02)

### Goal
Full redesign of the race scene to match Road Fighter arcade feel: 4-lane road with center divider, battle car player, two-gear driving system, typed traffic AI, shooting mechanics, spin/failure life system, road surface labels, and curve illusion.

---

### 3A — Road & Environment ✅
- **4-lane gray asphalt road** (`ROAD_W=180`, `LANE_W=45`): left 2 lanes = oncoming traffic; right 2 lanes = forward traffic + player
- **Center divider:** solid double yellow line separating oncoming from forward lanes
- **Lane markings:** dashed white lines within each side; red/white animated curb stripes on both edges
- **Road curve illusion (discrete sections):** distance-based sections — straight for 1200–2800 distance units, then a left or right curve for 700–1600 units; `curve` value interpolates between sections. Road holds perfectly straight when player is stationary (`ps <= 5` → curve lerps to 0).
- **Scanline perspective:** each 4px horizontal strip shifts road center based on `curve × (PLAYER_Y - sy)` giving Road Fighter depth illusion
- **Track themes** (3, player-selectable): Night City / Desert Highway / Mountain Pass — changes sky, shoulder, and background scenery
- **Road markers painted on surface:** START (blue oval, pd=0), CHECKPOINT (green oval, pd=5000/10000/15000), FINISH (gold oval, pd=20000) — colored stripe + oval + label text, scrolling with `screenY = PLAYER_Y - (dist - pd)`
- **Scenery:** railroad crossties + rails + crowd spectators on left shoulder; tree clusters + night lamp posts on right shoulder; scrolling parallax at different speeds
- **Right HUD panel (130px):** RANK/TIME/CARS boxes (blue headers, gold border), RPM gradient bar (blue→cyan), FUEL gradient bar (brown→orange), low-fuel red flash, speed in km/h, distance in km, ♥ lives
- **Gold progress bar** at top showing segment progress (last checkpoint → next)

### 3B — Player Battle Car ✅
- **Armored body** (battle red `#cc1111`), side armor plates, roof turret, exhaust smoke at high speed
- **Spin animation** on crash: `spinAngle` accumulates, damped over time
- **Invincibility flashing** after crash (alternates visible/invisible every 110ms)
- **Continuous lateral drag** at `LATERAL_SPD=220 px/s` (hold `← →`)
- **Two-gear system:** `↑ / Z` = low gear (maintains ~200 km/h, `LOW_GEAR_TOP=420`); `X` = high gear (accelerates to ~400 km/h, `HIGH_GEAR_TOP=850`, `2.2×` fuel burn); release = coast; `↓` = brake
- **Controls hint** shown at race start, hides when player starts moving

### 3C — Cars & Traffic ✅
- **Typed traffic** (lanes L2/L3, right half): Yellow = straight, Red = blocks player lane, Blue = aggressive random lane changes, Truck = instant life loss + 20% fuel penalty; all face away from player
- **Oncoming cars** (lanes L0/L1, left half): always green (`0x22bb44`), face TOWARD player (flipped drawCar), move DOWN at `scrollSpd + 160`; red warning outline when near player
- **Cop cars** (right half): dark blue with flashing red/blue light bar; RAM = bonus points, no life loss
- **Fuel cars** (lanes L2/L3 only): moving pickup, colliding gives +30% fuel; glowing with pulsing halo
- **Traffic only spawns when `ps >= 50`** — road is empty at standstill
- **All sizes:** `CAR_W=14, CAR_H=24`; player `PL_W=16, PL_H=28`; trucks `CAR_W×1.6, CAR_H×1.5`
- **AI racers removed entirely** — pure single-player

### 3D — Shooting System ✅
- **SPACE bar** fires bullet upward from player center
- **10,000 starting ammo** (`START_AMMO=10000`); HUD shows `∞` when ≥ 9999
- **Wide hit detection:** `LANE_W × 0.55` (~38px) x-tolerance so bullets hit regardless of exact lane alignment
- **Hits all car types except cop** (you ram cops, not shoot them)
- **Explosion particles** (16-particle radial burst) on bullet kill
- **+150 pts** for oncoming kill, **+80 pts** for traffic kill; **+5 ammo** per kill
- **Float text** shows score at kill position

### 3E — Spin / Failure System ✅
- **3 spins per life** (`MAX_SPINS=3`): each crash increments `spinCount`; on 3rd spin → `failureCount++`, `spinCount` resets, respawn with extra invincibility + 30% fuel floor
- **3 failures = game over** (`MAX_FAILURES=3`)
- **`raceBridge.lives`** = `MAX_FAILURES - failureCount` (3→0); React HUD shows ♥ hearts
- **Spin pips** in left HUD strip show current `spinCount` progress
- **Invincibility:** `INVINCE_MS=2500` after each spin; `3500ms` after respawn

### 3F — HUD ✅
**React overlay (RaceScreen.tsx):**
- ✕ quit button, grid position + pole/delay label
- ♥♥♥ lives (grays out on failure)
- Score (gold, center)
- Fuel % (color-coded red/amber/green)
- Ammo count (∞ or number)

**In-canvas HUD (RaceScene.ts):**
- Left mini-map strip: player dot position, checkpoint marks, finish marker
- Right fuel bar: color-coded, updates every frame
- Bottom speed bar: proportion of top speed
- Spin count pips: orange = used, dark = remaining
- Low fuel border: pulsing red frame when fuel < 15%
- Speed lines: at high speed
- Float score texts: rise from kill/pickup positions

### 3G — Question API Cascade ✅
Three-tier fallback so questions always work:
1. **Vercel `/api/questions`** — production + `vercel dev`
2. **Browser direct Anthropic call** — `npm run dev` with `VITE_ANTHROPIC_API_KEY` in `.env`
3. **Offline fallback** — `src/data/fallback-questions.json`; topic override filters by keyword (needs ≥5 matches)

### 3H — Sound ✅
Web Audio API (no audio files): engine hum (tracks speed), fuel pickup glug, crash thud. `stopEngine()` called in RaceScreen useEffect cleanup AND `handleQuit()`.

### raceBridge Updates (Phase 3) ✅
```typescript
// Added:
lives: number   // MAX_FAILURES - failureCount (3→0)
ammo: number    // remaining bullets

// Removed:
onCoinCollected: null  // no coins in new design
onNitroCollected: null // no nitro in new design
```

### Store Updates (Phase 3) ✅
- `tickRace` simplified: only polls `raceBridge.gameOver` / `raceBridge.raceFinished`; no countdown timer
- `startRace` initializes `raceBridge.lives = 3`, `raceBridge.ammo = 10` (overwritten by Phaser `create()`)
- `endRace` unchanged — XP/coins/streak logic preserved

---

## Phase 4 — Polish & Gameplay Depth (📋 Planned)

### Goals
Make the current single-player race feel more complete and replayable before adding multiplayer.

### Items
- [ ] Touch / swipe controls for mobile gameplay (left/right drag, tap to shoot)
- [ ] Additional pickup types: ammo crate (+500 ammo), shield (1 hit block), speed burst (3s boost)
- [ ] More audio variety: bullet fire SFX, explosion SFX, cop siren
- [ ] PostRaceScreen: show distance, shots fired, kill count, accuracy %
- [ ] Replay the race from a different vehicle → compare stats
- [ ] Per-topic leaderboard (daily top scores by topic)
- [ ] Google Sign-In option
- [ ] Level-based difficulty tuning using `raceBridge.playerLevel` — traffic density + spawn intervals per XP tier

---

## Phase 5 — Multiplayer (Firebase Realtime DB)

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
playerLevel: number     // 1-5; drives difficulty (easy/medium/hard)
playerColor: number     // unused in current scene (player is always battle-red)
trackTheme: string      // 'night_city' | 'desert' | 'mountain'

// Phaser → React (updated every frame)
fuelLevel: number       // 0.0–1.0
raceScore: number
distanceTraveled: number
gameOver: boolean
raceFinished: boolean
playerLane: number
lives: number           // MAX_FAILURES - failureCount (3→0)
ammo: number            // remaining bullets

// Event callbacks
onFuelCollected: (() => void) | null
onCrash: (() => void) | null
onCheckpoint: (() => void) | null
```

### Traffic System
| Type | Direction | Relative Speed | Width | Special |
|---|---|---|---|---|
| `yellow` | Same as player | 42% of scroll speed | 1 lane | Drives straight |
| `red` | Same as player | 45% of scroll speed | 1 lane | Moves to block player lane |
| `blue` | Same as player | 38% of scroll speed | 1 lane | Aggressive random lane changes |
| `truck` | Same as player | 28% of scroll speed | 1.6× wide | Instant life loss on hit |
| `fuel_car` | Same as player | 48% of scroll speed | 1 lane | Collect for +30% fuel |
| `incoming` | Head-on | scrollSpd + 160 | 1 lane | Always green, faces toward player |
| `cop` | Same as player | 50% of scroll speed | 1 lane | Ram for bonus pts, can't be shot |

Spawn intervals (per difficulty): easy 5.5s traffic / 9.0s incoming; hard 2.6s traffic / 4.0s incoming.
No traffic spawns until `ps >= 50` (Road Fighter: empty road at standstill).

### Pickup System
| Type | Effect |
|---|---|
| `fuel_car` | +30% fuel on collision |
| Checkpoints (5000/10000/15000) | +25% fuel |

### Speed / Gear System
```
Low gear (Z / ↑):  constant ~200 km/h  (ps ~420)
High gear (X):     accelerates to ~400 km/h  (ps ~850, 2.2× fuel burn)
Coast (no key):    decelerates at 80 px/s²
Brake (↓):         decelerates at 280 px/s²
Lateral (← →):     220 px/s continuous
```

### Crash Severity
| Trigger | Effect |
|---|---|
| Hit yellow / red / blue / incoming | spinCount++; 3 spins → respawn; -10% fuel |
| Hit truck | Instant life loss (skip spin); -20% fuel |
| Ram cop | Bonus points, no life loss |

After spin: 2500ms invincibility frames (car flashes 110ms on/off); 3500ms after respawn.

### Fuel Drain
- Time-based: `(FUEL_BASE + ps × FUEL_SPD) × gearMultiplier × dt`
- Low gear: 1.0× multiplier; high gear: 2.2×; coasting: 0.6×
- Crash penalty: -10% per spin hit; -20% for truck hit
- Grid position P5 starts at 80% fuel (added race pressure)

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
CLAUDE_MODEL=claude-haiku-4-5-20251001

# Optional browser-side key (local dev only — enables live topic questions with npm run dev)
# Without this, offline fallback questions are used (topic coverage is limited)
VITE_ANTHROPIC_API_KEY=your_key

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
