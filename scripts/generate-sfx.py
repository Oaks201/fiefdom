"""Render Fiefdom's original tavern SFX through the installed sfx-api MCP server.

Run: .tools/audio-env/Scripts/python.exe scripts/generate-sfx.py
Setup and reference measurements are documented in docs/sound-design.md.
The game needs only the resulting WAV files; these tools are development-only.
"""
import asyncio
import argparse
import json
import os
import shutil
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'src/renderer/src/assets/audio/sfx'
RENDERS = ROOT / '.tools/renders'
BEAT_MS = 60000 / 99.4
STEP_MS = BEAT_MS / 8


def pitch(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def layer(label, source, start=0, attack=2, decay=180, gain=-10, freq=None,
          end=None, cutoff=2800, cutoff_end=None, kind='lowpass', q=.707):
    result = dict(id=label, source=source, start_ms=start, gain_db=gain,
                  amp=dict(attack_ms=attack, decay_ms=decay),
                  filter=dict(type=kind, cutoff_hz=cutoff, q=q))
    if cutoff_end is not None:
        result['filter']['end_cutoff_hz'] = cutoff_end
    if freq is not None:
        result['pitch'] = dict(start_hz=freq)
        if end is not None:
            result['pitch']['end_hz'] = end
    return result


def brush(label, start=0, attack=12, decay=150, gain=-10, cutoff=1600,
          end=1100, q=.8, color='pink', kind='bandpass'):
    return layer(label, dict(type='noise', color=color), start, attack, decay,
                 gain, cutoff=cutoff, cutoff_end=end, kind=kind, q=q)


def wood(label='wood', start=0, freq=260, decay=140, gain=-12):
    return layer(label, dict(type='fm', mod_ratio=2.67, index=2.2, index_end=.1),
                 start, 1.5, decay, gain, freq, freq*.88, 1800, 700)


def thud(label='thud', start=0, freq=155, end=72, decay=180, gain=-10):
    return layer(label, dict(type='osc', wave='sine'), start, 2.5, decay,
                 gain, freq, end, 650)


def pluck(label, midi, start=0, decay=680, gain=-13):
    # A mellow, damped dulcimer voice; pitch stays fixed rather than sliding like a beep.
    return layer(label, dict(type='fm', mod_ratio=2, index=1.8, index_end=.05),
                 start, 3, decay, gain, pitch(midi), cutoff=2600, cutoff_end=1100)


def clink(label, midi=86, start=0, gain=-19, decay=330):
    return layer(label, dict(type='fm', mod_ratio=1.414, index=1.7, index_end=.25),
                 start, 2, decay, gain, pitch(midi), cutoff=3600, cutoff_end=1700)


def spec(name, layers, loudness=-26, room=.17, tail=180, variations=False):
    return dict(name=name, seed=2909, sample_rate=44100, layers=layers,
                master=dict(target_lufs=loudness, true_peak_dbtp=-8,
                            tail_ms=tail,
                            fx=[dict(type='reverb', room=room, damping=.78, wet=.1)]),
                variation=dict(pitch_cents=18 if variations else 0,
                               filter_cents=100 if variations else 0,
                               timing_ms=5 if variations else 0, gain_db=.6))


def fanfare(name, notes, loudness=-23, step=STEP_MS, final=False):
    layers = [pluck(f'pluck-{i}', note, i*step, 720, -13-i*.3)
              for i, note in enumerate(notes)]
    finish = (len(notes)-1)*step
    layers += [clink('brass-glint', 86, finish+50, -25, 700)]
    if final:
        # Open fifth, without the old F-sharp major third that conflicted with the music.
        layers += [pluck('warm-root', 50, finish, 900, -23),
                   pluck('warm-fifth', 57, finish+15, 850, -24),
                   clink('second-glint', 81, finish+STEP_MS, -28, 650)]
    return spec(name, layers, loudness, room=.27, tail=320)


def ceremonial(name, layers, loudness=-18, room=.35, tail=350):
    design = spec(name, layers, loudness, room, tail)
    design['master']['true_peak_dbtp'] = -3
    design['master']['fx'][0].update(damping=.42, wet=.16)
    return design


def metal(label, midi, start=0, gain=-15, decay=650):
    # Different modes decay independently, like a struck brass coin or little bell.
    modes = []
    for i, (ratio, level) in enumerate([(1, 0), (1.47, -8), (2.09, -13), (2.66, -18)]):
        mode = layer(f'{label}-mode-{i}', dict(type='osc', wave='sine'),
                     start, .7, decay/(ratio**.6), gain+level, pitch(midi)*ratio,
                     cutoff=7000)
        mode['amp']['curve'] = 'linear' if i == 0 else 'exp'
        modes.append(mode)
    modes.append(brush(f'{label}-contact', start, .7, 18, gain-10, 4800, 2900, color='white'))
    return modes


def horn(label, midi, start=0, gain=-20, decay=650):
    voice = layer(label, dict(type='fm', mod_ratio=1, index=1.4, index_end=.45),
                  start, 48, decay, gain, pitch(midi), cutoff=2200, cutoff_end=1200)
    voice['amp'].update(hold_ms=90, curve='linear')
    voice['pitch'].update(vibrato_cents=5, vibrato_hz=4.3)
    return voice


def celebration(name, notes, loudness, grand=False, step=STEP_MS):
    layers = []
    for i, note in enumerate(notes):
        voice = pluck(f'dulcimer-{i}', note, i*step, 550, -15)
        voice['amp']['curve'] = 'linear'
        voice['filter'].update(cutoff_hz=4500, end_cutoff_hz=2200)
        layers.append(voice)
    finish = (len(notes)-1)*step
    layers += metal('victory-bell', notes[-1], finish, -14, 950)
    for i, note in enumerate([81, 86, 89, 81, 86, 93] if grand else [81, 86, 89]):
        layers += metal(f'coin-{i}', note, finish+90+i*55+(i%2)*13, -22-i*.5, 360)
    if grand:
        layers += [horn('herald-root', 50, finish, -24, 800),
                   horn('herald-fifth', 57, finish+22, -28, 750),
                   thud('frame-drum', finish, 125, 65, 260, -20)]
    return ceremonial(name, layers, loudness, .38 if grand else .26)


def make_specs():
    specs = {}
    specs['page'] = spec('page', [
        brush('paper-sweep', attack=35, decay=280, cutoff=1600, end=850, gain=-7),
        brush('paper-fold', start=75, attack=8, decay=100, cutoff=2500, end=1600, gain=-14),
        brush('paper-settle', start=180, decay=140, cutoff=700, end=420, gain=-12),
        wood('book-edge', start=205, freq=205, decay=90, gain=-23)], -28, variations=True)
    specs['flip'] = spec('flip', [
        brush('leaf-turn', attack=22, decay=180, cutoff=1100, end=2200, gain=-8),
        brush('leaf-settle', start=95, decay=95, cutoff=800, end=500, gain=-13)], -30, variations=True)
    specs['open'] = spec('open', [
        brush('unroll', attack=40, decay=300, cutoff=1400, end=700, gain=-9),
        wood('scroll-dowel', start=45, freq=190, decay=160, gain=-15),
        wood('dowel-settle', start=175, freq=240, decay=90, gain=-21)], -28, variations=True)
    specs['stamp'] = spec('stamp', [
        thud(freq=175, end=78, decay=180), wood(freq=300, decay=100, gain=-14),
        brush('wax-press', attack=3, decay=95, cutoff=1100, end=500, gain=-9),
        brush('parchment', start=25, decay=110, cutoff=1800, end=900, gain=-19)], -25, variations=True)
    specs['unstamp'] = spec('unstamp', [
        brush('wax-peel', attack=7, decay=160, cutoff=750, end=1700, gain=-8),
        wood('wax-pop', start=65, freq=370, decay=90, gain=-18)], -29, variations=True)
    for name, count, spacing in [('quill', 3, 72), ('strike', 4, 45)]:
        layers = [brush(f'nib-{i}', start=i*spacing, attack=7, decay=60,
                        cutoff=2400+i*120, end=1700, q=1.3, gain=-9-i*.7)
                  for i in range(count)]
        layers.append(brush('paper-body', attack=15, decay=count*spacing,
                            cutoff=900, end=700, gain=-22))
        specs[name] = spec(name, layers, -31 if name=='quill' else -29, tail=80, variations=True)
    specs['click'] = spec('click', [wood(freq=420, decay=70, gain=-14),
        thud(freq=145, end=100, decay=65, gain=-19),
        brush('wood-contact', attack=1, decay=35, cutoff=1450, end=850, gain=-17)],
        -31, tail=60, variations=True)
    coins = []
    for i, (note, when) in enumerate([(81, 0), (86, 46), (89, 101), (86, 173)]):
        coins += metal(f'coin-{i}', note, when, -15-i*1.3, 420)
    coins.append(wood('coins-on-oak', start=80, freq=280, decay=80, gain=-28))
    specs['coin'] = ceremonial('coin', coins, -18, .2, 160)
    specs['lose'] = spec('lose', [pluck('low-string', 62, 0, 500, -16),
        pluck('settle-string', 57, BEAT_MS/4, 600, -18)], -28, room=.22)
    specs['goal'] = celebration('goal', [62, 69, 74], -19)
    specs['perfect'] = celebration('perfect', [62, 69, 72, 74, 77], -17, grand=True)
    specs['gilded'] = celebration('gilded', [62, 65, 69, 72, 74, 77, 81], -16, grand=True)
    specs['honored'] = celebration('honored', [62, 67, 69, 74], -18, grand=True, step=BEAT_MS/6)
    specs['wanting'] = spec('wanting', [pluck(f'descend-{i}', note, i*BEAT_MS/4, 750, -17)
                                     for i,note in enumerate([69,67,65,62])], -28, room=.22, tail=250)
    sealing = [thud('heavy-seal', freq=135, end=58, decay=360, gain=-17),
               wood('oak-seal-handle', freq=225, decay=160, gain=-21),
               brush('wax-contact', attack=2, decay=140, cutoff=2200, end=650, gain=-20),
               horn('oath-root', 50, 55, -20, 900), horn('oath-fifth', 57, 80, -24, 850)]
    for i, note in enumerate([62, 69, 74, 77]):
        voice = pluck(f'oath-dulcimer-{i}', note, 85+i*STEP_MS, 700, -23)
        voice['amp']['curve'] = 'linear'
        sealing.append(voice)
    sealing += metal('royal-bell', 74, 170, -24, 1250)
    sealing += metal('seal-sparkle', 81, 285, -28, 850)
    specs['seal'] = ceremonial('seal', sealing, -17, .4, 400)
    flame = [brush('ignition-whoosh', attack=100, decay=780, cutoff=600, end=2900, gain=-13),
             brush('fire-body', start=70, attack=150, decay=2200, cutoff=900, end=350,
                   gain=-12, color='brown', kind='lowpass'),
             brush('flame-roar', start=90, attack=140, decay=1850, cutoff=1700, end=650,
                   gain=-18, q=.55),
             thud('fire-catch', start=60, freq=110, end=55, decay=320, gain=-22)]
    for body in flame[:3]:
        body['amp']['curve'] = 'linear'
    for i in range(28):
        flame.append(brush(f'ember-{i}', start=60+i*73+(i%3)*17, attack=.7,
                           decay=14+(i%4)*9, cutoff=2100+(i%5)*380,
                           end=1250, gain=-25+(i%4)))
    flame.append(brush('curling-parchment', start=350, attack=75, decay=1450,
                       cutoff=3300, end=900, gain=-23))
    specs['burn'] = ceremonial('burn', flame, -18, .25, 350)
    specs['error'] = spec('error', [wood('knock-one', freq=200, decay=110, gain=-12),
        wood('knock-two', start=115, freq=165, decay=140, gain=-15),
        thud(start=115, freq=110, end=85, decay=100, gain=-23)], -29, tail=100)
    return specs


def unpack(result):
    if result.is_error:
        raise RuntimeError(str(result.content))
    if result.structured_content:
        return result.structured_content
    return json.loads(next(item.text for item in result.content if item.type=='text'))


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', nargs='+', choices=list(make_specs()),
                        help='Render only these events, preserving all other assets.')
    requested = parser.parse_args().only
    OUTPUT.mkdir(parents=True, exist_ok=True)
    RENDERS.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, 'SFX_OUT_DIR':str(RENDERS),
           'SFX_PRESETS_DIR':str(ROOT/'.tools/presets'), 'SFX_NO_PEDALBOARD':'1'}
    params = StdioServerParameters(command=str(ROOT/'.tools/audio-env/Scripts/sfx-mcp.exe'), env=env)
    report_path = ROOT/'.tools/render-report.json'
    report = json.loads(report_path.read_text()) if requested and report_path.exists() else {}
    rendered_count = 0
    async with stdio_client(params) as (reader,writer):
        async with ClientSession(reader,writer) as session:
            await session.initialize()
            listing = await session.list_tools()
            print('MCP connected: '+', '.join(tool.name for tool in listing.tools), flush=True)
            for name, design in make_specs().items():
                if requested and name not in requested:
                    continue
                result = unpack(await session.call_tool('sfx_render', {'spec':design}))
                renders = [result]
                if name in {'page','flip','open','stamp','unstamp','quill','strike','click'}:
                    variants = unpack(await session.call_tool('sfx_variations', {'spec':design,'count':2}))
                    renders += variants['variations']
                paths = []
                for i, rendered in enumerate(renders):
                    target = OUTPUT/(name+(f'-{i+1}' if i else '')+'.wav')
                    shutil.copyfile(rendered['path'],target)
                    # Enforce short click-free ends, even when upstream room tails are truncated.
                    samples,sr = sf.read(target)
                    fade = min(int(sr*.018),len(samples)//4)
                    samples[-fade:] *= np.linspace(1,0,fade)
                    sf.write(target,samples,sr,subtype='PCM_16')
                    paths.append(target.name)
                report[name] = {'files':paths,'features':result['features'],
                                'normalization':result['normalization'],'warnings':result['warnings']}
                rendered_count += len(paths)
                print(name+': '+', '.join(paths),flush=True)
    report_path.write_text(json.dumps(report,indent=2))
    print(f'Rendered {rendered_count} original WAVs.',flush=True)


if __name__=='__main__':
    asyncio.run(main())
