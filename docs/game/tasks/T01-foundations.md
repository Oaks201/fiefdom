# T01 — Foundations: types, rules table, RNG, campaign clock, codex and text data

| Phase | Depends on | Unblocks | Contains spoilers |
| --- | --- | --- | --- |
| 1 Foundations | — | every other task | Yes (it transcribes Appendix C) |

## Goal

Lay the ground every other task builds on: the shared types, the single tuning table, seeded randomness, 04:00 campaign time, the game's content as data, the text catalog, and a lint script that keeps all of them honest. After T01, other agents can work in parallel without inventing their own versions of these.

## Read first

- Book: Appendix A (Core types, New modules), Appendix B (the whole table), Appendix C (the whole codex), Ch 2 "Rules of real time" (rules 6 and 7), Ch 17 "Writing".
- Decisions: A-01, A-03, A-04, A-08, A-11, A-17 to A-22 (TUNE values that go into `rules.ts`), A-30, A-31, A-46.
- Code: `src/renderer/src/lib/contracts.ts` (`hashSeed`, FNV-1a), `src/renderer/src/lib/dates.ts`, `tsconfig.node.json`, `package.json` scripts.

## Scope

1. **`lib/game/types.ts`.** Transcribe the Appendix A types, then add:
   - A root `CampaignState` with one slice per system: `campaign`, `charter`, `hexes`, `buildings` (tiers), `castleTier`, `crossings`, `roster`, `contracts`, `purse` (events), `weight` (milestones, grace, Healer floor), `rivals`, `fronts`, `courtships`, `deals`, `orders`, `grandBattles`, `coalitions`, `worldEvents`, `log` (game events for the Herald and Chronicle), and `settledThrough` (`{ day: ISODate; week: number }`). Everything must be JSON-serializable.
   - `HexState` additions: `land?: 'north' | 'south' | 'west' | 'east'`, `road?: BuildingId`, `mythic?: boolean`.
   - `BuildingId = 'barracks' | 'merchantHall' | 'mageTower' | 'foundry'`, `RivalId = 'orc' | 'goblin' | 'dwarf' | 'archmage'`.
   - An `Effect` discriminated union that the codex uses to describe items, Wings, perks, Orders and Doctrines as data (for example `{ kind: 'power', add: 2 }` or `{ kind: 'mythicDamage', mult: 0.7 }`). T07 interprets it.
   - A `GameEvent` union for the log (raid result, assault result, courtship result, rival news, milestone, and so on). Keep it open for later tasks to extend.
2. **`lib/game/rules.ts`.** Export one deep-frozen `RULES` object with `ruleVersion: '2.0.0'`, grouped by Appendix B's "Area" column. Include every Appendix B row, plus the TUNE values from A-17 to A-22, A-24 and A-33, each with a `// TUNE (A-xx)` comment. Add small helpers that only read `RULES`, such as `base(ring)` and `lengthMultiplier(days)`.
3. **`lib/game/rng.ts`.**
   - `draw(seed: number, date: ISODate, label: string): number` returns a value in [0, 1). It is a pure function of its inputs, built on `hashSeed` (32-bit FNV-1a) and a small mixer such as mulberry32 or splitmix32.
   - Helpers built on it: `roll(seed, date, label, lo, hi)`, `int`, `chance(p)`, `pick(list)`, `weighted(list, weights)`, `shuffle`, and `stream(seed, date, label)` for several draws in sequence.
4. **`lib/game/clock.ts`.** Real time enters only here, always as a `now: Date` parameter.
   - `openDay(now, tz)`: the campaign day still open at `now` (day D is open from 04:00 on D to 04:00 on D+1, per A-01).
   - `dayCloseInstant(day, tz)`: a `Date`.
   - `closedDaysSince(lastSettled, now, tz)`: the ordered list of days to settle.
   - `weekOf(day, weekStartsOn)`, `isWeekCloseDay(day, weekStartsOn)`, `campaignWeek(startDay, day, weekStartsOn)` (per A-04), `daysInWeek1(startDay, weekStartsOn)`.
   - It must work for any IANA zone through `Intl.DateTimeFormat`, whatever the machine's zone, and it must be DST-safe.
5. **Codex data** in `src/renderer/src/data/codex/`: transcribe Appendix C (plus building and Crossing company names from Ch 7 and Ch 8) into `companies.json`, `crossings.json`, `elites.json`, `items.json`, `wings.json`, `orders.json`, `doctrines.json`, `hosts.json`, `mythics.json`, `rituals.json`, `events.json` and `rivals.json` (names, realms, roads, personalities; numbers stay in `rules.ts`).
   - Entry-specific numbers (an item's cost, an elite's power) live in the codex. Global numbers live in `rules.ts`. Never both.
   - Effects use the `Effect` union. Event criteria are an `id` plus parameters; T13 implements the logic.
   - `lib/game/codex.ts` loads the files with types and exports `validateCodex()`: ids are unique, tags are valid, cross-references resolve, every Order and Doctrine names a real source.
6. **Text catalog** in `src/renderer/src/data/text/`: `healer.json`, `milestones.json`, `rivals.json`, `events.json`, `coalitions.json`, `endings.json`, `crossings.json`, `units.json`, `items.json`, `battle-reports.json` and `herald.json`.
   - Each entry: `{ "template": "...{fact}...", "final": null }`. Healer entries also carry `"approved": false`.
   - Create every slot in the Ch 17 Writing table with a plain-fact template (A-46). Do not write flavor text.
   - `lib/game/text.ts` exports `t(id, facts)`. It returns `final` when present (Healer entries only when `approved` is true), otherwise the template filled with `facts`. An unknown id returns `[missing:<id>]`.
7. **`scripts/check-game-rules.cjs`**, run by a new npm script `check:game`. It fails when:
   - `src/renderer/src/lib/game/**` contains `Math.random`, `Date.now`, or `new Date(` (outside `clock.ts`);
   - a numeric literal outside `rules.ts` is not in the allowlist {0, 1, −1, 2, 100} and its line lacks a `// rules-ok: <reason>` comment;
   - `validateCodex()` reports errors, or a catalog slot that a codex entry needs (unit and item descriptions) is missing.
8. **Tests** in `tests/game/`: `rng.test.ts`, `clock.test.ts`, `rules.test.ts`, `codex.test.ts`, `text.test.ts`.

## Out of scope

Any game logic beyond the helpers above; persistence; screens.

## Files

- Create: everything under `src/renderer/src/lib/game/` named above, `src/renderer/src/data/codex/*`, `src/renderer/src/data/text/*`, `scripts/check-game-rules.cjs`, `tests/game/*`.
- Edit: `package.json` (add the `check:game` script; no new dependencies).

## Verification

- [ ] `npm run typecheck`, `npm test` and `npm run check:game` pass.
- [ ] RNG: `draw(42, '2026-10-05', 'threat')` gives the same value across three separate processes. Changing any one argument changes the value. Over 10,000 draws the mean is 0.5 ± 0.01. `weighted([a, b, c], [1, 2, 7])` lands within ±1 percentage point of 10/20/70% over 100,000 draws.
- [ ] Clock, with `tz = 'America/New_York'` while the test process's own TZ is set to something else (for example `process.env.TZ = 'Asia/Tokyo'` before importing):
  - `openDay` at 2026-10-06 02:00 local → `'2026-10-05'`; at 04:00 local → `'2026-10-06'`.
  - `dayCloseInstant('2026-03-07')` is 2026-03-08 04:00 EDT (the night DST starts).
  - `closedDaysSince('2026-10-28', 2026-11-03 09:00 local)` → exactly `['2026-10-29', …, '2026-11-02']`, with no duplicate or missing day across the 2026-11-01 DST change.
  - `campaignWeek`: start Thu 2026-10-08 with weeks starting Monday → week 1 for Oct 8 to 11, week 2 from Oct 12; `daysInWeek1` = 4.
- [ ] Rules: a test lists every Appendix B parameter by key and asserts each one exists in `RULES`. Mutating `RULES` throws in strict mode. `ruleVersion === '2.0.0'`.
- [ ] Codex counts: 20 building companies (4 × 5 tiers); 6 Crossings × 3 stages; 4 Elites plus the Sworn; 23 items (6 rank I, 4 rank II, 4 rank III, 4 Legendary, 5 trophies); 24 Wings (4 buildings × 3 Milestones × 2); 19 Orders (Barracks 4, Merchant Hall 3, Mage Tower 3, Foundry 3, 6 Crossing signatures); 5 Doctrines; 4 rival hosts of 4 companies plus a commander each; 6 Mythic Hunt quarries; 4 Rituals; 14 world events. `validateCodex()` returns no errors.
- [ ] Text: every Ch 17 slot category exists with the counts in that table. `t()` returns the template when `final` is null. A Healer `final` is ignored until `approved` is true. An unknown id returns `[missing:<id>]`.
- [ ] Planting `Math.random()` in a scratch file under `lib/game/` makes `npm run check:game` fail. Remove it afterwards.

## Hand-off notes

*(The implementing agent adds notes here: anything later tasks must know, and any decisions.md entries raised.)*
