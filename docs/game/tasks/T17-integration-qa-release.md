# T17 — Integration QA, guardrail audit and release

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 6 Release | T11 to T16 | The asset phase (A2 to A4), and playing for real | Yes |

## Goal

Prove the whole game works end to end on placeholders before the owner adds art and writing. Run a long scripted campaign through the real app, check the invariants at runtime, audit every wellbeing guardrail with evidence, make sure the owner's real ledger migrates safely, and produce an installer.

## Read first

- Book: Ch 15 "Invariants", Ch 16 (all of it), Appendix A "Tests to write first" (all 10), Ch 2 (all of it).
- Decisions: all of them, especially D-02, D-04, A-02, A-05, A-07 and A-09.
- Docs: `docs/game/sim/report.md` (T13) and every task's hand-off notes.

## Scope

1. **End-to-end run.** A committed dev script, `scripts/campaign-e2e.cjs` (built on T14's `scripts/screens.cjs`; no new dependencies), launches the built app against a temp data folder seeded with a synthetic Steadfast ledger.
   - It founds a campaign through the wizard, then uses dev time travel to advance 52 weeks.
   - Every 4 weeks it seals a contract, sets orders, courts a village and buys a tier, and it fights at least one Grand Battle by hand.
   - It saves screenshots at fixed checkpoints and records every console and main-process error.
2. **Runtime invariants, dev builds only:** assertions after every `settle` for Ch 15's invariants and Tests 9 and 10: no loss before week 36 (44 at Grace III); rings 0 to 2 never lost; settling again changes nothing; every purse event has a source; Momentum never above the target pace. A failure stops the run and logs the seed.
3. **The guardrail audit,** `docs/game/guardrail-audit.md`: one row per Ch 16 guardrail with its code location, the test that proves it and a screenshot where it shows: the calorie floor, too fast, plateaus, regain, an unsafe goal, overtraining, illness and travel (Respite), fear of losing, coming back, shame (read every loss and Fall text as rendered), no paying or rushing, and privacy (no network calls except Fitbit). The notification row is met by D-04.
4. **Migration safety:** run the app against a copy of the owner's real `ledger.json` (the owner provides it; never commit it). The ledger migrates to v2 with the legacy weights imported, the Archive is unchanged, and founding works. Diff `ledger.json` before and after a settle to confirm game code never writes it.
5. **Performance:** settling 365 missed days takes under 2 s on the development PC (a passive campaign took about 0.2 s on 2026-10-07; re-measure with a playing one). Map hover stays under 16 ms. `campaign.json` stays under 5 MB after 70 weeks (a passive campaign was about 0.46 MB); if it doesn't, compact daily snapshots older than the grace window and the windows the weight rules look back over.
6. **Data safety:** delete or corrupt `campaign.json` and confirm the newest backup loads; confirm the backups rotate (the newest 30 kept).
7. **Release:** update `README.md` (the new pages, a short "How the game works" pointing to `docs/game/`, the data files), bump the app version, run `npm run dist`, and install the result on the development PC.
8. **The handover list,** `docs/game/handover.md`: every open "Raised by agents" entry in `decisions.md`, every owner decision still owed, every simulator proposal awaiting a decision, and what A1 to A4 need.

## Out of scope

New features; retuning numbers (D-02); final art and text.

## Files

- Create: `scripts/campaign-e2e.cjs`, `docs/game/guardrail-audit.md`, `docs/game/handover.md`.
- Edit: `README.md`, `package.json` (version), and small fixes anywhere, each listed in the hand-off notes.

## Verification

- [ ] `npm run typecheck`, `npm test`, `npm run check:game`, `npm run assets:check` (report mode) and `npm run text:check` all run cleanly.
- [ ] The 52-week end-to-end run completes with zero invariant failures and zero uncaught errors; the checkpoint screenshots are attached.
- [ ] All 10 "Tests to write first" pass with the corrected values from `decisions.md` (list the test names and output).
- [ ] The guardrail audit has a row with evidence for every Ch 16 guardrail.
- [ ] The owner's real ledger migrates; the Archive shows the same contracts and history as before; `ledger.json` is untouched by settlement.
- [ ] Settling 365 missed days takes under 2 s (attach the timing), and `campaign.json` after 70 weeks is under 5 MB.
- [ ] A corrupt `campaign.json` recovers from its backup.
- [ ] `npm run dist` produces an installer that installs and runs; the game works with placeholder art and text only.
- [ ] `docs/game/handover.md` lists every decision still owed.

## Hand-off notes

*(The implementing agent adds notes here.)*
