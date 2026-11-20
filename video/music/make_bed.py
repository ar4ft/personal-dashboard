"""Procedurally generate the Video News ambient music bed (original work, released CC0).

Soft detuned pads over a slow I–V–vi–IV progression in C, a gentle sub pulse and
filtered shimmer. Deterministic (seeded) so the committed file can be regenerated.
Usage: python video/music/make_bed.py video/music/ambient-bed.mp3
"""
import subprocess, sys, wave
import numpy as np

SR, BPM, BARS = 44100, 96, 8
beat = 60 / BPM
bar = 4 * beat
N = int(SR * bar * BARS)
t = np.arange(N) / SR
rng = np.random.default_rng(7)
midi = lambda m: 440 * 2 ** ((m - 69) / 12)
chords = [[48, 55, 60, 64, 67], [43, 55, 59, 62, 67], [45, 57, 60, 64, 69], [41, 53, 57, 60, 65]]
out = np.zeros((N, 2))
for b in range(BARS):
    ch = chords[b % 4]
    s0, s1 = int(b * bar * SR), int((b + 1) * bar * SR)
    seg = t[: s1 - s0]
    env = np.minimum(1, seg / 0.9) * np.minimum(1, (bar - seg) / 0.9 + 0.15)
    for n in ch:
        f = midi(n)
        for det, pan in ((-0.12, 0.3), (0.12, 0.7)):
            ph = rng.uniform(0, 2 * np.pi)
            v = (np.sin(2 * np.pi * f * (1 + det / 100) * seg + ph) + 0.18 * np.sin(4 * np.pi * f * seg + ph)) * env * 0.05
            out[s0:s1, 0] += v * (1 - pan); out[s0:s1, 1] += v * pan
    root = midi(ch[0] - 12)
    for k in range(4):  # soft sub pulse on each beat
        p0 = s0 + int(k * beat * SR); L = int(beat * SR * 0.9)
        pe = np.exp(-np.arange(L) / SR * 5)
        out[p0:p0 + L] += (np.sin(2 * np.pi * root * np.arange(L) / SR) * pe * 0.09)[:, None]
# shimmer: band-limited noise, slowly breathing
noise = rng.standard_normal(N)
noise = np.convolve(noise, np.ones(30) / 30, mode="same") - np.convolve(noise, np.ones(300) / 300, mode="same")
out += (noise * 0.02 * (0.6 + 0.4 * np.sin(2 * np.pi * t / (bar * 2))))[:, None]
xf = int(SR * 0.5)  # crossfade the tail into the head so the loop is seamless
out[:xf] = out[:xf] * np.linspace(0, 1, xf)[:, None] + out[-xf:] * np.linspace(1, 0, xf)[:, None]
out = out[:-xf]
out /= np.abs(out).max() / 0.7
pcm = (out * 32767).astype("<i2")
wav = sys.argv[1].rsplit(".", 1)[0] + ".wav"
with wave.open(wav, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", wav, "-c:a", "libmp3lame", "-b:a", "96k",
                "-metadata", "title=Video News ambient bed", "-metadata", "copyright=CC0 1.0", sys.argv[1]], check=True)
import os; os.remove(wav)
