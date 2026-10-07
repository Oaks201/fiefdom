# T14 — The campaign in the app: shell, founding, Herald, Contract and Chronicle

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 5 Screens | T02, T04 to T06 (done); can start now, beside T11 | T15, T16, A2 to A4 | Light (Milestone count and marks only) |

## Goal

Make the campaign playable on its habit side. Add the new pages to the navigation, a founding wizard, the campaign purse in the top bar, the Herald's dawn tidings, the Homecoming after an absence, and dev-only time travel. Rework the two pages the player opens every day: the Contract page seals any length with an optional pledge, and the Chronicle shows the week's pace, today's Valor, the weekly weigh-in and the next Milestone, without ever shaming a bad day. Build the **art, text and sound plumbing** every later screen uses, so the game runs fully on placeholders and the owner can drop in real art and writing with no code changes.

## Read first

- Book: Ch 2 "The daily and weekly loop", Ch 4 (all of it), Ch 5 "Momentum" and "Realm Consistency", Ch 9 "Milestones" and "The Crown's Grace" (what the player sees), Ch 16 (all of it: the tone, the coming-back and shame rows, the suggested duties), Ch 17 (all of it: art direction, the asset table, placeholders first, writing), Appendix A "Changes to existing code" (the `pages/` row).
- Decisions: **D-01**, **D-04** (no notifications), A-02, A-03, A-07, A-08, A-09, A-11, A-39, A-40, A-45, A-46.
- Code: `App.tsx`, `state/ui.ts`, `state/campaign.ts`, `state/campaignClock.ts`, `components/TopBar.tsx`, `Modal.tsx`, `HoldButton.tsx`, `WaxSeal.tsx`, `pages/ContractPage.tsx`, `ChroniclePage.tsx`, `ArchivePage.tsx`, `components/contract/*`, `components/chronicle/*`, `components/archive/ContractCard.tsx`, `styles/*`, `audio/sfx.ts`.

## Start from (already built)

- **The campaign store** (`state/campaign.ts`): `useCampaign` with `status`, `campaign`, `load()`, `apply(op)` (a `CampaignError` becomes a toast), `found(state)`, `settleNow(ledger, now, { launch })`, and `homecoming` (a `SettleSummary` when A-45 calls for it) with `dismissHomecoming()`. It saves the way the ledger does.
- **The campaign clock** (`state/campaignClock.ts`), started in `App.tsx`: it settles at launch and at each 04:00. In dev builds `campaignNow()` honors `FIEFDOM_DEV_NOW`, and `devAdvanceDays(n)` (also `window.fiefdomDev`) moves time and settles. Only the menu is missing.
- **Founding:** `foundCampaign(input, now)` (`campaign.ts`) and `checkGoal` (`weight.ts`) throw a `CampaignError` whose message is ready to show.
- **Contracts:** `availableLengths`, `pledgeCap(days, realmEffects().pledgeCap.value, balance)`, `contractPayout`, `pledgeReturn(pledge, Q, realmEffects().minPledgeReturn.value)`, `withdrawalPayout`, `scoredDays`, `seal`, `withdraw`, `spendRespite`, `validateCharter` and `stewardSuggestion` (`contracts.ts`); `contractScore`, `charterOn` and `valorOn` (`settle.ts`); `weekPillars`, `poolShare`, `valor` and `weekScores` (`score.ts`).
- **Weight:** `state.weight.milestones`, `markReachedOn` (lock 1), `changeGoal`, `nextGoalChange`, `graceTextId`, `healerRange`, `loggedAverage`, `healerCheckIns` and `healerText` (`weight.ts`). The ledger has `setWeight` and `weighIns`, and the Chronicle already has a minimal "Weight today" field (T02).
- **The Herald:** `tidings(state, date)` (`combat.ts`) gives today's threats with bands, never a hidden number. The log holds every result as a plain-fact event; the text catalog has the slots (`herald.*`, `battle.*`).
- **Text:** `t(id, facts)`, `hasText`, `textIds` and `validateCatalog` (`text.ts`).

## Gaps in the current code to close here

1. **Contract actions work on slices, not the campaign.** `seal`, `withdraw` and `spendRespite` take the contracts and purse slices plus a context the caller must build (`tests/game/settle.test.ts`'s `sealOn` shows how). Add state-level actions (seal, withdraw, take a Respite day, revise the Charter between contracts) that build that context from the state (`realmEffects`, the Healer floor, `contractScore`) and log their results, so screens and the T13 simulator share them.
2. **Medical supervision isn't stored.** `FoundingInput.medicalSupervision` lets the founding Charter sit below the Healer's floor, but `Campaign` doesn't keep it, so the next seal re-checks without it. Store the confirmation on the campaign and pass it to every Charter check.
3. **The wizard can't show the floor before founding.** `foundCampaign` computes the founding Healer floor internally. Export that step so the wizard can display the floor as the player types the calorie limit.
4. **No screenshot tooling exists.** Earlier task text pointed at `.tools/electron-qa.cjs`, which is gitignored and isn't in the repo. Add a committed, dependency-free `scripts/screens.cjs`: launch the built app with `--remote-debugging-port`, then drive it and capture pages through the DevTools protocol over Node's built-in `WebSocket`, at a given window size, into a folder.

## Scope

Suggested order: the plumbing first, then the shell, then founding, then the two pages.

1. **Plumbing, used by every later screen:**
   - **Art:** `src/renderer/public/game-assets/manifest.json` maps each slot id to `{ file: string | null, kind, size: [w, h] }` (A-08). Generate the slot inventory from the codex plus Ch 17's fixed lists (hex terrains and overlays, 20 building tiers, 5 castle tiers, 12 rival portraits, a token and a portrait per company line, Elite, mythic, Dragon and Wild Hunt portraits, item icons, 6 banners, an event card per event, 10 Milestone scenes, the interface kit). `<GameArt slot="…" />` renders the file when it is listed and present, and otherwise a placeholder (a hex in the owner's banner color from Ch 17, a lettered token, initials on a parchment card). A missing file never throws.
   - `npm run assets:check` (`scripts/check-assets.cjs`, no new dependencies; read PNG and WebP sizes from the file header) lists missing slots, unknown files and wrong sizes; it exits 0 in report mode and 1 with `--strict`. The same script writes `docs/game/assets.md`, the owner's checklist of every slot with its file name, size and where it shows (A2).
   - **Text:** a `useText()` hook around `t()`; a dev-only overlay counting placeholder and final text per catalog file; `npm run text:check` (`scripts/check-text.cjs`) lists placeholder slots and unapproved Healer entries, flags a `{placeholder}` in a `final` that its template doesn't offer, and warns when a `final` runs past the Ch 17 sentence count for its slot type (A3).
   - **Sound:** register the new game sound ids (battle won and lost, Milestone, Herald, coalition, Ultimatum, victory, the Fall, …) in `audio/sfx.ts` with a silent fallback, so A4 can add files without code changes.
   - **The big-moment card:** a full-screen painted card (placeholder art and text slots) for Milestones, Grand Battle results, coalitions, victory and the Fall. T16 calls it.
   - **View models** live in `lib/game/view/*.ts`, pure and unit-tested; components only render. They sit under `lib/game`, so `check:game` applies to them.
   - `scripts/screens.cjs` (gap 4).
2. **The shell:**
   - Navigation: add Realm, Diplomacy and Armory pages as empty shells (T15 and T16 fill them); Ctrl+1 to 6 switch pages. The new pages appear only once a campaign exists; until then the ledger-only app behaves exactly as it does today.
   - The top bar, with a campaign: the purse (a whole number, A-11), Realm Consistency (28 days) and the Grace level's plain description. Legacy reputation moves to the Archive (A-07).
   - The Herald: a tidings panel for the Chronicle and the Realm page with today's threats, targets and bands (exact strength only when revealed), rival rumors, Grand Battle warnings and yesterday's results, all through `t()`. In-app only: no OS notification, tray icon or notification setting anywhere (D-04).
   - The Homecoming, at launch when `useCampaign().homecoming` is set: what held, what was lost and the purse change, plainly; the Steward suggests a short contract. Chronicle, not judgment (Ch 16).
   - Dev time travel (A-09): a dev-only menu to advance a day or a week and to show `FIEFDOM_DEV_NOW`, absent from production builds.
3. **The founding wizard** (a modal, in steps):
   - Weight: start (pre-filled from the latest weigh-in), goal, unit, and the target-pace cap 0.3 to 1.0 (default 0.8).
   - Optional height, sex and birth year, with a plain note that they only estimate the Healer's calorie floor.
   - The Charter: step pool, calorie limit (checked against the floor, which is shown), and 1 to 5 duties, offering Ch 16's additive suggestions; a medical-supervision confirmation (gap 2).
   - Confirm: the time zone is shown, and founding takes a hold on a wax seal.
   - Refusals shown plainly: a legacy contract open (A-07), a goal below BMI 18.5 with a height, a limit below the floor.
4. **The Contract page,** when a campaign exists:
   - Lengths 1, 3, 7, 14 and 30 days; a locked length shows its requirement ("Castle Tier II").
   - The Charter: read-only while a contract runs; revisable between contracts with the floor shown and enforced.
   - An optional pledge with its cap, and a payout preview ("at 70%: break even").
   - Seal with the existing wax-seal hold; it starts at the next dawn. Queue the next contract.
   - The running contract: day N of M, the live Q with its three pillars, the projected payout, and Withdraw (a hold to confirm, showing exactly what it pays and returns).
   - The Respite bank, and spending a day on today or yesterday. The Steward's Counsel card. An Accord (sealed from Diplomacy in T16) shows its rival and the Respect it will add (D-01).
   - No burning in the campaign; the legacy flow stays for ledgers without a campaign.
5. **The Archive:** campaign contract cards (length, Q, payout, pledge result); legacy cards unchanged; legacy reputation shown as history (A-07).
6. **The Chronicle:**
   - Steps as a weekly pace bar toward the pool (the daily tally still takes input); calories as the week's logged average against the limit with the floor marked, under-floor days shown gently.
   - Today's Valor so far as a three-part meter (duties, food logged, step pace); today's tidings (the Herald); the campaign reputation earned that day.
   - A weekly weigh-in prompt at the week close (more often optional), writing `DayLog.weight`.
   - Healer check-ins as calm cards from `healer.*`, the `final` text only when approved (otherwise the placeholder).
7. **The Milestones and Grace panel:** the 10 marks, the next mark with its earliest week and which locks are met, broken Milestones with their dates, Keeping Milestones when relevant. Never what future Milestones unlock (those stay in T16's cards). The Grace level as its plain description, never Steadiness numbers or benchmark effects. Momentum this week as earned reputation, not as a weight-loss target.

## Out of scope

The contents of the Realm, Diplomacy, Battle and Armory pages; final art and text; the rules themselves (beyond gaps 1 to 3).

## Files

- Create: `src/renderer/src/components/game/` (`GameArt.tsx`, `BigMomentCard.tsx`, `Herald.tsx`, `FoundingWizard.tsx`, `Homecoming.tsx`, `DevTimeTravel.tsx`), `src/renderer/src/components/campaign/*`, `src/renderer/src/lib/game/view/` (`shell.ts`, `contract.ts`, `chronicle.ts`), the state-level contract actions (gap 1), `src/renderer/src/pages/RealmPage.tsx`, `DiplomacyPage.tsx` and `ArmoryPage.tsx` (shells), `src/renderer/public/game-assets/manifest.json`, `scripts/check-assets.cjs`, `scripts/check-text.cjs`, `scripts/screens.cjs`, `docs/game/assets.md`, `src/renderer/src/styles/game.css`, and tests in `tests/game/viewShell.test.ts`, `viewContract.test.ts` and `viewChronicle.test.ts`.
- Edit: `App.tsx`, `state/ui.ts`, `components/TopBar.tsx`, `audio/sfx.ts`, `pages/ContractPage.tsx`, `pages/ChroniclePage.tsx`, `pages/ArchivePage.tsx` and their components and styles, `campaign.ts` (gaps 2 and 3), `types.ts`, `package.json` (`assets:check`, `text:check`).

## Verification

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass; the existing ledger tests pass unchanged.
- [ ] With an empty data folder the app opens exactly as before (ledger only, no new tabs). Founding creates `campaign.json`, shows a purse of 100 and adds the new tabs.
- [ ] Founding is refused, with a clear reason, for an open legacy contract, a BMI below 18.5 with a height, and a limit below the floor (the floor is shown before founding).
- [ ] `npm run assets:check` lists every slot as missing on a clean checkout and exits 0; `--strict` exits 1. Adding one correctly named and sized PNG to `game-assets/` and the manifest makes `<GameArt>` show it after a reload, with no code change (before-and-after screenshots). `docs/game/assets.md` lists every slot with its file name and pixel size.
- [ ] `npm run text:check` reports every catalog slot as a placeholder and every Healer entry as unapproved on a clean checkout.
- [ ] Dev time travel: advancing a day runs `settle` and the Herald shows the new tidings. After a 5-day jump the Homecoming appears and lists all 5 days. `DevTimeTravel` does not appear in `out/renderer` after `npm run build`.
- [ ] View models: a 7-day contract on its 4th day at Q 0.9 projects 10 × 7 × 1.4 × 0.833 = 81.7 before the bonus. Locked lengths report their exact requirement; the pledge cap is ×1.5 at Merchant Hall III. The pace bar for 30,000 steps by Thursday against a 50,000 pool (Monday weeks) reads 30,000 of 28,571 expected, "ahead". Valor's parts match `valor()`.
- [ ] The Milestone panel for 217 → 168 at 205 lb in week 5 shows Milestone 1 broken, Milestone 2 at 207 with earliest week 7, lock 1 met and lock 2 not yet.
- [ ] No hidden number (the benchmark, Steadiness, a rival's income) appears in any view model's output (a test scans keys and values).
- [ ] Medical supervision confirmed at founding still lets a later contract seal below the floor; without it the seal is refused.
- [ ] Manual, with dev time travel: found a campaign, seal a 3-day contract with a 20 pledge, advance 4 days, and see the payout in the purse and the Archive card. Withdraw a second contract mid-way and see exactly the previewed amount. Spend a Respite day on yesterday and see the end date move.
- [ ] There is no OS notification, tray icon or notification setting anywhere (D-04).
- [ ] Screenshots from `scripts/screens.cjs` at 1024×768 and 1920×1080: the wizard, the top bar, the Herald, the Homecoming, the Contract page (drafting and running), the Chronicle and the Milestone panel.

## Hand-off notes

*(The implementing agent adds notes here: the plumbing APIs (`GameArt`, `useText`, sound ids, the big-moment card, `screens.cjs`), the view-model conventions, and the state-level contract actions.)*
