"""
Trailer score, synthesised from scratch (no samples, no licences).

Optional cues: "bpm" (default 84), "reveal" (a whoosh into a low hit, for the
hook's camera move), "risers" (noise swells that end on these moments).

    python3 scripts/film/score.py cues.json out.wav

cues.json gives the length and the moments the music follows (seconds):
    {"length": 78, "build": 17, "life": 27, "drama": 50, "title": 66,
     "thunder": [52.1, 55.4], "hits": [50.0, 66.0], "rain": [51, 57], "night": [58, 62]}

Sections: a quiet pad over wind (intro), a pulse of plucked notes as the
colony grows (build), the full groove under the life montage (life), a low
drone with thunder and rain (drama), and a warm swell under the title.
Everything is additive synthesis, filtered noise and a convolution reverb.
"""
import json
import sys
import wave

import numpy as np

SR = 48000
rng = np.random.default_rng(7)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def env_adsr(n, a, r, sustain=1.0):
    """Linear attack and release (seconds) over n samples."""
    e = np.full(n, sustain)
    na = min(n, int(a * SR))
    nr = min(n - na, int(r * SR))
    if na:
        e[:na] = np.linspace(0, sustain, na)
    if nr:
        e[n - nr:] = np.linspace(sustain, 0, nr)
    return e


def lowpass(x, fc):
    """Zero-phase-ish one-pole lowpass via FFT (gentle 12 dB/oct)."""
    n = len(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    h = 1 / (1 + (f / fc) ** 2)
    return np.fft.irfft(np.fft.rfft(x) * h, n)


def bandpass(x, lo, hi):
    n = len(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    h = 1 / (1 + (lo / np.maximum(f, 1)) ** 4) / (1 + (f / hi) ** 4)
    return np.fft.irfft(np.fft.rfft(x) * h, n)


def saw(freq, dur, cutoff, detune_cents=0.0, phase=0.0):
    """Band-limited, pre-filtered saw: harmonics 1/n, rolled off above cutoff."""
    t = t_axis(dur)
    f = freq * 2 ** (detune_cents / 1200)
    out = np.zeros_like(t)
    n = 1
    while n * f < min(cutoff * 4, SR / 2.2):
        a = (1 / n) / (1 + (n * f / cutoff) ** 2)
        out += a * np.sin(2 * np.pi * n * f * t + phase * n)
        n += 1
    return out


def pad_chord(notes, dur, cutoff=1400, amp=0.06):
    """Three detuned saws per note, spread in stereo."""
    n = int(dur * SR)
    L = np.zeros(n)
    R = np.zeros(n)
    for k, m in enumerate(notes):
        f = midi(m)
        for d, pan in ((-7, 0.2), (0, 0.5), (7, 0.8)):
            v = saw(f, dur, cutoff, d, phase=rng.uniform(0, 6.28))[:n]
            L += v * (1 - pan)
            R += v * pan
    e = env_adsr(n, min(1.6, dur * 0.4), min(1.8, dur * 0.45))
    return np.stack([L * e, R * e]) * amp / max(1, len(notes) ** 0.5)


def pluck(freq, dur=1.6, bright=1.0, amp=0.12):
    """Plucked string: harmonics that die faster the higher they are."""
    t = t_axis(dur)
    out = np.zeros_like(t)
    for n in range(1, 14):
        if n * freq > SR / 2.5:
            break
        decay = 2.2 + n * 1.6 / bright
        out += (0.9 ** n) / n ** 0.6 * np.exp(-t * decay) * np.sin(2 * np.pi * n * freq * t + rng.uniform(0, 6.28))
    attack = np.minimum(1, t / 0.003)
    return out * attack * amp


def bell(freq, dur=4.0, amp=0.07):
    t = t_axis(dur)
    out = np.zeros_like(t)
    for ratio, a, d in ((1, 1, 0.9), (2.0, 0.45, 1.6), (3.01, 0.25, 2.6), (4.2, 0.12, 3.5), (5.4, 0.06, 5)):
        out += a * np.exp(-t * d) * np.sin(2 * np.pi * freq * ratio * t)
    return out * np.minimum(1, t / 0.004) * amp


def boom(dur=3.5, amp=0.5):
    """A low hit: a falling sine plus a soft noise thud."""
    t = t_axis(dur)
    f = 32 + 38 * np.exp(-t * 6)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 1.3)
    thud = lowpass(rng.standard_normal(len(t)), 180) * np.exp(-t * 12) * 0.6
    return (body + thud) * amp


def tick(amp=0.05):
    """A tiny dry click (mandibles, footsteps)."""
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    x = bandpass(rng.standard_normal(n), 2500, 7000) * np.exp(-t * 260)
    return x * amp


def thunder(dur=6.0, amp=0.55):
    t = t_axis(dur)
    x = rng.standard_normal(len(t))
    x = lowpass(np.cumsum(x) * 0.02, 400)
    x /= np.abs(x).max() + 1e-9
    crack = bandpass(rng.standard_normal(len(t)), 300, 4000) * np.exp(-t * 9)
    rumble = x * (np.minimum(1, t / 0.08)) * np.exp(-t * 0.7) * (0.6 + 0.4 * np.sin(t * 7) ** 2)
    return (rumble + crack * 0.35) * amp


def noise_bed(dur, lo, hi, amp):
    n = int(dur * SR)
    return np.stack([bandpass(rng.standard_normal(n), lo, hi), bandpass(rng.standard_normal(n), lo, hi)]) * amp


def reverb_ir(seconds=3.2, predelay=0.02):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal((2, n)) * np.exp(-t * 6.9 / seconds)
    # Darker tail.
    ir[0] = lowpass(ir[0], 5000)
    ir[1] = lowpass(ir[1], 5000)
    ir[:, : int(predelay * SR)] = 0
    return ir / np.sqrt((ir ** 2).sum(axis=1, keepdims=True))


def convolve(x, ir):
    n = x.shape[1] + ir.shape[1] - 1
    size = 1 << (n - 1).bit_length()
    out = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:, : x.shape[1]]
    return out


class Mix:
    def __init__(self, length):
        self.n = int(length * SR)
        self.dry = np.zeros((2, self.n))
        self.wet = np.zeros((2, self.n))

    def add(self, at, sig, gain=1.0, pan=0.5, send=0.3):
        if sig.ndim == 1:
            sig = np.stack([sig * (1 - pan) * 2 ** 0.5, sig * pan * 2 ** 0.5])
        i = int(at * SR)
        if i >= self.n:
            return
        if i < 0:
            # Starts before the video: keep only the part that falls inside it.
            sig = sig[:, -i:]
            i = 0
        j = min(self.n, i + sig.shape[1])
        seg = sig[:, : j - i] * gain
        self.dry[:, i:j] += seg * (1 - send * 0.5)
        self.wet[:, i:j] += seg * send


def automation(n, points):
    """Piecewise-linear gain curve from [(seconds, gain), …]."""
    xs = [p[0] * SR for p in points]
    ys = [p[1] for p in points]
    return np.interp(np.arange(n), xs, ys)


def main():
    cues = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    L = cues["length"]
    b, life, drama, title = cues["build"], cues["life"], cues["drama"], cues["title"]
    beat = 60 / cues.get("bpm", 84)
    m = Mix(L)

    # --- harmony: D minor, a slow i - VI - III - VII walk; the title resolves to D major.
    prog = [
        [50, 57, 62, 64, 65],  # Dm(add9)
        [46, 53, 58, 62, 65],  # Bb
        [53, 57, 60, 65, 69],  # F
        [48, 55, 60, 64, 67],  # C
    ]
    # Chords change every two bars at a quick tempo, every four seconds at the slow one.
    chord_len = 8 * beat if beat < 0.62 else 4.0
    t = 0.0
    k = 0
    while t < drama:
        dur = min(chord_len + 1.6, drama + 1.5 - t)
        cutoff = 900 if t < b else 1500 if t < life else 2200
        amp = 0.05 if t < b else 0.06 if t < life else 0.07
        m.add(t, pad_chord(prog[k % 4], dur, cutoff, amp), send=0.55)
        t += chord_len
        k += 1

    # Sparse bells over the intro (the queen in the air).
    # (A video that starts cold, like a reel, opens on a note straight away.)
    first = ((0.04, 74),) if cues.get("fade_in", 1.2) < 0.5 else ()
    for at, n in first + ((1.5, 74), (5.2, 77), (8.6, 72), (12.0, 81), (14.6, 76)):
        if at < b:
            m.add(at, bell(midi(n)), pan=rng.uniform(0.3, 0.7), send=0.7)

    # --- the pulse: plucked arpeggio from the build, in eighths at 84 bpm, on a grid
    # that puts a downbeat exactly where the life montage starts (its cuts are on the beat).
    arp = {0: [62, 65, 69, 74], 1: [58, 62, 65, 70], 2: [60, 65, 69, 72], 3: [60, 64, 67, 72]}
    t = life - np.ceil((life - b) / (beat / 2)) * (beat / 2)
    step = 0
    while t < drama - 0.2:
        k = int((t / chord_len)) % 4
        notes = arp[k]
        n = notes[step % 4] + (12 if (step // 8) % 2 and t > life else 0)
        bright = 0.6 + 0.8 * min(1, (t - b) / max(1, life - b))
        gain = 0.55 + 0.45 * min(1, (t - b) / max(1, life - b))
        m.add(t, pluck(midi(n), 1.4, bright, 0.09 * gain), pan=0.35 + 0.3 * (step % 2), send=0.35)
        t += beat / 2
        step += 1

    # Bass and soft thumps under the life montage.
    roots = [38, 34, 41, 36]
    t = life
    while t < drama - 0.5:
        k = int(t / chord_len) % 4
        tb = t_axis(chord_len)
        f = midi(roots[k])
        bass = (np.sin(2 * np.pi * f * tb) + 0.3 * np.sin(4 * np.pi * f * tb)) * env_adsr(len(tb), 0.05, 0.6) * 0.16
        m.add(t, bass, send=0.1)
        t += chord_len
    t = life
    beat_n = 0
    while t < drama - 0.3:
        if beat_n % 2 == 0:
            m.add(t, boom(0.8, 0.22), send=0.08)
        m.add(t + beat / 2, tick(0.06), pan=0.65, send=0.15)
        m.add(t + beat * 0.75, tick(0.035), pan=0.35, send=0.15)
        t += beat
        beat_n += 1

    # --- drama: a low drone with a rubbing minor second, rain, thunder.
    dd = title - drama + 1.0
    drone = pad_chord([38, 45, 50, 51], dd, 500, 0.09)
    m.add(drama, drone, send=0.5)
    for at in cues.get("hits", []):
        m.add(at, boom(4.0, 0.55), send=0.35)
    for at in cues.get("thunder", []):
        m.add(at, thunder(6.0, 0.5), send=0.25)
    r0, r1 = cues.get("rain", [drama, drama])
    if r1 > r0:
        rain = noise_bed(r1 - r0 + 1.5, 1200, 7000, 0.03)
        rain *= automation(rain.shape[1], [(0, 0), (0.6, 1), (r1 - r0, 1), (r1 - r0 + 1.5, 0)])
        m.add(r0, rain, send=0.2)
    n0, n1 = cues.get("night", [drama, drama])
    if n1 > n0:
        # Crickets: bursts of a high chirp.
        t = n0
        while t < n1:
            tc = t_axis(0.18)
            chirp = np.sin(2 * np.pi * 4300 * tc) * (np.sin(2 * np.pi * 30 * tc) > 0) * np.exp(-tc * 8) * 0.025
            m.add(t, chirp, pan=rng.uniform(0.2, 0.8), send=0.4)
            t += rng.uniform(0.35, 0.7)

    # --- title: a beat of near-silence, then a warm D major swell and a low hit.
    swell_len = L - title + 0.5
    m.add(title + 0.35, pad_chord([38, 50, 57, 62, 66, 69, 76], swell_len, 1800, 0.11), send=0.7)
    m.add(title + 0.35, boom(5.0, 0.6), send=0.4)
    for at, n in ((title + 0.4, 78), (title + 1.6, 81), (title + 3.0, 74)):
        m.add(at, bell(midi(n), 5.0, 0.06), pan=rng.uniform(0.35, 0.65), send=0.8)

    # --- the hook's reveal: air rushing past into a low hit.
    if "reveal" in cues:
        at = cues["reveal"]
        n = int(1.2 * SR)
        tt = np.arange(n) / SR
        sweep = bandpass(rng.standard_normal(n), 300, 6000) * (tt / 1.2) ** 2.2 * 0.22
        m.add(at - 1.2, np.stack([sweep, np.roll(sweep, 300)]), send=0.3)
        m.add(at, boom(4.0, 0.6), send=0.35)
        m.add(at + 0.05, bell(midi(81), 4.0, 0.05), send=0.8)
    # --- risers: filtered noise swelling up to a cut.
    for at in cues.get("risers", []):
        dur = 2.0
        n = int(dur * SR)
        tt = np.arange(n) / SR
        x = rng.standard_normal(n)
        lo = bandpass(x, 200, 1200)
        hi = bandpass(x, 1500, 8000)
        k = (tt / dur) ** 2.5
        riser = (lo * (1 - k) + hi * k) * k * 0.14
        m.add(at - dur, np.stack([riser, np.roll(riser, 200)]), send=0.4)

    # --- wind bed all through (quieter under the groove).
    wind = noise_bed(L, 120, 900, 0.05)
    lfo = 0.6 + 0.4 * np.sin(2 * np.pi * t_axis(L)[: wind.shape[1]] / 9.0)
    wind *= lfo
    wind *= automation(wind.shape[1], [(0, 0), (min(2, cues.get("fade_in", 2)), 1), (life, 0.8), (drama, 1.3), (title, 0.4), (L, 0.2)])
    m.add(0, wind, send=0.1)

    wet = convolve(m.wet, reverb_ir())
    mix = m.dry + wet * 0.9
    # Section gain: dip before the title so the swell lands.
    fi = cues.get("fade_in", 1.2)
    g = automation(mix.shape[1], [(0, 0), (fi, 1), (title - 0.6, 1), (title - 0.1, 0.25), (title + 0.35, 1), (L - 2.5, 1), (L, 0)])
    mix *= g
    mix = np.tanh(mix * 1.4) / 1.4
    mix /= np.abs(mix).max() / 0.89

    pcm = (mix.T * 32767).astype(np.int16)
    with wave.open(out, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print("wrote", out, f"{L:.1f}s")


if __name__ == "__main__":
    main()
