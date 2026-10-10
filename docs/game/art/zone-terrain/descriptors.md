# Zone terrain tiles: what each one shows

56 hex tiles that give each part of the map its own look (D-09). Approved by the owner on 2026-10-09. Each tile's ID is its art slot. `node scripts/zone-terrain-prompts.cjs` turns each row into a Codex prompt in [prompts.json](prompts.json), with each region's look and the house style; edit this file and run it again to change a prompt. The [README](README.md) explains making and installing the tiles.

**How tiles are picked.** A hex's tile depends on where it is, not who holds it: a Dwarf hex you conquer stays mountainous and gets your border color. Until a tile's file exists, its hexes keep today's art, so tiles can arrive one at a time. The Crown heartland (rings 0 to 2) keeps today's tiles.

**Near and far.** Each zone's wild hexes come in two stages: *near* (rings 3 and 4) and *far* (ring 5). The gate (ring 5), the home hexes and the capital (ring 6) take the zone the rest of the way, so the land builds toward each capital.

## Rules for every tile

- **Style:** the same pixel art as the existing tiles: chunky square pixel clusters, warm dark outline, golden light from the upper left, 4 to 5 flat shades per material. Pointy-top hexagon on a transparent 222 × 256 canvas.
- **Readable at about 60 px:** one big landmark and two or three supporting details, never clutter. Each zone has its own dominant palette (listed below), so the zones read apart at a glance.
- **Leave room for the game's badges:** capitals get a crown badge in the middle, battlefields a war-track pill in the middle, villages a small badge near the top-left corner. The landmark should still read around them.
- **Never:** writing, letters, numbers, readable runes, coats of arms or banner symbols (banners are plain cloth). No bodies or gore; bones are fine where noted.

## The Ashen Steppe (Orc, north-west)

**Look:** war-torn. Ash gray and charcoal ground, ochre dead grass, rust-orange iron, raw dark timber, ember red-orange glow, bone white. Everything built is jagged: riveted iron plates, sharpened logs lashed with rope and chain, spikes, tusks and horns. Smoke and embers everywhere. Unlike the Wyrmfells, the damage here is made by orcs: structures, weapons and fire, not beasts.

| Tile | Where | What it shows |
| --- | --- | --- |
| `hex.wilds.orc.near` | Ashfall, Grimtusk Rise, Cinderheath, Redbarrow | Burnt grassland: ochre dead grass fading into gray ash, two charred tree stumps, a toppled barricade of sharpened logs, a rusted broken blade stuck upright in the ground, a thin wisp of smoke. |
| `hex.wilds.orc.far` | Scorchmoor, Howling Tor (and Gorehollow, Blackfang when not villages) | War-wrecked badlands: cracked charcoal earth with glowing ember fissures, a burnt-out watchtower of jagged timber and iron plates, a row of sharpened stakes, a broken siege wheel, a heavy column of black smoke. |
| `hex.village.orc` | Orc-land villages (e.g. Gorehollow, Blackfang, Gallowsway) | An orc war-camp village: three longhuts of hide and dark timber with jagged scrap-iron roofs, ringed by a sharpened-log palisade, a smoking cookfire in the middle, a totem pole topped with a horned beast skull. |
| `hex.road.orc` | Skullcairn | A rutted dark-mud road through ash, lined with sharpened stakes, a cairn of horned beast skulls at the roadside, a wrecked war-wagon with an iron-banded wheel. |
| `hex.gate.orc` | Ashgate | A hulking gatehouse of lashed black logs armored with riveted, jagged iron plates; two huge curved tusks arch over the gate; a fire brazier on each side; spikes along the top. |
| `hex.realm.orc` | Ember Waste, Charnel Plain | The warlord's war-forge grounds: a fighting pit ringed with spikes, a crude forge belching black smoke beside heaps of scrap armor and weapons, a half-built battering ram. |
| `hex.battlefield.orc` | Redfield, Crowfield | Churned ash-and-mud field: shattered shields, broken spears, a toppled tattered plain banner, scorch craters, crows perched on a stake. |
| `hex.capital.orc` | Skullthrone | Ugrak's stronghold: a towering, jagged, asymmetric fortress of black iron plates and huge timbers, spiked battlements and hooked blades, a giant horned beast skull mounted over the gate, red forge glow in the windows, smoke and embers rising. Aggressive silhouette. |

## The Gilded Warren (Goblin, north-east)

**Look:** industrial, rich and run on paperwork, burrowed into green hills. The Warren is the realm's trade capital, so its buildings look official as well as wealthy. Brass and gold, copper with verdigris teal, red brick, soot black, warm lamplight yellow, white steam. Brass pipes, cogs, chimneys, riveted copper, coins; and the trappings of trade bureaucracy: counting-houses, ledgers, scrolls tied with red ribbon, plain wax seals, brass scales and stamps, clerks and queues. All paper is blank or scribbled with wavy lines, never readable. Busy and glittering rather than grim.

| Tile | Where | What it shows |
| --- | --- | --- |
| `hex.wilds.goblin.near` | Copperdell, Tinker’s Hollow, Crookback, Rustpenny | Green rolling hills dotted with round brass-rimmed burrow doors and little chimneys puffing steam, copper pipes snaking through the grass, a short mine-cart track, a little surveyor's boundary post hung with a wax-sealed tag. |
| `hex.wilds.goblin.far` | Pilfer’s End, Smuggler’s Notch (and Brasswick, Gobbet’s Burrow when not villages) | Hills cut open for industry: terraced mine pits, a tall brick smokestack and a riveted steam boiler, a crane hoisting a cart of gold ore onto a big brass weighing scale beside a clerk's shed, soot-darkened ground glinting with dropped coins. |
| `hex.village.goblin` | Goblin-land villages (e.g. Brasswick, Tollbridge) | A crowded goblin town: tall, narrow, crooked houses with copper roofs and many chimneys, a counting-house with a clerk at an open window stamping papers and a short queue outside, strings of warm lanterns, a big brass cog set into a wall. |
| `hex.road.goblin` | Haggler’s Way | A neat cobbled toll road with a mine-cart rail alongside, a striped toll barrier beside a small booth where a clerk stamps a scroll over an open chest of gold coins, a notice board pinned with blank parchment, brass lamp posts. |
| `hex.gate.goblin` | Gildgate | A huge round gilded vault door set into a hillside as the gate, framed by brass pipes and pressure gauges, a customs desk under a striped awning in front of it stacked with ribbon-tied scrolls and a brass scale, a glowing lantern on each side, gold trim on dark iron. |
| `hex.realm.goblin` | Tallow Deeps, Glimmerdell | The works: two smokestacks, a copper smelter pouring molten gold into molds, rails of loaded carts, stacked gold ingots being weighed and tallied at an assay office's brass scales, glowing furnace light. |
| `hex.battlefield.goblin` | Dicer’s Field, Swindler’s Field | A trampled field strewn with wrecked clockwork contraptions, a burst boiler hissing steam, spilled coins, broken crossbows, torn scrolls and red ribbons blowing across the mud. |
| `hex.capital.goblin` | Hoardhollow | Skivvet's trade capital burrowed into a hill: golden domes and brass towers bristling with chimneys, an enormous round vault door at the front, beside it a grand columned exchange hall with a long queue of petitioners on its steps and towers of filed scrolls in its windows, coins spilling down the slope, steam and warm light everywhere. Opulent and official. |

## Dun Kaldor (Dwarf, south-east)

**Look:** mountains that climb toward a masterwork fortress. Slate blue-gray granite, snow white, dark pine green, bronze and gold trim, warm forge orange. Precisely cut stone blocks, geometric carving (no letters or runes), bronze bands. Cold and solid; craftsmanship increases toward the capital.

| Tile | Where | What it shows |
| --- | --- | --- |
| `hex.wilds.dwarf.near` | Flintholm, Cragmoor, Granitefast, Bergholm | Foothills: grassy slopes broken by gray granite outcrops, a few dark pines, a small cold stream, a neat stone cairn. |
| `hex.wilds.dwarf.far` | Emberdelve, Coldforge (and Jarnholt, Grimholt when not villages) | High crags: steep slate-gray peaks with snowcaps and scree, a mine entrance with a bronze-banded door cut into the rock, a thin trail of forge smoke. |
| `hex.village.dwarf` | Dwarf-land villages (e.g. Jarnholt, Grimholt, Kaldor Road) | Stone longhouses with turf roofs set into a hillside, round bronze-banded doors, smoking chimneys, forge glow in one doorway, a stacked woodpile. |
| `hex.road.dwarf` | Deepway | A precisely paved stone road switchbacking up a slope, a carved stone milestone with geometric knotwork, a small arched stone bridge over a stream. |
| `hex.gate.dwarf` | Stonegate | A massive gate carved into a cliff face, flanked by two stern dwarf guardian statues holding axes, great bronze-banded doors, geometric knotwork around the arch. |
| `hex.realm.dwarf` | Hrimgard, Gullhall | Snowy high mountains with terraced quarries and halls cut into the rock, warm glowing windows, a waterfall, bronze rails for mine carts. |
| `hex.battlefield.dwarf` | Cairnfield, Anvilfield | A rocky mountain pass with shattered boulders and siege rubble, broken axes and round shields, a toppled stone pillar. |
| `hex.capital.dwarf` | Kaldor Deep | A masterwork fortress carved into a snowcapped peak: tier upon tier of geometric stone halls, great doors trimmed in gold and bronze glowing with forge light, twin waterfalls, stout towers with plain banners. Grand and symmetrical; the most elaborate tile in the zone. |

## Emrys’ Reach (Archmage, south-west)

**Look:** Welsh moorland bent by the magic pouring out of Emrys' compound, more strongly the closer you get. Heather violet, deep indigo, moonlit silver, mist white, glowing cyan arcane light. Whitewashed stone, slate, standing stones, mist; then crystals, floating earth and glass. Eerie and beautiful rather than ruined.

| Tile | Where | What it shows |
| --- | --- | --- |
| `hex.wilds.archmage.near` | Llyn Seren, Glasmere, Cwm Hud, Silverveil | Misty moorland with heather and a still lake; the first signs of magic: a few violet crystal shards poking through the grass, faint cyan glowing lines in the earth, one small stone floating just above the ground. |
| `hex.wilds.archmage.far` | Bryn Rhith, Moonwell (and Whisperwood, Pen Dinas when not villages) | Magic-warped land: chunks of earth floating above the ground, large violet crystals, trees turned to silvery glass, glowing cyan cracks, drifting motes of light. |
| `hex.village.archmage` | Villages of the Reach (e.g. Whisperwood, Pen Dinas, Lantern Way) | Whitewashed stone cottages with slate roofs, a violet crystal growing up through one roof, small lanterns floating above the lane, a softly glowing well. |
| `hex.road.archmage` | Mistway | A path of flat stepping stones hovering over drifting mist, lit by tall lantern posts burning with cyan flame. |
| `hex.gate.archmage` | Veilgate | Two great standing stones joined by a shimmering violet curtain of light, a glowing circle on the ground between them. |
| `hex.realm.archmage` | Ynys Wen, Elderglass | Heavily warped: a waterfall pouring upward into the sky, small floating islands with tiny trees, a glassy lake reflecting stars, giant crystals. |
| `hex.battlefield.archmage` | Starfall Field, Mistfield | Spell-scarred ground: patches melted into dark glass, a crater crackling with violet energy, broken staves, a fallen star fragment still glowing. |
| `hex.capital.archmage` | Caer Emrys | Emrys' compound, the source of it all: a slender spiralling white-and-violet tower complex on a floating rock above a lake, a beam of cyan-violet light shooting into the sky, plain standing stones orbiting it in a ring. The brightest tile in the zone. |

## The Thornwild (east, the lairs of the Griffins, the Manticore and the Wild Hunt)

**Look:** a dark fey forest of giant briars. Deep forest green, black-purple thorns, blood-red roses, twilight blue shadow, pale green wisp light. Thorns, brambles, roots and antlers; the deeper in, the darker and bigger.

| Tile | Where | What it shows |
| --- | --- | --- |
| `hex.wilds.thornwild.near` | Briarholt, Nettlecombe, Hagthorn, Witchbriar, Rosethorn (and Bramblegloom when not a village) | The forest edge: dark green trees, thick bramble hedges with black thorns and red wild roses, nettles, a mossy path vanishing into the trees. |
| `hex.wilds.thornwild.far` | Blackthorn, Wolfsbane Dell, Hemlock Hollow, Gloaming Glade | Deep thornwood: giant twisted black thorn vines arching overhead, gloom, a few pale green wisp lights, purple wolfsbane flowers, a pair of glowing eyes in the shadows. |
| `hex.village.thornwild` | Thornwild villages (e.g. Bramblegloom) | A hamlet of crooked thatched huts behind a thorn hedge, bundles of herbs and antlers hung as charms, a smoking cauldron. |
| `hex.lairMouth.thornwild` | Thornmaw | Enormous thorned branches knotted into a gaping, fanged archway leading into darkness, golden griffin feathers caught on the thorns, deep claw marks in the bark. |
| `hex.lair.thornwild` | Witchwood, Thornheart, Rootdeep | The heart of the wood: a colossal ancient tree strangled in thorns, a griffin's nest of branches at the top with golden feathers, roots like walls, a faint red glow in a hollow (the Manticore's den). |
| `hex.battlefield.thornwild` | Bramblefield, Thornfield | A trampled clearing ringed by brambles: broken hunting spears, scattered griffin feathers, torn plain banners caught on thorns, hoofprints. |

## The Wyrmfells (west, the lairs of the Wyverns, the Basilisk and the Dragon)

**Look:** bleak dragon-scarred fells: bare, high northern hills. Dark basalt and slate, heather purple-brown, scorched black, sulfur yellow, ember red, bone white, glints of gold. Unlike the Ashen Steppe, the damage here comes from beasts: claw gouges, fire trails and old bones, on wild land with few buildings.

| Tile | Where | What it shows |
| --- | --- | --- |
| `hex.wilds.wyrmfells.near` | Scaleby, Raventhwaite, Gloomfell (and Drakesfell, Coldfell, Wyrmscar when not villages) | Bleak open fells: heather and dark rock, a dry-stone wall, a raven on a crag, long black scorch marks raked across the hillside. |
| `hex.wilds.wyrmfells.far` | Drakehowe, Worm Tor, Knucklebone Crag, Brimstone Scar | Dragon country: jagged basalt crags, sulfur vents puffing yellow steam, a giant old beast skeleton half sunk in the ground, a small wyvern circling overhead. |
| `hex.village.wyrmfells` | Fells villages (e.g. Drakesfell, Coldfell, Wyrmscar) | Hardy stone huts with turf roofs huddled behind a dry-stone wall, one roof scorched, a lit beacon on a rock. |
| `hex.lairMouth.wyrmfells` | Fellmaw | A huge cave mouth in a scorched cliff, smoke curling out, claw gouges on the rock, old dented armor and bones at the entrance. |
| `hex.lair.wyrmfells` | Gold Barrow, Wyrmhall, Black Eyrie | A volcanic peak with a wyvern eyrie on the summit, a cave glittering with a heap of gold, sulfur vents, a stone figure frozen mid-stride (the Basilisk's work). |
| `hex.battlefield.wyrmfells` | Wyrmfield, Smoulderfield | Burnt ground cut by a long fire trail, melted shields, a huge three-toed claw print, smoking craters. |

## Borders: where two zones meet

Each of the six zone borders has one village (ring 4, a village in every campaign) and one battlefield (ring 6). Each blend is split along the direction its two zones lie in, so each half faces its own zone on the map: the two looks meet in the middle of the tile rather than at a hard seam. "Left" and "right" are the tile's west and east halves; "top" and "bottom" its north and south halves.

| Tile | Where | What it shows |
| --- | --- | --- |
| `hex.village.orc-goblin` | Raiders’ Toll | Orc (left) meets Goblin (right): hide-and-iron orc huts behind spikes on the left, copper-roofed goblin houses with chimneys on the right, a toll gate between them piled with coin sacks, a goblin clerk at a desk stamping papers on one side and a spiked orc barricade on the other. |
| `hex.battlefield.orc-goblin` | Plunder Field | A looted battlefield: orc stakes and broken axes on the left, smashed goblin clockwork and spilled gold on the right. |
| `hex.village.goblin-thornwild` | Pricklepurse | Goblin (top) meets Thornwild (bottom): a goblin trading post with copper pipes, chimneys and a customs shed with a brass scale, being swallowed from below by black brambles and red roses. |
| `hex.battlefield.goblin-thornwild` | Tanglefield | Wrecked goblin machines at the top, dragged down into thorn vines that thicken toward the bottom. |
| `hex.village.thornwild-dwarf` | Stonebriar | Thornwild (top) meets Dwarf (bottom): dwarf stone longhouses at the foot of granite rocks, with thorn hedges and briars climbing down over their walls from above. |
| `hex.battlefield.thornwild-dwarf` | Rockthorn Field | A rocky pass where thorn vines crack through the boulders; broken dwarf axes among the brambles. |
| `hex.village.dwarf-archmage` | Runestone | Emrys' Reach (left) meets Dwarf (right): precise dwarf stone longhouses on the right with violet crystals sprouting from their masonry, a dwarf-carved standing stone glowing cyan, the misty moor with floating stones on the left. |
| `hex.battlefield.dwarf-archmage` | Runefield | A mountain pass scarred by spells: shattered dwarf shields and rubble on the right, glassed rock and floating boulders on the left. |
| `hex.village.archmage-wyrmfells` | Dreamfell | Wyrmfells (top) meets Emrys' Reach (bottom): fell-side stone huts with scorched turf roofs at the top, violet mist and floating lanterns drifting up from below. |
| `hex.battlefield.archmage-wyrmfells` | Veilfire | Dragon fire meets magic: burnt ground and a fire trail at the top, glassy crystal ground at the bottom, violet flames where they meet. |
| `hex.village.wyrmfells-orc` | Smokefell | Orc (top) meets Wyrmfells (bottom): spiked timber-and-iron orc huts on the bleak heather hill, scorch marks, a lit beacon. |
| `hex.battlefield.wyrmfells-orc` | Bonefield | Ash steppe at the top giving way to scorched fells at the bottom, huge old beast bones, broken orc blades. |

## Count

| Group | Tiles |
| --- | --- |
| Four rival zones × 8 (near and far wilds, village, road, gate, home hexes, battlefield, capital) | 32 |
| Thornwild and Wyrmfells × 6 (near and far wilds, village, lair mouth, lair, battlefield) | 12 |
| Six borders × 2 (village, battlefield) | 12 |
| **Total** | **56** |
