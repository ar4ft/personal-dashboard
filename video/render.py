"""Render a vertical (9:16) news video from a story script.

Pillow draws every frame; frames are piped straight into ffmpeg (libx264 + AAC).
Narration comes from edge-tts with word-level timings that drive kinetic captions.
"""
from __future__ import annotations
import asyncio, json, math, os, re, subprocess, tempfile
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

FONT_DIR = Path(os.environ.get("VIDEO_FONT_DIR", "/usr/share/fonts/truetype/sand-box/google"))
DISPLAY_FONT = os.environ.get("VIDEO_DISPLAY_FONT", str(FONT_DIR / "Bricolage Grotesque/BricolageGrotesque-VariableFont_opsz,wdth,wght.ttf"))
UI_FONT = os.environ.get("VIDEO_UI_FONT", str(FONT_DIR / "Inter/Inter-VariableFont_opsz,wght.ttf"))
VOICE = os.environ.get("VIDEO_VOICE", "en-US-AvaNeural")
RATE = os.environ.get("VIDEO_RATE", "+6%")
FPS = 30

TEAL = (18, 103, 115)
ACCENT = (255, 214, 92)
SOURCE_COLORS = {"Hacker News": (255, 102, 0), "Twitter / X": (20, 20, 20), "Reading": (108, 76, 216), "X digest": (20, 20, 20)}
SOURCE_LABEL = {"Twitter / X": "X", "Hacker News": "Hacker News", "Reading": "Reading"}


@lru_cache(maxsize=64)
def font(size: int, weight: str = "ExtraBold", ui=False) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(UI_FONT if ui else DISPLAY_FONT, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


def speakable(text: str) -> str:
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"\b(\w+)\(\)", r"\1", text).replace("`", "")
    text = re.sub(r"[^\w\s.,!?;:'’\"“”()%$€£+×/&@#°-]", "", text)  # drop emoji and symbols the voice reads oddly
    return re.sub(r"\s+", " ", text).strip()


# ---------------------------------------------------------------- narration
async def _tts(text: str, out: Path) -> list[tuple[float, float, str]]:
    import edge_tts
    words = []
    for voice in dict.fromkeys((VOICE, "en-US-AvaNeural", "en-US-AriaNeural")):
        try:
            comm = edge_tts.Communicate(text, voice, rate=RATE, boundary="WordBoundary")
            words = []
            with open(out, "wb") as fh:
                async for ch in comm.stream():
                    if ch["type"] == "audio":
                        fh.write(ch["data"])
                    elif ch["type"] == "WordBoundary":
                        words.append((ch["offset"] / 1e7, ch["duration"] / 1e7, ch["text"]))
            return words
        except Exception:
            continue
    raise RuntimeError("TTS failed for all voices")


def duration(path: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def narrate(segments: list[str], tmp: Path, gap=0.28):
    """TTS each segment; return wav path, per-segment (start, end) and global word timings."""
    parts, spans, words, t = [], [], [], 0.25
    for i, text in enumerate(segments):
        mp3 = tmp / f"seg{i}.mp3"
        w = asyncio.run(_tts(text, mp3))
        d = duration(mp3)
        spans.append((t, t + d))
        words += [(t + o, t + o + du, s) for o, du, s in w]
        parts.append((mp3, t))
        t += d + gap
    total = t + 0.6
    inputs, filters = [], []
    for i, (p, start) in enumerate(parts):
        inputs += ["-i", str(p)]
        filters.append(f"[{i}:a]adelay={int(start*1000)}|{int(start*1000)},aresample=44100[a{i}]")
    mix = "".join(f"[a{i}]" for i in range(len(parts))) + f"amix=inputs={len(parts)}:normalize=0,apad,atrim=0:{total:.3f},loudnorm=I=-15:TP=-1.5[out]"
    wav = tmp / "narration.wav"
    subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(filters + [mix]), "-map", "[out]", "-ac", "2", str(wav)], check=True)
    return wav, spans, words, total


# ---------------------------------------------------------------- visuals
def rounded(im: Image.Image, r: int) -> Image.Image:
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *im.size), r, fill=255)
    im = im.convert("RGBA")
    im.putalpha(mask)
    return im


class Visual:
    """Pre-rendered background plate for one beat; per-frame motion is a cheap crop/offset."""

    def __init__(self, path: str | None, W: int, H: int, kind: str):
        self.W, self.H = W, H
        self.kind = kind
        src = Image.open(path).convert("RGB") if path else None
        if src is None:
            self.plate = self._brand_plate()
            self.mode = "zoom"
        elif kind == "shot" or src.height / src.width > 1.3:
            # tall page screenshot: full-bleed, slow scroll
            w = int(W * 1.06)
            plate = src.resize((w, int(src.height * w / src.width)), Image.LANCZOS)
            self.plate = Image.blend(plate, Image.new("RGB", plate.size, (10, 14, 20)), 0.22)
            self.mode = "scroll"
        else:
            # landscape/square image: framed card over a blurred, darkened copy
            bg = ImageOps.fit(src, (int(W * 1.12), int(H * 1.12)), Image.LANCZOS).filter(ImageFilter.GaussianBlur(28))
            bg = Image.blend(bg, Image.new("RGB", bg.size, (8, 12, 16)), 0.45)
            cw = int(W * 0.9)
            card = src.copy()
            card.thumbnail((cw, int(H * 0.46)), Image.LANCZOS)
            card = rounded(card, 26)
            shadow = Image.new("RGBA", (card.width + 80, card.height + 80), (0, 0, 0, 0))
            ImageDraw.Draw(shadow).rounded_rectangle((40, 50, 40 + card.width, 50 + card.height), 30, fill=(0, 0, 0, 150))
            shadow = shadow.filter(ImageFilter.GaussianBlur(22))
            bg = bg.convert("RGBA")
            cx, cy = (bg.width - card.width) // 2, int(bg.height * 0.36) - card.height // 2
            bg.alpha_composite(shadow, (cx - 40, cy - 40))
            bg.alpha_composite(card, (cx, cy))
            self.plate = bg.convert("RGB")
            self.mode = "zoom"

    def _brand_plate(self):
        W, H = int(self.W * 1.12), int(self.H * 1.12)
        g = Image.linear_gradient("L").resize((W, H))
        return Image.composite(Image.new("RGB", (W, H), (6, 40, 46)), Image.new("RGB", (W, H), TEAL), g)

    def frame(self, p: float) -> Image.Image:
        p = max(0.0, min(1.0, p))
        e = p * p * (3 - 2 * p)
        if self.mode == "scroll":
            travel = max(0, self.plate.height - self.H)
            y = int(min(travel, self.H * 0.35) * e)
            x = (self.plate.width - self.W) // 2
            return self.plate.crop((x, y, x + self.W, y + self.H))
        s = 1.0 + 0.07 * e  # Ken Burns push-in
        cw, ch = int(self.plate.width / s / 1.12 * 1.0), int(self.plate.height / s / 1.12)
        cx, cy = (self.plate.width - cw) // 2, (self.plate.height - ch) // 2
        return self.plate.crop((cx, cy, cx + cw, cy + ch)).resize((self.W, self.H), Image.BILINEAR)


# ---------------------------------------------------------------- overlays
def gradient_overlay(W, H):
    a = Image.new("L", (1, 256))
    for y in range(256):
        t = y / 255
        v = 150 * max(0, 1 - t / 0.22) + 245 * max(0, (t - 0.45) / 0.55) ** 1.1
        a.putpixel((0, y), int(min(240, v)))
    a = a.resize((W, H))
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ov.putalpha(a)
    return ov


def pill(text, size, bg, fg=(255, 255, 255), pad=(18, 9), weight="SemiBold"):
    f = font(size, weight, ui=True)
    l, t, r, b = f.getbbox(text)
    im = Image.new("RGBA", (r - l + pad[0] * 2, size + pad[1] * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, im.width - 1, im.height - 1), im.height // 2, fill=bg)
    d.text((pad[0] - l, pad[1] + (size - (b - t)) // 2 - t), text, font=f, fill=fg)
    return im


def wrap(text, f, maxw):
    lines, cur = [], ""
    for w in text.split():
        trial = f"{cur} {w}".strip()
        if f.getlength(trial) <= maxw or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def chunk_words(words, max_chars=18, max_words=3, breaks=()):
    chunks, cur = [], []
    for w in words:
        if cur and (w[0] - cur[-1][1] > 0.22 or any(cur[-1][0] < b <= w[0] for b in breaks)):
            chunks.append(cur)
            cur = []
        cur.append(w)
        txt = " ".join(x[2] for x in cur)
        if len(cur) >= max_words or len(txt) >= max_chars or re.search(r"[.,!?;:]$", w[2]):
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    return chunks


@lru_cache(maxsize=512)
def caption_image(words: tuple[str, ...], active: int, size: int, maxw: int):
    f = font(size, "ExtraBold")
    stroke = max(4, size // 11)
    texts = [w.upper() for w in words]
    space = f.getlength(" ")
    lines, line, lw = [], [], 0
    for i, t in enumerate(texts):
        wl = f.getlength(t)
        if line and lw + space + wl > maxw:
            lines.append(line); line, lw = [], 0
        line.append((i, t, wl)); lw += (space if lw else 0) + wl
    lines.append(line)
    lh = int(size * 1.08)
    im = Image.new("RGBA", (maxw + stroke * 4, lh * len(lines) + stroke * 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for li, ln in enumerate(lines):
        total = sum(w for _, _, w in ln) + space * (len(ln) - 1)
        x = (im.width - total) / 2
        for i, t, wl in ln:
            color = ACCENT if i == active else (255, 255, 255)
            d.text((x, stroke * 2 + li * lh), t, font=f, fill=color, stroke_width=stroke, stroke_fill=(0, 0, 0))
            x += wl + space
    return im


def ease_out_back(t):
    c1, c3 = 1.70158, 2.70158
    t = max(0, min(1, t))
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2


def vtt(chunks) -> str:
    def ts(x):
        return f"{int(x // 3600):02d}:{int(x % 3600 // 60):02d}:{x % 60:06.3f}"
    out = ["WEBVTT", ""]
    for c in chunks:
        out += [f"{ts(c[0][0])} --> {ts(c[-1][1] + 0.2)}", " ".join(w[2] for w in c), ""]
    return "\n".join(out)


# ---------------------------------------------------------------- composition
def render(story: dict, script: dict, out_mp4: Path, poster: Path, size=720, music: str | None = None, crf=27) -> dict:
    W, H = size, size * 16 // 9
    k = W / 720
    tmp = Path(tempfile.mkdtemp(prefix="vidrender-"))
    hook = speakable(script["hook"])
    beats = script["beats"]
    outro = speakable(script.get("outro") or "Full story on the dashboard.")
    segments = [hook] + [speakable(b["say"]) for b in beats] + [outro]
    wav, spans, words, total = narrate(segments, tmp)

    visuals_src = [v for v in story.get("visuals", [])] or [None]
    def vis(idx):
        v = visuals_src[idx % len(visuals_src)] if visuals_src[0] else None
        return Visual(v["path"] if v else None, W, H, v["kind"] if v else "brand")
    plates = [vis(script.get("hookVisual", 0))] + [vis(b.get("visual", i + 1)) for i, b in enumerate(beats)] + [vis(script.get("outroVisual", 0))]

    overlay = gradient_overlay(W, H)
    scrim = Image.new("L", (W, H), 0)
    ImageDraw.Draw(scrim).rounded_rectangle((int(W * 0.02), int(H * 0.55), int(W * 0.98), int(H * 0.88)), int(80 * k), fill=120)
    scrim = scrim.filter(ImageFilter.GaussianBlur(int(50 * k)))
    scrim_rgba = Image.new("RGBA", (W, H), (0, 0, 0, 0)); scrim_rgba.putalpha(scrim)
    source = story.get("source") or "News"
    badges = [pill(SOURCE_LABEL.get(source, source), int(22 * k), SOURCE_COLORS.get(source, TEAL) + (255,))]
    for t in (story.get("topics") or [])[:1]:
        badges.append(pill(t, int(22 * k), (255, 255, 255, 235), fg=(20, 20, 20)))
    domain = urlparse(story.get("target") or story.get("url") or "").netloc.replace("www.", "")
    chunks = chunk_words(words, breaks=[sp[0] - 0.01 for sp in spans])
    seg_bounds = [(spans[i][0] - (0.25 if i == 0 else 0.14), spans[i + 1][0] - 0.14 if i + 1 < len(spans) else total) for i in range(len(spans))]
    seg_bounds[0] = (0.0, seg_bounds[0][1])
    n_frames = int(total * FPS)
    fade = 0.28

    enc = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-i", str(wav), *(["-stream_loop", "-1", "-i", music] if music else []),
                            *(["-filter_complex", f"[1:a]asplit=2[n1][n2];[2:a]volume=0.26,afade=t=out:st={max(0, total-1.5):.2f}:d=1.5[m];[m][n1]sidechaincompress=threshold=0.03:ratio=8:release=350[duck];[n2][duck]amix=inputs=2:normalize=0[a]", "-map", "0:v", "-map", "[a]"] if music else ["-map", "0:v", "-map", "1:a"]),
                            "-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-maxrate", "1600k", "-bufsize", "3200k",
                            "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "96k",
                            "-shortest", str(out_mp4)], stdin=subprocess.PIPE)
    poster_saved = False
    hook_words = [w for w in words if w[0] < spans[0][1] + 0.05]
    title_font = font(int(84 * k), "ExtraBold")
    hook_lines = wrap(script.get("hookText", hook).upper(), title_font, W * 0.86)

    for fi in range(n_frames):
        t = fi / FPS
        si = next((i for i, (a, b) in enumerate(seg_bounds) if a <= t < b), len(seg_bounds) - 1)
        a, b = seg_bounds[si]
        frame = plates[si].frame((t - a) / max(0.1, b - a))
        if si > 0 and t - a < fade:  # crossfade + slight punch from previous plate
            prev = plates[si - 1].frame(1.0)
            frame = Image.blend(prev, frame, (t - a) / fade)
        frame = frame.convert("RGBA")
        frame.alpha_composite(overlay)
        if si > 0 and plates[si].mode == "scroll":
            frame.alpha_composite(scrim_rgba)
        d = ImageDraw.Draw(frame)

        # progress bar, segmented like stories
        gx, gy, gw, gh = int(24 * k), int(22 * k), W - int(48 * k), max(4, int(6 * k))
        nseg, gap = len(seg_bounds), int(6 * k)
        sw = (gw - gap * (nseg - 1)) / nseg
        for i, (sa, sb) in enumerate(seg_bounds):
            x0 = gx + i * (sw + gap)
            d.rounded_rectangle((x0, gy, x0 + sw, gy + gh), gh // 2, fill=(255, 255, 255, 90))
            fill = 1.0 if t >= sb else max(0.0, (t - sa) / (sb - sa)) if t >= sa else 0
            if fill > 0:
                d.rounded_rectangle((x0, gy, x0 + max(gh, sw * fill), gy + gh), gh // 2, fill=(255, 255, 255, 255))
        bx = gx
        for bimg in badges:
            frame.alpha_composite(bimg, (bx, gy + int(22 * k)))
            bx += bimg.width + int(10 * k)

        if si == 0:
            # HOOK: big title words slam in during the first ~2 s
            lh = int(88 * k)
            y0 = int(H * 0.70) - (lh * len(hook_lines)) // 2
            idx = 0
            nwords = sum(len(l.split()) for l in hook_lines)
            for li, line in enumerate(hook_lines):
                x = (W - title_font.getlength(line)) / 2
                for w in line.split():
                    appear = 0.08 + idx * min(0.16, 1.6 / max(1, nwords))
                    p = (t - appear) / 0.18
                    if p > 0:
                        s = ease_out_back(p)
                        wimg = Image.new("RGBA", (int(title_font.getlength(w)) + 20, lh + 20), (0, 0, 0, 0))
                        ImageDraw.Draw(wimg).text((10, 6), w, font=title_font, fill=ACCENT if idx == 0 else (255, 255, 255), stroke_width=int(5 * k), stroke_fill=(0, 0, 0))
                        if abs(s - 1) > 0.01:
                            wimg = wimg.resize((max(1, int(wimg.width * s)), max(1, int(wimg.height * s))), Image.BILINEAR)
                        alpha = min(1, p * 2)
                        if alpha < 1:
                            wimg.putalpha(wimg.getchannel("A").point(lambda v: int(v * alpha)))
                        frame.alpha_composite(wimg, (int(x + (title_font.getlength(w) + 20) / 2 - wimg.width / 2 - 10), int(y0 + li * lh + (lh + 20) / 2 - wimg.height / 2)))
                    x += title_font.getlength(w + " ")
                    idx += 1
        else:
            # stat callout
            beat = beats[si - 1] if si - 1 < len(beats) else None
            if beat and beat.get("stat"):
                p = min(1, (t - a) / 0.35)
                sfont = font(int(120 * k), "ExtraBold")
                stat = beat["stat"]
                m = re.match(r"^([^\d]*)([\d,]*\.?\d+)(.*)$", stat)
                if m and p < 1:
                    num = float(m.group(2).replace(",", ""))
                    dec = len(m.group(2).split(".")[1]) if "." in m.group(2) else 0
                    val = num * (1 - (1 - p) ** 3)
                    shown = f"{m.group(1)}{val:,.{dec}f}{m.group(3)}" if "," in m.group(2) else f"{m.group(1)}{val:.{dec}f}{m.group(3)}"
                else:
                    shown = stat
                sw_ = sfont.getlength(shown)
                sy = int(H * 0.575)
                d.text(((W - sw_) / 2, sy - int(30 * k) * (1 - p)), shown, font=sfont, fill=ACCENT + (int(255 * p),), stroke_width=int(6 * k), stroke_fill=(0, 0, 0, int(255 * p)))
                if beat.get("statLabel"):
                    lf = font(int(30 * k), "Bold")
                    lbl = beat["statLabel"].upper()
                    d.text(((W - lf.getlength(lbl)) / 2, sy + int(132 * k)), lbl, font=lf, fill=(255, 255, 255, int(255 * p)), stroke_width=int(3 * k), stroke_fill=(0, 0, 0, int(200 * p)))
            if si == len(seg_bounds) - 1:
                # outro card
                p = min(1, (t - a) / 0.4)
                cf = font(int(46 * k), "ExtraBold")
                lines = ["FULL STORY", "ON THE DASHBOARD"]
                for li, ln in enumerate(lines):
                    d.text(((W - cf.getlength(ln)) / 2, int(H * 0.66) + li * int(56 * k)), ln, font=cf, fill=(255, 255, 255, int(255 * p)), stroke_width=int(4 * k), stroke_fill=(0, 0, 0, int(255 * p)))
                if domain:
                    dp = pill(domain, int(24 * k), (255, 255, 255, int(235 * p)), fg=(20, 20, 20))
                    frame.alpha_composite(dp, ((W - dp.width) // 2, int(H * 0.66) + int(130 * k)))

        # kinetic captions (skip during hook: the title already carries those words)
        if si > 0:
            cur = next((c for c in reversed(chunks) if c[0][0] - 0.05 <= t <= c[-1][1] + 0.25 and c[0][0] >= spans[1][0] - 0.05), None)
            if cur:
                active = max([i for i, w in enumerate(cur) if w[0] <= t] or [0])
                cimg = caption_image(tuple(w[2] for w in cur), active, int(64 * k), int(W * 0.84))
                p = (t - cur[0][0]) / 0.12
                if p < 1:
                    s = 0.85 + 0.15 * ease_out_back(max(0, p))
                    cimg = cimg.resize((max(1, int(cimg.width * s)), max(1, int(cimg.height * s))), Image.BILINEAR)
                frame.alpha_composite(cimg, ((W - cimg.width) // 2, int(H * 0.775) - cimg.height // 2))

        # handle/credit footer
        if story.get("credit"):
            cf2 = font(int(20 * k), "Medium", ui=True)
            d.text((gx, H - int(44 * k)), story["credit"], font=cf2, fill=(255, 255, 255, 190))

        rgb = frame.convert("RGB")
        if not poster_saved and t >= 1.9:
            rgb.save(poster, quality=82)
            poster_saved = True
        enc.stdin.write(rgb.tobytes())
    enc.stdin.close()
    if enc.wait() != 0:
        raise RuntimeError("ffmpeg failed")
    out_mp4.with_suffix(".vtt").write_text(vtt(chunks))
    return {"duration": round(total, 2), "bytes": out_mp4.stat().st_size, "width": W, "height": H,
            "captions": " ".join(segments)}
