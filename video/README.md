# Video News pipeline

Turns news items from `public/feed.json` into short vertical (9:16) narrated videos for the
**Video news** page (`/videos/`). Everything is free and runs from code on the curation box.

```
feed item ──► ingest.py ──► story.json ──► script (agent-written or auto) ──► render.py ──► MP4 + poster + VTT
              real article text,             hook + 3 beats with            edge-tts narration with word timings,
              key facts, og:image,           real numbers                   Pillow frames piped to ffmpeg (H.264/AAC)
              inline figures, phone
              screenshots of the page
```

## Setup (once)

```sh
python3 -m venv /workspace/video-venv
/workspace/video-venv/bin/pip install -r video/requirements.txt
```

Needs `ffmpeg` and Google Chrome (or Chromium) on the PATH. Fonts default to Bricolage Grotesque
(the dashboard's display font) and Inter from `/usr/share/fonts/...`; override with `VIDEO_FONT_DIR`,
`VIDEO_DISPLAY_FONT` and `VIDEO_UI_FONT`. Voice: `VIDEO_VOICE` (default `en-US-AvaNeural`), `VIDEO_RATE`.

## Run

```sh
PY=/workspace/video-venv/bin/python
# 1. fetch the real stories (article text, facts, images, screenshots) into the work dir
$PY video/make.py --ids hn:50572503 x:2123708574790553715 --ingest-only --work /tmp/video-work
# 2. (recommended) the curation agent reads /tmp/video-work/<slug>/story.json and writes video/scripts/<slug>.json
# 3. render; items without a script get an automatic extractive script
$PY video/make.py --ids hn:50572503 x:2123708574790553715 --scripts video/scripts --work /tmp/video-work \
    --social-dir /workspace/video-social/$(date +%F) --sync-pins
```

Outputs `public/media/videos/<slug>.mp4|.jpg|.vtt` (720×1280, ~2–3 MB per 30 s). With `--host jsdelivr` (the live setup)
the MP4 is uploaded to ar4ft/dashboard-videos, `src` becomes a SHA-pinned jsDelivr URL and the local MP4 is removed —
see `docs/video-news.md` › External hosting and upserts `public/videos.json`
with `feedId` and the article `url`. With `--social-dir`, it renders once at 1080×1920 into that folder (for
Reels/TikTok/Shorts, kept **out of the repo**) and downscales the site copy from it.

Retention runs every time: unpinned videos older than `--retain-days` (default 60) are deleted; `pinned: true` videos
are kept forever. `--pin` / `--unpin` take video or feed IDs; `--sync-pins` pins videos from open `Keep video: <id>`
issues authored by `--owner` (default `ar4ft`) — see `docs/video-news.md`.

Voice: `en-US-AvaNeural` (Microsoft Edge neural voice via edge-tts) by default.

## Music

`video/music/ambient-bed.mp3` (~20 s seamless loop, 96 kbps, 235 KB) is mixed under the narration at low volume and
ducks (sidechain compression) while the voice speaks. **Source: generated procedurally by `video/music/make_bed.py`
(numpy sine pads, sub pulse and filtered noise; seeded, reproducible). It is original work for this repo, released
under CC0 1.0 — no third-party samples, so no attribution or licence restrictions apply.** Regenerate with
`python video/music/make_bed.py video/music/ambient-bed.mp3`. Use `--no-music` to turn it off, or `--music other.mp3`
only with a track whose licence allows reuse (e.g. CC0), and record its source here.

## Script format (`video/scripts/<slug>.json`)

```json
{
  "hook": "AI just designed an entire CPU by itself.",
  "hookText": "AI just designed a whole CPU",
  "beats": [
    {"say": "One or two spoken sentences built from facts in story.json.", "visual": 1},
    {"say": "…4.59 times the performance per watt…", "visual": 2, "stat": "4.59×", "statLabel": "performance per watt"}
  ],
  "outro": "Full story on the dashboard."
}
```

Rules for script writers: hook ≤ 10 words and lands in the first 2 seconds; 3 beats; 70–90 words total
(25–40 s); only facts present in `story.json` (article excerpt, post text or feed summary); spell numbers
the way they should be spoken; `visual` indexes `story.visuals` (0 = og:image, then page screenshots, then inline figures).

## Safety

Fetched pages and posts are untrusted data: they are only read as plain text for narration and as images.
Screenshots use a throwaway browser context with no cookies or logins. Never commit `story.json`
(it holds an article excerpt); only the short narration we write and the rendered media are published.
X posts are read from X's public embed/syndication endpoints, not the paid X API.
