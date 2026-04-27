---
name: BrainRace Project
description: Core goals, confirmed tech stack, and architecture decisions for the BrainRace trivia racing game
type: project
originSessionId: a0fdad53-ddd4-4c45-9b75-8c135751c53e
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

**All code, config, deployment files must live inside `/brain-race/` folder.**

**How to apply:** All technical decisions should follow this stack. Do not suggest alternatives unless there is a critical blocker.
