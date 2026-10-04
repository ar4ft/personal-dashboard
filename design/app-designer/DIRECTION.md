# Personal dashboard · App Designer

Source: https://github.com/fortvna/app-designer

## Brief

A personal Astro PWA on GitHub Pages for reading news, collecting project ideas, and planning tasks/calendar events. Core action: inspect a story, save it, and move it to a topic/board for following. Existing owner request favors a social feed with images and a phone swipe reader. Redesign the existing app; preserve its content and features. No paid image generation. Owner selected **Bright and tactile**.

## Current app

Existing direction: object / light / grotesque / green / shape. Green-on-pale neutral canvas, rounded containers, three pastel category tiles, repeated inspirational eyebrow copy, and extensive toolbar chrome before the first story. Positive: readable type, local persistence, consistent icons, real supplied sample covers, accessible pointer/keyboard/touch boards.

Keep: all four destinations and subsection routes; feed/timeline/swipe/board/calendar views; news detail/source links; editable items and columns; topics/groups/search/favorites; feed import/automation; backups and local persistence; 44px controls; reduced motion; install/offline/update PWA.
Lose: inspirational overview hero, pastel category confetti, stacked desktop card borders/shadows, redundant prose in section headers, ornamental avatars without identity information.
Resolved: follow the device appearance by default; allow a manual preference under App. No name/tab/metric/features will be changed.

## Three directions

1. **Personal dashboard is a personal edition.** Printed/light/serif/blue/illustration. Newsreader display type, pale ink-blue ground, content imagery and an editorial feature story. Blue means action/selection. Uses supplied covers, clearly identified as samples.
2. **Personal dashboard is an observatory.** Place/dark/mono/orange/colour-material. Deep steel, amber source signals, precise headline type. It foregrounds monitoring more than reading.
3. **Personal dashboard is a clipping board.** Object/colour-field/expanded/teal/shape. Saturated teal, heavy grotesque, tactile pinned clippings. It foregrounds collecting, but its physical metaphor would compete with dense calendars and actual Kanban.

The first candidate differs from the old look in source, type, hue and richness. All three are rendered before selection.

## Rendering scope

Skill shoot.mjs runs with Chromium on Linux. It renders the supplied device kit, but Apple SF/New York fonts and native Liquid Glass/haptics are not available here. The production app uses real web controls, a bundled OFL font, and platform system fonts; it is a PWA rather than a SwiftUI build. No artificial OS chrome will be added to production.

## Selected direction

The clipping board won by the owner’s choice. Personal edition is strong for long-form reading, but quieter than the requested feel. Observatory is strong for monitoring, but its low-light precision conflicts with bright/tactile. The winner differs from the old direction in ground (colour-field), type (expanded display), and hue (teal).

The category default being replaced is the pale dashboard with pastel category tiles and an inspirational hero. Here content is something to keep: the canvas reads as a board, the sheets have small offset depth and tape, and actual media does the storytelling. These containers are movable clippings rather than boxes around every label. Glass stays on the phone navigation; content stays opaque.

## Tokens

Ground #126773 / dark #102c32; paper #fbfcf5 / dark #203f45; ink #153e45 / dark #f1f8ef; secondary #496168 / dark #c3d3d1; rule #c6d6d1 / dark #507278; action ink #105969 / dark #b8e4df. Teal is the colour-field ground; ink/selection shares the same hue. No hue-coded category tiles.

Display: bundled OFL Bricolage Grotesque (the sturdy, irregular shapes make headings feel like a cut-out label), weight 700/800. UI/body: platform system font, regular/600. Sizes: 12, 13, 15, 16/17 reading, 28/32 item headings, 38/56 display; rem sizing preserves browser text preferences. Side margin 16 on phones, 44 desktop. Corners: 10 controls, 14/16 paper, 24 sheets, capsule navigation. Spacing 4/8/12/16/24/32.

## Signature storyboard

Read → keep → follow. In the swipe reader, Track clips the current story onto the Following board. Frame 1 (0ms): story is active. Frame 2 (0–220ms): pale “Clipped to Following” label lands 8px up with a slight rotation, with a 12ms vibration only where the browser supports it. Frame 3 (220–2200ms): label rests, board choice updates, accessible status announces the destination. Frame 4: label disappears. Reduced Motion: immediate stable label, no motion/vibration; persistence is unchanged. Haptics are optional on the web and not available on iOS Safari.

## Content

Production content remains the exact current seed data and imported feed items. `CONTENT.json` records the sample data used for renders. Destinations remain Home, News, Ideas, Plan. Section titles remain News & reading, Project ideas, Todos & calendar. All view/settings/form labels are retained. New home title: “Things to keep.”, intro: “Read a story. Save an idea. Make your next move.”. Secondary home headings: Worth a read, On your plan, Ideas to try. Appearance controls: System, Light, Dark. Signature feedback uses the actual column title.

## Kept features

All original destinations/routes, view controls, feeds, item details, editing, favorites, search/topic grouping, pointer/touch/keyboard boards, calendar, local persistence/backups and PWA installation/offline/update behavior are retained. Theme selection is an additive browser preference. Name and destination structure are unchanged; the app glyph is refreshed as overlapping clippings.

## Review result

Two rounds with the same independent critic: round 1 had seven of twelve scores at 4; round 2 has ten at 4, none below 3. All five requested refinements landed; no feature was dropped and no owner decision remains. Full evidence, scan warning responses and validation are in [CRITIQUE.md](CRITIQUE.md). Final flow: [final-sheet.png](final-sheet.png); exploration: [concepts.png](concepts.png); [before/after](before-after.html).

Keep contract checked: [x] destinations/subsections; [x] feed/timeline/swipe; [x] Kanban editing and pointer/touch/keyboard movement; [x] calendar; [x] detail/source views; [x] items/columns; [x] topics/groups/search/favorites; [x] automated feeds/import; [x] backups/local persistence; [x] touch targets/text resizing/reduced motion; [x] PWA install/offline/update. No public feed data or schema changed.
