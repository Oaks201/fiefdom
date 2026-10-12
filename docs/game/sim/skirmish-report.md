# Daily skirmishes (D-12): verification report

*Stage 3 of the daily-battles plan, 2026-10-11. Per D-02 this report only proposes: no value in `rules.ts` changed.*

## A day you don't fight is the day it always was

The same campaigns were driven through the code before D-12 (commit `bc40815`) and after it, with a player who never presses **Start today's battles**: 12 campaigns (5 seeds × steady and poor habits × 30 weeks with the greedy test driver, plus a 40-week diplomat and a 40-week passive one), 210 to 311 daily battles each. **All 12 final campaign states are byte-for-byte identical**, and none gains a `skirmishes` field.

## Whole campaigns: leading every fight vs never

`npx tsx sim/skirmish-calibrate.ts compare --seeds 20`: 20 campaigns per profile, 70 weeks, the greedy player against the same player who also presses Start every day and fights every fight with the Marshal's play (`skirmish` policy).

| Profile | Policy | Won (mean week) | Fell (before week 36) | Hexes at the end | Rule violations |
| --- | --- | --- | --- | --- | --- |
| Steadfast | greedy | 95% (50.2) | 0% (0) | 89.0 | 0 |
| Steadfast | skirmish | 100% (50.9) | 0% (0) | 89.0 | 0 |
| Committed | greedy | 30% (62.7) | 0% (0) | 63.5 | 0 |
| Committed | skirmish | 20% (64.3) | 0% (0) | 53.8 | 0 |
| Wavering | greedy | 0% | 60% (0) | 16.6 | 0 |
| Wavering | skirmish | 0% | 60% (0) | 17.3 | 0 |

The design book's safety rules hold in every run: no loss before week 36, and zero invariant violations (the development build's checks after every settlement, resettling sampled days, and the clock set back a week).

## One real difference: mythic attacks are harder on the field

The Committed player who leads every fight ends with about 10 fewer hexes. Traced day by day (seed 11, the simulator's own loop):

- The two players order the **same assaults on the same days until early March**. Then the skirmish player's assault estimate falls just short of the border garrisons (18.6 against 19.8, where the greedy player's is 19.7), and its assaults stop. Over 26 weeks it makes 4.5 assaults a campaign to the greedy player's 9.3.
- Its companies are weaker because they carry fewer **trophies**, and trophies come from beating mythic attacks. Over the first 26 weeks the formula held 7.9 of 33.8 mythic attacks a campaign; the Marshal on the field held 3.1 of 33.7. (Part of that gap is the compounding itself: the skirmish player's companies were already weaker. On the same fights the gap is smaller, below.)
- Other fights are not the cause: beasts are held about as often (58% both ways, with twice the routs on the field), raids a little more often on the field (22% vs 17%), and assaults are repulsed far less (0.1 vs 1.4).
- With fewer hexes there is less Dominion, so the purse buys fewer tiers and Crossings (spend down from about 1,990 to 1,080 in 26 weeks), which compounds. Hired companies from the Reserves Order cost the skirmish player only 3 reputation in that time.

On the same fights from fixed campaign states (12 seeds × 2 habits × weeks 8 to 26, Valor 0.2 to 1), the Marshal wins 73% of beast attacks to the formula’s 70%, 59% of rival attacks to 52%, but **43% of mythic attacks to 49%**. Against mythics alone (108 fights), the enemy at 0.85 × `hostScale` brings the Marshal level with the formula (50% vs 51%).

At low Valor the field is, if anything, kinder than the formula: at Valor 0.2 the Marshal holds 54% of defenses to the formula's 40%.

**Proposal (owner's decision, D-02):** size mythic enemies separately, for example a TUNE `RULES.skirmish.mythicScale` of about 0.85 applied on top of `hostScale` for mythic foes. `npx tsx sim/skirmish-calibrate.ts sample` now prints, for each side and enemy, the multiple of `hostScale` at which the Marshal would win as often as the formula:

| Fights (`sample --seeds 3 --every 3`: 1,560 fights) | Formula wins | Marshal wins | Multiple to match |
| --- | --- | --- | --- |
| Defense vs mythic (256) | 58% | 55% | ×0.88 |
| Defense vs beasts (500) | 76% | 73% | ×0.96 |
| Defense vs rival (593) | 40% | 42% | ×1.04 |
| Assault vs beasts (94) | 95% | 99% | ×1.14 |
| Assault vs rival (97) | 89% | 97% | ×1.13 |
| Assault vs militia (16), mythic (4) | too few to read | | |

Assaults on the field are a little easier than at the close, defenses against mythics a little harder; the mythic gap is the one that compounds, through trophies.

A human player who reads the intents should do better than the Marshal, so this matters most to a player who leaves fights to him; but a mythic fight on the field is currently the one place where fighting yourself is likely to cost you.

## In the real app

Development build, scratch saves (`scripts/screens-data.ts` midgame: 16 weeks, a steady greedy player), driven over CDP with `scripts/screens.cjs --dev`; screenshots in `docs/game/screens/d12/`.

1. **Day 1:** an assault ordered on Skullcairn from the Realm, then **Start today's battles (2)** on the Chronicle (Valor 100%). Fought both by hand: the Ugrak raid (Bribe, then Spoils of War: a Rout) and the assault (Blink Strike, then Phalanx: a defeat; its three companies listed as Weary from the close).
2. **Orders lock:** the Realm's orders read "Held: the battles have begun", the assault target and every company button were disabled, and the stored orders were unchanged.
3. **The close** (`advanceDays(1)`): the Herald's two results were exactly the lines the result screens had shown ("Ugrak raid on Raiders' Toll: routed. Spoils 25.9." and the repulse), both marked **You led it**, and the log's events carry `led: true` with spoils 25.9. "The 2 battles you led: results and replays" opened the day read-only: "Posted at the day's close."
4. **Day 2:** started again, fought the beasts by hand (a victory, Spoils 34.6, with Reserves hiring a company) and left the assault to the close: the page closed, and at the close the beasts' result posted as led while the assault was the formula's (`led: false`).
5. **Day 3:** didn't press the button. The close posted the day's defense as the formula's, no skirmish day was added, and the Herald showed no link.
6. **A window under 1024 px** shows the widen notice and hides the field (this check caught the skirmish layout overriding the battle page's narrow rule; fixed).

Screenshots: `start-button`, `opening`, `round`, `result`, `result-repulsed`, `orders-held`, `herald-led`, `yesterday-review` (1280 × 800) and `widen-notice` (1000 × 800).

## Polish in this stage

- **The next dawn:** the Herald marks each result the player led ("You led it") and links to that day's fights, read-only, with their results and replays. Before, a led fight's replay (kept `RULES.skirmish.keepDays` days) could not be reached once its day closed.
- **A fight opened and left** is finished by the Marshal at the close, and its result card now says so (`Skirmish.marshal`, set only by the close).
- **Art:** the beasts and village militia met in skirmishes have token slots (`company.bears.token`, `company.wolves.token`, `company.giantSpiders.token`, `company.villageMilitia.token`) in `scripts/check-assets.cjs`; until they have files they show their initials. The next `npm run assets:check` adds them to `docs/game/assets.md`.
- **Tests:** the reveal roll on a den assault agrees between the skirmish list and the close (a revealing den is left to its Mythic Hunt, any other den is fought as beasts), and the Herald's markers and link.
