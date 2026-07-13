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
| `dayFontSize` | 14 | px |
| `timeFontSize` | 26 | px |
| `titleFontSize` | 13 | px |
| `tzFontSize` | 11 | px |
| `width` | 14 | % of canvas width — a *minimum*; the box grows wider to fit content |
| `height` | 26 | % of canvas height — a *fixed* size; taller content clips (`overflow:hidden`) rather than growing the box |

### Canvas & Rendering
- The canvas (`#schedule-canvas`) is a CSS percentage-positioned container inside `#schedule-wrapper`, which enforces the correct aspect ratio.
- Day boxes (`.day-box`) are absolutely positioned using `left`/`top` as percentages.
- `buildBox(dayKey)` → creates DOM node; `applyBoxStyles` + `fillBoxContent` update it.
- `renderBox(dayKey)` — targeted single-box re-render.
- `renderAllBoxes()` — full rebuild, called after preset/timezone changes or "Apply to All".
- **Box sizing**: width is `min-width: ${s.width}%` + `width: auto` (grows to fit its day-name/title so short single-line content isn't awkwardly padded — see Orientation Layouts for the day-name-length uniformity tradeoff this implies). Height is a **fixed** `${s.height}%` (not `auto`/`min-height`) with `.day-box{overflow:hidden}` clipping anything taller — this used to be `auto`/grow-to-fit like width, but that let a box's content (typically a long title, or title + extra timezone lines) push its actual rendered height past the configured `%` and overlap the box below it, which was especially easy to hit in the portrait single-column layout (see below) at a short browser window. Fixed height makes overlap structurally impossible; the tradeoff is that content taller than the configured height clips instead of growing. `LAYOUTS.portrait`'s height is tuned generously so a title + one extra timezone line fits without clipping in the common case.
- `.box-additional-times` (the auto-converted-timezone lines under the main time) is `flex-direction: row; flex-wrap: wrap` rather than stacking one per line — each `state.additionalTimezones` entry adds height only when it doesn't fit on the current row, not unconditionally, which is what keeps several added timezones from single-handedly pushing a box's content past its fixed height. `additionalTimezones` is global (applies to every day equally), so this matters more the more zones someone adds.

### Drag & Drop
- Uses **interact.js**. Config is returned by `dragConfig()` and applied in `initDragging()`.
- During `drag end`, `snapPosition()` checks all other enabled boxes for alignment snapping (threshold: 5% units).
- Positions are clamped to `[0, 100 - boxSize]` to keep boxes within canvas bounds — both `move` and `end` clamp against the box's **actual rendered size** (`getBoundingClientRect()`), not `style.width`/`style.height`, because box width is still `width:auto` and can grow to fit content (see Canvas & Rendering above). Clamping against the nominal size let boxes drag past where they visually fit.

### Orientation Layouts (`LAYOUTS`, `presetCategory()`, `applyLayoutForCategory()`)
- Box `width`/`height` are percentages of the canvas, but fonts are fixed px — so the same percentage means very different actual room depending on the canvas's on-screen CSS pixel size. `applyCanvasPreset()` sizes portrait canvases by **height** (`calc(100vh - 80px)`) rather than width, so a portrait canvas renders far narrower on screen than landscape/square do. The landscape row layout's 14%-wide boxes then need to grow (via `width:auto`) well past their slot to fit "7:00 PM" etc., and overlap their neighbours — this was the original bug (box sizing/snapping "awkward" specifically in vertical view, corrupting exports and Discord posts).
- Fix: `presetCategory(presetKey)` classifies a preset as `landscape` / `square` / `portrait` (by comparing `w`/`h`). `LAYOUTS[category]` holds a tuned `positions` array (7 `[x,y]` pairs) plus `width`/`height` (and, for portrait, smaller `dayFontSize`/`timeFontSize`/`titleFontSize`/`tzFontSize`) for that orientation. Portrait stacks boxes in a **single column** — width overflow becomes harmless since there's no horizontal neighbour to collide with — and relies on the fixed-height clipping above (not spacing alone) to guarantee boxes never overlap each other vertically regardless of content or viewport size. `height:13` leaves enough margin that typical content (a title, one extra timezone) fits without clipping even at a short (~600px-tall) browser window; only more extreme combinations (very short window *and* the longest realistic content) would ever clip, and even then boxes stay visually separate.
- `applyLayoutForCategory(category)` overwrites every day's `position` and `style.width`/`height` (and portrait's font sizes) — called from `applyCanvasPreset()` only when the category actually **changes** (landscape↔square↔portrait), so switching resolution within the same orientation (e.g. `16:9` → `16:9-720`) never clobbers a user's custom positions. The "Reset Positions" button also goes through this (`applyLayoutForCategory(presetCategory(state.canvasPreset))`) instead of the old hardcoded landscape-only reset.
- `loadFromStorage()` has a one-time migration: if a saved config's preset is portrait and every day's position still exactly matches the old landscape default (`DEFAULT_POSITIONS`), it's almost certainly a config saved before this fix — silently re-lay it out as portrait rather than leaving it broken.

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
