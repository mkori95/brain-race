---
name: BrainRace Project
description: Core goals, confirmed tech stack, architecture decisions, and current build status
type: project
---

BrainRace is a trivia-powered racing game — Road Fighter style top-down vertical scroller. A pre-race qualifier quiz (5 questions) determines grid position and start delay. The race itself is pure reflex driving — no questions during the race.

**Why:** User wants a fun, personalized knowledge game playable by anyone from kids to developers.

**Platform:** Browser-first (React + Vite), Capacitor-wrappable for iOS/Android.

**Confirmed tech stack:**
- React + Vite + TypeScript (frontend)
- Phaser 3 (WebGL, Road Fighter vertical scroller — `src/game/RaceScene.ts`)
- Firebase Auth (email/password) + Firestore (JS SDK, free Spark plan)
- Vercel (hosting + serverless API routes — free tier)
- Claude Haiku (`claude-haiku-4-5-20251001`) as default via `CLAUDE_MODEL` env var (swappable)
- Zustand (`src/store/useGameStore.ts`)
- Capacitor (future mobile)

**Key architecture decisions:**
- Claude API key NEVER in browser in production — proxied via Vercel serverless `/api/questions`
- **Local dev question cascade:** Vercel → browser direct Anthropic (`VITE_ANTHROPIC_API_KEY`) → offline fallback
- Coins NEVER written by client — validated server-side via `/api/coins`
- **Qualifier (pre-race, 5 questions, 15s each)** → grid position 1–5 → `GRID_DELAY_MS` start delay
- **Race is pure driving** — no questions during race
- **raceBridge pattern:** `src/game/raceBridge.ts` — React writes config before race, Phaser writes runtime state every frame (fuel, score, distance, gameOver, raceFinished, lives, ammo), React reads for HUD
- Questions pool resets when `available.length < 10`

**Git remote:** git@github.com:mkori95/brain-race.git (SSH, main branch)

---

## CRITICAL — ONE CODEBASE RULE

**All code edits must go directly to the main project folder on the `main` branch:**
- ✅ Correct: `/Users/manikantabharadwajkoride/mani_scratchpad/projects/brain-race/src/...`
- ❌ Wrong: editing files inside `.claude/worktrees/<any-worktree>/src/...`

**Why:** Claude Code creates a new git worktree for each session. If fixes are made only inside a worktree branch and never merged to `main`, code drifts apart and changes get lost across sessions. The user explicitly requested one single copy of the codebase.

**How to apply:**
1. Always read files from the main project folder (`/brain-race/src/`)
2. Always write edits to the main project folder
3. After each significant fix, commit to `main` and push to `origin/main`
4. If a session creates a new worktree, merge any fixes back to `main` before the session ends — never leave code only in a worktree branch

**Env file:** `/Users/manikantabharadwajkoride/mani_scratchpad/projects/brain-race/.env` — single source of truth, in `.gitignore`, never committed. All worktrees symlink to it.

---

## Game Flow

```
Race Setup (topic + track theme)
        ↓
Qualifier (5 Qs, 15s each, circular timer) → Grid Position 1–5
        ↓
Road Fighter Race (4-lane road, battle car, shoot/dodge traffic, fuel, checkpoints)
        ↓
Post-Race (score, XP, coins, streak)
```

### Qualifier system
- `AI_QUALI_SCORES = [1, 2, 3, 4]` (Rex, Zara, Bolt, Nova)
- Player score 0–5 compared to AI scores; rank = gridPosition
- `GRID_DELAY_MS = { 1: 0, 2: 800, 3: 1600, 4: 2400, 5: 3200 }`
- P5 starts with 80% fuel (penalty: `1.0 - (gridPosition-1) * 0.05`)

### Road Fighter race mechanics
- **4-lane road** (`ROAD_W=280`, `LANE_W=70`): left 2 lanes = oncoming (L0/L1), right 2 lanes = forward + player (L2/L3)
- **Player:** battle car (red armored), two-gear system (Z/↑ = low ~200 km/h; X = high ~400 km/h, 2.2× fuel burn; release = coast; ↓ = brake), lateral drag (← → at 220 px/s)
- **Shooting:** SPACE bar; 10,000 starting ammo (shown as ∞); bullets hit yellow/red/blue/truck/incoming, NOT cop; +150 oncoming / +80 traffic; explosion particles
- **Cop cars:** RAM for bonus points (no life loss)
- **Spin/failure system:** 3 spins per life → respawn + failureCount++; 3 failures = game over; `raceBridge.lives = MAX_FAILURES - failureCount`
- **Traffic types:** yellow (straight), red (blocks player lane), blue (aggressive lane changes), truck (instant life loss), fuel_car (collect +30% fuel), incoming (head-on, green, flipped), cop (ram for points)
- **Traffic spawn guard:** `ps < 50` → no spawns; road empty at standstill
- **Fuel pickups** scroll in any lane; checkpoints at dist 5000/10000/15000 add +25% fuel
- **Finish line** at dist 20000; race ends on finish OR fuel=0
- **Road curve:** distance-based discrete sections (straight 1200–2800 units, curve 700–1600 units); when `ps ≤ 5`, curve lerps back to 0 — road never tilts at standstill
- **roadScrollY only advances when ps > 0** — road completely static at standstill

### raceBridge fields
```typescript
// React → Phaser
gridPosition, startDelayMs, playerLevel, playerColor, trackTheme

// Phaser → React (every frame)
fuelLevel, raceScore, distanceTraveled, gameOver, raceFinished, playerLane, lives, ammo

// Event callbacks
onFuelCollected, onCrash, onCheckpoint
```

---

## Build Status (as of 2026-05-02) — ROAD FIGHTER COMPLETE

### ✅ All screens working end-to-end:
- OnboardingScreen, AuthScreen, HomeScreen, RaceSetupScreen
- VehicleSelectionScreen, QualiScreen, RaceScreen, PostRaceScreen
- GarageScreen, DailyChallengeScreen, ProfileScreen

### ✅ Auth fixes (2026-05-02):
- Sign-up race condition fixed: `_signUpInProgress` flag prevents `onAuthStateChanged` from calling `setUser(null)` before `createUserProfile` finishes
- Sign-in recovery: if Firestore profile missing, auto-creates a minimal profile so user can log in

### ✅ Topic questions — fully working (2026-05-02):
- Questions cascade: Vercel `/api/questions` → Vite dev proxy → offline fallback
- **Vite dev proxy** (`/anthropic-proxy/*` → `https://api.anthropic.com`): strips `Origin` and `Referer` headers before forwarding so Anthropic treats it as a server-to-server call (not a CORS browser request). API key injected via `VITE_ANTHROPIC_API_KEY` from `.env`
- **100% topic-specific prompt**: both `api/questions.ts` and `src/services/questions.ts` use a strict prompt that enforces ALL 20 questions to be about the selected topic; topic field hardcoded to match override
- `TOPIC_CATEGORY_MAP` in `src/services/questions.ts` for offline fallback topic expansion

### ✅ Road Fighter visual overhaul:
- Layout: GAME_W=350 + PANEL_W=130 right HUD panel
- Right HUD: RANK/FUEL/RPM bars, hearts for lives, km/h speed, distance in km
- Left shoulder: railroad crossties, crowd spectators, tree clusters
- Right shoulder: tree/bush clusters, night lamp posts
- Per-scanline road curve, headlights (night-only with glow beams)

### ✅ TypeScript: `tsc --noEmit` passes clean

### Latest commits on main:
- `42d8da8` — fix: enforce 100% topic-specific questions in both API and browser prompts
- `838b821` — fix: strip Origin/Referer headers in Anthropic proxy
- `82017f8` — fix: use VITE_ANTHROPIC_API_KEY in dev proxy
- `2ce8d72` — fix: route Anthropic calls through Vite dev proxy to bypass CORS
- `c31ecd8` — fix: sign-up race condition + sign-in profile recovery

---

## Next Steps (Phase 4)
1. Touch controls for mobile (swipe steer, tap shoot)
2. More pickup types (ammo crate, shield, speed burst)
3. More sounds (bullet fire, explosion, cop siren)
4. PostRaceScreen stats (shots fired, kill count, accuracy)
5. Level-based difficulty via `raceBridge.playerLevel`
6. Topic leaderboards
7. Google Sign-In
