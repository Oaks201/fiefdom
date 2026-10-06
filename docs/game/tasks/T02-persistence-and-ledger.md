# T02 — Persistence and ledger additions: campaign.json, weigh-ins, total calories

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 1 Foundations | T01 | T05 (real weigh-ins), T06, T16 | No |

## Goal

Give the game somewhere to live (`campaign.json`, saved as safely as the ledger) and give the ledger the two inputs it lacks: hand-typed weigh-ins and Fitbit's total calories burned. Also ship a minimal weigh-in field now, so real weight history builds up while the rest of the game is being written.

## Read first

- Book: Ch 1 "Kept from the existing code", Appendix A "Changes to existing code" (the `ledgerFile` and `health` rows), Ch 16 (the Privacy row).
- Decisions: A-02, A-05, A-06, A-07, A-08, A-10.
- Code: `src/main/ledgerFile.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/shared/api.ts`, `src/renderer/src/state/store.ts`, `src/renderer/src/state/persistence.ts`, `src/renderer/src/lib/ledger.ts` (`normalizeLedger`, `validateWeight`, `setMetric`, `mergeSynced`), `src/renderer/src/lib/types.ts`, `src/main/health.ts`, `src/renderer/src/state/health.ts`, `tests/ledgerFile.test.ts`, `tests/health.test.ts`, `tests/support/fakeGoogle.ts`.

## Scope

1. **Campaign file (main process).** Reuse the atomic writer, daily backups and corrupt-file fallback for `campaign.json`. Either generalize `LedgerFile` (file name and backup prefix as parameters) or add a sibling class. `ledger.json` behavior must stay byte-for-byte the same. Backups go to `backups/campaign-YYYY-MM-DD.json`, keeping the last 30.
2. **Bridge.** Add `loadCampaign()`, `saveCampaign(json)` and `saveCampaignSync(json)` to `shared/api.ts`, the preload and IPC.
3. **Renderer persistence and store.**
   - `state/persistence.ts` gains campaign functions, with a localStorage fallback under the key `fiefdom:campaign`.
   - New `state/campaign.ts`: a zustand store holding `status`, `campaign: CampaignState | null`, `load()` and `apply(op)`. `apply` catches `CampaignError` and shows it as a toast. Saving is debounced, with a synchronous flush on window close, mirroring `state/store.ts`.
   - Nothing is written while `campaign` is null. There is no game logic here.
4. **Weigh-ins in the ledger (A-05).**
   - Add `DayLog.weight?: number` and bump `LEDGER_VERSION` to 2.
   - `normalizeLedger` accepts v1 and v2. When migrating v1, copy each legacy contract's `startWeight` and `finalWeight` onto its start and close dates where that day has no weight.
   - Add `setWeight(ledger, date, weight | undefined)`, validated with the existing `validateWeight`, and `weighIns(ledger): { date, weight }[]` sorted by date.
5. **Total calories burned (A-06).**
   - Add a `burned` health metric that reads Google Health `total-calories`. It is read-only: it is stored in the day log, never marked manual, never shown as a tally, and never used for scoring.
   - Extend the fake Google server and the tests.
   - `src/main/health.ts` had uncommitted changes at planning time. Make sure they are committed before you start.
6. **Minimal weigh-in field.** Add a small "Weight today" input to the Chronicle's day panel (the existing `WeighIn` component can serve as reference for style). This is deliberately minimal; T17 builds the full weekly weigh-in prompt.

## Out of scope

Founding, settlement and every game rule.

## Files

- Edit: `src/main/ledgerFile.ts` (or add `src/main/jsonFile.ts`), `src/main/index.ts`, `src/preload/index.ts`, `src/shared/api.ts`, `src/renderer/src/state/persistence.ts`, `src/renderer/src/lib/types.ts`, `src/renderer/src/lib/ledger.ts`, `src/main/health.ts`, `src/renderer/src/state/health.ts`, one Chronicle component.
- Create: `src/renderer/src/state/campaign.ts`, `tests/campaignFile.test.ts`, `tests/ledgerV2.test.ts`.

## Verification

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass. All existing tests pass unchanged.
- [ ] The campaign file passes tests that mirror `tests/ledgerFile.test.ts`: atomic write, one backup per day, the newest 30 kept, and a corrupt file falling back to the newest good backup while the damaged copy is preserved.
- [ ] Migration: a v1 ledger with two legacy contracts (217 → 214, then 214 → 211) normalizes to v2 with weights on the four contract dates. Normalizing a v2 ledger again returns an identical object. A hand-typed weight on a contract date is never overwritten.
- [ ] `setWeight` rejects values that `validateWeight` rejects, and `setWeight(…, undefined)` clears the field.
- [ ] Health: the fake Google returns `total-calories` for a range, and those days get `burned` set. A hand-typed `eaten` value is still never overwritten. The `manual` flag never applies to `burned`. Revoking the activity scope reports an error for `burned` as it does for `steps`.
- [ ] Manual check, run with `FIEFDOM_DATA_DIR` pointed at a temp folder: typing a weight in the Chronicle writes `days[date].weight` into `ledger.json`, and `campaign.json` does not exist yet.

## Hand-off notes

*(The implementing agent adds notes here.)*
