---
name: Workflow rules feedback
description: How the user wants code edits, sessions, requirements, and the codebase managed
type: feedback
---

## Single codebase rule — MOST IMPORTANT

Always edit code in the **main project folder** (`/brain-race/src/`), not in worktree branches.

**Why:** Claude Code creates a new git worktree per session. Fixes scattered across worktree branches get lost and the codebase fragments. The user explicitly said: "we need one single copy of code base not multiple session copies."

**How to apply:**
- Read and write files from `/Users/manikantabharadwajkoride/mani_scratchpad/projects/brain-race/src/`
- After each significant change, commit to `main` and push to `origin/main`
- If the session is in a worktree, still edit the main folder files directly — do not touch `src/` inside the worktree
- Before ending a session, confirm all fixes are committed and pushed to `main`

---

## Context limit rule

Keep track of context usage. If it exceeds ~80%, update memory files, commit, push, and tell the user to start a fresh session.

**Why:** User said "if it exceeds 80% - update the memory files so that i can start a new chat"

**How to apply:** Before hitting limits, write a progress snapshot to `memory/project_brainrace.md` (Build Status + Next Steps), commit and push all memory files, then inform the user.

---

## Requirements process

Confirm all decisions before writing/rewriting the requirements document. Do not iterate on the requirements doc repeatedly — get alignment first, then write it once.

**Why:** User said "first lets confirm things then you can write the requirements once - lets not rewrite again and again"

**How to apply:** Discuss and confirm in conversation. Only update the doc when the user has signed off. Batch all changes into one write.

---

## Installations

List any new packages and get user approval before running `npm install` or similar.

**Why:** User wants to know what's being added to the project.
