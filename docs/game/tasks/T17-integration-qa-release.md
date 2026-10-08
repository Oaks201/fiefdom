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

### Evidence (2026-10-08)

Measured in a Linux cloud container (4 vCPUs, Node 22.22, Electron 44.4.5 under Xvfb), not on the development PC; the steps that need that PC or the real ledger are the owner's (`docs/game/handover.md` §1).

E2E_SECTION

- **The 10 "Tests to write first"** all pass with the decisions.md values: `npx tsx --test --test-name-pattern="^Test [0-9]+[ :(]" tests/game/*.test.ts` ran every test named for one of them, 25 in all, and all passed (`# pass 50`, `# fail 0`, counting the 25 file-level entries). By number: **1** "Test 1: Ch 4 worked example pays 80.68 (posted 80.7); a 70 pledge returns 115.26 (posted 115.3) (E-01)"; **2** "Test 2: logged average 2,050 and trend 1.0 lb/week → TDEE 2,550, range 1,550 to 2,050, floor 1,550"; **3** "Test 3 (E-02): the Ch 10 worked battle gives Army 117.9, Defense 116.31 at V 0.97 and 81.29 at V 0.31", and the same battle from a realm state; **4** "Test 4 (E-03, D-03): Knights and Crossbowmen against a charging Brute with Shieldwall: hit 10.8, Brute 40.25, Knights 69"; **5** "Test 5: BI(0.80, 1.7) = 344.53"; **6** "Test 6: target pace 0.80 at 217 lb, 0.72 at 180, 0.68 at 170; 0.5 at 217 with the cap at 0.5"; **7** "Test 7 (E-06): 127 hexes, 86 claimable, 12 rival-held, 74 neutral claimable", "Test 7 (E-06, A-108): 30 villages, 12 rival plus 18 seeded split 4/6/8 by ring", "Test 7 (A-108): no seeded village touches a rival village or one in its own ring; at most 2 pairs touch" and the map's other counts; **8** "Test 8 (E-04): 217 → 168 gives marks 212 … 168 and earliest weeks 4 … 31"; **9** "Test 9 (core): settle twice with the same now gives a deep-equal state and zero new events", "Test 9: 30 days settled one call per day equal one catch-up call over the same 30 days", the new "Test 9: a clock set back to a day already settled changes nothing, the last launch included", and the parts for battles, courtships, the rival turn, Grand Battles and the world; **10** "Test 10: 300 seeded 70-week campaigns keep every endgame invariant", "Test 10 (part): across 300 seeded 70-week runs no Border Campaign targets a Gate, a capital or a player hex…", "Test 10 (part): a ring-2 hex that loses a conquest-strength battle never changes owner; it is only scorched", and the new "Test 10: a Border Campaign on a player hex is reported, but not on one a rival took from the player earlier that day".
- **Checks:** CHECKS_SECTION
- **The guardrail audit** is `docs/game/guardrail-audit.md`: a row for every Ch 16 guardrail with its code, the tests that prove it and the screen where it shows; the notification row is met by D-04. Four new source scans back the rows no rule test covers (`tests/game/guardrails.test.ts`: privacy, Fitbit tokens through `safeStorage`, D-04, Pillar 7), and the production bundle (`out/renderer`) holds no `fiefdomDev`, `advanceDays`, scenario id or `__fiefdomCommits`.
- **Migration:** the owner's real ledger isn't in this repository (and mustn't be), so `scripts/migration-check.cjs` was run on a stand-in version 1 ledger (68 days, two closed legacy contracts with sworn duties), `--app` included: it migrates to version 2 importing the 4 legacy weigh-ins; the Archive evaluates both contracts exactly as before the import; no contract field changes; a campaign founds and settles; and across a launch of the built app that settled the campaign 2 days (2026-10-04 → 10-06), `ledger.json` stayed byte-identical (sha256 3b54b283f1d94d48, before and after). The owner runs the same command on a copy of the real ledger.
- **Performance:** `npx tsx scripts/campaign-perf.ts` on four simulated players, each played day by day for 20 weeks and then left for 365 days, the year settled in one call as the next launch would: Steadfast (greedy, seed 1) 560 ms, Committed (smarter, seed 2) 551 ms, Perfect (seed 4, 80 hexes) 927 ms, Casual (seed 4) 496 ms, best of 3 each, against 2 s. `campaign.json` after 70 weeks of play: 0.83, 0.71, 0.82 and 0.29 MB (Casual fell first), against 5 MB; the largest holds 1,770 log events, 3,306 purse events and 518 day snapshots. HOVER_SECTION
- **Data safety:** with the built app, a corrupt `campaign.json` beside two good backups opened the campaign (all six pages), kept the damaged copy as `campaign.corrupt-<time>.json` and rewrote `campaign.json` from the newest backup (seed 42, the newest's); with `campaign.json` deleted, the same. Unit tests: "A-08: a corrupt campaign.json falls back to the newest good backup and the damaged copy is kept", "A-08: the newest 30 campaign backups are kept by default", and the new "T17: a deleted campaign.json loads from the newest backup, and the next save restores the file".
- **Release:** version 0.2.0. `npm run dist` builds the app (`dist/win-unpacked/Fiefdom.exe`) but stops at the NSIS step in this container: NSIS needs Wine to make the uninstaller (`wine process failed ENOENT`). The installer has to be built and installed on the Windows PC (`npm run dist`, as the README says). As a stand-in, `npm run dist:dir` built the Linux app, and the packaged binary, given a campaign, opened all six pages, served all 255 manifest slots from inside the package, drew 132 placeholders on the Realm, and had no `window.fiefdomDev`.

### What was built and changed

- `scripts/campaign-e2e.cjs` (the 52-week run), `scripts/migration-check.cjs`, `scripts/campaign-perf.ts`; `scripts/screens.cjs` exports its CDP client and launcher, passes page events to a callback, adds `--no-sandbox` when run as root on Linux, and starts the app in its own process group so that stopping a development run also ends the Electron that `electron-vite dev` started (it was left running before).
- `lib/game/dev/invariants.ts` (`settleViolations`), checked after every settlement in development builds by the campaign store (`state/campaign.ts`, which logs the seed and throws before a broken result is kept), and every day by the simulator. `window.fiefdomDev.campaign()` (development builds only) lets scripts read the campaign.
- `docs/game/guardrail-audit.md`, `docs/game/handover.md`; `README.md` (the game, its pages and data files, the scripts); `docs/game/README.md` (status, module map).

### Small fixes, each with a test

- **A clock set back** to a day already settled re-ran that day's dawn (old threats and tidings came back) and moved the last launch back. Settlement now changes nothing then (A-183). Test: "Test 9: a clock set back to a day already settled changes nothing, the last launch included".
- **Test 10 never ran on newer Node 22:** a worker started on a `.ts` file with `--import tsx` is loaded by Node's own ESM loader since type stripping became the default (22.18), and failed on the repo's extensionless imports, so `npm test` was red before any campaign settled. The invariants test (and the simulator) start their workers from a small `.cjs` that registers `tsx/cjs`.
- **Hired blades' art** asked for a slot no manifest entry could fill (`company.hired:0.token`); they now wear the Merchant Hall's company token, as on the battle field. Test: "Convention 8 / A-19: hired blades wear the Merchant Hall's current company token, a slot in the art manifest".
- **Six tests would have failed as soon as A3 wrote story text** (they compared rendered strings with the placeholder wording, or required every final to be null). They now pass on placeholders and with every slot written and approved.
- **The day's orders re-rendered every second** for their countdown to 04:00: the whole panel, about 10 ms a time in a development build, which is what put the first runs' hover maximum over 16 ms. The countdown is now its own small component and the panel re-renders only when the lock changes; on a 52-week realm the idle commits fell from about 10 ms to under 1 ms and a sweep over all 127 hexes from a 15.5 ms maximum to 2.3 ms. No unit test renders components; the evidence is the hover line of the end-to-end run.
- **A2 and A4** said things that aren't so (A2: the interface kit is "seen on every screen"; A4: sounds must be registered in code); both corrected, with the art slots no screen draws yet listed in A2.

### For the owner

`docs/game/handover.md`: the steps only the owner can take (install on the PC, run the migration check on the real ledger, time the performance targets and the simulator there), the decisions owed (the simulator's proposals, the land deadlock, the repeated push), the 82 open readings, and what A1 to A4 need.

