# Personal dashboard

An Astro static dashboard for news, project ideas, todos, and calendars. Designed for GitHub Pages: commit content or code to `main` and GitHub Actions builds and deploys the site.

## Run locally

Requires Node.js 22.12+ (the deployment workflow uses Node.js 24).

```sh
npm ci
npm run dev
```

Open the URL shown by Astro, including `/personal-dashboard-/` (normally `http://localhost:4321/personal-dashboard-/`).

```sh
npm run check
npm test
npm run build
npm run preview
```

## Publish on GitHub Pages

Create an **empty public** GitHub repository named `personal-dashboard-` under your account. From this directory:

```sh
git remote add origin https://github.com/YOUR_USERNAME/personal-dashboard-.git
git push -u origin main
```

In **Settings → Pages → Build and deployment**, select **GitHub Actions**. If the first run happened before Pages was enabled, rerun **Deploy dashboard to GitHub Pages** in Actions. The workflow also validates pull requests without deploying them.

The workflow automatically derives the owner and repository base path from `GITHUB_REPOSITORY`. The intended URL is `https://YOUR_USERNAME.github.io/personal-dashboard-/`. For local development with a different owner/repo, set `GITHUB_REPOSITORY` for the command, e.g. `GITHUB_REPOSITORY=YOUR_USERNAME/personal-dashboard- npm run dev`.

Private repository Pages publishing requires an eligible GitHub plan. Repository privacy does **not** generally make the published website private; treat committed dashboard content as public. Do not put private calendar information or tokens in the content file. This project has no authentication layer.

## Use your workspace

Each main section has **Feed**, **Timeline**, and **Kanban** views. Planning also has a calendar. Views share the same items, favorites, notes, and board positions.

- Drag a board card into another column or onto a card to reorder it. The column menu on each card also works with touch and keyboard.
- Use **Edit columns** to add, rename, reorder, or remove columns. Removing a column retains its cards in the first remaining column. Planning's Done column is retained for task completion.
- Open any item for details, full text or notes, source link, favorite, edit, and delete. Previous/Next and arrow keys browse the current filtered list. Details have shareable `?item=ID` links for repository/feed items. Browser-only items need a backup on the receiving device.
- Use **Add item** and **Edit** to change titles, topics, summaries, content, source links, board status, idea next steps, and task/event dates. Planning's Done lane marks tasks complete; moving out marks them incomplete.
- Search includes titles, summaries, full text, topics, source, and next steps. Combine search with a topic, source/stage subsection, and Favorites.
- **Group by Topic** groups feeds, timelines, and boards. Items with multiple topics appear in each group.
- Feed lists paginate in batches of 30. **Swipe cards** switches to a horizontal snap feed with Previous/Next and keyboard arrow controls. Swipe on touch devices or scroll horizontally.
- Calendar entries come from the same editable planning items, including tasks with due dates.

Your edits save in this browser's localStorage under `personal-dashboard:workspace:v1`. Separate tabs share updates. This is a static public site: changes are personal to the current browser, do not commit to GitHub, and do not automatically sync across devices. **Feeds & backup → Export workspace** saves all local items, favorites, columns, notes, ordering, feed cache, and source settings. Restore that backup on another device; a recovery backup downloads before replacement. If storage is unavailable, keep the tab open and export before leaving.

The existing v1 task checkmarks are migrated on the first visit to an interactive section.

Starter content remains in `src/data/dashboard.json`. News links and dated events are examples. News details show the full plain text supplied by a feed or your notes; the dashboard does not scrape linked websites. If no full text is supplied, open the original source.

## Feed your dashboard automatically

Commit a versioned JSON feed to **`public/feed.json`**. GitHub Actions validates the file, rebuilds, and deploys it on each push. The app reads the deployed JSON on load and every five minutes while visible, with a manual **Refresh now** button.

Alternatively enter a public JSON feed URL in **Feeds & backup**. The endpoint must permit browser access using CORS, and it must be HTTPS when served from GitHub Pages. No private API credential is stored or sent by this app.

Feed items are merged by stable ID. Repeated ingestion updates source fields while retaining favorites, board positions, and individually edited fields. Old items stay in the browser cache for tracking even when absent from a newer feed; delete an item to hide it in your workspace. Use globally unique IDs (for example `hn:123456` or `x:987654`) and keep IDs unchanged between updates. Import feed JSON is additive; Restore backup replaces local state.

See [the feed format](docs/feed-format.md) for all fields and a three-section example. The JSON Schema is at [public/feed.schema.json](public/feed.schema.json).

## Future integrations

GitHub Pages runs static files and browser JavaScript; it cannot run a private backend. Hacker News can be fetched through its public API; RSS sources can be collected during a scheduled GitHub Actions build. Twitter / X requires a supported authenticated API or curated links. Use Actions secrets for build-time credentials and publish only intended public output. For private calendar data, use an authenticated service rather than committing event details to this site.

There are no API credentials or remote feed dependencies in this starter. Fonts use Google Fonts with system fallbacks. Layout and colors live in `src/styles/global.css`.

## Browser interaction checks

The committed browser test covers all three sections, native drag/drop, reorder persistence, editing, favorites, search/topics, feed updates, backup restore, calendar creation, overview consistency, details, and mobile layout. Run the preview in one terminal, then run the browser suite in another:

```sh
npm exec playwright install chromium
npm run build
npm run preview -- --port 4322
# in another terminal:
npm run test:browser
```

Set `DASHBOARD_BROWSER_EXECUTABLE=/path/to/chromium` to use an installed Chromium. Set `DASHBOARD_TEST_URL` for a different preview URL. The test starts with a fresh browser profile, uses sample imports, and only changes browser-local state. Screenshots are written to `test-output/`.
