# BrainRace — Game Requirements Document
**Last updated: 2026-04-27**

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

## Implementation Status (as of 2026-04-27)

### ✅ Phase 1 — Scaffold (complete)
- Project structure, Vite + React + TypeScript + Phaser 3 + Zustand
- Firebase Auth + Firestore integration (JS SDK)
- Onboarding flow (6-step persona wizard)
- Auth screen (sign up / log in)
- Home screen, Profile screen, Garage screen, Daily Challenge screen
- Vehicle selection (cars, bikes, trucks) with upgrade panel
- Vercel serverless routes (`/api/questions`, `/api/coins`)
- Offline fallback question bank (~200 questions)
- All TypeScript compiling clean

### ✅ Phase 2 — Road Fighter Redesign (complete)
- Pre-race Qualifier: 5 questions, 15s timer, progress dots
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

### ⏳ Phase 3 — Visual Overhaul (NEXT — this doc section)
See below.

### 📋 Phase 4 — Multiplayer (planned)
See below.

---

## Phase 3 — Visual Overhaul (Deadly Descent–Inspired)

### Goal
The current visuals are functional but basic (flat-colored rectangles for cars, plain grey road, minimal effects). The target is a visually exciting, atmospheric game that feels polished and fun — while keeping the top-down 2D perspective in Phaser 3.

**Visual reference:** [Deadly Descent on CrazyGames](https://www.crazygames.com/game/deadly-descent-bzs)
- Key inspiration: rich particle effects, dynamic destruction feedback, atmospheric environments, detailed vehicles with damage states, intense visual feedback on collisions

Since Deadly Descent is 3D and we're 2D, we achieve equivalent richness through: layered parallax backgrounds, detailed vector-drawn car art, particle systems, neon/glow aesthetic, screen effects, and animated HUD.

---

### 3A — Environment & Road

**Current state:** Plain gray rectangle road, no background, basic white lane lines.

**Target:**

#### Road
- Dark asphalt texture (programmatically drawn with noise/grain) — charcoal with slight blue tint
- Lane markings: glowing neon-blue dashes (animated, scrolling downward)
- Road edges: concrete barrier / guardrail drawn on both sides (animated scroll)
- Road shoulder: dirt/grass strip with color variation

#### Parallax Background Layers (3 layers, different scroll speeds)
- **Layer 1 (slowest, 20% road speed):** Sky gradient — deep navy-to-purple night sky with subtle stars
- **Layer 2 (40% road speed):** Distant cityscape silhouette OR mountain ridgeline (varies by track theme)
- **Layer 3 (70% road speed):** Roadside elements — streetlights with glow halos, billboard frames, palm trees, concrete pillars

#### Track Themes (3 total, rotate by race or player selects)
1. **Night City** — neon city skyline, orange streetlights, wet road reflection
2. **Desert Highway** — sunset orange sky, sand dunes, cacti, dry cracked road
3. **Mountain Pass** — twilight purple sky, pine tree silhouettes, snow-capped peaks

#### Road Surface Effects
- Tire skid marks: drawn at crash/oil slip points, fade over 3s
- Speed distortion: at high speed (>400px/s), subtle vertical stretch/blur on road lines
- Wet road effect (Night City): faint light reflection ripple on asphalt

---

### 3B — Vehicle Art

**Current state:** Colored rectangles with simple window/wheel shapes.

**Target:** Detailed top-down vector-drawn sprites for each vehicle category.

#### Player Car
- Top-down car body drawn in Phaser Graphics with:
  - Distinct hood, roof, trunk shape (not just a rectangle)
  - Side mirrors
  - Windshield highlight (lighter glass rectangle with reflection glint)
  - Headlights: two white glow ovals at front, cast a subtle cone of light on road ahead
  - Taillights: two red glow ovals at rear
  - Underside shadow: dark semi-transparent oval beneath car
- Color: driven by player's selected vehicle color from garage
- Damage state: after a crash, car gets a subtle tilt and spark residue overlay for 1s
- Exhaust particle trail: continuous small grey smoke puffs from rear

#### Traffic Cars
- `slow` type: standard sedan silhouette, earth tones (grey, white, dark red)
- `oncoming` type: bright yellow/lime, aggressive front grille shape, headlights blazing toward player
- `truck` type: larger rectangle with cab + trailer distinction, darker colors, big side mirrors
- All traffic also gets underside shadow, headlights/taillights

#### Bikes (when player selects bike vehicle)
- Narrower profile (1/3 lane width)
- Visible wheel outlines front and rear
- Rider helmet shape on top
- Slightly faster lean animation on lane change

---

### 3C — Particle Systems

**Current state:** Basic spark particles on crash, that's it.

**Target:** Full particle vocabulary:

| Event | Effect |
|---|---|
| Player exhaust (always) | Tiny grey/white smoke puffs from rear, fade over 0.4s |
| Nitro activated | Blue flame burst from rear + trailing blue sparks for 3s |
| Coin collected | Gold particle burst (8–12 particles, fan outward, scale up then fade) |
| Fuel collected | Green particle burst with fuel-drop shape |
| Crash (soft) | Orange spark burst, small debris chips fly outward |
| Crash (hard) | Large orange+red spark explosion, smoke cloud, 3 debris chunks tumble |
| Oil slick hit | Black smoke puff + purple swirl around car during spin |
| Near miss | Brief white flash on car edge + "WHOA!" floating text |
| Fuel critical (<20%) | Red pulse glow around fuel bar, warning particles |
| Traffic car offscreen | Pop/squash animation as it exits bottom |

**Implementation:** Phaser 3 `ParticleEmitter` with per-event config objects. Pre-create all emitters in `RaceScene.create()`, trigger them from the event callbacks already wired into the bridge.

---

### 3D — Screen & Camera Effects

| Trigger | Effect |
|---|---|
| Crash (any) | Camera shake (duration scales with severity: 400ms soft, 900ms hard) |
| Crash (hard) | Camera flash (orange tint, 200ms) |
| Nitro start | Brief screen-edge vignette darkens (speed tunnel effect) |
| Speed ≥ 400px/s | Motion lines: 8–10 vertical white streaks on screen edges, opacity tied to speed |
| Fuel hits 0 | Camera flash (red), then game over |
| Qualifier P1 result | Confetti particle shower on QualiScreen result card |

---

### 3E — HUD Redesign

**Current state:** Text-only HUD at top (`P1 — 74s — 🏆 902`), fuel bar at bottom-left.

**Target:** Styled, animated HUD panels that don't block the road.

#### Top HUD Strip
- Semi-transparent dark bar across full width
- Left: Position badge (`P1` in gold/silver/bronze/grey, colored by position)
- Center: Race timer with clock icon, large font
- Right: Score with animated +N ticker when score increases

#### Fuel Gauge (bottom-left panel)
- Vertical bar with segmented sections (10 segments)
- Color transitions: green → yellow (50%) → orange (30%) → red pulse (20%)
- "FUEL" label above, percentage below
- Warning animation: red glow + "LOW FUEL" text flash when <20%

#### Speed Indicator (bottom-right)
- Small arc speedometer graphic (like a real gauge)
- Needle animates smoothly with current speed
- KM/H label below value

#### Pickup Flash Notifications (center-left, stack upward)
- When pickup collected: small animated badge slides in from left
  - 🪙 +50 (gold) / ⛽ +Fuel (green) / ⚡ NITRO (blue) / 💀 OIL! (red)
  - Fades out after 1.2s

#### Grid Position Indicator (top-left, shown first 10s of race)
- Large animated banner: "P1 — POLE POSITION — NO DELAY 🚀" slides down then fades

---

### 3F — Qualifier Screen Visual Polish

**Current state:** Functional but plain card layout.

**Target:**
- Dark card background with racing stripe accent
- Question timer: circular progress arc (not just a bar), color transitions red as time runs out
- Answer feedback: selected answer card animates (green bounce for correct, red shake for wrong)
- Between questions: brief "car zooming past" transition wipe
- Results card: animated grid position reveal with checkered flag confetti if P1

---

### 3G — Sound Design

| Event | Sound |
|---|---|
| Correct qualifier answer | Short positive chime + "ding" |
| Wrong qualifier answer | Low buzzer |
| Race countdown (3-2-1-GO) | Deep engine rev building to GO horn |
| Coin collected | Bright coin ping |
| Fuel collected | Satisfying "glug" |
| Nitro activated | Engine roar spike |
| Near miss | Doppler whoosh |
| Crash soft | Bump thud |
| Crash hard | Metal crunch + skid |
| Race win | Short victory fanfare |
| Race end (not 1st) | Engine-down wind-off |
| Fuel low | Pulsing warning beep |
| Fuel empty / game over | Engine splutter then silence |

- Sounds off by default; toggle in Settings
- All sounds generated via Phaser's Web Audio API (no external audio files needed initially — use procedural tones or a small sound pack)
- Haptics via Capacitor Haptics when running mobile

---

### Phase 3 Implementation Priority

```
1. Parallax background (sky + far layer + near layer) — biggest visual win
2. Road texture + glowing lane markings + guardrails
3. Player car detailed sprite (proper car shape, headlights, shadow, exhaust trail)
4. Traffic car improved sprites (distinct shapes per type)
5. Particle systems (crash, nitro, coin, fuel)
6. Screen effects (camera shake already done — add motion lines + vignette)
7. HUD redesign (fuel gauge visual, speed arc, score ticker)
8. Qualifier visual polish (circular timer, answer animations, confetti)
9. Sound effects
10. Track themes (Night City first, then Desert + Mountain)
```

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
✅ /brain-race/.claude/worktrees/wonderful-goldwasser-a14e3d/src/...
❌ /brain-race/src/...
```

Git branch: `claude/wonderful-goldwasser-a14e3d`

---

## Future (Not in v1)

- Google Sign-In
- Ghost mode (race your own personal best)
- Topic leaderboards (who scores highest in Python globally)
- Push notifications for daily challenges (Capacitor)
- Question rating system (thumbs up/down)
- Social share card: "I finished 1st in a Python race!"
- Capacitor build for iOS/Android App Store
