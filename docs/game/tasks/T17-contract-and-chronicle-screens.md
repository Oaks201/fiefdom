# T17 — Contract and Chronicle screens, Milestones and Grace

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 5 Screens | T04, T05, T16 | T21 | Light (Milestone count and marks only) |

## Goal

Rework the two pages the player opens every day for the campaign. The Contract page seals any length with an optional pledge and shows the payout taking shape. The Chronicle shows the week's pace, today's Valor, the weekly weigh-in, and progress toward the next Milestone, without ever shaming a bad day.

## Read first

- Book: Ch 4 (all of it), Ch 5 "Momentum" and "Realm Consistency", Ch 9 "Milestones" and "The Crown's Grace" (what the player sees), Ch 2 "The daily and weekly loop", Ch 16 (all of it: the tone and the Healer check-ins).
- Decisions: D-01, A-02, A-07, A-11, A-39, A-40, A-46.
- Code: `pages/ContractPage.tsx`, `pages/ChroniclePage.tsx`, `pages/ArchivePage.tsx`, `components/contract/*`, `components/chronicle/*`, `components/archive/ContractCard.tsx`.

## Scope

1. **The Contract page** (when a campaign exists):
   - Choose a length: 1, 3, 7, 14 or 30 days. Locked lengths show their requirement ("Castle Tier II").
   - The Charter (read-only while a contract runs; editable between contracts, with the Healer floor shown and enforced, and a medical-supervision override with a confirm).
   - An optional pledge slider with its cap and a payout preview: "at 70%: break even".
   - Seal with the existing wax-seal hold; it starts at the next dawn. Queue the next contract.
   - The running contract: day N of M, the live Q with its three pillars, the projected payout, and Withdraw (a hold to confirm, showing exactly what it pays and returns).
   - The Respite bank, and spending a day on today or yesterday.
   - The Steward's Counsel suggestion card.
   - An Accord contract (sealed from Diplomacy) shows its rival and the Respect it will add (D-01).
   - There is no burning in the campaign. The legacy flow stays only for ledgers with no campaign.
2. **The Archive:** campaign contracts get cards (length, Q, payout, pledge result). Legacy cards stay unchanged. Legacy reputation is shown in the Archive as history (A-07).
3. **The Chronicle:**
   - Steps as a weekly pace bar toward the pool (the daily tally still accepts input).
   - Calories as the week's logged average against the limit, with the floor marked; under-floor days are shown gently.
   - Today's Valor so far, as a simple three-part meter (duties, food logged, step pace).
   - Today's tidings (the T16 Herald).
   - The day ledger panel lists the campaign reputation earned today.
   - A weekly weigh-in prompt at week close; more often is optional. It writes `DayLog.weight`, extending T02's minimal field.
   - Healer check-ins appear as calm cards, using `healer.*` text, shown only when `approved` (the placeholder otherwise).
4. **A Milestones and Grace panel** (a Chronicle side panel or modal):
   - The 10 marks with their weights. The next mark, its earliest week, and which locks are met.
   - Broken Milestones with their dates, and Keeping Milestones when relevant.
   - Do not list what future Milestones unlock (spoilers stay in T14's cards).
   - The Grace level with its plain description, never Steadiness numbers or benchmark effects.
   - Momentum this week, shown as earned reputation, not as a weight-loss target.
5. **View models** in `lib/game/view/contract.ts` and `lib/game/view/chronicle.ts`, with tests.

## Out of scope

The Realm, Diplomacy, Battle and Armory pages; the rules themselves.

## Files

- Create: `src/renderer/src/lib/game/view/contract.ts`, `view/chronicle.ts`, `src/renderer/src/components/campaign/*`, `tests/game/viewContract.test.ts`, `tests/game/viewChronicle.test.ts`.
- Edit: `pages/ContractPage.tsx`, `pages/ChroniclePage.tsx`, `pages/ArchivePage.tsx`, the related components and styles.

## Verification

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] View model: a 7-day contract on its 4th day with Q 0.9 projects 10 × 7 × 1.4 × 0.833 = 81.7. Locked lengths report their exact requirement. The pledge cap matches T04 (×1.5 at Merchant Hall III).
- [ ] View model: the Chronicle's pace bar for 30,000 steps by Thursday against a 50,000 pool (week from Monday) reads 30,000 of 28,571 expected, so "ahead". Valor parts match T04's `valor()`.
- [ ] The Milestone panel for 217 → 168 at 205 lb in week 5 shows Milestone 1 broken, Milestone 2 at 207 with earliest week 7, lock 1 met, and lock 2 not yet.
- [ ] No hidden number (benchmark, Steadiness) appears in any view model output (test by key name and value scan).
- [ ] Manual, with dev time travel: found a campaign, seal a 3-day contract with a 20 pledge, advance 4 days, and see the payout in the purse and the Archive card. Withdraw a second contract mid-way and see exactly the previewed amount. Spend a Respite day on yesterday and see the end date move.
- [ ] A ledger without a campaign still shows the legacy Contract page and behaves exactly as before (the existing tests pass).
- [ ] Screenshots at 1024×768 and 1920×1080 of the Contract page (drafting and running), the Chronicle, and the Milestone panel.

## Hand-off notes

*(The implementing agent adds notes here.)*
