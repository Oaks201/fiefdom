# A4 — Game sound effects (owner, optional)

| Phase | Depends on | Unblocks | Who |
| --- | --- | --- | --- |
| 7 Assets | T14 (the silent sound slots) | — | The owner |

## Goal

Give the new game moments their own sounds, in the same tavern style as the existing effects. The book doesn't require this. T14 registers every new sound id with a silent fallback, so the game is complete without it.

## Read first

- `docs/sound-design.md` (how the existing 34 effects were made and tuned to the soundtrack).
- `src/renderer/src/audio/sfx.ts`: the list of game sound ids T14 added (battle won, battle lost, Milestone, Herald, coalition, Ultimatum, victory, the Fall, and so on).

## Steps

1. For each game sound id, make or source a short effect in the existing style (see `docs/sound-design.md` and `scripts/generate-sfx.py`).
2. Save it beside the existing effects in `src/renderer/src/assets/audio/sfx/` with the id as the file name, and register it the way the existing effects are registered in `audio/sfx.ts`.
3. Check the volume against the existing effects and the music, using the in-app Settings sliders.

## Verification

- [ ] Every game sound id plays a file, or is deliberately left silent and listed in `docs/sound-design.md`.
- [ ] The new effects sit at the same loudness as the existing ones (no effect noticeably louder at the default volume).
- [ ] Turning effects off in Settings silences all of them.
- [ ] Any sourced sound's license is recorded in `docs/sound-design.md` and in the credits section of `README.md`.
