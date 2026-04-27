---
name: BrainRace Project
description: Core goals, confirmed tech stack, architecture decisions, and current build status
type: project
---

BrainRace is a trivia-powered racing game. Answer questions correctly/fast → speed up. Wrong → slow down. Race against 4 AI opponents over 90 seconds.

**Why:** User wants to build a fun, personalized knowledge game playable by anyone from kids to developers.

**Platform decision:** Browser-first (React + Vite), then wrap with Capacitor for iOS/Android. No rewrite needed.

**Confirmed tech stack:**
- React + Vite + TypeScript (frontend)
- Phaser.js (game engine — HTML5 canvas, browser + Capacitor compatible)
- Firebase Auth (email for now, Google later) + Firestore (JS SDK, free Spark plan — no Cloud Functions)
- Vercel (hosting + serverless API routes — free tier)
- Claude Haiku (`claude-haiku-4-5`) as default model via `CLAUDE_MODEL` env var (swappable)
- Zustand for state management
- Capacitor (future mobile wrapping)

**Key architecture decisions:**
- Claude API key is NEVER in the browser — proxied via Vercel serverless function `/api/questions`
- Coins are NEVER written by the client — validated and written server-side via `/api/coins`
- 20 questions pre-fetched before race starts (no mid-race API latency)
- Firebase JS SDK used (not @react-native-firebase) — works in browser, no native build needed
- All infrastructure is free; Claude API cost ~$0.001/race at Haiku pricing
- Phaser ↔ React bridge: `src/game/raceBridge.ts` — shared mutable object React writes, Phaser reads every frame

**Git remote:** git@github.com:mkori95/brain-race.git (SSH, main branch)

**All code, config, deployment files must live inside `/brain-race/` folder.**

---

## Build Status (as of 2026-04-27) — PHASE 1 COMPLETE

### ✅ Files written (all in brain-race/):
- `package.json` — all deps (react, phaser, firebase, zustand, @anthropic-ai/sdk, firebase-admin)
- `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`
- `vercel.json` — build + rewrite config
- `.env.example` — full template with all required vars
- `index.html`
- `src/types/index.ts` — all TypeScript interfaces
- `src/data/vehicles.ts` — 15 vehicles (cars/bikes/trucks) with full stats
- `src/data/fallback-questions.json` — 30 offline fallback questions
- `src/services/firebase.ts` — Firebase init
- `src/services/auth.ts` — signUp, signIn, signOut, onAuthChange, getCurrentIdToken
- `src/services/firestore.ts` — createUserProfile, getUserProfile, updatePersona, updateProgress, etc.
- `src/services/questions.ts` — fetchQuestions with offline fallback
- `src/store/useGameStore.ts` — full Zustand store (race lifecycle, speed mechanics, XP/coins)
- `src/game/raceBridge.ts` — React→Phaser shared bridge object
- `src/game/RaceScene.ts` — Phaser scene: 5-lane top-down track, vehicle rendering, nitro particles
- `src/index.css` — complete dark racing theme with all component styles
- `src/main.tsx`, `src/App.tsx` — entry point + router + auth guard
- `src/screens/OnboardingScreen.tsx` — 5-step persona wizard
- `src/screens/AuthScreen.tsx` — email login/signup
- `src/screens/HomeScreen.tsx` — dashboard with XP bar, coins, daily challenge
- `src/screens/RaceSetupScreen.tsx` — topic picker (20 quick topics + custom input)
- `src/screens/VehicleSelectionScreen.tsx` — buy & upgrade vehicles
- `src/screens/RaceScreen.tsx` — main game (Phaser canvas + React overlay HUD + question card)
- `src/screens/PostRaceScreen.tsx` — results + wrong answer review with explanations
- `src/screens/GarageScreen.tsx` — vehicle overview
- `src/screens/DailyChallengeScreen.tsx` — daily topic race
- `src/screens/ProfileScreen.tsx` — edit persona & interests
- `api/questions.ts` — Vercel serverless function: Claude API proxy with persona-aware prompt
- `api/coins.ts` — Vercel serverless function: coin validation with Firebase Admin SDK
- `README.md` — full project documentation

### ⏳ NEXT SESSION — pick up here:
1. **Run `npm install`** — user must approve first (packages: react, phaser, firebase, zustand, @anthropic-ai/sdk, firebase-admin, @vercel/node, vite, typescript)
2. **Fix TypeScript errors** — run `npx tsc --noEmit` and fix any type issues
3. **Run `npm run dev`** — verify app starts on localhost:3000
4. **Fix any runtime errors** — test the full flow: onboarding → auth → home → race
5. **Firebase setup** — user needs to create Firebase project and add keys to .env
6. **Vercel deploy** — once working locally
7. **Test question generation** — with real Anthropic API key

### Known issue to fix in next session:
- `useGameStore.ts` has `_advanceQuestion` defined twice (as interface method and as stub at bottom) — needs cleanup
- The store's `_advanceQuestion` internal method pattern needs to be refactored to a cleaner closure pattern

**How to apply:** Always check this file at session start to know where we left off. Run npm install first thing.
