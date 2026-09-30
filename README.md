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

## Edit your content

All starter content lives in `src/data/dashboard.json`. The starter links and events are explicitly samples, not fetched feeds.

- `name`: workspace name.
- `news`: title, description, source, category, URL, and label. Source subsections: Hacker News, Twitter / X, Reading.
- `ideas`: title, description, category, next step, and stage. Stage subsections: Explore, Build, Later.
- `todos`: stable unique ID, title, group, and default completion. Group subsections: Today, Upcoming, Someday.
- `events`: stable unique ID, title, `YYYY-MM-DD` date, `HH:MM` time, calendar label, and description. Dates and times are displayed as entered, with no timezone conversion.

The overview links into each section. Every subsection has its own static URL. To add new subsections, edit `src/lib/model.mjs` and add matching content values. News links open in a new tab. The calendar supports month navigation and date-specific agendas.

Task completion is stored in the browser's localStorage, keyed by task ID. It persists across reloads on the same origin/browser and does not sync to GitHub or other devices. Changing a task's ID gives it a fresh completion state. To reset completion, remove the `personal-dashboard:tasks:v1` localStorage entry. Task text, ideas, and events are edited through Git, not in the website.

## Future integrations

GitHub Pages runs static files and browser JavaScript; it cannot run a private backend. Hacker News can be fetched through its public API; RSS sources can be collected during a scheduled GitHub Actions build. Twitter / X requires a supported authenticated API or curated links. Use Actions secrets for build-time credentials and publish only intended public output. For private calendar data, use an authenticated service rather than committing event details to this site.

There are no API credentials or remote feed dependencies in this starter. Fonts use Google Fonts with system fallbacks. Layout and colors live in `src/styles/global.css`.
