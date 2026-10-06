# Fiefdom — notes for AI agents

Fiefdom is an Electron + React 19 + TypeScript habit ledger (see `README.md`) that is growing a strategy-game campaign layer on top.

## The game build

- **Start here:** `docs/game/README.md`: the task list, waves, conventions and status table.
- **Spec:** `docs/game/design-book-v2.md`, a snapshot of the design book. Never edit it.
- **Decisions:** `docs/game/decisions.md`. It overrides the book where they disagree.
- **Tasks:** `docs/game/tasks/Txx-*.md`, each with its scope and verification list. `A1` to `A4` are the owner's asset tasks; don't do them unless asked.

## Ground rules

- Game rules are pure, deterministic modules in `src/renderer/src/lib/game/`. Every number lives in `rules.ts` or the codex JSON. Randomness goes only through `rng.ts`.
- Never invent story or flavor text. Narrative strings go through the text catalog with plain-fact placeholders.
- Never show hidden values (the rival benchmark, rival income, event criteria) as numbers in the UI.
- Health records in `ledger.json` are never destroyed or rewritten by game code.
- Before finishing: `npm run typecheck`, `npm test`, and `npm run check:game` once it exists.
