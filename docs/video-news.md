# Video News manifest

`public/videos.json` lists the vertical videos shown on the **Video news** page. It is separate from the v1
`feed.json` contract, so feed validators, backups and browser storage are unchanged. Schema: `public/videos.schema.json`.

```json
{
  "version": 1,
  "videos": [
    {
      "id": "video:hn-50572503",
      "feedId": "hn:50572503",
      "title": "Frostbite: a CPU architecture discovered, designed and verified end-to-end by AI",
      "source": "Hacker News",
      "topics": ["AI", "Technology"],
      "url": "https://architectlabs.com/blog/frostbite",
      "src": "media/videos/hn-50572503.mp4",
      "poster": "media/videos/hn-50572503.jpg",
      "captions": "media/videos/hn-50572503.vtt",
      "duration": 37.5,
      "transcript": "Narration text…",
      "createdAt": "2026-11-20T18:20:00Z",
      "pinned": false
    }
  ]
}
```

- `feedId` (required) is the `feed.json` item the video is about; `url` is the original article. The video page links to both
  ("Read the story" and "In dashboard" → `news/?item=<feedId>`), and News cards/details show "▶ Watch video" by matching
  `feedId` client-side, so `feed.json` stays v1 with no new fields.
- `ticks: true` (optional, legacy) marks videos rendered before 2026-11-20, which still have Stories-style white progress
  ticks painted at y≈22–28. The Video news reader crops the top 32 px only for those (`video.has-ticks` in
  `src/styles/video-news.css`). New renders have no ticks and no flag; re-rendering a legacy video drops the flag.
- `id` is `video:` plus a lowercase slug; `src` must be an `.mp4` dashboard path or an `https://` URL.
- Keep each MP4 under 6 MB (H.264 + AAC, `+faststart`). `npm test` checks files exist and sizes.
- Video media under `media/videos/` is not precached by the service worker; `videos.json` is network-first.
- Generate entries with `video/make.py` (see `video/README.md`).

## Retention and keeping videos forever

- Every run keeps each video at least **60 days** after `createdAt` (`video/make.py --retain-days 60`, the default).
  Older videos are deleted (manifest entry plus MP4, poster and captions) **unless `"pinned": true`**. Re-rendering keeps the original `createdAt`.
- `pinned: true` means keep forever. The manifest in the repo is the only source of truth for retention.
- Ways to pin:
  1. **Keep forever** on the Video news page opens a prefilled GitHub issue titled `Keep video: <id>` (label `keep-video`).
     Submitting it from the owner's account (ar4ft) is the request; the button also remembers "Keep requested" in this
     browser only. The next curation run (`make.py --sync-pins`) pins videos from **open issues authored by the owner only**
     (anyone can open issues on a public repo), and the page then shows "📌 Kept forever".
  2. Ask the curation agent ("keep the Frostbite video"); it runs `make.py --pin video:hn-50572503`.
  3. Edit `public/videos.json` and set `"pinned": true`.
- Unpin with `make.py --unpin <id>` or by setting `false`.

## Full-screen reader

The Video news page lists poster cards with a **Full screen** button. Opening full screen, tapping a card, or following a `videos/#<id>` link (including **▶ Watch video** on News) uses the same swipe reader as News and Ideas: one video per screen, swipe up or down, arrow keys, and Esc to close.

In the reader, the video fills the screen (contained on black) with no gray overlay, so burned-in captions stay readable. A compact title and source sit at the bottom-left; Story, Dashboard, and Keep forever stay on the right. The current video autoplays muted; tap the video or the sound control to unmute. Only the current video and the next one are preloaded. Swiping away pauses playback.

News swipe reels also play the matching video inline when one exists, and still offer **Watch video** to open this reader at that story.

## Recommended invocation (curation routine)

```sh
cd /workspace/dashboard/repo && PY=/workspace/video-venv/bin/python
$PY -W ignore video/make.py --ids <feed ids…> --ingest-only --work /workspace/video-work
# write video/scripts/<slug>.json for each fetched story, then:
$PY -W ignore video/make.py --ids <feed ids…> --scripts video/scripts --work /workspace/video-work \
    --social-dir /workspace/video-social/$(date +%F) --retain-days 60 --sync-pins < /dev/null
```

- Pass all IDs to one invocation. Each story is rendered in its own try/except with one retry, and `public/videos.json`
  is saved after every successful video, so one failure never loses earlier renders. Failures are listed at the end
  (`failed (n): …`) and leave no half-written media.
- TTS (edge-tts) has a per-voice timeout (`VIDEO_TTS_TIMEOUT`, default 60 s) and one retry per segment.
- `make.py` detaches its children from stdin (and `--sync-pins` calls `gh` with `stdin=DEVNULL`), so it is safe inside
  `while read …` loops; `< /dev/null` is still recommended.
