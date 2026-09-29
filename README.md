# Fiefdom

A medieval habit ledger. You are a minor noble granted a modest holding; keeping your word — a weekly contract and a roll of daily duties — earns **reputation**, the currency your holding will one day run on. This first part is the ledger itself; the game comes later.

![The Chronicle](docs/tavern-preview.png)

## Getting started (Windows)

1. Install **Node.js 22.12 or newer** from [nodejs.org](https://nodejs.org) (the LTS is fine). Check with `node -v`.
2. Unzip this folder, open a terminal in it, and run:

   ```
   npm install
   npm run dev
   ```

   `npm run dev` opens the app with hot reload — edit anything under `src/renderer` and the window updates instantly.

3. When you want it as a normal program with a desktop shortcut:

   ```
   npm run dist
   ```

   This builds `dist/Fiefdom-Setup-0.1.0.exe`. Run it once to install. The installer isn't code-signed, so Windows may say it's from an unknown publisher — choose **More info → Run anyway**.

| Script              | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `npm run dev`       | Run the app in development mode with hot reload                     |
| `npm run build`     | Compile to `out/`                                                   |
| `npm start`         | Run the compiled app from `out/`                                    |
| `npm run dist`      | Build the Windows installer into `dist/`                             |
| `npm run dist:dir`  | Build an unpacked app for the current OS (quick packaging check)     |
| `npm test`          | Run the rule tests (dates, contracts, reputation, saving)           |
| `npm run typecheck` | Type-check everything                                               |

## The three pages

**The Chronicle** — one day at a time. Type your steps and calories burned into the big tallies (typing replaces the number; `+1200` adds to it; the chips add common amounts). Below is the roll of **daily duties**: yes/no habits you check off with a wax seal. Step back through past days with the arrows, the week strip or the calendar, and edit them freely. The ledger on the right shows what the day earned and what's still missing for a perfect day.

**The Contract** — each week you draft a contract: daily steps, daily calories burned, and your weight today. Sealing it takes a press-and-hold on the wax. From then on the terms are shown, never edited. A contract can only be:

- **kept** — from its last day on, declare your final weight (with an optional note) to close it, or
- **burned** — which destroys the contract *and its progress*: the steps and calories logged on its days are erased, and so is the reputation they earned. Duties aren't part of a contract and are kept.

Only one contract is open at a time. A new one may start today or up to a week ahead, never overlapping an earlier one. After a weigh-in, the next draft is pre-filled with your last terms and final weight.

**The Archive** — every contract, as a card with a small chart of the week, goals met, weight change and reputation. Search by month, date, year, goal, outcome (`gilded`, `honored`, `wanting`, `lost`, `gained`) or the words you wrote at the weigh-in; filter by outcome; sort by date, reputation or weight lost. Open a card to see the full contract.

Closed contracts are graded by the 14 daily goals (7 days × steps and calories): **Gilded** (all 14), **Honored** (10+), **Found Wanting** (fewer).

## Reputation

Reputation is never stored — it's recalculated from the ledger (`src/renderer/src/lib/reputation.ts`), so editing a past day simply re-tells history.

| Earned for                                                        | Reputation   |
| ----------------------------------------------------------------- | ------------ |
| Steps goal met (a day under a contract)                           | +10          |
| Calories goal met (a day under a contract)                        | +10          |
| Each duty kept                                                    | +4           |
| A perfect day — every goal that applied, every duty               | +5           |
| Streak bonus — per consecutive perfect day before it              | +1 (max +10) |
| Closing a contract with the final weigh-in                        | +25          |
| A flawless week — both goals, all seven days                      | +50          |

An unfinished today never breaks your streak; it just hasn't joined it yet.

## Sound

Fiefdom plays **Innfolk Mirth** as its looping background soundtrack. The recording is bundled with the app and works offline. Every action has a sound too: paper when you turn a page, a wax stamp when you keep a duty, quill scratches when you write a number, coin for reputation, a chime when you meet a goal and a fanfare for a perfect day.

Open **Settings** (the cog in the top bar) to turn the music and the sound effects on or off and set their volumes. The music-note button, or the **M** key, pauses and resumes the music. The music rests while the window is minimised, then resumes from the same place.

## Keyboard

| Key                          | In the Chronicle               |
| ---------------------------- | ------------------------------ |
| `←` `→` / `Shift`+`←` `→`    | previous / next day, week      |
| `T`                          | today                          |
| `S` / `C`                    | jump to steps / calories       |
| `1`–`9`                      | toggle a duty                  |
| `N`                          | add a duty                     |
| `↑` `↓` in a tally           | ±100 steps or ±10 kcal (Shift ×10) |
| `Ctrl`+`1` / `2` / `3`       | switch pages (anywhere)        |
| `M`                          | pause / resume the music (anywhere) |
| `Ctrl`+`=` / `-` / `0`, `F11` | zoom, fullscreen              |

Drag a duty up or down to reorder it. Removing a duty takes it off the roll from the day you're viewing onward; earlier days keep their record.

## Your data

Everything is saved to one file on your computer — nothing leaves it:

```
%APPDATA%\Fiefdom\ledger.json
%APPDATA%\Fiefdom\backups\ledger-YYYY-MM-DD.json   (one per day, last 30 kept)
```

Writes are atomic (a crash can't leave a half-written file), and if the ledger is ever damaged the app falls back to the newest good backup. `npm run dev` and the installed app share the same ledger. To experiment without touching it, point the app at another folder (PowerShell):

```
$env:FIEFDOM_DATA_DIR = "C:\temp\fiefdom-test"; npm run dev
```

## How it's built

Electron + React 19 + TypeScript, bundled with electron-vite. State lives in a small [zustand](https://github.com/pmndrs/zustand) store — the same store React Three Fiber scenes can read from when the holding itself arrives.

```
src/
  main/            Electron main process: window, IPC, ledger file (atomic writes, backups)
  preload/         The tiny, typed bridge exposed to the page as window.fiefdom
  shared/          Types shared by both sides of the bridge
  renderer/src/
    lib/           Pure rules, no UI: dates, ledger operations, contracts, reputation
    audio/         Synthesized sound effects, reverb, and looping soundtrack player
    assets/audio/  The bundled Innfolk Mirth soundtrack
    assets/art/    Painted tavern desk and parchment textures
    state/         Stores: the ledger (+ saving), UI, clock, notices
    components/    Wax seals, hold-to-confirm, dialogs, desk props, chronicle/contract/archive parts
    pages/         Chronicle, Contract, Archive
    styles/        Desk, parchment and component styles
tests/             Node test runner tests for the rules and the ledger file
```

The rules in `lib/` are plain functions that take a ledger and return a new one, so the game can reuse them as they are. When reputation becomes spendable, record purchases as their own entries and subtract them from `computeReputation(...).total`.

## Troubleshooting

**`Error: Electron uninstall` when running `npm run dev`.** After `npm install` fetches the packages, Electron runs a second step that downloads the Electron app itself; that step didn't finish. Make sure `node -v` shows v22.12 or newer, then run this in the project folder:

```
node node_modules/electron/install.js
```

If it still fails, it prints the reason (for example a proxy or antivirus blocking the download). Also check that `npm config get ignore-scripts` says `false`.

## Credits

Desk and parchment artwork generated for Fiefdom with the built-in image generation tool. Asset paths and full prompts are recorded in [the art notes](docs/art-assets.md).

Fonts: Almendra, Cinzel, EB Garamond and IM Fell English (SIL Open Font License), bundled with the app so it works offline. Background music: **Innfolk Mirth**, supplied by the user. Sound effects are synthesized live by the app with the Web Audio API. Icons from [game-icons.net](https://game-icons.net) by their authors, under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), via react-icons.
