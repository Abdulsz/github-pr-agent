# Agent instructions

Guidance for AI agents working in this repository.

## Architectural decisions log

When you make a **significant architectural decision** — not a small fix or routine change — document it in **[`architecture-decisions.md`](./architecture-decisions.md)**.

### What belongs in `architecture-decisions.md`

- New tools, agents, or workflows (e.g. ReAct tool split, new commit model)
- Cross-cutting patterns (validation layers, auth flows, data boundaries)
- Tradeoffs and alternatives considered
- “Why we chose X over Y” for structural choices
- Diagrams or flows that explain system behavior

### What does **not** belong there

- Bugfixes, typos, linter fixes
- Single-line or localized refactors
- Dependency bumps
- Config tweaks unless they change system architecture

### Format

Add a new section per decision:

```markdown
## AD-NNN: Short title

**Date:** YYYY-MM-DD
**Status:** Accepted | Superseded | Proposed
**Context:** What problem or incident triggered this?
**Decision:** What we chose.
**Consequences:** Tradeoffs, key files, follow-ups.
```

Increment `AD-NNN` from the highest number already in the file.

### Important

- **`architecture-decisions.md` is gitignored** — it is local context only, not committed to the repo.
- Always **read** `architecture-decisions.md` at the start of work that touches agent behavior, PR creation, or GitHub integration.
- **Update** it when you introduce or materially change an architectural decision in those areas.
