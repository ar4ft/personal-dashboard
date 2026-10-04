# Design review

Following [fortvna/app-designer](https://github.com/fortvna/app-designer) at `bd00d7273dbec878950f979f78b12f5166e29008`. One independent critic reviewed both rounds, opening the production renders, before frames and icon. The owner chose Bright and tactile; existing content and features were the keep contract.

| Rubric | Round 1 | Round 2 | Final visible evidence |
|---|---:|---:|---|
| Concept on the pixel | 4 | 4 | Taped cards, source clipping, stacked Home sheets and matching icon communicate collecting. |
| Not the category average | 4 | 4 | Teal colour fields and irregular display lettering distinguish the dashboard. |
| Not this skill's average | 4 | 4 | Colour and material govern navigation and utility controls as well as content. |
| Hierarchy | 3 | 4 | News leads into a story after compact search and management controls. |
| Typography | 4 | 4 | Expressive headings pair with readable body text; Home's smaller heading restores balance. |
| Colour | 4 | 4 | Light/dark screens maintain surface, ink, selection and tape roles. |
| Richness | 4 | 4 | Media, paper, tape, overlapping sheets and the icon share one material vocabulary. |
| Rhythm and space | 3 | 3 | Dense calendars and multiple toolbar rows still constrain phone space. |
| Craft details | 3 | 4 | Calendar tab/selection remain visible; tracking feedback clears the controls. |
| Native fluency | 4 | 4 | Bottom navigation, disclosure, detail sheet, appearance controls and reader suit a phone PWA. |
| Signature | 3 | 4 | The taped confirmation accompanies the story's changed board destination. |
| The feature test | 3 | 3 | Home/tracking are memorable; sample covers and utility chrome limit the design's distinction. |
| Fidelity (additional) | 4 | 4 | All destinations and kept features remain available; functional claims are separately tested. |

## Round 1 — not done

The critic found a coherent improvement over the pale/pastel dashboard, but phone controls competed with content. Five asks:

1. Keep Add item at 44px; put editing/backups under Manage beside the item count.
2. Reveal the selected Calendar subsection and inset the grid by 8px.
3. Move the confirmation above media, away from Read story, source and board controls; make it taped paper.
4. Reduce phone Home title to 40px and shorten the illustration/intro.
5. Carry material into the resting swipe screen with a clipped source label and remove the ornamental initials avatar.

All five were implemented. No asks were declined. First-story position is approximately 328px on a 390px phone. Dark input placeholders, reading links and calendar controls also gained proper contrast; an obsolete 10px phone action rule was corrected. Manual/system theme behavior and reachable phone administrative actions have regression checks.

## Round 2 — done

The same critic confirmed all five asks landed. **10 of 12 rubric lines score 4, none below 3.** Fidelity scores 4 separately. The overlapping-paper app icon was judged recognizable at small sizes. No additional concrete visual defects were named; no further design round was requested.

Latest local full-resolution frames: `shots/r2/`; retained flow: [final-sheet.png](final-sheet.png). Exploration: [concepts.png](concepts.png). [Before/after](before-after.html) pairs the actual original and redesigned Home/News pages.

## Scan and warnings

The three-direction kit scan and the final production DOM/pixel scan have **zero FAILs**. [scan.json](scan.json) records four actual routes at 402×874 and 375×667, each in light and dark. Upstream scan annotations identify real scroll surfaces and floating navigation; the only code adaptation adds parsing for modern computed CSS `color(srgb …)` colors. A separate browser suite checks 320px widths, 200% text and 44px touch targets.

Every warning is addressed:

- **Overview has nine type sizes:** deliberately retained for display, section heading, destination heading, navigation, body and metadata roles across its mixed overview. This is a compact deviation from the suggested 5–7 steps; the critic scored Typography 4 in both rounds.
- **Six to nine left edges:** the detector counts aligned columns in navigation, summary rows, reading numbers and the seven-column calendar. Those are intentional grids rather than accidental offsets.
- **Calendar's largest text is 22px:** the month and date grid are the focal point. A larger decorative title would reduce usable calendar space. Its content density is deliberate.
- **Exploration native fonts unavailable:** Apple font URLs cannot resolve on Linux. Explorations used verified fallbacks; production renders use bundled Bricolage and system UI fonts.
- **Exploration has ten combined sizes:** it compares three deliberately different concepts rather than one production type scale.

## Validation and limits

Astro check: zero errors/warnings/hints. Unit tests: 17 passed. Six browser suites passed: workspace, board input, phone, PWA, accessibility, appearance. Build generates 14 static pages and precaches 36 local assets, including the bundled font. Content/feed/backups retain their existing schema and stable IDs.

Actual Chromium production renders were inspected at phone, small-phone and desktop sizes, with a dark core screen and appearance sheet. This is a web PWA. Physical-device feel, VoiceOver, iOS simulator fonts and Safari-specific installation gestures were not verified. Optional haptics are unavailable on Safari. No name, tab structure, feature removal or other owner decision remains pending.
