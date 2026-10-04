# Design and accessibility

The installed `swiftui-pro` skill is under `.agents/skills/swiftui-pro`, pinned by `skills-lock.json`. Install/update it with:

```sh
npx skills add https://github.com/twostraws/swiftui-agent-skill --skill swiftui-pro --agent codex --yes
```

This repository is an Astro web PWA. The skill's Swift API, Swift concurrency, and native view recommendations apply to a future SwiftUI client. Its design, accessibility, and performance principles informed these web changes:

- Shared palette, fonts, spacing, radii and elevation in `src/styles/tokens.css`; refinements in `polish.css`. Layout loads styles in one explicit order, including workspace styles before mobile overrides.
- System fonts render consistently in the installed app and offline without fetching third-party font files. Text uses `rem` and flexible layouts so browser text-size preferences are respected.
- Secondary text has stronger contrast. Controls use at least 44px touch targets; narrow calendars span the available phone width. Selected navigation has an outline/stroke or underline as well as color. More Contrast and forced-colors preferences have explicit styles.
- `src/lib/focus.ts` retains a control's identity through card/detail rerenders. Loading another batch moves keyboard focus to the first new item; clearing filters returns focus to search. Empty states offer direct actions.
- Reduce Motion disables decorative transitions and makes sideways/vertical reading navigation immediate. Native buttons, labeled controls and modal dialogs remain the interaction primitives.
- Feeds/timelines continue rendering 30 items per batch; the swipe reader renders 20. Search and detail navigation still operate on the complete dataset. Images remain lazy-loaded and cards reserve their media space.

`tests/accessibility.browser.cjs` checks representative WCAG AA text contrast, phone touch targets, 200% root text sizing, keyboard focus continuity, empty-search recovery, reduced-motion scrolling, and searching/loading beyond the initial batch. Run it through `npm run test:browser`. These automated checks complement visual inspection; they do not replace testing with VoiceOver or a physical phone.
