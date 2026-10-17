"""
Trailer score, synthesised from scratch (no samples, no licences).

    python3 scripts/film/score.py cues.json out.wav

cues.json gives the length and the moments the music follows (seconds):
    {"length": 78, "build": 17, "life": 27, "drama": 50, "title": 66,
     "thunder": [52.1, 55.4], "hits": [50.0, 66.0], "rain": [51, 57], "night": [58, 62]}

Sections: a quiet pad over wind (intro), a pulse of plucked notes as the
colony grows (build), the full groove under the life montage (life), a low
drone with thunder and rain (drama), and a warm swell under the title.
Everything is additive synthesis, filtered noise and a convolution reverb.

Optional cues (the variants after the sound review):
  "phone": true    mix for phone speakers: harmonics on the bass and hits, a click
                   on every cut ("cuts"), chords on the bar, the storm in the
                   mid-range, sound from the first frame, a 40 Hz high-pass
  "style": "seedclock"  wooden marimba, seed knocks and a soil shaker in place of
                   the plucks and thumps
  "accents": [s]   a bell (or marimba note) on each card
  "flashes": [s]   a crack of thunder on each lightning flash
  "shimmer": [s]   a cold, high shimmer (snow)
  "risers": [s]    noise swells ending on these moments
  "buzz": [a, b]   the hum of the flying alates
  "fade_in": s     how long the sound takes to come up (default 1.2)
  "loop": true     no fade at the end: the last chord rings into the restart
  "soft": true     no harsh bursts: quieter rain, cracks, knocks and hits, no
                   saturation on the mix (after "the music bursts in places")
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


def highpass(x, fc):
    n = len(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    h = 1 / (1 + (fc / np.maximum(f, 1)) ** 4)
    return np.fft.irfft(np.fft.rfft(x) * h, n)


def boom_phone(dur=3.5, amp=0.5):
    """The low hit, with a body and a click a phone speaker can play."""
    x = boom(dur, amp)
    t = t_axis(dur)
    body = (np.sin(2 * np.pi * 150 * t) * 0.5 + bandpass(rng.standard_normal(len(t)), 120, 260) * 0.6) * np.exp(-t * 9)
    click = bandpass(rng.standard_normal(len(t)), 2000, 4500) * np.exp(-t * 300)
    return x + (body * 0.5 + click * 0.1) * amp


def knock(amp=0.12, pitch=1000.0):
    """A seed knock: a short wooden tone with a click (marks a cut on any speaker)."""
    t = t_axis(0.12)
    tone = np.sin(2 * np.pi * pitch * t) * np.exp(-t * 55) + 0.4 * np.sin(2 * np.pi * pitch * 2.7 * t) * np.exp(-t * 90)
    click = bandpass(rng.standard_normal(len(t)), 2000, 5000) * np.exp(-t * 400) * 0.15
    return (tone + click) * amp


def marimba(freq, dur=1.6, amp=0.12):
    """A wooden bar: partials 1 : 3.93 : 9.2, a 6 ms attack."""
    t = t_axis(dur)
    x = np.sin(2 * np.pi * freq * t) * np.exp(-t * 3.2)
    x += 0.35 * np.sin(2 * np.pi * freq * 3.93 * t) * np.exp(-t * 9)
    x += 0.12 * np.sin(2 * np.pi * freq * 9.2 * t) * np.exp(-t * 22)
    return x * np.minimum(1, t / 0.006) * amp


def shaker(amp=0.03):
    t = t_axis(0.05)
    return bandpass(rng.standard_normal(len(t)), 3000, 8000) * np.exp(-t * 90) * amp


def bass_phone(freq, dur, amp=0.16):
    """A bass with harmonics up to about 1 kHz, so it is heard on a phone too."""
    x = saw(freq, dur, 900)
    x = np.tanh(x * 1.2)
    return x * env_adsr(len(x), 0.02, 0.5) * amp


def crack(amp=0.35):
    t = t_axis(0.5)
    return bandpass(rng.standard_normal(len(t)), 1000, 4500) * np.exp(-t * 14) * amp


def droplets(dur, rate=40, amp=0.05):
    """Rain as grains: tiny ticks at random, 2-6 kHz."""
    n = int(dur * SR)
    out = np.zeros((2, n))
    for _ in range(int(dur * rate)):
        i = rng.integers(0, max(1, n - 800))
        g = bandpass(rng.standard_normal(800), 2000, 6000) * np.exp(-np.arange(800) / SR * 500) * amp * rng.uniform(0.3, 1)
        p = rng.uniform(0.15, 0.85)
        out[0, i : i + 800] += g * (1 - p)
        out[1, i : i + 800] += g * p
    return out


def riser(dur=2.0, amp=0.14):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    x = rng.standard_normal(n)
    k = (tt / dur) ** 2.5
    r = (bandpass(x, 200, 1200) * (1 - k) + bandpass(x, 1500, 8000) * k) * k * amp
    return np.stack([r, np.roll(r, 200)])


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
    phone = cues.get("phone", False)
    clock = cues.get("style") == "seedclock"
    fade_in = cues.get("fade_in", 1.2)
    soft = cues.get("soft", False)
    beat = 60 / 84
    m = Mix(L)

    # --- harmony: D minor, a slow i - VI - III - VII walk; the title resolves to D major.
    prog = [
        [50, 57, 62, 64, 65],  # Dm(add9)
        [46, 53, 58, 62, 65],  # Bb
        [53, 57, 60, 65, 69],  # F
        [48, 55, 60, 64, 67],  # C
    ]
    # The phone mix changes chord on the bar, counted from the montage's first downbeat.
    chord_len = 4 * beat if phone else 4.0
    t0 = life - np.ceil(life / chord_len) * chord_len if phone else 0.0
    chord = lambda t: int(np.floor((t - t0) / chord_len)) % 4  # noqa: E731
    t = t0
    while t < drama:
        dur = min(chord_len + 1.6, drama + 1.5 - t)
        cutoff = 900 if t < b else 1500 if t < life else 2200
        amp = 0.05 if t < b else 0.06 if t < life else 0.07
        if phone and t < b:
            amp *= 1.5  # the intro sat 4 dB under the rest
        if clock:
            amp *= 0.6
        m.add(max(t, -1.0), pad_chord(prog[chord(t + 0.01)], dur, cutoff, amp), send=0.55)
        t += chord_len

    # Bells over the intro (the queen in the air), or on each card.
    accents = cues.get("accents")
    if accents is None:
        accents = [at for at in (1.5, 5.2, 8.6, 12.0, 14.6) if at < b]
    first = [0.04] if fade_in < 0.5 else []
    notes = [74, 77, 72, 81, 76, 79]
    for k, at in enumerate(first + list(accents)):
        n = notes[k % len(notes)]
        if clock:
            m.add(at, marimba(midi(n), 2.5, 0.11), pan=rng.uniform(0.35, 0.65), send=0.5)
        else:
            m.add(at, bell(midi(n)), pan=rng.uniform(0.3, 0.7), send=0.7)

    # The alates' hum over the flight.
    if "buzz" in cues:
        a0, a1 = cues["buzz"]
        tb = t_axis(a1 - a0)
        hum = saw(190, a1 - a0, 600) * (0.5 + 0.5 * np.sin(2 * np.pi * 23 * tb)) * 0.025
        hum *= env_adsr(len(hum), 0.3, 0.8)
        pan = 0.5 + 0.35 * np.sin(2 * np.pi * tb / 3.1)
        m.add(a0, np.stack([hum * (1 - pan), hum * pan]) * 1.4, send=0.3)

    # --- the pulse: eighths at 84 bpm on a grid that puts a downbeat exactly where the
    # life montage starts (its cuts are on the beat).
    arp = {0: [62, 65, 69, 74], 1: [58, 62, 65, 70], 2: [60, 65, 69, 72], 3: [60, 64, 67, 72]}
    t = life - np.ceil((life - b) / (beat / 2)) * (beat / 2)
    step = 0
    while t < drama - 0.2:
        k = chord(t) if phone else int((t / chord_len)) % 4
        # (The octave jump falls on every other bar of the montage.)
        up = (int(round((t - life) / beat)) // 4) % 2 if phone else (step // 8) % 2
        n = arp[k][step % 4] + (12 if up and t > life else 0)
        bright = 0.6 + 0.8 * min(1, (t - b) / max(1, life - b))
        gain = 0.55 + 0.45 * min(1, (t - b) / max(1, life - b))
        if clock:
            m.add(t, marimba(midi(n + 12), 1.2, 0.09 * gain), pan=0.35 + 0.3 * (step % 2), send=0.3)
        else:
            m.add(t, pluck(midi(n), 1.4, bright, 0.09 * gain), pan=0.35 + 0.3 * (step % 2), send=0.35)
        t += beat / 2
        step += 1

    # Bass and soft thumps (or knocks and a shaker) under the life montage.
    roots = [38, 34, 41, 36]
    if phone:
        t = life
        while t < drama - 0.5:
            f = midi(roots[chord(t)] + (12 if clock else 0))
            m.add(t, bass_phone(f, chord_len if not clock else beat * 0.9, 0.13), send=0.1)
            if clock:
                m.add(t + 2 * beat, bass_phone(f, beat * 0.9, 0.1), send=0.1)
            t += chord_len
    else:
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
    hit = boom_phone if phone else boom
    while t < drama - 0.3:
        if clock:
            if beat_n % 2 == 0:
                m.add(t, knock(0.14, 820), send=0.1)
            for s16 in range(4):
                swing = 0.55 if s16 % 2 else 0.0
                m.add(t + (s16 + swing * 0.5) * beat / 4, shaker(0.035 if s16 % 2 else 0.02), pan=0.6, send=0.1)
        else:
            if beat_n % 2 == 0:
                m.add(t, hit(0.8, 0.22), send=0.08)
            tk = 0.5 if phone else 1.0
            m.add(t + beat / 2, tick(0.06 * tk), pan=0.65, send=0.15)
            m.add(t + beat * 0.75, tick(0.035 * tk), pan=0.35, send=0.15)
        t += beat
        beat_n += 1
    # A knock on every cut, so the cuts are heard on a phone.
    for k, at in enumerate(cues.get("cuts", [])):
        m.add(at, knock(0.05 if soft else 0.12, 900 + 120 * (k % 3)), send=0.15)

    # --- drama: a drone with a rubbing minor second, rain, thunder.
    dd = title - drama + 1.0
    if phone:
        m.add(drama, pad_chord([50, 57, 62, 63], dd, 1800, 0.07), send=0.5)
    else:
        m.add(drama, pad_chord([38, 45, 50, 51], dd, 500, 0.09), send=0.5)
    for at in cues.get("hits", []):
        m.add(at, hit(4.0, 0.38 if soft else 0.55), send=0.35)
    for at in cues.get("thunder", []):
        m.add(at, thunder(6.0, 0.35 if soft else 0.5), send=0.25)
    for at in cues.get("flashes", []):
        m.add(at, crack(0.12 if soft else 0.35), pan=rng.uniform(0.3, 0.7), send=0.3)
    r0, r1 = cues.get("rain", [drama, drama])
    if r1 > r0:
        rain = noise_bed(r1 - r0 + 1.5, 900, 4500, 0.04) if soft else noise_bed(r1 - r0 + 1.5, 1200, 7000, 0.095 if phone else 0.03)
        rain *= automation(rain.shape[1], [(0, 0), (0.6, 1), (r1 - r0, 1), (r1 - r0 + 1.5, 0)])
        m.add(r0, rain, send=0.2)
        if phone or clock:
            m.add(r0, droplets(r1 - r0 + 0.5, 30 if soft else 40, 0.025 if soft else 0.06), send=0.15)
    n0, n1 = cues.get("night", [drama, drama])
    if n1 > n0:
        # Crickets: bursts of a high chirp.
        t = n0
        while t < n1:
            tc = t_axis(0.18)
            chirp = np.sin(2 * np.pi * 4300 * tc) * (np.sin(2 * np.pi * 30 * tc) > 0) * np.exp(-tc * 8) * 0.025
            m.add(t, chirp, pan=rng.uniform(0.2, 0.8), send=0.4)
            t += (beat / 3) * 2 if clock else rng.uniform(0.35, 0.7)
    for at in cues.get("shimmer", []):
        for k, n in enumerate((86, 93, 98, 91)):
            m.add(at + k * 0.09, bell(midi(n), 3.0, 0.035), pan=0.2 + 0.2 * k, send=0.9)
    for at in cues.get("risers", []):
        m.add(at - 2.0, riser(2.0, 0.07 if soft else 0.12), send=0.4)

    # --- title: a beat of near-silence, then a warm D major swell and a low hit.
    swell_len = L - title + 0.5
    m.add(title + 0.35, pad_chord([38, 50, 57, 62, 66, 69, 76], swell_len, 1800, 0.11), send=0.7)
    m.add(title + 0.35, hit(5.0, 0.42 if soft else 0.6), send=0.4)
    if clock:
        for k, n in enumerate((62, 66, 69, 74)):
            m.add(title + 0.35 + k * 0.03, marimba(midi(n), 4.0, 0.1), pan=0.3 + 0.13 * k, send=0.5)
    for at, n in ((title + 0.4, 78), (title + 1.6, 81), (title + 3.0, 74)):
        m.add(at, bell(midi(n), 5.0, 0.06), pan=rng.uniform(0.35, 0.65), send=0.8)
    if cues.get("loop"):
        # The last note rings over the cut back to the start.
        m.add(L - 1.2, bell(midi(74), 3.0, 0.05), send=0.8)

    # --- wind bed all through (quieter under the groove).
    wind = noise_bed(L, 120, 900, 0.05)
    lfo = 0.6 + 0.4 * np.sin(2 * np.pi * t_axis(L)[: wind.shape[1]] / 9.0)
    wind *= lfo
    w_in = min(2, fade_in) if fade_in >= 0.5 else 0.02
    wind *= automation(wind.shape[1], [(0, 0), (w_in, 1), (life, 0.8), (drama, 1.3), (title, 0.4), (L, 0.2)])
    m.add(0, wind, send=0.1)

    wet = convolve(m.wet, reverb_ir())
    mix = m.dry + wet * 0.9
    # Section gain: dip before the title so the swell lands.
    end = [(L - 0.3, 1), (L, 0.85)] if cues.get("loop") else [(L - 2.5, 1), (L, 0)]
    g = automation(mix.shape[1], [(0, 0), (max(0.02, fade_in), 1), (title - 0.6, 1), (title - 0.1, 0.25), (title + 0.35, 1)] + end)
    mix *= g
    if phone:
        mix = np.stack([highpass(mix[0], 40), highpass(mix[1], 40)])
    if not soft:
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
