# A3 — Write the story text (owner)

| Phase | Depends on | Unblocks | Who |
| --- | --- | --- | --- |
| 7 Assets | T01 (the catalog), T14 (the checker); best after T17 | The game's voice | The owner and co-writers (book Ch 17: written by people, not AI) |

## Goal

Replace the plain-fact placeholders with the game's real voice. All narrative text lives in `src/renderer/src/data/text/*.json`, keyed by id and separate from the rules, so writing can be added or changed at any time without touching game logic.

## Read first

- Book: Ch 17 "Writing" (the slot table, the order, the Healer rule), the paragraph at the top of Ch 17 about NPC lines (short one-liners in each ruler's personality, Civ-style), Ch 12 "The four rivals" (each one's voice), Ch 16 (all of it; the Healer check-ins are health messages).
- Decisions: A-46.

## How the files work

Each entry looks like this:

```json
"rivals.orc.surrenderHex": {
  "template": "Orc: hex {hex} ceded to you.",
  "final": null
}
```

- Write your line in `"final"`. Keep the `{placeholders}` you need; they are filled from game facts (`{hex}`, `{rival}`, `{amount}`, …). The template shows which facts are available.
- **Healer entries** also have `"approved": false`. The game shows your Healer text only after you set `"approved": true`. Leave it false until you have read the line as a health message.
- Reload the app to see changes (`npm run dev`).

## Order (from the book)

1. **Healer check-ins**, one per Ch 16 guardrail, 1 to 3 sentences: plain, kind, direct, with only a light in-world voice. No numbers that pressure, and never suggest eating less.
2. **Milestone unlocks**, 10 of them, 3 to 4 sentences each.
3. **Rival voice lines**, 4 rivals × about 12 moments (greeting, warning, raid, defeat in battle, Accord offered, Ultimatum, defection, fall, …), 1 to 2 sentences each. Ugrak: blunt threats, grudging praise. Skivvet: haggling, flattery, bad bargains. Emrys: riddles and old warnings. Hrodgar: proverbs about stone and patience.
4. Then everything else: event cards (a title and 2 to 3 sentences), coalition announcements (3), the Ultimatum, the Siege, Victory and the Fall (a short paragraph each), Crossings (a name and 2 sentences), units and items (1 sentence each), and about 20 daily battle report templates.

## Verification

- [ ] `npm run text:check` reports 0 placeholders and 0 unapproved entries in `healer.json` and `milestones.json`.
- [ ] `npm run text:check` reports 0 placeholders overall (or lists the ones deliberately left).
- [ ] Every `{placeholder}` used in a `final` exists in that entry's template (the checker flags unknown ones).
- [ ] Lengths match the Ch 17 table (the checker counts sentences and warns when over).
- [ ] Every loss, Fall and broken-streak line has been read aloud once as chronicle, not judgment (Ch 16, Shame).
