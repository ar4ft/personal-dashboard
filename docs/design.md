# Design and accessibility

The installed `swiftui-pro` skill is under `.agents/skills/swiftui-pro`, pinned by `skills-lock.json`. Install/update it with:

```sh
npx skills add https://github.com/twostraws/swiftui-agent-skill --skill swiftui-pro --agent codex --yes
```

This repository is an Astro web PWA. The skill's Swift API, Swift concurrency, and native view recommendations apply to a future SwiftUI client. Its design, accessibility, and performance principles informed these web changes:

- Shared palette, fonts, spacing, radii and elevation in `src/styles/tokens.css`; refinements in `polish.css`. Layout loads styles in one explicit order, including workspace styles before mobile overrides.
- System UI fonts and bundled OFL Bricolage Grotesque headings render in the installed app and offline without requesting a third-party font service. Text uses `rem` and flexible layouts so browser text-size preferences are respected.
- Secondary text has stronger contrast. Controls use at least 44px touch targets; narrow calendars span the available phone width. Selected navigation has an outline/stroke or underline as well as color. More Contrast and forced-colors preferences have explicit styles.
- `src/lib/focus.ts` retains a control's identity through card/detail rerenders. Loading another batch moves keyboard focus to the first new item; clearing filters returns focus to search. Empty states offer direct actions.
- Reduce Motion disables decorative transitions and makes sideways/vertical reading navigation immediate. Native buttons, labeled controls and modal dialogs remain the interaction primitives.
- Feeds/timelines continue rendering 30 items per batch; the swipe reader renders 20. Search and detail navigation still operate on the complete dataset. Images remain lazy-loaded and cards reserve their media space.

`tests/accessibility.browser.cjs` checks representative WCAG AA text contrast, phone touch targets, 200% root text sizing, keyboard focus continuity, empty-search recovery, reduced-motion scrolling, and searching/loading beyond the initial batch. Run it through `npm run test:browser`. These automated checks complement visual inspection; they do not replace testing with VoiceOver or a physical phone.

## Clipping-board redesign

The owner selected **Bright and tactile**. The [app-designer workflow](https://github.com/fortvna/app-designer), pinned for this review to `bd00d7273dbec878950f979f78b12f5166e29008`, informed the redesign. Its three concept renders, brief, selected direction, keep list, scan and scored critique are in `design/app-designer/`. The upstream skill is inspected separately rather than vendored.

Teal is the canvas; pale opaque paper carries content; Bricolage gives story headings a sturdy, irregular shape. Tape and small offset shadows express keeping a clipping. The swipe reader carries the source on a clipped label. Tracking a story gives a brief taped confirmation above the image, with its actual column title; existing status text announces the saved state. Reduced Motion skips animation/vibration. Supporting browsers may provide a short vibration; Safari does not.

`src/scripts/appearance.ts` follows the system or saves a manual light/dark preference under a separate browser-local key. The initial theme applies before paint; colors and browser chrome follow the selected theme. This preference does not change the workspace/feed schema. Existing backups remain compatible.

On phones, Add item and Manage share the item-count row. Manage exposes Edit columns and Feeds & backup. Desktop keeps these administrative actions directly visible. Subsection tabs scroll horizontally and reveal the active route without moving the document. All previous views, editing, feed ingestion, grouping, search, favorites, boards, calendars and PWA flows remain available.

### Review artifacts

Build the app and start `npm run preview -- --host 0.0.0.0 --port 4322`, then:

```sh
node scripts/design-review.cjs
# Loads the kit's DOM/pixel scan from a separately cloned skill:
APP_DESIGNER_ROOT=/path/to/app-designer/app-designer node scripts/design-scan.cjs
```

`DESIGN_REVIEW_OUT` and `DESIGN_SCAN_OUT` choose output paths. `DASHBOARD_TEST_URL` supports another preview. Raw 3× production screenshots are local review output; compact final sheets are retained in the repository. The scan uses actual rendered web pages at 402×874 and 375×667 in light and dark, with the kit's clipping/collision/typography/contrast rules. Its color parser is extended to support computed CSS `color(srgb …)` values from `color-mix()`. Actual scrolling surfaces and floating navigation are annotated for the scan; intentional scroll overflow is allowed. No failed check is suppressed.

The kit's exploratory device mockups use Linux Chromium fallback fonts because Apple SF/New York files are unavailable. Managed Chromium blocks `file://` navigation, so the exploration used a loopback HTTP server instead. Production renders use the actual bundled font and no simulated OS chrome. This is an Astro PWA; iOS simulator rendering, physical device feel, VoiceOver and Safari-specific installation gestures were not verified here.

The browser suite includes `tests/appearance.browser.cjs` for system/manual theme selection, persistence across routes, phone management, active-tab visibility and clipping feedback that does not cover reader actions. The existing suites cover content, drag/drop with touch and keyboard, feed/backup merging, small-phone layouts, text resizing, contrast, reduced motion and PWA installation/update/offline behavior.
