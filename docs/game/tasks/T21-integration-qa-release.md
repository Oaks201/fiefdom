# T21 — Integration QA, guardrail audit and release

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 6 Release | T01 to T20 | The asset phase (A2 to A4), and playing for real | Yes |

## Goal

Prove the whole game works end to end on placeholders before the owner adds art and writing. Run a long scripted campaign through the real app, audit every wellbeing guardrail with evidence, check the invariants at runtime, make sure the owner's real ledger migrates safely, and produce an installer.

## Read first

- Book: Ch 15 "Invariants", Ch 16 (all of it), Appendix A "Tests to write first" (all 10), Ch 2 (all of it).
- Decisions: all of them, especially D-02, D-04, A-02, A-05, A-07 and A-09.
- Docs: `docs/game/sim/report-v2.md` (T15).

## Scope

1. **End-to-end run.** A dev script (`.tools/campaign-e2e.cjs`, reusing the existing Electron QA scripts) launches the built app against a temp data folder seeded with a synthetic Steadfast ledger.
   - It founds a campaign through the wizard, then uses dev time travel to advance 52 weeks.
   - Every 4 weeks it seals a contract, sets orders, courts a village, buys a tier, and fights any Grand Battle by hand at least once.
   - It saves screenshots at fixed checkpoints, and records errors from the console and the main process.
2. **Runtime invariants (dev builds only):** assertions after every `settle`, covering Ch 15's invariants and Tests 9 and 10:
   - no loss state before week 36 (44 at Grace III);
   - rings 0 to 2 are never lost;
   - a re-settle changes nothing;
   - every purse event has a source;
   - Momentum is never above the target pace.

   An assertion failure stops the run and logs the seed.
3. **Guardrail audit:** `docs/game/guardrail-audit.md`, one row per Ch 16 guardrail, each with the code location, the test that proves it, and a screenshot where it shows. Calorie floor, too fast, plateaus, regain, unsafe goal, overtraining, illness and travel (Respite), fear of losing, coming back, shame (read every loss and Fall text as rendered), no paying or rushing, privacy (no network calls except Fitbit). The notification row is satisfied by D-04.
4. **Migration safety:** run the app against a copy of the owner's real `ledger.json` (the owner provides it; never commit it). The ledger migrates to v2 with legacy weights imported, the Archive is unchanged, and founding works. Confirm that `ledger.json` is never written by game code (diff before and after a settle).
5. **Performance:** settling 365 missed days takes under 2 seconds on the development PC. The Realm map hover stays under 16 ms. `campaign.json` stays under 5 MB after 70 simulated weeks; if not, compact old daily snapshots older than the grace window.
6. **Data safety:** delete or corrupt `campaign.json` and confirm the newest backup loads. Confirm the backups rotate (the newest 30 kept).
7. **Release:** update `README.md` (the new pages, a short "How the game works" pointing to `docs/game/`, data files), bump the app version, run `npm run dist`, and install the result on the development PC.
8. **The handover list:** `docs/game/handover.md`, listing every open "Raised by agents" item in `decisions.md`, every sim proposal awaiting a decision, and what A1 to A4 need.

## Out of scope

New features; retuning numbers (D-02); final art and text.

## Files

- Create: `.tools/campaign-e2e.cjs` (the `.tools` folder is gitignored, so also copy the script to `scripts/` if it should be kept), `docs/game/guardrail-audit.md`, `docs/game/handover.md`.
- Edit: `README.md`, `package.json` (version), small fixes anywhere, with each fix listed in the hand-off notes.

## Verification

- [ ] `npm run typecheck`, `npm test`, `npm run check:game`, `npm run assets:check` (report mode) and `npm run text:check` all run cleanly.
- [ ] The 52-week end-to-end run completes with zero invariant failures and zero uncaught errors. Attach the checkpoint screenshots.
- [ ] All 10 "Tests to write first" pass, with the corrected values from decisions.md (list the test names and output).
- [ ] The guardrail audit has a row for every Ch 16 guardrail, each with evidence.
- [ ] The owner's real ledger migrates; the Archive shows the same contracts and history as before; `ledger.json` is untouched by settlement.
- [ ] Settling 365 missed days takes under 2 s (attach the timing).
- [ ] A corrupt `campaign.json` recovers from backup.
- [ ] `npm run dist` produces an installer that installs and runs. The game works with placeholder art and text only.
- [ ] `docs/game/handover.md` exists and lists every decision still owed.

## Hand-off notes

*(The implementing agent adds notes here.)*
