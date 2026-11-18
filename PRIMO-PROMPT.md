Copy everything below the line into Claude Code (in plan mode) as your first message.

---

Hi! I'm building OpenDecks, a website that collects free electronic DJ sets from YouTube and plays them directly on our pages.

Please read these files first:
- CLAUDE.md (project rules, including YouTube's rules)
- docs/BRIEF.md (full product spec and the 6 build phases)
- data/seed-sets.json (23 hand-checked sets to start with)
- design/DESIGN.md and design/reference/*.html (the approved design)
- .claude/agents/designer.md (the designer subagent: all visual work goes through it)

Then:
1. Tell me in a few lines what you understood, and list anything in the brief that's unclear or that you'd change.
2. Ask me about the open decisions in BRIEF.md section 8 that you need answered for phase 1.
3. Give me a plan for **phase 1 only** (foundation: repo, Next.js app, database, seed import, deploy on Render) and list exactly what I need to give you (accounts, keys, settings).

Don't write any code until I approve the plan. I'm not a developer, so explain things simply and tell me exactly what to click or paste when you need something from me.
