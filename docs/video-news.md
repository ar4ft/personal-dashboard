# Video News manifest

`public/videos.json` lists the vertical videos shown on the **Video news** page. It is separate from the v1
`feed.json` contract, so feed validators, backups and browser storage are unchanged. Schema: `public/videos.schema.json`.

```json
{
  "version": 1,
  "videos": [
    {
      "id": "video:hn-50572503",
      "itemId": "hn:50572503",
      "title": "Frostbite: a CPU architecture discovered, designed and verified end-to-end by AI",
      "source": "Hacker News",
      "topics": ["AI", "Technology"],
      "url": "https://architectlabs.com/blog/frostbite",
      "src": "media/videos/hn-50572503.mp4",
      "poster": "media/videos/hn-50572503.jpg",
      "captions": "media/videos/hn-50572503.vtt",
      "duration": 37.5,
      "transcript": "Narration text…",
      "createdAt": "2026-11-20T18:20:00Z"
    }
  ]
}
```

- `id` is `video:` plus a lowercase slug; `src` must be an `.mp4` dashboard path or an `https://` URL.
- Keep each MP4 under 6 MB (H.264 + AAC, `+faststart`). `npm test` checks files exist and sizes.
- Video media under `media/videos/` is not precached by the service worker; `videos.json` is network-first.
- Generate entries with `video/make.py` (see `video/README.md`).
