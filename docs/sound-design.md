# Fiefdom tavern sound pack

The interface still uses the original page structure and controls. The desk painting,
parchment texture, and **Innfolk Mirth** recording are unchanged. The top bar now uses
original illustrated timber grain and brass bevels. Almendra now supplies the whole
interface: bold headings and controls, regular body text, and true italic signatures
and parchment annotations. Small headings use less tracking and title case; shared
wooden buttons use the beam's timber texture. All page layouts and markup are preserved.

## Sound direction

Original, locally synthesized cartoon medieval effects: damped wooden knocks, soft
parchment movement, short quill strokes, heavy wax seals, ringing brass, heraldic horns,
coin showers and dulcimer flourishes. No Hearthstone audio was copied. The pack covers all 18
existing action names and the two live press-and-hold textures. Eight frequent effects
have three takes each, for **34 bundled mono 44.1 kHz / 16-bit WAV files**, about 1.94 MiB.
Repeated foley never picks the same take twice consecutively. Sounds load and decode
once; every action still respects the existing effects switch, slider, and delays.

### Reference analysis

Measured locally with FFmpeg, librosa, NumPy and pyloudnorm:

| Measurement | Innfolk Mirth |
| --- | --- |
| Duration | 164.77 seconds, stereo |
| Integrated loudness | -14.66 LUFS |
| RMS level | -17.45 dBFS |
| Estimated pulse | 99.4 BPM, from the first 75 seconds |
| Mean spectral centroid | 1129 Hz, from the first 75 seconds |
| Strongest pitch classes | D, C, F, G, A |
| Closest key profiles | C major (0.751), D minor (0.731) |

Tempo and key estimates are approximate. The near-tied key profiles do not establish a
single key; the cues use D/A open fifths and the shared natural-note palette. The old
D-major F-sharps and bright sawtooth fanfares have been removed. Reward note spacing uses
subdivisions of the estimated pulse, without changing or seeking the soundtrack.

The stronger second pass changes only `coin`, `goal`, `perfect`, `gilded`, `honored`,
`seal` and `burn`, plus the two hold textures. SHA-256 comparison confirms the other
27 WAVs are byte-for-byte unchanged. New brass uses independently decaying resonant
modes; musical bodies have fuller decay envelopes. The seal combines a low impact,
wax contact, an open-fifth horn chord and bells. Fire combines a swelling ignition,
low roar, curling paper and 28 crackles. Holds build with progress and fade on release.

| Revised cue | Measured LUFS | Increase from first pass |
| --- | --- | --- |
| Coin | -18.00 | 9.0 dB |
| Goal | -19.00 | 5.0 dB |
| Perfect day | -17.00 | 6.0 dB |
| Gilded contract | -16.00 | 6.0 dB |
| Honored contract | -18.00 | 6.0 dB |
| Seal | -17.00 | 12.45 dB |
| Burn | -18.50 | 8.5 dB |

Revised cues use a -3 dBTP ceiling, with measured sample peaks between -5.84 and
-3.18 dBFS. Other foley retains its original -8 dBTP ceiling and -31 to -25 LUFS
targets. Each file has an 18 ms end fade. The 0.65-second effects room, music player,
music/effects bus levels and master processing are unchanged by this second pass.

Direct subjective listening was unavailable in this session. Signal analysis, browser
rendering, and offline desktop playback checks guided the design. Use the audition
below to judge the final timbre and music balance by ear.

## Audition

[Play the 29-second preview](tavern-sfx-preview.mp3). Chromium's OfflineAudioContext
renders the actual imported effects and live holds over the original recording at
the app's default music/effects settings. It uses the same master gain, compressor,
soft clipper and short room configuration as the app, then exports to MP3. The earlier
preview's extra half-volume attenuation is removed. The preview is not used by the app.

| Time | Sound |
| --- | --- |
| 1 s | coins |
| 3 s | goal |
| 6 s | perfect day |
| 10–11.1 s | signing hold, then contract seal |
| 15 s | honored contract |
| 18 s | gilded contract |
| 23–24.5 s | burning hold |
| 24.5 s | burning parchment |

## Installed local tools

These tools are in the ignored `.tools` directory and are excluded from the shipped app:

- [sfx-api](https://github.com/gteuscher/sfx-api), revision
  `de52991082cc95483491d911f3f73c113dcc1644`, installed in `.tools/audio-env`.
  This is parametric synthesis on CPU, without an account, GPU, or model download.
  Its MCP server is registered in Codex as `fiefdom-sfx`.
- [audio-analysis-mcp](https://github.com/zachswift615/audio-analysis-mcp), revision
  `4d36d5acf35e2d9f2114dd25677400b4021bcbdc`, installed in `.tools/analysis-env`.
  Its MCP server is registered as `fiefdom-audio-analysis`.
- FFmpeg, supplied by `imageio-ffmpeg` in `.tools/audio-env`, plus librosa, scipy,
  soundfile and pyloudnorm for decoding, spectral analysis and loudness measurement.

The SFX server uses MCP SDK 2.x; the analysis server uses SDK 1.x in a separate environment.
The downloaded analysis server has two small local Windows fixes: it imports
`scipy.linalg` before opening stdio (avoiding a native BLAS loader hang), and runs
operations through `await asyncio.to_thread(...)` to keep its protocol responsive.
Its saved environment limits BLAS/OMP threads to one and uses Matplotlib's Agg backend
with its cache inside `.tools`. Fingerprint and spectrogram MCP calls were verified.
Restart the MCP servers in Codex settings to load the newly registered tools into future
chats. The registrations use absolute paths; update them if this checkout moves.

### Reproduce the sound pack

With the installed tools:

```powershell
.tools/audio-env/Scripts/python.exe scripts/generate-sfx.py
```

To rebuild just the revised cues and preserve the other sounds:

```powershell
.tools/audio-env/Scripts/python.exe scripts/generate-sfx.py --only coin goal perfect gilded honored seal burn
```

`scripts/generate-sfx.py` contains every layered design, deterministic seed, and level.
It calls the SFX MCP over stdio, renders the base effects and variations, and copies only
the final WAVs into `src/renderer/src/assets/audio/sfx`. Render specs and diagnostics stay
in `.tools/renders` and `.tools/render-report.json`.

To set up these development tools in another checkout, install `uv`, then:

```powershell
git clone https://github.com/gteuscher/sfx-api.git .tools/sfx-api
git clone https://github.com/zachswift615/audio-analysis-mcp.git .tools/audio-analysis-mcp
uv --cache-dir .tools/uv-cache venv --python 3.13 .tools/audio-env
uv --cache-dir .tools/uv-cache pip install --python .tools/audio-env/Scripts/python.exe -e .tools/sfx-api imageio-ffmpeg librosa
uv --cache-dir .tools/uv-cache venv --python 3.13 .tools/analysis-env
uv --cache-dir .tools/uv-cache pip install --python .tools/analysis-env/Scripts/python.exe -e .tools/audio-analysis-mcp 'mcp<2'
```

For the analysis server on Windows, apply the two fixes described above to
`.tools/audio-analysis-mcp/src/audio_analysis_mcp/server.py`: add `import scipy.linalg`
and `import asyncio` near its imports, then replace the synchronous operation call
with `result = await asyncio.to_thread(OPERATIONS[op], path, path2)`.

## Verification

- Typecheck, production build, and all 32 existing tests pass.
- Browser checks at 1360, 1180, 1120 and 1024 px confirm that the header stays within
  its original 78 px height and its controls do not overlap.
- All 18 event names produce non-silent Web Audio output below the asset peak ceiling.
  A muted effects bus produces exact silence, and a 300 ms delayed cue keeps its delay.
- Seal and burn holds increase in RMS level with progress. Both cancellation and
  completion leave exact silence after the short release. Repeated stop calls are safe.
- The preview master chain stays below full scale at default settings (peak 0.458)
  and at maximum music/effects volume (peak 0.661), including the live holds.
- All three pages, settings, profile, active contracts, burning and result dialogs
  use Almendra and fit at 1360 and 1024 px. Signing and burning were cancelled and
  completed through the actual controls in a disposable browser ledger; a completed
  weigh-in opened the gilded result without errors.
- The built Electron renderer decodes all 34 bundled WAVs over `file://`, starts the
  effects graph, and switches pages without renderer errors, using disposable data.
- The original desk, parchment, music, page components, and UI markup have no diff.
