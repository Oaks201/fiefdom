// Dev-only: prints the founding map for a seed as ASCII rows. `npm run map:print -- 7`
import { buildMap, seedVillages } from '../src/renderer/src/lib/game/map'
import { MAP_ASCII_LEGEND, mapAscii } from '../src/renderer/src/lib/game/dev/mapAscii'

const seed = Number(process.argv[2] ?? 7)
console.log(`seed ${seed} (villages found on attempt ${seedVillages(seed).attempt})`)
console.log(mapAscii(buildMap(seed)))
console.log(MAP_ASCII_LEGEND)
