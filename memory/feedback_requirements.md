---
name: Requirements process feedback
description: How the user wants requirements discussions and rewrites handled
type: feedback
originSessionId: a0fdad53-ddd4-4c45-9b75-8c135751c53e
---
Confirm all decisions with the user before writing/rewriting the requirements document. Do not rewrite the requirements doc multiple times iteratively — get alignment first, then write it once cleanly.

**Why:** User explicitly said "first lets confirm things then you can write the requirements once - lets not rewrite again and again"

**How to apply:** When requirements change, discuss and confirm in conversation first. Only update the doc when the user has signed off on the full set of changes. Batch all changes into one write.

---

Always keep track of context/session usage. If it exceeds ~80%, update memory files and push to git so the user can start a fresh session cleanly.

**Why:** User explicitly requested this — "if it exceeds 80% - update the memory files so that i can start a new chat"

**How to apply:** Monitor context length proactively. Before hitting limits, write a progress snapshot to `memory/project_brainrace.md` (especially the "Build Status" and "NEXT SESSION" sections), commit and push all files, then inform the user they can start a new session.
