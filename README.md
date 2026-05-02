# BrainRace

> Race with your brain. Answer trivia to earn your grid position. Drive to survive.

BrainRace is a browser-first trivia racing game inspired by Road Fighter. Answer 5 quiz questions before each race — your score determines your starting grid position and start delay. Then race pure reflex: dodge traffic, shoot oncoming cars, ram cop cars, manage your fuel, hit checkpoints. No questions during the race. Brain and reflex are cleanly separated.

Questions are **fully personalized** to each player's age, interests, and profession — powered by the Claude AI API.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + Vite + TypeScript |
| Game Engine | Phaser 3 (WebGL canvas) |
| Auth | Firebase Auth (email/password) |
| Database | Firebase Firestore (JS SDK) |
| Hosting | Vercel (free tier) |
| API Proxy | Vercel Serverless Functions |
| AI Questions | Claude API (`claude-haiku-4-5-20251001` default) |
| State | Zustand |
| Sound | Web Audio API (procedural, no audio files) |
| Mobile (future) | Capacitor (wraps build, no code changes needed) |

---

## Project Structure

```
brain-race/
├── api/
│   ├── questions.ts              # Claude API proxy — persona-aware question generation
│   └── coins.ts                  # Coin validation & anti-cheat (Firebase Admin)
├── src/
│   ├── data/
│   │   ├── vehicles.ts           # 15 vehicle definitions (cars, bikes, trucks)
│   │   └── fallback-questions.json  # Offline fallback question bank (~200 Qs)
│   ├── game/
│   │   ├── RaceScene.ts          # Phaser 3 race scene — Road Fighter top-down scroller
│   │   ├── raceBridge.ts         # Shared mutable bridge (React config → Phaser runtime)
│   │   └── audioEngine.ts        # Web Audio API procedural sounds (engine, coin, crash…)
│   ├── screens/
│   │   ├── OnboardingScreen.tsx  # 5-step persona wizard (pre-auth)
│   │   ├── AuthScreen.tsx        # Email login / sign up
│   │   ├── HomeScreen.tsx        # Dashboard — streak banner, XP, coins, daily challenge
│   │   ├── RaceSetupScreen.tsx   # Topic + track theme picker, vehicle preview
│   │   ├── VehicleSelectionScreen.tsx  # Buy & upgrade vehicles
│   │   ├── QualiScreen.tsx       # 5-question qualifier — circular timer, confetti on P1
│   │   ├── RaceScreen.tsx        # Game (Phaser canvas + React HUD overlay)
│   │   ├── PostRaceScreen.tsx    # Results — streak milestone, XP bar, coin breakdown
│   │   ├── GarageScreen.tsx      # Vehicle overview with personal bests
│   │   ├── DailyChallengeScreen.tsx  # Daily topic race with streak system
│   │   └── ProfileScreen.tsx     # Edit persona & preferences
│   ├── services/
│   │   ├── firebase.ts           # Firebase init + readiness check
│   │   ├── auth.ts               # signUp, signIn, signOut, onAuthChange, getCurrentIdToken
│   │   ├── firestore.ts          # User profile CRUD, progress updates, seen-question tracking
│   │   └── questions.ts          # fetchQuestions — Claude API + offline fallback
│   ├── store/
│   │   └── useGameStore.ts       # Zustand store — full game lifecycle + daily streak logic
│   ├── types/
│   │   └── index.ts              # All TypeScript interfaces (TrackThemeName, RaceResult, etc.)
│   ├── App.tsx                   # Router + AuthGuard
│   ├── main.tsx
│   └── index.css                 # Dark racing theme, component styles, animations
├── memory/                       # In-repo Claude project memory files
├── BrainRace_Requirements.md     # Full game design + implementation status
├── .env.example
├── vercel.json
├── vite.config.ts
└── package.json
```

---

## Game Flow

```
Race Setup (topic + track theme + vehicle)
        ↓
Qualifier Quiz (5 questions, 15s each)
        ↓
Grid Position 1–5 (better score = pole, no delay)
        ↓
Road Fighter Race (fuel-limited, no timer)
  - 4-lane road: 2 oncoming lanes (left) + 2 forward lanes (right)
  - Shoot oncoming cars with SPACE — +150 pts + ammo refill
  - Ram cop cars for bonus points (no life loss)
  - 3 lives: each life = 3 spins before respawn; 3 respawns = game over
  - Checkpoints award +25% fuel
  - Race ends: finish line OR fuel hits 0
        ↓
Post-Race: Score, XP, Coins, Streak
```

---

## Getting Started

### 1. Install

```bash
cd brain-race
npm install
```

### 2. Firebase Setup

1. [Firebase Console](https://console.firebase.google.com) → Create project
2. Enable **Authentication** → Email/Password
3. Enable **Firestore Database**
4. **Project Settings → Your Apps → Web App** → copy client config
5. **Project Settings → Service Accounts → Generate private key** → download JSON (for admin SDK)

### 3. Environment Variables

```bash
cp .env.example .env
```

```env
# Claude API (Vercel only — never in browser)
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-haiku-4-5-20251001

# Optional: browser-side key for local dev (enables live topic questions without vercel dev)
VITE_ANTHROPIC_API_KEY=sk-ant-...   # leave blank to use offline fallback only

# Firebase client (safe for browser — VITE_ prefix exposes to frontend)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

# Firebase Admin (Vercel only — for /api/coins coin validation)
FIREBASE_ADMIN_PROJECT_ID=your-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-...@your-project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 4. Run Locally

```bash
npm run dev
```

> The Vercel API routes (`/api/questions`, `/api/coins`) only run on Vercel. Locally, the app automatically falls back to the bundled offline question bank.

---

## Race Mechanics

### Qualifier System
- 5 questions, 15 seconds each, circular SVG countdown timer
- AI opponents: Rex 1/5, Zara 2/5, Bolt 3/5, Nova 4/5
- Player score vs AI scores → grid position 1–5
- `P1` = pole position, no delay. `P5` = 3.2s delay + 80% starting fuel
- Confetti on P1, answer breakdown on results screen

### Road Fighter Race (current implementation)
- **4-lane top-down scroller**, Phaser 3 WebGL, pure single-player (`fps.forceSetTimeOut: true` keeps loop alive in background tabs)
- **4-lane road** (`ROAD_W=180`, `LANE_W=45`): left 2 lanes = oncoming; right 2 lanes = forward + player; double yellow center divider; animated red/white curbs; scanline perspective effect
- **Road curves:** distance-based discrete sections — straight 1200–2800 units, then left or right for 700–1600 units. Road holds perfectly straight when player is stationary.
- **Road markers:** START / CHECKPOINT / FINISH painted as colored ovals on road surface, scrolling with the road
- **Two-gear controls:** `↑ / Z` = low gear (~200 km/h constant), `X` = high gear (~400 km/h, 2.2× fuel burn); release = coast; `↓` = brake; `← →` = lateral steer at 220 px/s. Controls hint shown on screen at start.
- **Typed traffic:** Yellow (normal), Red (lane-blocks player), Blue (aggressive lane changes), Truck (instant life loss, double fuel penalty), Fuel Car (collect for +30% fuel). Oncoming cars are always green and face toward player.
- **Traffic only spawns when moving** — road is empty at standstill; no artificial speed floor
- **Shooting:** SPACE fires bullets; 10,000 starting ammo (shows ∞); hits yellow/red/blue/truck/incoming; +150 pts for oncoming, +80 pts for traffic; +5 ammo on kill
- **Cop cars:** ram for bonus points (no life loss); has flashing light bar
- **Lives / spin system:** 3 spins per life → respawn; 3 respawns (failures) → game over; invincibility frames after each crash; trucks skip spin system (direct life loss)
- **Fuel:** drains continuously × gear multiplier; fuel cars give +30% on collection; race ends at fuel=0 or finish line; no countdown timer
- **Checkpoints** at 5000/10000/15000 distance: +25% fuel each; finish line at 20000
- **Right HUD panel** (130px): RANK/TIME/CARS boxes, RPM gradient bar (blue→cyan), FUEL gradient bar (brown→orange), low-fuel red flash, speed in km/h, distance in km, ♥ lives
- **Scenery:** railroad crossties + rails (left), crowd spectators, tree clusters both sides, night lamp posts; green grass shoulders
- **Difficulty:** auto-scaled from player XP level (easy/medium/hard → spawn intervals)

### Track Themes
Select before each race — changes sky, road, curbs, lane dashes, background, and roadside scenery:

| Theme | Sky | Road | Scenery |
|---|---|---|---|
| **Night City** | Dark navy, stars, neon horizon | Dark asphalt, cyan dashes | City buildings, lamp posts |
| **Desert Highway** | Warm orange-amber, sun disc | Sandy tan road, orange curbs | Mesa/dune bg, cacti, rocks |
| **Mountain Pass** | Deep purple, stars, misty horizon | Gray concrete, lavender dashes | Snow peaks bg, pine trees, snow rocks |

---

## Visual Features

- **Road curves:** background parallax shifts opposite direction to road curve for immersive turn feel
- **Player battle car:** armored body (red), roof turret, side armor plates, headlight glow, exhaust smoke trail; spins on crash
- **Traffic:** compact cars (traffic + oncoming) with cabin/windshield/taillights; cop cars with flashing red/blue light bar + checkerboard stripes
- **Particles:** crash sparks (10-particle burst), bullet explosion (16-particle burst), fuel collect particles, floating score text
- **Screen FX:** speed lines at high speed, fuel warning red border pulse (< 15%), invincibility flashing
- **HUD (React overlay):** lives (♥ hearts), score, fuel %, ammo count (∞ when maxed); checkpoint flash overlay
- **HUD (in-canvas):** left mini-map strip, right fuel bar, bottom speed bar, spin count pips, low-fuel pulsing border
- **Sound:** Web Audio API — engine hum (tracks speed), fuel pickup, crash — lazy init on first gesture

---

## Progression & Daily Streaks

- **XP:** +50/race, +200 for P1, +20/correct qualifier answer
- **Levels:** Rookie (0) → Amateur (500) → Pro (1500) → Expert (4000) → Legend (10000)
- **Coins:** server-authoritative — +50/race, +150 for P1, +300 daily challenge bonus
- **Daily streak:** consecutive daily challenge completions → streak counter + bonus coins (base 300 + 20 per streak day up to day 10)
- **Personal bests:** tracked per vehicle category (cars / bikes / trucks) by distance

---

## Question API Cascade

Questions are fetched in this priority order:

1. **Vercel serverless** `/api/questions` — production and `vercel dev`
2. **Browser direct Anthropic call** — local `npm run dev` only, requires `VITE_ANTHROPIC_API_KEY` in `.env`
3. **Offline fallback** — `src/data/fallback-questions.json` (~200 questions); topic filter applied if a topic override is set

To enable live questions in local dev, add to `.env`:
```env
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

## Security

- Claude API key **never in the browser** in production — proxied via Vercel serverless `/api/questions`
- Coins **never set by the client** — validated and written server-side via `/api/coins` using Firebase Admin SDK + Firestore transactions
- Firebase ID token required for all coin operations
- Anti-cheat: coin cap per race, UID validation, rate limiting

---

## Deployment (Vercel)

```bash
npm i -g vercel
vercel
```

Set all environment variables in the Vercel dashboard (Settings → Environment Variables). The free tier handles static hosting, serverless functions, CDN, and HTTPS.

---

## Switching Claude Models

Change `CLAUDE_MODEL` — no code changes needed:

| Model | Best for |
|---|---|
| `claude-haiku-4-5-20251001` | Default — fastest, cheapest (~$0.001/race) |
| `claude-sonnet-4-6` | Higher quality questions |
| `claude-opus-4-7` | Best quality, slower |

---

## Mobile (Capacitor)

When ready to ship:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init BrainRace com.brainrace.app
npm run build && npx cap sync
npx cap open ios      # opens Xcode
npx cap open android  # opens Android Studio
```

No code changes needed — the Vite build is wrapped into a native shell.

---

## Offline Mode

When the Claude API is unavailable, the app automatically:
1. Falls back to ~200 bundled questions in `src/data/fallback-questions.json`
2. Shows an "OFFLINE" badge in the race HUD
3. Basic persona matching (keyword filtering) still applies

---

## Architecture Notes

- **raceBridge pattern:** `src/game/raceBridge.ts` is a shared mutable singleton. React writes config (grid position, theme, player color) before race start; Phaser writes runtime state (fuel, score, distance, gameOver) every frame. No events or subscriptions — direct and fast.
- **Qualifier deferred-answer pattern:** `QualiScreen` stores answers in a `pendingRef` and defers the Zustand `submitQualiAnswer` call by 900ms to allow the correct/wrong animation to run against the right question. Zustand updates synchronously — reading derived state immediately after a store update gives the new value, which caused a timing bug now fixed.
- **Audio lifecycle:** `stopEngine()` is called both in `RaceScreen`'s useEffect cleanup AND in `handleQuit()` to guarantee audio stops on all exit paths — not just via Phaser lifecycle.
- **Pickup collision:** Graphics objects positioned with `g.y = item.y` draw in local coordinate space, so the visible center is at local `(cx, 0)`, not `(cx, item.y)`. Collision tests against `item.y` (world position) are correct.

---

## Roadmap

### Phase 4 — Polish & Gameplay Depth
- [ ] Touch / swipe controls for mobile (Capacitor)
- [ ] More pickup types: ammo crate, shield, speed burst
- [ ] Sound: more variety (bullet fire, explosion, cop siren)
- [ ] PostRaceScreen: show distance driven, shots fired, accuracy
- [ ] Leaderboard per topic / per track theme
- [ ] Google Sign-In

### Phase 5 — Multiplayer
- [ ] Real-time race via Firebase Realtime Database (ghost overlays, shared leaderboard)
- [ ] Ghost mode — race your own personal best

### Phase 6 — Mobile
- [ ] Capacitor iOS/Android App Store release
- [ ] Push notifications for daily challenges
- [ ] Social share card ("I finished P1 in a Python race!")

---

## License

Private project — all rights reserved.
