# 🏎️ BrainRace

> Race with your brain. Answer trivia questions to control your speed.

BrainRace is a browser-first trivia racing game where your knowledge drives your vehicle. Answer questions correctly and fast → speed up. Answer wrong → slow down. Beat 4 AI opponents over 90 seconds using pure brain power.

Questions are **fully personalized** to each player's age, interests, and profession — powered by the Claude AI API.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + Vite + TypeScript |
| Game Engine | Phaser.js (HTML5 canvas, browser + Capacitor ready) |
| Auth | Firebase Auth (email/password) |
| Database | Firebase Firestore (JS SDK) |
| Hosting | Vercel (free tier) |
| API Proxy | Vercel Serverless Functions |
| AI Questions | Claude API (`claude-haiku-4-5` by default) |
| State | Zustand |
| Mobile (future) | Capacitor (wraps build, no code changes needed) |

---

## Project Structure

```
brain-race/
├── api/                          # Vercel serverless functions
│   ├── questions.ts              # Claude API proxy (question generation)
│   └── coins.ts                  # Coin validation & anti-cheat
├── src/
│   ├── data/
│   │   ├── vehicles.ts           # All 15 vehicle definitions + stats
│   │   └── fallback-questions.json  # 30 offline fallback questions
│   ├── game/
│   │   ├── RaceScene.ts          # Phaser.js race scene (5-lane top-down)
│   │   └── raceBridge.ts         # Shared state bridge (React → Phaser)
│   ├── screens/
│   │   ├── OnboardingScreen.tsx  # 5-step persona wizard (pre-auth)
│   │   ├── AuthScreen.tsx        # Email login / sign up
│   │   ├── HomeScreen.tsx        # Dashboard with XP, coins, quick stats
│   │   ├── RaceSetupScreen.tsx   # Topic picker + vehicle preview
│   │   ├── VehicleSelectionScreen.tsx  # Buy & upgrade vehicles
│   │   ├── RaceScreen.tsx        # Main game (Phaser + React overlay)
│   │   ├── PostRaceScreen.tsx    # Results + wrong answer review
│   │   ├── GarageScreen.tsx      # Vehicle overview
│   │   ├── DailyChallengeScreen.tsx  # Daily topic race
│   │   └── ProfileScreen.tsx     # Edit persona & preferences
│   ├── services/
│   │   ├── firebase.ts           # Firebase init
│   │   ├── auth.ts               # Auth functions
│   │   ├── firestore.ts          # Firestore CRUD
│   │   └── questions.ts          # Question fetch + offline fallback
│   ├── store/
│   │   └── useGameStore.ts       # Zustand store (all game state)
│   ├── types/
│   │   └── index.ts              # All TypeScript interfaces
│   ├── App.tsx                   # Router + auth guard
│   ├── main.tsx                  # Entry point
│   └── index.css                 # Global styles (dark racing theme)
├── memory/                       # Claude project memory files
├── public/assets/                # Static assets (add sprites here)
├── BrainRace_Requirements.md     # Full game requirements
├── .env.example                  # Environment variable template
├── vercel.json                   # Vercel deployment config
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Getting Started

### 1. Clone & Install

```bash
cd brain-race
npm install
```

### 2. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com) → Create a new project
2. Enable **Authentication** → Email/Password sign-in
3. Enable **Firestore Database** → Start in production mode
4. Go to **Project Settings** → Your Apps → Add Web App → copy config
5. Go to **Project Settings** → Service Accounts → Generate new private key → download JSON

### 3. Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```env
# Claude API (https://console.anthropic.com)
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-haiku-4-5

# Firebase client (from Firebase Console → Project Settings → Your Apps)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

# Firebase Admin (from service account JSON — server only, never in browser)
FIREBASE_ADMIN_PROJECT_ID=your-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-...@your-project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 4. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

> **Note:** The Vercel API routes (`/api/questions`, `/api/coins`) only run in Vercel's environment. For local development, the app automatically falls back to the bundled offline question bank if the API is unavailable.

---

## Game Features

### Persona-Driven Questions
- 5-step onboarding wizard captures name, age, roles, interests, difficulty preference
- Claude generates 20 personalized questions before each race starts (no mid-race lag)
- Topics span everything: Linux, Python, Formula 1, history, cooking, memes, and more
- Per-race topic picker: choose a specific topic, go generic, or let Claude surprise you

### Race Mechanics
- 90-second race against 4 AI opponents
- Phaser.js 5-lane top-down track with scrolling road
- Speed effects:
  - Fast correct answer (<3s) → big boost + nitro animation
  - Slow correct answer → small boost
  - Wrong answer → speed penalty based on vehicle handling
  - 3 wrong in a row → 3-second stall
- Post-race wrong answer review with explanations

### Vehicles (15 total)
- **Cars:** City Hatchback (free) → Hypercar (10,000 coins)
- **Bikes:** City Scooter → MotoGP Prototype
- **Trucks:** Pickup Truck → Trophy Truck
- 3 upgrades per vehicle: Engine (max speed), Tires (handling), Nitro (acceleration)

### Progression
- XP and coins from every race
- Levels: Rookie → Amateur → Pro → Expert → Legend
- Daily challenge: one special topic per day, +300 coin bonus
- Personal bests tracked per vehicle category

### Security
- Claude API key never in the browser — proxied via Vercel serverless function
- Coins validated and written server-side via `/api/coins` with Firebase Admin SDK
- Firebase ID token required for all coin operations
- Anti-cheat: rate limiting, coin cap per race, UID validation

---

## Deployment (Vercel)

```bash
# Install Vercel CLI (one-time)
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard:
# vercel.com → your project → Settings → Environment Variables
# Add all variables from .env (ANTHROPIC_API_KEY, FIREBASE_* etc.)
```

The Vercel free tier handles:
- Static hosting with global CDN
- Serverless functions (`/api/questions`, `/api/coins`)
- Automatic HTTPS

---

## Mobile (Future — Capacitor)

When ready to ship to App Store / Play Store:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init BrainRace com.brainrace.app
npm run build
npx cap add ios
npx cap add android
npx cap sync
npx cap open ios    # opens Xcode
npx cap open android # opens Android Studio
```

No code changes needed — the same Vite build is wrapped into a native shell.

---

## Offline Mode

When the Claude API is unavailable (no network, API down), the game automatically:
1. Falls back to 30 bundled questions in `src/data/fallback-questions.json`
2. Shows a small "OFFLINE" badge in the race HUD
3. Basic persona matching still applies (filters questions by interest keywords)

---

## Switching Claude Models

Change the `CLAUDE_MODEL` environment variable — no code changes needed:

| Model | Cost | Best for |
|---|---|---|
| `claude-haiku-4-5` | Cheapest | Default — fast trivia generation |
| `claude-sonnet-4-6` | Mid | Higher quality, more nuanced questions |
| `claude-opus-4-7` | Premium | Best quality, slower |

---

## Development Notes

- **Phaser ↔ React bridge:** `src/game/raceBridge.ts` is a shared mutable object. React writes to it when speed changes; Phaser reads it every frame. No events, no subscriptions — simple and fast.
- **Question pre-fetch:** 20 questions are fetched before the race starts (in `prepareRace()`). The race screen has zero API calls during gameplay.
- **Coins are server-authoritative:** The client never directly sets coins. All coin changes go through `/api/coins` which verifies the Firebase ID token and uses Firestore transactions.
- **Firebase JS SDK** (not `@react-native-firebase`) is used — works in browser and Capacitor without a native build step.

---

## Roadmap

- [ ] Sound effects (correct answer chime, wrong answer buzzer, nitro roar)
- [ ] Google Sign-In
- [ ] Multiplayer (real-time 2-player race via Firebase Realtime Database)
- [ ] Ghost mode (race your own personal best as a ghost)
- [ ] Topic leaderboards
- [ ] Push notifications for daily challenges (Capacitor)
- [ ] Question rating system (thumbs up/down)
- [ ] Social share card ("I finished 1st in a Python race!")
- [ ] Vehicle sprites (replace placeholder rectangles with proper artwork)

---

## License

Private project — all rights reserved.
