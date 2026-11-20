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
