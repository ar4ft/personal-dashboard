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
- `id` is `video:` plus a lowercase slug; `src` must be either a local `media/videos/<slug>.mp4` path or a SHA-pinned
  jsDelivr URL `https://cdn.jsdelivr.net/gh/ar4ft/dashboard-videos@<40-hex commit>/<slug>.mp4` (any other https host is
  rejected by `src/lib/videos.mjs` and the schema). Posters and VTT captions always stay local in `media/videos/`.
- Keep each MP4 under 6 MB (H.264 + AAC, `+faststart`); jsDelivr's per-file limit is 20 MB. `npm test` checks local files.
- MP4s are never precached by the service worker: local `media/videos/` is excluded from the precache, and the worker
  ignores cross-origin requests, so jsDelivr URLs always go to the network. `videos.json` is network-first.
- Generate entries with `video/make.py` (see `video/README.md`).

Agents adding news: follow the step-by-step prompt in [`docs/video-agents.md`](video-agents.md).

## External hosting (live since 2026-11-20)

**External hosting is live.** MP4s are no longer stored in this repo or on the Pages site; they live in the public repo
[ar4ft/dashboard-videos](https://github.com/ar4ft/dashboard-videos) (not a Pages site) and are served by jsDelivr.
Policy: **one video per new news story**, kept 60 days, pinned videos forever.

- Why not GitHub Release assets: GitHub serves them as `application/octet-stream` with no CORS, and Chrome blocks them
  from `ar4ft.github.io` (`ERR_BLOCKED_BY_ORB`). jsDelivr serves `video/mp4`, `Access-Control-Allow-Origin: *`,
  `Cross-Origin-Resource-Policy: cross-origin`, byte ranges (206) and `immutable` caching for SHA URLs.
- jsDelivr limits: 20 MB per file from any GitHub ref regardless of repo size; if a single-file fetch fails it falls back
  to fetching the whole ref, which is limited to 50 MB. So each ref is kept under 40 MB.
- Layout: `main` (README), orphan **day branches** `v-YYYYMMDD-N` (a new `-N` whenever the next video would push the
  branch over 40 MB) and `pinned-N` branches. Each upload is one commit built with git plumbing; `src` is pinned to that
  commit SHA, so URLs never change and jsDelivr caches them as immutable. `make.py` warms each new URL (GET, must be
  200 `video/mp4`) and then deletes the local MP4.
- Retention: when a video is older than 60 days and not pinned, its manifest entry, poster and captions are deleted. Day
  branches older than 61 days are deleted as whole refs (no history rewrite; GitHub reclaims the space), but first every
  pinned video on them is copied to a `pinned-N` branch and its `src` switched to the new commit.
- Index: the media repo's `main` README is generated from `public/videos.json` (grouped by day, newest first, with
  branch file link, jsDelivr link, story link, date and pinned flag). Every `--host jsdelivr` run regenerates it and
  pushes one commit only when it changed; an index failure never fails the run.
- Code: `video/host_jsdelivr.py` (`Host`), used by `make.py --host jsdelivr`. The media clone is
  `/workspace/dashboard/videos-repo`; pushes use the gh credential helper (no tokens in either repo).
- Videos from before external hosting were moved with `make.py --host jsdelivr --migrate` (uploads every local MP4 still
  referenced by `videos.json`, oldest first, saving after each). Run it again any time a local MP4 sneaks in.

## Retention and keeping videos forever

- Every run keeps each video at least **60 days** after `createdAt` (`video/make.py --retain-days 60`, the default).
  Older videos are deleted (manifest entry plus poster and captions; the MP4 goes with its expired day branch) **unless `"pinned": true`**. Re-rendering keeps the original `createdAt`.
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

## Automatic pipeline (GitHub Actions)

Since 2026-11-20 videos are made by `.github/workflows/video-news.yml` on `ar4ft/personal-dashboard`, with no agent
involved. Agents only add news (and optionally `video/scripts/<slug>.json`); see [`docs/video-agents.md`](video-agents.md).

- **Triggers:** a push to `main` touching `public/feed.json` or `video/scripts/**`; a schedule every 3 h (`:17`); manual
  `workflow_dispatch` with optional `ids` (space separated) and `max`. `concurrency: video-news` runs one at a time
  without cancelling (a newer queued run replaces an older queued one, which is fine: every run picks all missing).
- **Stories:** `ids` input, else `video/pick_ids.py --days 3 --max 20` (news items created in the last 3 days with no
  `feedId` in `videos.json`, newest first).
- **Steps:** Python 3.13 + pinned `video/requirements.txt` (pip cache), ffmpeg (apt), Bricolage Grotesque + Inter from
  `google/fonts` (cached), the runner's preinstalled Google Chrome for screenshots, `npm ci`; then
  `make.py --ingest-only` → `autoscript.py` (writes scripts only where none exist) →
  `make.py --host jsdelivr --retain-days 60 --sync-pins --story-timeout 300` (also runs with no stories, for retention,
  pins and the media README) → `npm test` → commit `public/videos.json`, `public/media/videos`, `video/scripts` and push
  with up to 5 `pull --rebase` retries. Timeout 45 min.
- **Scripts:** a hand-written `video/scripts/<slug>.json` always wins. Otherwise `video/autoscript.py` builds a
  deterministic, LLM-free extractive script: hook from the title (≤ 10 words) + 3 beats picked from the story text,
  70–90 words, no URLs/emoji/code, `"auto": true`. Stories without enough clean text get no video.
- **Media push:** `host_jsdelivr.py` clones/pushes `git@github.com:ar4ft/dashboard-videos.git` (env `VIDEOS_REMOTE`)
  with an SSH deploy key (write access to that repo only) from the secret `VIDEOS_DEPLOY_KEY`; the github.com host key is
  checked against GitHub's published fingerprint. On the box it still uses `https://github.com/…` + `gh`.
- **Redeploy:** pushes made with `GITHUB_TOKEN` never trigger workflows, so `deploy.yml` also runs on
  `workflow_run: ["Video News"] completed` (only when it succeeded) and deploys `main`.
- **Loop protection:** the bot's commits cannot trigger `push` workflows, and the job also skips when the actor is
  `github-actions[bot]`.
- **Social 1080p copies are not made in CI** (720p is rendered directly). Make them locally with `--social-dir` if ever
  needed; never post them.
- **TTS:** edge-tts (Ava) works from GitHub-hosted runners (verified 2026-11-20).

## Manual invocation (box, if Actions is unavailable)

```sh
cd /workspace/dashboard/repo && PY=/workspace/video-venv/bin/python
IDS=$($PY video/pick_ids.py --days 3 --max 20)
$PY -W ignore video/make.py --ids $IDS --ingest-only --work /workspace/video-work < /dev/null
$PY video/autoscript.py --ids $IDS --work /workspace/video-work --scripts video/scripts   # or write scripts by hand
$PY -W ignore video/make.py --ids $IDS --scripts video/scripts --work /workspace/video-work \
    --social-dir /workspace/video-social/$(date +%F) --host jsdelivr --retain-days 60 --sync-pins \
    --story-timeout 300 < /dev/null
git add public/videos.json public/media/videos video/scripts && git commit -m "Video News: …" && git pull --rebase && git push
```

- Budget: ingest ~5 s/story; render + upload + warm ~50–75 s/story. For 12–15 new stories allow **30 minutes** for
  the whole video step (about 15–20 min of rendering plus script writing). Stories without a script get an automatic
  extractive script, so write scripts first.
- `--latest N` instead of `--ids` picks the N newest news items without a video.

- Pass all IDs to one invocation. Each story is rendered in its own try/except with one retry, and `public/videos.json`
  is saved after every successful video, so one failure never loses earlier renders. Failures are listed at the end
  (`failed (n): …`) and leave no half-written media.
- `--story-timeout` (default 300 s) caps each story attempt; a timed-out render kills its ffmpeg encoder and is
  retried once, then skipped. Typical render is ~45–70 s per story (1080p + 720p copy).
- TTS (edge-tts) has a per-voice timeout (`VIDEO_TTS_TIMEOUT`, default 60 s) and one retry per segment.
- `make.py` detaches its children from stdin (and `--sync-pins` calls `gh` with `stdin=DEVNULL`), so it is safe inside
  `while read …` loops; `< /dev/null` is still recommended.
