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
`VIDEO_DISPLAY_FONT` and `VIDEO_UI_FONT`. Voice: `VIDEO_VOICE` (default `en-US-AndrewNeural`), `VIDEO_RATE`.

## Run

```sh
PY=/workspace/video-venv/bin/python
# 1. fetch the real stories (article text, facts, images, screenshots) into the work dir
$PY video/make.py --ids hn:50572503 x:2123708574790553715 --ingest-only --work /tmp/video-work
# 2. (recommended) the curation agent reads /tmp/video-work/<slug>/story.json and writes video/scripts/<slug>.json
# 3. render; items without a script get an automatic extractive script
$PY video/make.py --ids hn:50572503 x:2123708574790553715 --scripts video/scripts --work /tmp/video-work --keep 30
```

Outputs `public/media/videos/<slug>.mp4|.jpg|.vtt` and upserts `public/videos.json`.
`--size 1080` renders 1080×1920 for uploading to Reels/TikTok/Shorts; the site default is 720×1280 (~2–3 MB per 30 s).
`--music track.mp3` adds a ducked music bed (royalty-free tracks only).

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
