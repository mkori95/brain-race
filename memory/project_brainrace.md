---
name: BrainRace Project
description: Core goals, confirmed tech stack, architecture decisions, and current build status
type: project
---

BrainRace is a trivia-powered racing game — Road Fighter style top-down vertical scroller. A pre-race qualifier quiz (5 questions) determines grid position and start delay. The race is pure reflex driving: dodge traffic, collect pickups, manage fuel, hit checkpoints.

**Why:** User wants to build a fun, personalized knowledge game playable by anyone from kids to developers.

**Platform:** Browser-first (React + Vite), Capacitor-wrappable for iOS/Android. No rewrite needed.

**Tech stack:**
- React + Vite + TypeScript (frontend)
- Phaser 3 (WebGL, top-down scroller — `src/game/RaceScene.ts`)
- Firebase Auth (email/password) + Firestore (JS SDK, free Spark plan)
- Vercel (hosting + serverless API routes)
- Claude Haiku (`claude-haiku-4-5`) as default via `CLAUDE_MODEL` env var (swappable)
- Zustand (`src/store/useGameStore.ts`)
- Web Audio API (`src/game/audioEngine.ts`) — procedural sounds, no audio files
- Capacitor (future mobile)

**Key architecture decisions:**
- Claude API key NEVER in browser — proxied via `/api/questions` Vercel function
- Coins NEVER set by client — validated server-side via `/api/coins` with Firebase Admin
- `raceBridge` pattern: `src/game/raceBridge.ts` — shared mutable singleton; React writes config before race, Phaser writes runtime state every frame
- Questions pool resets when `available.length < 10`
- `pendingRef` pattern in QualiScreen: defers `submitQualiAnswer` 900ms so correct/wrong animations run against the right question (Zustand updates synchronously — reading immediately after gives new value)
- `stopEngine()` called in both RaceScreen useEffect cleanup AND `handleQuit()` — not just via Phaser lifecycle

**Git remote:** git@github.com:mkori95/brain-race.git (SSH, main branch)

---

## Game Flow

```
Race Setup (topic + track theme)
        ↓
Qualifier (5 Qs, 15s each) → Grid Position 1–5
        ↓
90s Road Fighter Race (traffic, pickups, fuel, checkpoints)
        ↓
Post-Race (score, XP, coins, streak)
```

---

## Build Status — PHASE 3 COMPLETE (2026-04-29)

### ✅ All screens built and working:
- OnboardingScreen (5-step persona wizard)
- AuthScreen (email login/signup)
- HomeScreen (streak banner, 7-day dot progress, daily challenge card)
- RaceSetupScreen (topic picker, track theme selector, vehicle preview)
- VehicleSelectionScreen (buy + upgrade)
- QualiScreen (circular SVG timer, answer animations, confetti on P1, back button)
- RaceScreen (Phaser canvas + React overlay HUD, quit dialog)
- PostRaceScreen (streak milestone, XP bar, coin breakdown)
- GarageScreen (vehicle overview, personal bests)
- DailyChallengeScreen (daily topic, streak tracking)
- ProfileScreen (edit persona)

### ✅ Phase 3 Visual Overhaul — all 10 items done:
1. Parallax background: sky (depth 0), bg layer at 18% speed (depth 1), near scenery (depth 4)
2. Road: theme-aware asphalt + banding + animated curbs + scrolling guardrail posts
3. Player car: headlights, shadow, exhaust, nitro flame, crash spin + lateral drift
4. Traffic: sedan, oncoming racer, truck — CAR_W=20/CAR_H=34; hit car destroyed on collision
5. Particles: crash sparks, nitro exhaust, coin/fuel/nitro bursts, oil smoke, score floats
6. Screen FX: speed lines, fuel border flash, nitro vignette, camera shake + flash
7. HUD: 10-segment fuel gauge, speedometer, mini-map (14×110px), pickup notifications
8. Qualifier: circular SVG timer, scorePop/shake animations, colored key badges, confetti
9. Sound: Web Audio engine hum, coin, fuel, nitro, crash, oil — stopEngine() lifecycle fixed
10. Track themes: Night City / Desert Highway / Mountain Pass (sky + road + curbs + dashes + bg + scenery)

### ✅ Bug fixes:
- Coin pickup: drawPickup draws at local cy=0 (g.y already = world position)
- Qualifier 4/5 count bug: pendingRef defers store update past animation window
- quitRace() action: resets without awarding XP/coins/streak
- Back buttons on QualiScreen; quit dialog in RaceScreen
- Checkpoints: 350/750/1200/1800 distance units (+10s each), finish at 2500
- Audio: stopEngine() in RaceScreen cleanup + handleQuit()

### ✅ XP/Streak system:
- Daily streak: consecutive days detected, streakBonus = 300 + min(streak-1, 10) × 20
- XP: +50/race, +200 for P1, +20/correct qualifier answer
- Levels: rookie→amateur→pro→expert→legend (0/500/1500/4000/10000 XP)

---

## Key constants (RaceScene.ts)
- Canvas: 480×560, 5 lanes, ROAD_W=270
- PLAYER_Y = 0.82 × CANVAS_H
- BASE_SPEED=200, MAX_SPEED=520, SPEED_RAMP=+25/30s
- CAR_W=20, CAR_H=34 (player bw=24, bh=42)
- Checkpoints at distance 350/750/1200/1800/2500 (last = finish)
- 1 game-distance-unit = 20 screen pixels
- RACE_DURATION_S=90, QUALI_QUESTION_COUNT=5

## raceBridge fields (React → Phaser, set before race)
- gridPosition, startDelayMs, playerLevel, playerColor, trackTheme

## raceBridge fields (Phaser → React, updated each frame)
- fuelLevel, raceScore, distanceTraveled, gameOver, raceFinished, playerLane
- onCoinCollected, onNitroCollected, onFuelCollected, onCrash, onCheckpoint (callbacks)

---

## CRITICAL — worktree path
All edits must go to the **worktree**, not the main project dir:
- ✅ `/Users/manikantabharadwajkoride/mani_scratchpad/projects/brain-race/.claude/worktrees/dreamy-heisenberg-012535/src/...`
- ❌ `/Users/manikantabharadwajkoride/mani_scratchpad/projects/brain-race/src/...`

Git branch: `claude/dreamy-heisenberg-012535`

---

## Next up (Phase 4)
- Level-based AI difficulty (traffic density/speed ceiling by playerLevel)
- Multiplayer via Firebase Realtime Database (ghost overlays, shared leaderboard)
- Google Sign-In
- Ghost mode (race your personal best)
- Topic leaderboards
