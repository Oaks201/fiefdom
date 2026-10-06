// Run in a child process by rng.test.ts: prints draw(42, '2026-10-05', 'threat').
import { draw } from '../../../src/renderer/src/lib/game/rng'

console.log(draw(42, '2026-10-05', 'threat'))
