# Stream Schedule Builder — Copilot Instructions

## Project Overview
A **client-side-only, no-build-step** web app that lets streamers design a weekly stream schedule graphic and export it as a PNG or JPEG image. Everything runs in the browser; there is no server, no framework, and no package.json.

## File Structure
```
app.js                  — All application logic (single file, ~700 lines)
index.html              — Single-page UI shell; injects all controls & canvas
style.css               — Full dark-themed stylesheet; CSS variables in :root
vendor/
  interact.min.js       — Drag-and-drop library (interact.js)
  html2canvas.min.js    — DOM-to-canvas export library
start.bat               — Dev launcher: `npx serve -p 5173 -s .`
```

## Running the App
```bat
start.bat       ← double-click, or run in terminal
```
Serves on **http://localhost:5173** via `npx serve`. No install step required.

## Architecture

### State
A single global `state` object holds everything:
- `state.background` — image (base64), brightness, overlay color/opacity, pan position
- `state.canvasPreset` — one of `'16:9' | '16:9-720' | '1:1' | '9:16'`
- `state.mainTimezone` — IANA timezone string
- `state.additionalTimezones` — array of IANA strings for auto-converted times
- `state.days` — object keyed by `DAY_KEYS` (`monday`–`friday`), each with:
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
| `width` | 14 | % of canvas width |
| `height` | 26 | % of canvas height |

### Canvas & Rendering
- The canvas (`#schedule-canvas`) is a CSS percentage-positioned container inside `#schedule-wrapper`, which enforces the correct aspect ratio.
- Day boxes (`.day-box`) are absolutely positioned using `left`/`top` as percentages.
- `buildBox(dayKey)` → creates DOM node; `applyBoxStyles` + `fillBoxContent` update it.
- `renderBox(dayKey)` — targeted single-box re-render.
- `renderAllBoxes()` — full rebuild, called after preset/timezone changes or "Apply to All".

### Drag & Drop
- Uses **interact.js**. Config is returned by `dragConfig()` and applied in `initDragging()`.
- During `drag end`, `snapPosition()` checks all other enabled boxes for alignment snapping (threshold: 5% units).
- Positions are clamped to `[0, 100 - boxSize]` to keep boxes within canvas bounds.

### Timezone Conversion
- `tzOffsetMinutes(tz)` — computes UTC offset via `toLocaleString` comparison (cross-browser safe).
- `convertTime(hour12, minute, period, fromTZ, toTZ)` — returns a formatted 12-hour string.
- `tzShortName(tz)` — extracts short abbreviation (e.g. `ET`, `PST`) via `Intl.DateTimeFormat`.

### Export
- `exportImage()` uses **html2canvas** with a computed `exportScale` that maps the CSS canvas size to the target preset resolution (e.g. 1920×1080 at 2×).
- Sidebar and selection highlights are hidden before capture and restored after.
- Supports PNG and JPEG (with quality slider).

### Persistence
- `saveToStorage()` / `loadFromStorage()` — `localStorage` under keys `ss_config` and `ss_bg`.
- Background image stored separately as base64 (`ss_bg`); silently skipped if storage quota is exceeded.
- `saveConfigFile()` / `loadConfigFile(file)` — JSON download/upload for cross-device transfer.

## UI Structure (index.html)
- **Sidebar tabs**: BG (background & canvas), Day (per-day style & time), TZ (timezones), Save (export & config)
- **Canvas area**: `#schedule-wrapper` → `#schedule-canvas` → `#bg-layer`, `#bg-overlay`, `.day-box` elements
- Day selector buttons (`.day-btn`) and clicking boxes both set `state.selectedDay`.

## CSS Conventions
- All colours, spacing tokens, and border radii are defined as CSS variables in `:root` inside `style.css`.
- Primary accent: `--purple: #9146ff` (Twitch brand purple).
- Dark theme throughout; background levels: `--bg-app` → `--bg-sidebar` → `--bg-section` → `--bg-input`.

## Key Constants
- `DAY_KEYS`: `['monday','tuesday','wednesday','thursday','friday']`
- `CANVAS_PRESETS`: maps preset key → `{ w, h, ratio }` for both CSS and export resolution
- `DEFAULT_POSITIONS`: default `[x%, y%]` for each of the 5 day boxes
- `TIMEZONES`: grouped array of `{ group, zones: [{ label, value }] }` used to populate both TZ selects

## Google Fonts Loaded
Inter, Oswald, Bebas Neue, Roboto, Montserrat, Rajdhani, Exo 2, Orbitron, Anton, Oxanium

## Development Notes
- **No build tool** — edit files directly; refresh browser to see changes.
- `app.js` uses `'use strict'` and is entirely vanilla JS (ES2017+).
- All user-facing strings rendered into HTML go through `esc()` (XSS sanitisation).
- The `pickImageFile` helper creates a hidden `<input type="file">`, clicks it programmatically, and cleans up after use — avoids persistent hidden inputs in the DOM.
- `loadImageFile` uses `FileReader.readAsDataURL` to store images as base64.
- Pan mode temporarily disables pointer events on all `.day-box` elements so drag-to-reposition the background works without accidentally moving boxes.
