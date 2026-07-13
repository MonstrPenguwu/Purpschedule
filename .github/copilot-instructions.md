# Stream Schedule Builder — Copilot Instructions

## Project Overview
A **client-side-only, no-build-step** web app that lets streamers design a weekly stream schedule graphic and export it as a PNG or JPEG image. Everything runs in the browser; there is no server, no framework, and no package.json.

## File Structure
```
app.js                  — All application logic (single file, ~850 lines)
index.html              — Single-page UI shell; injects all controls & canvas
style.css               — Full dark-themed stylesheet; CSS variables in :root
vendor/
  interact.min.js       — Drag-and-drop library (interact.js)
  html2canvas.min.js    — DOM-to-canvas export library
start.bat               — Dev launcher: `npx serve -p 5173 -s .`
.github/
  copilot-instructions.md — This file
```

## Running the App
```bat
start.bat       ← double-click, or run in terminal
```
Serves on **http://localhost:5173** via `npx serve`. Also accessible on the local network (shown in terminal output) — useful for mobile testing. No install step required.

## Architecture

### State
A single global `state` object holds everything:
- `state.background` — image (base64), brightness, overlayColor/opacity, posX/posY, **scale**
- `state.canvasPreset` — one of `'16:9' | '16:9-720' | '1:1' | '9:16'`
- `state.exportFilename` — download/webhook filename base (sanitized at use time, not at rest)
- `state.discordWebhook` — Discord webhook URL; **localStorage-only**, never written to the shareable config JSON (see Persistence)
- `state.mainTimezone` — IANA timezone string
- `state.additionalTimezones` — array of IANA strings for auto-converted times
- `state.days` — object keyed by `DAY_KEYS` (`monday`–`sunday`), each with:
  - `enabled`, `noStream`, `title`, `hour`, `minute`, `period`
  - `position: { x, y }` — percentage-based position on canvas
  - `style` — per-box style object (colors, fonts, sizes, border, dimensions)

### Per-box Style Object (`DEFAULT_STYLE`)
| Key | Default | Description |
|-----|---------|-------------|
| `bgColor` | `#1a1a2e` | Box background color |
| `bgOpacity` | 85 | 0–100% |
| `borderColor` | `#9146ff` | |
| `borderWidth` | 2 | px |
| `borderRadius` | 10 | px |
| `fontFamily` | `Inter` | One of 12 Google Fonts options |
| `fontColor` | `#ffffff` | |
| `accentColor` | `#9146ff` | Used for the time display |
| `dayFontSize` | 7 | px — tuned for a mobile-width landscape canvas, this app's primary use case (see Orientation Layouts) |
| `timeFontSize` | 9 | px |
| `titleFontSize` | 7 | px |
| `tzFontSize` | 6 | px |
| `width` | 14 | % of canvas width — *fixed*; wider content clips (`overflow:hidden`) rather than growing the box |
| `height` | 26 | % of canvas height — *fixed*; taller content clips (`overflow:hidden`) rather than growing the box |

### Canvas & Rendering
- The canvas (`#schedule-canvas`) is a CSS percentage-positioned container inside `#schedule-wrapper`, which enforces the correct aspect ratio.
- Day boxes (`.day-box`) are absolutely positioned using `left`/`top` as percentages.
- `buildBox(dayKey)` → creates DOM node; `applyBoxStyles` + `fillBoxContent` update it.
- `renderBox(dayKey)` — targeted single-box re-render.
- `renderAllBoxes()` — full rebuild, called after preset/timezone changes or "Apply to All".
- **Box sizing**: both width and height are **fixed** at `${s.width}%`/`${s.height}%` (not `auto`/`min-*`), with `.day-box{overflow:hidden}` clipping content that doesn't fit. Both used to be `auto`/grow-to-fit, which let content push a box's actual rendered size past its configured `%` and overlap neighbouring boxes — height could overlap the box below (worst in the portrait single-column layout at a short browser window); width could overlap the box beside it (worst in the landscape row layout on a narrow/mobile screen, where 5 boxes across only get ~50px each). Fixed sizing makes overlap structurally impossible in both dimensions; the tradeoff is that oversized content clips instead of growing the box. Since boxes are resizable by hand (see Drag & Drop → resizing), a user hitting clipping has a direct way to fix that one box.
- **`text-overflow: ellipsis` does not reliably work on `.box-day-name`/`.box-time-main`/`.box-tz-label`/`.box-title`/`.box-additional-times span`, and two attempts to add it were tried and reverted — don't try a third without reading this first.** These are all children of `.box-inner`, a `flex-direction: column` container with `align-items: center` (cross-axis size = content-based, not stretched):
  - `max-width: 100%` (a percentage) triggers ellipsis **even when the content demonstrably fits with room to spare** — confirmed by comparing rendered output with/without it at the same font size; the "clipped" version showed less text while `scrollWidth`/`clientWidth` claimed no overflow. A real false positive, not a rounding artifact.
  - `min-width: 0` (the standard flexbox fix for a *different*, more common version of this problem) avoids that false positive, but then **fails to engage ellipsis at all for content that genuinely doesn't fit** — the element just renders at its full natural width and gets symmetrically center-cropped by the ancestor `.day-box{overflow:hidden}` (since `align-items: center` centers it), producing a confusing mid-string fragment with no "…" instead of a clean truncation.
  - Neither combination was found that gets *both* right in this specific column-flex/`align-items:center` setup. Given that, these elements intentionally carry no overflow properties at all (just `white-space: nowrap`) and rely purely on `.day-box{overflow:hidden}` as a blunt safety net — good enough to guarantee a box can never overlap its neighbours, not pretty for the rare case of genuinely-too-long content. If you want to revisit this, the promising unexplored direction is constraining `.box-inner` itself (e.g. an explicit `width` instead of relying on default block sizing) rather than the individual text children.
- `.box-additional-times` (the auto-converted-timezone lines under the main time) is `flex-direction: row; flex-wrap: wrap` rather than stacking one per line — each `state.additionalTimezones` entry adds height only when it doesn't fit on the current row, not unconditionally, which is what keeps several added timezones from single-handedly pushing a box's content past its fixed height. `additionalTimezones` is global (applies to every day equally), so this matters more the more zones someone adds.
- `.box-inner` padding is `6px` (was `8px 10px`) — deliberately tight, since it's a fixed px cost that eats a much bigger share of a mobile-landscape box (~50px wide) than a desktop one.

### Drag & Drop / Resize
- Uses **interact.js** (v1.10.27, vendored). `dragConfig()` (reposition) and `resizeConfig()` (resize) are applied via `interact(box).draggable(...)`/`.resizable(...)` in `initDragging()` (full rebuild) and inline in `renderBox()`'s new-box branch.
- During `drag end`, `snapPosition()` checks all other enabled boxes for alignment snapping (threshold: 5% units).
- Positions/sizes are clamped to stay within `[CANVAS_MARGIN, 100 - CANVAS_MARGIN - boxSize]` (both drag and resize) using the box's **measured** `getBoundingClientRect()` rather than trusting `style.width`/`style.height` directly — harmless now that both are fixed (see Canvas & Rendering), kept as a trivially-correct source of truth rather than assuming the two never diverge.
- **`CANVAS_MARGIN` (3%)**: no box — via drag or resize — can be positioned or sized to touch the canvas edge. Social platforms overlay their own chrome (captions, buttons, safe-zone UI) right at the edges, so content pushed flush against them is likely to end up underneath someone else's UI. `LAYOUTS.portrait`'s positions are tuned to respect this (first row starts at `y:3`, last row's bottom edge lands exactly at `100 - 3 = 97`); landscape/square's positions already had enough natural margin and needed no change. If you ever change `CANVAS_MARGIN`, re-check `LAYOUTS.portrait` — it's the one with the least slack.
- **Resize**: each box gets a `.resize-handle` element (bottom-right corner, only visible via CSS when `.day-box.selected` — which also means it's automatically hidden during export/Discord posts, since `renderScheduleCanvas()` already strips `.selected` before capturing). `resizeConfig()` uses `edges: { right: '.resize-handle', bottom: '.resize-handle' }` so only that corner triggers a resize; `move` converts `ev.deltaRect` (px) to a `%` delta, writes to `state.days[key].style.width/height`, and sets `ev.target.style.width`/`.height` directly (**not** `minWidth`/`minHeight`) to move the box live during the drag. This mistake shipped once already: since `applyBoxStyles` sets a fixed `width`, setting `minWidth` during resize only *appears* to work when growing (min-width overriding a smaller fixed width) but silently fails to shrink (min-width can't force width down below the existing fixed value) — verified by testing both directions, not just one. Also live-syncs the Day tab's `box-width`/`box-height` inputs if that day is currently selected. Works with mouse and touch — interact.js listens via Pointer Events, so touch input arrives as `pointerType:'touch'` (a browser guarantee on real devices; note for testing: CDP's `Input.dispatchTouchEvent` and hand-constructed `TouchEvent`s do **not** reliably trigger it in headless Chromium — synthesize `PointerEvent`s with `pointerType:'touch'` instead if writing an automated test for this).
- **Content-aware resize floor** (`measureNaturalBoxSize(dayKey)`): resizing (drag or the Width/Height number inputs) can't shrink a box smaller than its own current content needs — previously it could, clipping a box down to a single letter, which is much easier to do by accident with an imprecise touch drag than a mouse. Implementation: briefly set the box's `width`/`height` to `'auto'` (letting it shrink-to-fit its content, same mechanism the pre-fixed-size box used), measure `getBoundingClientRect()`, restore the fixed size, and buffer the result — see below. It's a genuine reflow, so `resizeConfig()`'s `start` listener measures it **once per drag gesture** and caches it for every `move` event rather than re-measuring per pointer move. The **"Fit to Content" button** (Day tab, next to the Width/Height fields) runs the same measurement and applies it directly — a one-tap reliable starting size instead of eyeballing a drag, useful on both mobile and desktop.
- **`.box-additional-times` needs special handling in the measurement, or it wildly overestimates.** It's `flex-wrap:wrap` by design (see Canvas & Rendering), but CSS shrink-to-fit's "preferred width" (what `width:'auto'` resolves to) is defined as the width with **no wrapping at all** — as if every extra timezone sat on one unbroken line. With 2-3 added zones that can be 2-3x wider than the box actually needs once wrapping is allowed, which was pinning the floor right up against the max-size cap and made "shrink after growing" look completely broken (see the git history around this comment for the debugging trail — it took a while to isolate). Fix: before measuring, cap `.box-additional-times`'s `max-width` to the box's *current* rendered width (so it wraps the same way it already does), do the `width:'auto'` measurement, then restore. If you touch this function, re-verify with a box that actually has 2+ additional timezones — the bug doesn't show with zero or one.
- **The buffer is a hybrid (`v * 1.1 + 3`), not a flat multiplier.** A pure `×1.3` gave small content (~6%) almost no visible padding (→8%) while blowing up already-large content (~72%, with big custom fonts) to ~94% — right against the max-size cap, which is what actually caused a box to grow-then-get-stuck against its ceiling (not a bug in the clamp logic itself). The additive term (+3 points) matters most for small content; the relative term (×1.1) keeps the buffer from ballooning as content grows. Capped at `100 - 2*CANVAS_MARGIN` either way.
- **`maxSizeAvoidingNeighbors(dayKey)`**: resize also can't grow into an enabled neighbouring box, computed once per gesture the same way `minSize` is (position doesn't change during resize, so this is constant through the gesture). This isn't just cosmetic — an unconstrained resize that grows into a neighbour lets that neighbour (later in DOM order, so painted on top) visually cover this box's own resize handle, making the box **stuck**: no amount of dragging can shrink it back down because there's nothing left to click. Only checks boxes that actually share the other axis (to the right + vertically overlapping, for width; below + horizontally overlapping, for height) — unrelated boxes elsewhere don't constrain it. Genuine content-vs-space conflicts (content's natural minimum exceeds the room before a neighbour) still resolve in favour of not clipping content, which can still produce a rare residual overlap in extreme cases — that's an accepted tradeoff, not a bug to chase further.
- These guardrails (edge margin + content floor) are deliberately *soft*: box **shape** (wide/tall/square) stays fully freeform — nothing enforces or locks an aspect ratio. "Fit to Content" is the closest thing to a content-driven default shape, and it's opt-in, not automatic. If a hard aspect-ratio constraint is ever wanted, that was explicitly discussed and declined in favour of this softer approach — check with the user before adding one.

### Orientation Layouts (`LAYOUTS`, `presetCategory()`, `applyLayoutForCategory()`)
- Box `width`/`height` are percentages of the canvas, but fonts are fixed px — so the same percentage means very different actual room depending on the canvas's on-screen CSS pixel size. `applyCanvasPreset()` sizes portrait canvases by **height** (`calc(100vh - 80px)`) rather than width, so a portrait canvas renders far narrower on screen than landscape/square do — and *any* canvas renders narrow on a phone, landscape/square included (5 boxes across a ~370px mobile screen leaves only ~50px per box). Both width and height are fixed now (see Canvas & Rendering), so a box can never overlap its neighbours regardless of viewport — but fixed-px fonts sized for a wide desktop canvas will still clip badly on a box that small, which is why `DEFAULT_STYLE`'s font sizes (and `LAYOUTS.landscape`/`.square`'s) are now tuned small enough to fit a **mobile-width landscape canvas** — this app's primary use case — rather than a desktop one. They read small on a wide desktop canvas, but that's a deliberate trade in the other direction; per-day font size is still fully user-adjustable via the Day tab sliders or by resizing the box.
- `presetCategory(presetKey)` classifies a preset as `landscape` / `square` / `portrait` (by comparing `w`/`h`). `LAYOUTS[category]` holds a tuned `positions` array (7 `[x,y]` pairs), `width`/`height`, and `dayFontSize`/`timeFontSize`/`titleFontSize`/`tzFontSize` for that orientation. Portrait stacks boxes in a **single column**, sized with enough vertical gap that typical content (a title, one extra timezone) fits without clipping even at a short (~600px-tall) browser window.
- `applyLayoutForCategory(category)` overwrites every day's `position`, `style.width`/`height`, and font sizes — called from `applyCanvasPreset()` only when the category actually **changes** (landscape↔square↔portrait), so switching resolution within the same orientation (e.g. `16:9` → `16:9-720`) never clobbers a user's custom positions. The "Reset Positions" button also goes through this (`applyLayoutForCategory(presetCategory(state.canvasPreset))`) instead of the old hardcoded landscape-only reset.
- `loadFromStorage()` has two one-time migrations, each gated on the relevant fields still exactly matching their *old* hardcoded default (i.e. provably untouched by the user, so safe to swap without clobbering customisation):
  1. If preset is portrait and every day's position still matches the old landscape `DEFAULT_POSITIONS`, apply the portrait layout (fixes configs saved before portrait got its own layout).
  2. If preset is landscape/square and a day's four font-size fields still match the old desktop defaults (`14/26/13/11`), swap in the new mobile-tuned sizes for that day (checked per-day, not all-or-nothing, since font size is customised per-day more often than position is).

### Timezone Conversion
- `tzOffsetMinutes(tz)` — computes UTC offset via `toLocaleString` comparison (cross-browser safe).
- `convertTime(hour12, minute, period, fromTZ, toTZ)` — returns a formatted 12-hour string.
- `tzShortName(tz)` — extracts short abbreviation (e.g. `ET`, `PST`) via `Intl.DateTimeFormat`.

### Export
- `renderScheduleCanvas()` is the shared rasteriser: hides editor chrome, runs **html2canvas** with a computed `exportScale` that maps the CSS canvas size to the target preset resolution (e.g. 1920×1080 at 2×), and returns the finished canvas. All hidden UI and inline styles are restored in `finally` before it resolves — used by both `exportImage()` (download) and `postToDiscord()` (webhook post) so the two share one rendering path.
- **Background image sharpness** — html2canvas blurs CSS background images by capturing them at CSS pixel size then scaling up. Fix: when a background image is present, a two-pass composite is used inside `renderScheduleCanvas()`:
  1. `#bg-layer` backgroundImage is set to `none` and `#schedule-canvas` background made transparent so html2canvas captures only the day boxes (transparent background, `backgroundColor: null`).
  2. A new canvas is built manually: base `#1a1a2e` fill → `drawImage()` of the source image at native resolution using the same `background-size`/`background-position` maths as CSS → colour overlay → html2canvas output drawn on top.
  - Position formula matches CSS percentage semantics: `drawX = (canvasW - drawW) * (posX / 100)`.
  - Brightness applied via `ctx.filter = 'brightness(n%)'` before `drawImage`, reset after.
  - All saved inline styles (`backgroundImage`, `backgroundSize`, `backgroundPosition`, `filter`, overlay, canvas background) are restored in `finally`.
- **Filename** — `state.exportFilename` (default `stream-schedule`) is set via the "File Name" field on the Save tab. `sanitizeFilename()` strips path-unsafe characters (`\ / : * ? " < > |`) and falls back to the default if the result is empty; the raw (unsanitized) text is what's persisted/shown in the input.
- **iOS**: `<a download>` is not supported by Safari. Instead the image is rendered as PNG (JPEG causes viewer issues in iOS Photos) and shown in a full-screen in-page overlay; user long-presses to "Save to Photos". Filename doesn't apply here since there's no programmatic save.
- **Android / Desktop**: uses `canvas.toBlob()` + `URL.createObjectURL()` (more reliable than large data URLs); `a.download` uses the sanitized filename.
- iOS detection: `/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)` — the second condition catches iPadOS.

### Post to Discord
- `postToDiscord()` reuses `renderScheduleCanvas()`, converts the result to a `Blob` via `toBlob()`, and `fetch()`s it as multipart `FormData` (field name `file`) directly to a Discord **webhook** URL — no bot/server required, and Discord's webhook endpoint accepts cross-origin browser requests.
- `state.discordWebhook` is stored **only** in `localStorage` (via `saveToStorage`/`loadFromStorage`) — it is deliberately **excluded** from `saveConfigFile()`/`loadConfigFile()` (the downloadable/shareable JSON) so sharing a schedule template never leaks someone's webhook URL.
- The `#discord-webhook` input is `type="password"` to avoid shoulder-surfing/screen-share exposure of the URL.
- Button gives inline feedback (`⏳ Posting…` → `✅ Posted!` / `alert()` on failure) rather than blocking the whole UI.

### Background Image Controls
- `applyBackground()` sets `backgroundImage`, `backgroundSize` (`${scale}%`), `backgroundPosition`, and `filter` as inline styles on `#bg-layer`.
- **Pan / Zoom mode** (`#pan-bg-btn`): disables pointer events on `.day-box` elements so the canvas can be dragged to reposition the background.
  - Mouse drag → pan; **mouse wheel** → zoom (desktop).
  - Single-finger drag → pan; **two-finger pinch** → zoom (mobile).
- Scale range: 20–300%. Stored as `state.background.scale` (default 100). Persisted to localStorage.
- Clearing the background resets scale to 100.

### Persistence
- `saveToStorage()` / `loadFromStorage()` — `localStorage` under keys `ss_config` and `ss_bg`.
- Background image stored separately as base64 (`ss_bg`); silently skipped if storage quota is exceeded.
- `saveConfigFile()` / `loadConfigFile(file)` — JSON download/upload for cross-device transfer.
- When loading old configs that predate a new state property (e.g. `scale`), `Object.assign` leaves the default value intact since the key is absent from the saved object.
- **Not every state field belongs in all three places.** `exportFilename` is saved in both `localStorage` and the shareable config JSON. `discordWebhook` is a secret — it's saved in `localStorage` only and intentionally left out of `saveConfigFile()`/`loadConfigFile()`. When adding a new field, decide deliberately whether it's shareable or per-device/sensitive.

## Mobile Layout
- On screens ≤700px the sidebar becomes a **fixed position slide-in drawer** (`position: fixed; left: -100%`).
- `#mobile-menu-btn` (☰, fixed top-left, z-index 198) toggles the sidebar open/closed.
- `#mobile-overlay` (semi-transparent backdrop, z-index 199) closes the sidebar when tapped.
- Tapping a day box on mobile auto-opens the sidebar and switches to the Day tab.
- The mobile button and overlay are hidden via `style.display = 'none'` during export and restored in `finally`.
- Desktop is unaffected: the `.mobile-open` class sets `left: 0` which has no effect when `position` is not `fixed`.

## UI Structure (index.html)
- **Sidebar tabs**: BG (background & canvas), Day (per-day style & time), TZ (timezones), Save (export & config)
- **Canvas area**: `#schedule-wrapper` → `#schedule-canvas` → `#bg-layer`, `#bg-overlay`, `.day-box` elements
- Day selector buttons (`.day-btn`) and clicking boxes both set `state.selectedDay`.

## CSS Conventions
- All colours, spacing tokens, and border radii are defined as CSS variables in `:root` inside `style.css`.
- Primary accent: `--purple: #9146ff` (Twitch brand purple).
- Dark theme throughout; background levels: `--bg-app` → `--bg-sidebar` → `--bg-section` → `--bg-input`.
- Mobile styles live at the bottom of `style.css` under `@media (max-width: 700px)`.

## Key Constants
- `DAY_KEYS`: `['monday','tuesday','wednesday','thursday','friday','saturday','sunday']`
- `CANVAS_PRESETS`: maps preset key → `{ w, h, ratio }` for both CSS and export resolution
- `DEFAULT_POSITIONS`: default `[x%, y%]` for each of the 7 day boxes — Mon–Fri in a row at y=37%, Sat/Sun centred below at y=67%
- `TIMEZONES`: grouped array of `{ group, zones: [{ label, value }] }` used to populate both TZ selects

## Google Fonts Loaded
Inter, Oswald, Bebas Neue, Roboto, Montserrat, Rajdhani, Exo 2, Orbitron, Anton, Oxanium

## Development Notes
- **No build tool** — edit files directly; refresh browser to see changes.
- `app.js` uses `'use strict'` and is entirely vanilla JS (ES2017+).
- All user-facing strings rendered into HTML go through `esc()` (XSS sanitisation).
- The `pickImageFile` helper creates a hidden `<input type="file">`, clicks it programmatically, and cleans up after use — avoids persistent hidden inputs in the DOM.
- `loadImageFile` uses `FileReader.readAsDataURL` to store images as base64.
- Adding a new day: update `DAY_KEYS`, `DAY_SHORT`, `DEFAULT_POSITIONS`, and every `positions` array in `LAYOUTS` (one `[x,y]` per day, same order as `DAY_KEYS`) — all rendering, storage, and UI toggle loops are driven by `DAY_KEYS` and require no other changes.
- Adding a new `state.background` property: initialise it in the `state` declaration; `Object.assign` in `loadFromStorage`/`loadConfigFile` will preserve the default for old configs automatically.
