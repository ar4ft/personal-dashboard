# Dashboard feed format

Your automation should write `public/feed.json` and commit it to `main`, or serve the same format from an HTTPS endpoint that allows CORS. A repository commit triggers validation and deployment. The browser refreshes feeds on load and every five minutes while visible. Data stays cached if a fetch fails.

```json
{
  "version": 1,
  "items": [
    {
      "id": "hn:123456",
      "section": "news",
      "type": "news",
      "title": "Example story from your automation",
      "description": "A short summary for the feed card.",
      "content": "The full article text, if your source provides it.\n\nNew paragraphs are preserved. Otherwise use this field for notes.",
      "topics": ["Technology", "AI"],
      "source": "Hacker News",
      "author": "Example author",
      "image": "media/story.jpg",
      "imageAlt": "Description of the story’s cover image",
      "url": "https://news.ycombinator.com/item?id=123456",
      "createdAt": "2026-09-30T10:30:00Z",
      "updatedAt": "2026-09-30T11:00:00Z",
      "status": "inbox"
    },
    {
      "id": "ideas:daily-digest",
      "section": "ideas",
      "type": "idea",
      "title": "Build a daily digest",
      "topics": ["Automation"],
      "description": "An idea created by my automation.",
      "nextStep": "Pick three feeds.",
      "status": "explore",
      "createdAt": "2026-09-30T09:00:00Z"
    },
    {
      "id": "calendar:focus-2026-10-05",
      "section": "planning",
      "type": "event",
      "title": "Focus time",
      "topics": ["Projects"],
      "date": "2026-10-05",
      "time": "10:00",
      "status": "todo",
      "createdAt": "2026-09-30T09:00:00Z"
    }
  ]
}
```

Required root fields: `version: 1` and `items` array. Each item requires a globally unique stable `id`, `section`, and nonempty `title`. Up to 10,000 items and a 10 MB JSON file are supported.

| Field | Format / behavior |
| --- | --- |
| `section` | `news`, `ideas`, or `planning` |
| `type` | `news` for news, `idea` for ideas, `task` or `event` for planning. Defaults to the section's first type. |
| `id` | Stable string, at most 200 characters; use source prefixes. IDs `__proto__`, `constructor`, and `prototype` are reserved. Do not reuse an ID for a different item or section. |
| `title` | Nonempty string, at most 500 characters |
| `description` | Short summary shown on the card |
| `content` | Full plain text or notes, shown in the detail view. HTML is displayed as text. |
| `topics` | Array of topic strings, each at most 80 characters. Defaults to `General`. |
| `author` | Author or account name shown above the post |
| `image` | Optional HTTPS image URL or dashboard-relative path such as `media/story.jpg` (stored at `public/media/story.jpg`). Missing/broken images use an honest cover fallback. |
| `imageAlt` | Useful image description for screen readers |
| `source` | Source name. Use `Hacker News`, `Twitter / X`, or `Reading` to match the starter source subsections; other sources appear under All. |
| `url` | Optional HTTP(S) link to the original. No credential or script URLs. |
| `createdAt` | ISO publication/creation timestamp. Feed sorts newest first. Omit only when unknown (defaults to epoch, placing the item last). |
| `updatedAt` | ISO update timestamp, defaults to `createdAt` |
| `status` | Board column ID. News: `inbox`, `following`, `read`, `archived`. Ideas: `explore`, `build`, `later`, `shipped`. Planning: `todo`, `doing`, `done`. Unknown columns fall back to the first lane. |
| `nextStep` | Optional next step for an idea |
| `group` | Optional task group: `Today`, `Upcoming`, `Someday`; used by planning subsections |
| `date` | Valid `YYYY-MM-DD`. Required for calendar events, optional due date for tasks. Timeline uses this date when present. |
| `time` | Optional 24-hour `HH:MM`. Dates and times are displayed as entered, without timezone conversion. |
| `done` | Optional boolean for tasks. The Done lane also marks tasks complete. |

Automation only updates source content; the browser holds a separate layer for personal tracking. Moving a card or editing one field does not prevent unedited fields from receiving updates. Favorites, notes, hidden/deleted items, and customized column layouts survive new feed batches. Empty batches do not clear history.

News source URLs must be unique across all news sources and board columns, including Reading. Comparison ignores fragments, one trailing slash, query ordering, UTM parameters and fbclid/gclid/dclid/msclkid tracking parameters. Hosts/default ports are normalized; path case, scheme and meaningful query values (such as article IDs) remain distinct. Original source URLs are retained for opening/sharing. Items without a URL are allowed. Duplicate URLs inside a feed are rejected before mutation; a URL already present in starter/browser content is skipped during ingestion, retaining the existing ID, favorites, notes and board position. Same-ID updates remain supported unless their effective URL would collide with another item. Deleted cached items also reserve their links so a changed producer ID cannot resurrect them. Existing backups with older duplicates remain readable and are not destructively cleaned up.

Repository feeds are validated by `npm test` and in GitHub Actions. Browser imports and remote feeds are validated before mutation. Invalid feeds leave the existing workspace intact and display an error in Feeds & backup. Local IDs created by the app begin with `<section>:local:`; do not use that prefix in automated feeds.

The current site is public. Only publish content you intend to expose in your repository/feed. The app fetches public JSON with credentials omitted; it does not connect directly to Twitter/X or private calendars. Your producer handles those sources and their credentials outside the published dashboard.

For agent publishing instructions and authorization rules, read [llms.txt](../public/llms.txt) and [AGENTS.md](../AGENTS.md). Public access does not grant write permission.
