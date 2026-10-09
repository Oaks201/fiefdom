# First ten weeks — pixel art

Built-in image_gen was used for 36 original source images. 65 slots have installed local PNGs; this early set requires 166 slots. Still pending: banner.archmage, banner.dwarf, banner.goblin, banner.neutral, banner.orc, building.barracks.2, building.barracks.3, building.foundry.1, building.foundry.2, building.foundry.3, building.mageTower.1, building.mageTower.2, building.mageTower.3, building.merchantHall.1, building.merchantHall.2, building.merchantHall.3, castle.2, company.acolytes.portrait, company.acolytes.token, company.alchemists.portrait, company.alchemists.token, company.ballistaCrew.portrait, company.ballistaCrew.token, company.battlemages.portrait, company.battlemages.token, company.beastcatchers.portrait, company.beastcatchers.token, company.bombardBattery.portrait, company.bombardBattery.token, company.brutes.portrait, company.brutes.token, company.caravanGuard.portrait, company.caravanGuard.token, company.cataphracts.portrait, company.cataphracts.token, company.clayGolems.portrait, company.clayGolems.token, company.crossbowmen.portrait, company.crossbowmen.token, company.goldenGuard.portrait, company.goldenGuard.token, company.grunts.portrait, company.grunts.token, company.hedgeWardens.portrait, company.hedgeWardens.token, company.hiredOgres.portrait, company.hiredOgres.token, company.ironclads.portrait, company.ironclads.token, company.menAtArms.portrait, company.menAtArms.token, company.palisadeCrew.portrait, company.palisadeCrew.token, company.pikemen.portrait, company.pikemen.token, company.rangers.portrait, company.rangers.token, company.sellswords.portrait, company.sellswords.token, company.shamans.portrait, company.shamans.token, company.sneaks.portrait, company.sneaks.token, company.spellblades.portrait, company.spellblades.token, company.ugraksWarboss.portrait, company.ugraksWarboss.token, company.wanderingOrder.portrait, company.wanderingOrder.token, company.warWagons.portrait, company.warWagons.token, company.wardens.portrait, company.wardens.token, company.watchmen.portrait, company.watchmen.token, company.wolfRiders.portrait, company.wolfRiders.token, event.beastSurge, event.deepCall, event.envoys, event.fearOfTheCrown, event.grandAuction, event.hungryWinter, event.ugraksChallenge, event.wanderingOrder, hex.battlefield, hex.capital, hex.gate, hex.lair, hex.lairMouth, hex.overlay.scorched, hex.realm, hex.ruins, item.coldIronEdges, item.luckyCoin, item.powderKegs, item.runeChalk, item.towerShields, milestone.2, moment.grandBattleLost, portrait.sappers.

## Art direction

The owner’s actual portrait is the visual reference. Broad square clusters, stepped silhouettes, warm upper-left light, discrete color planes and chunky fantasy materials are shared throughout. Ugrak was redesigned from scratch as a fierce black-maned, heavily tusked warlord. His mood variants retain that identity.

## Coverage

The [exposure report](exposure.json) records the earliest observed week for each screen slot across 36 real-engine campaigns. Additional coverage includes every rival host, both early hybrid stages, calendar-dependent Winter, threshold-triggered rival events, and the third milestone/Elites for a faster journey. Later Tier IV/V, later milestones, mythic hunts and endgame art retain placeholders. Game rules and progression were not changed.

## Files and prompts

All active files are in `src/renderer/public/game-assets/`, mapped by `manifest.json`. Each row links its exact prompt, references, preserved original generated source path, installed output filenames, dimensions and nearest-neighbor normalization. Transparent artwork preserves the generator’s alpha; resizing contains the whole silhouette without stretching.

| Source asset | Prompt / provenance | Installed output(s) |
| --- | --- | --- |
| `company.anvilGuard` | [company.anvilGuard.json](company.anvilGuard.json) | `company.anvilGuard.portrait-early-v3.png` (512 × 512), `company.anvilGuard.token-early-v3.png` (128 × 128) |
| `company.apprentices` | [company.apprentices.json](company.apprentices.json) | `company.apprentices.portrait-early-v3.png` (512 × 512), `company.apprentices.token-early-v3.png` (128 × 128) |
| `company.emrysEcho` | [company.emrysEcho.json](company.emrysEcho.json) | `company.emrysEcho.portrait-early-v3.png` (512 × 512), `company.emrysEcho.token-early-v3.png` (128 × 128) |
| `company.hammerers` | [company.hammerers.json](company.hammerers.json) | `company.hammerers.portrait-early-v3.png` (512 × 512), `company.hammerers.token-early-v3.png` (128 × 128) |
| `company.illusionists` | [company.illusionists.json](company.illusionists.json) | `company.illusionists.portrait-early-v3.png` (512 × 512), `company.illusionists.token-early-v3.png` (128 × 128) |
| `company.ironbreakers` | [company.ironbreakers.json](company.ironbreakers.json) | `company.ironbreakers.portrait-early-v3.png` (512 × 512), `company.ironbreakers.token-early-v3.png` (128 × 128) |
| `company.runeGolems` | [company.runeGolems.json](company.runeGolems.json) | `company.runeGolems.portrait-early-v3.png` (512 × 512), `company.runeGolems.token-early-v3.png` (128 × 128) |
| `company.runePriests` | [company.runePriests.json](company.runePriests.json) | `company.runePriests.portrait-early-v3.png` (512 × 512), `company.runePriests.token-early-v3.png` (128 × 128) |
| `company.shadowHounds` | [company.shadowHounds.json](company.shadowHounds.json) | `company.shadowHounds.portrait-early-v3.png` (512 × 512), `company.shadowHounds.token-early-v3.png` (128 × 128) |
| `company.slingers` | [company.slingers.json](company.slingers.json) | `company.slingers.portrait-early-v3.png` (512 × 512), `company.slingers.token-early-v3.png` (128 × 128) |
| `company.stoneSentinels` | [company.stoneSentinels.json](company.stoneSentinels.json) | `company.stoneSentinels.portrait-early-v3.png` (512 × 512), `company.stoneSentinels.token-early-v3.png` (128 × 128) |
| `company.thunderers` | [company.thunderers.json](company.thunderers.json) | `company.thunderers.portrait-early-v3.png` (512 × 512), `company.thunderers.token-early-v3.png` (128 × 128) |
| `company.trapSetters` | [company.trapSetters.json](company.trapSetters.json) | `company.trapSetters.portrait-early-v3.png` (512 × 512), `company.trapSetters.token-early-v3.png` (128 × 128) |
| `company.wisps` | [company.wisps.json](company.wisps.json) | `company.wisps.portrait-early-v3.png` (512 × 512), `company.wisps.token-early-v3.png` (128 × 128) |
| `hex.building` | [hex.building.json](hex.building.json) | `hex.building-early-v3.png` (222 × 256) |
| `hex.castle` | [hex.castle.json](hex.castle.json) | `hex.castle-early-v3.png` (222 × 256) |
| `hex.den` | [hex.den.json](hex.den.json) | `hex.den-early-v3.png` (222 × 256) |
| `hex.road` | [hex.road.json](hex.road.json) | `hex.road-early-v3.png` (222 × 256) |
| `hex.village` | [hex.village.json](hex.village.json) | `hex.village-early-v3.png` (222 × 256) |
| `milestone.3` | [milestone.3.json](milestone.3.json) | `milestone.3-early-v3.png` (1920 × 1080) |
| `portrait.goldCloaks` | [portrait.goldCloaks.json](portrait.goldCloaks.json) | `portrait.goldCloaks-early-v3.png` (512 × 512) |
| `portrait.oathsworn` | [portrait.oathsworn.json](portrait.oathsworn.json) | `portrait.oathsworn-early-v3.png` (512 × 512) |
| `portrait.sappers` | [portrait.sappers.json](portrait.sappers.json) |  |
| `portrait.starwardens` | [portrait.starwardens.json](portrait.starwardens.json) | `portrait.starwardens-early-v3.png` (512 × 512) |
| `rival.archmage.angry` | [rival.archmage.angry.json](rival.archmage.angry.json) | `rival.archmage.angry-early-v3.png` (512 × 640) |
| `rival.archmage.calm` | [rival.archmage.calm.json](rival.archmage.calm.json) | `rival.archmage.calm-early-v3.png` (512 × 640) |
| `rival.archmage.humbled` | [rival.archmage.humbled.json](rival.archmage.humbled.json) | `rival.archmage.humbled-early-v3.png` (512 × 640) |
| `rival.dwarf.angry` | [rival.dwarf.angry.json](rival.dwarf.angry.json) | `rival.dwarf.angry-early-v3.png` (512 × 640) |
| `rival.dwarf.calm` | [rival.dwarf.calm.json](rival.dwarf.calm.json) | `rival.dwarf.calm-early-v3.png` (512 × 640) |
| `rival.dwarf.humbled` | [rival.dwarf.humbled.json](rival.dwarf.humbled.json) | `rival.dwarf.humbled-early-v3.png` (512 × 640) |
| `rival.goblin.angry` | [rival.goblin.angry.json](rival.goblin.angry.json) | `rival.goblin.angry-early-v3.png` (512 × 640) |
| `rival.goblin.calm` | [rival.goblin.calm.json](rival.goblin.calm.json) | `rival.goblin.calm-early-v3.png` (512 × 640) |
| `rival.goblin.humbled` | [rival.goblin.humbled.json](rival.goblin.humbled.json) | `rival.goblin.humbled-early-v3.png` (512 × 640) |
| `rival.orc.angry` | [rival.orc.angry.json](rival.orc.angry.json) | `rival.orc.angry-early-v3.png` (512 × 640) |
| `rival.orc.calm` | [rival.orc.calm.json](rival.orc.calm.json) | `rival.orc.calm-early-v3.png` (512 × 640) |
| `rival.orc.humbled` | [rival.orc.humbled.json](rival.orc.humbled.json) | `rival.orc.humbled-early-v3.png` (512 × 640) |

## Preview and verification

In `npm run dev`, open **Art samples** and tick **Show all installed art**. Previewing art does not change a campaign. **Reload art** refreshes URLs; versioned filenames also avoid stale revisions.

Checks: `npm run assets:check -- --first-ten-weeks --strict`, `npx tsx scripts/early-art-exposure.ts --strict`, `node scripts/early-art-qa.cjs`, and the regular dev/offline `scripts/art-qa.cjs` verification. Live checks use isolated simulated fixtures at weeks 1, 3, 6 and 10 at 1024 × 768 and 1920 × 1080.
