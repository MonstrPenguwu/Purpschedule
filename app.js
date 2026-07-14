/* ════════════════════════════════════════════════════
   Stream Schedule Builder — app.js
   ════════════════════════════════════════════════════ */

'use strict';

// ── Constants ──────────────────────────────────────────────────────────────

const DAY_KEYS   = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const DAY_SHORT  = { monday:'MON', tuesday:'TUE', wednesday:'WED', thursday:'THU', friday:'FRI', saturday:'SAT', sunday:'SUN' };

const CANVAS_PRESETS = {
  '16:9':     { w:1920, h:1080, ratio:'16/9' },
  '16:9-720': { w:1280, h:720,  ratio:'16/9' },
  '1:1':      { w:1080, h:1080, ratio:'1/1'  },
  '9:16':     { w:1080, h:1920, ratio:'9/16' },
};

// Minimum distance (% of canvas) a box must keep from every canvas edge —
// social platforms overlay their own UI (captions, buttons, safe-zone
// chrome) right at the edges, so a box that stretches edge-to-edge is likely
// to sit under someone else's clutter. Drag and resize both clamp against
// this the same way they already clamp against the canvas bounds.
const CANVAS_MARGIN = 3;

const TIMEZONES = [
  { group:'North America', zones:[
    { label:'Eastern Time (ET)',   value:'America/New_York' },
    { label:'Central Time (CT)',   value:'America/Chicago' },
    { label:'Mountain Time (MT)',  value:'America/Denver' },
    { label:'Pacific Time (PT)',   value:'America/Los_Angeles' },
    { label:'Alaska (AKT)',        value:'America/Anchorage' },
    { label:'Hawaii (HT)',         value:'Pacific/Honolulu' },
    { label:'Mexico City',         value:'America/Mexico_City' },
  ]},
  { group:'South America', zones:[
    { label:'Brazil (BRT)',        value:'America/Sao_Paulo' },
    { label:'Argentina (ART)',     value:'America/Argentina/Buenos_Aires' },
    { label:'Colombia (COT)',      value:'America/Bogota' },
    { label:'Chile (CLT)',         value:'America/Santiago' },
  ]},
  { group:'UTC / Europe', zones:[
    { label:'UTC',                 value:'UTC' },
    { label:'London (GMT/BST)',    value:'Europe/London' },
    { label:'Paris / Berlin (CET)',value:'Europe/Paris' },
    { label:'Helsinki (EET)',      value:'Europe/Helsinki' },
    { label:'Moscow (MSK)',        value:'Europe/Moscow' },
    { label:'Istanbul (TRT)',      value:'Europe/Istanbul' },
  ]},
  { group:'Middle East & Africa', zones:[
    { label:'Dubai (GST)',         value:'Asia/Dubai' },
    { label:'Israel (IST)',        value:'Asia/Jerusalem' },
    { label:'Egypt (EET)',         value:'Africa/Cairo' },
    { label:'South Africa (SAST)',value:'Africa/Johannesburg' },
    { label:'Nigeria (WAT)',       value:'Africa/Lagos' },
  ]},
  { group:'Asia', zones:[
    { label:'India (IST)',         value:'Asia/Kolkata' },
    { label:'Bangladesh (BST)',    value:'Asia/Dhaka' },
    { label:'Thailand (ICT)',      value:'Asia/Bangkok' },
    { label:'Singapore/China (SGT)',value:'Asia/Singapore' },
    { label:'Japan (JST)',         value:'Asia/Tokyo' },
    { label:'South Korea (KST)',   value:'Asia/Seoul' },
    { label:'Philippines (PST)',   value:'Asia/Manila' },
  ]},
  { group:'Oceania', zones:[
    { label:'Sydney (AEST/AEDT)', value:'Australia/Sydney' },
    { label:'Melbourne (AEST)',   value:'Australia/Melbourne' },
    { label:'Perth (AWST)',       value:'Australia/Perth' },
    { label:'Auckland (NZST)',    value:'Pacific/Auckland' },
  ]},
];

// ── Default Style & State ──────────────────────────────────────────────────

const DEFAULT_STYLE = {
  bgColor: '#1a1a2e', bgOpacity: 85,
  borderColor: '#9146ff', borderWidth: 2, borderRadius: 10,
  fontFamily: 'Inter', fontColor: '#ffffff', accentColor: '#9146ff',
  // Sized to still fit a landscape row's ~14%-wide boxes on a mobile-width
  // canvas (a phone screen, not a desktop window) — the app's primary use
  // case. These look small on a wide desktop canvas but stay legible; the
  // reverse (desktop-tuned sizes on mobile) clips "7:00 PM" down to a couple
  // of characters (see .day-box{overflow:hidden}), which is worse. Both
  // width/height fit as-is —
  // only font size was too large for how little on-screen width a mobile
  // canvas actually has per box.
  dayFontSize: 7, timeFontSize: 9, titleFontSize: 7, tzFontSize: 6,
  width: 14, height: 26,
};

const DEFAULT_POSITIONS = [[4,37],[23,37],[42,37],[61,37],[80,37],[29,67],[57,67]];

// Per-orientation layouts. The landscape row arrangement only fits because the
// canvas is wide on screen; the portrait canvas is height-constrained (see
// applyCanvasPreset) and renders far narrower, so a horizontal row of boxes
// with fixed-px fonts overflows its slot and overlaps neighbours. Portrait
// instead stacks boxes in a single column — width overflow becomes harmless
// because there's no horizontal neighbour left to collide with.
const LAYOUTS = {
  landscape: {
    positions: [[4,37],[23,37],[42,37],[61,37],[80,37],[29,67],[57,67]], width: 14, height: 26,
    dayFontSize: 7, timeFontSize: 9, titleFontSize: 7, tzFontSize: 6,
  },
  square: {
    positions: [[4,37],[23,37],[42,37],[61,37],[80,37],[29,67],[57,67]], width: 14, height: 26,
    dayFontSize: 7, timeFontSize: 9, titleFontSize: 7, tzFontSize: 6,
  },
  // 7 rows in a fixed 100% budget leaves little slack, so portrait also uses
  // smaller fonts. Box height is fixed (see applyBoxStyles) so overflow clips
  // instead of growing into the next box — that guarantees no overlap, but
  // means the height needs to be generous enough that typical content (a
  // title, one extra timezone) actually fits instead of getting clipped.
  portrait:  {
    positions: [[5,3],[5,16.5],[5,30],[5,43.5],[5,57],[5,70.5],[5,84]], width: 90, height: 13,
    dayFontSize: 9, timeFontSize: 15, titleFontSize: 9, tzFontSize: 8,
  },
};

function presetCategory(presetKey) {
  const { w, h } = CANVAS_PRESETS[presetKey];
  if (h > w) return 'portrait';
  if (h === w) return 'square';
  return 'landscape';
}

function applyLayoutForCategory(category) {
  const layout = LAYOUTS[category];
  state.gridOrder = [...DAY_KEYS];
  DAY_KEYS.forEach((k, i) => {
    state.days[k].position = { x: layout.positions[i][0], y: layout.positions[i][1] };
    state.days[k].style.width  = layout.width;
    state.days[k].style.height = layout.height;
    state.days[k].gridSpan = 'half';
    state.days[k].gridAlign = 'left';
    if (layout.dayFontSize) {
      state.days[k].style.dayFontSize   = layout.dayFontSize;
      state.days[k].style.timeFontSize  = layout.timeFontSize;
      state.days[k].style.titleFontSize = layout.titleFontSize;
      state.days[k].style.tzFontSize    = layout.tzFontSize;
    }
  });
}

function mkDay(i) {
  return {
    enabled: true, noStream: false, title: '',
    hour: 7, minute: 0, period: 'PM',
    position: { x: DEFAULT_POSITIONS[i][0], y: DEFAULT_POSITIONS[i][1] },
    style: { ...DEFAULT_STYLE },
    gridSpan: 'half',
    gridAlign: 'left',
  };
}

const state = {
  background: { image: null, brightness: 100, overlayColor: '#000000', overlayOpacity: 0, posX: 50, posY: 50, scale: 100 },
  canvasPreset: '16:9',
  exportFilename: 'stream-schedule',
  discordWebhook: '',
  mainTimezone: 'America/New_York',
  additionalTimezones: [],
  selectedDay: 'monday',
  gridMode: true,
  // Grid-mode-only stacking order (independent of DAY_KEYS/Mon-Sun) — lets a
  // box be dragged to a different row without changing which day it is.
  gridOrder: [...DAY_KEYS],
  days: Object.fromEntries(DAY_KEYS.map((k,i) => [k, mkDay(i)])),
};

// ── Timezone Utilities ─────────────────────────────────────────────────────

function tzOffsetMinutes(tz) {
  const now = new Date();
  // Reliable cross-browser method: compare locale strings parsed back as Date
  const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  return (local - utc) / 60000;
}

function convertTime(hour12, minute, period, fromTZ, toTZ) {
  let h = parseInt(hour12, 10);
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  const now = new Date();
  const offset = tzOffsetMinutes(fromTZ);
  const utc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), h, parseInt(minute,10)) - offset * 60000);
  return new Intl.DateTimeFormat('en-US', { timeZone: toTZ, hour:'numeric', minute:'2-digit', hour12:true }).format(utc);
}

function tzShortName(tz) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName:'short' }).formatToParts(new Date());
  return (parts.find(p => p.type === 'timeZoneName') || {}).value || tz;
}

function tzLabel(value) {
  for (const g of TIMEZONES) {
    const z = g.zones.find(z => z.value === value);
    if (z) return z.label;
  }
  return value;
}

// ── DOM Helpers ────────────────────────────────────────────────────────────

function hex2rgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) } : {r:0,g:0,b:0};
}

function sanitizeFilename(name) {
  const cleaned = String(name || '').trim().replace(/[\\/:*?"<>|]/g, '');
  return cleaned || 'stream-schedule';
}

function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Render Boxes ───────────────────────────────────────────────────────────

function renderAllBoxes() {
  const canvas = document.getElementById('schedule-canvas');
  canvas.querySelectorAll('.day-box').forEach(el => el.remove());
  DAY_KEYS.forEach(k => {
    if (state.days[k].enabled) {
      const box = buildBox(k);
      canvas.appendChild(box);
    }
  });
  if (state.gridMode) applyGridLayout();
  initDragging();
  highlightSelected();
}

function renderBox(dayKey) {
  const canvas = document.getElementById('schedule-canvas');
  let box = canvas.querySelector(`.day-box[data-day="${dayKey}"]`);
  const day = state.days[dayKey];

  if (!day.enabled) {
    if (box) box.remove();
    if (state.gridMode) applyGridLayout();
    highlightSelected();
    return;
  }

  const isNew = !box;
  if (isNew) {
    box = buildBox(dayKey);
    canvas.appendChild(box);
    if (state.gridMode) {
      interact(box).draggable(gridDragConfig());
    } else {
      interact(box).draggable(dragConfig());
      interact(box).resizable(resizeConfig());
    }
  } else {
    applyBoxStyles(box, dayKey);
    fillBoxContent(box, dayKey);
  }
  // A content change can shift this box's own natural height, which in grid
  // mode cascades into every row below it — cheap enough at 7 boxes to just
  // recompute the whole layout rather than track what changed.
  if (state.gridMode) applyGridLayout();
  highlightSelected();
}

function buildBox(dayKey) {
  const box = document.createElement('div');
  box.className = 'day-box';
  box.classList.toggle('grid-mode', state.gridMode);
  box.dataset.day = dayKey;
  applyBoxStyles(box, dayKey);
  fillBoxContent(box, dayKey);
  return box;
}

function applyBoxStyles(box, dayKey) {
  const day = state.days[dayKey];
  const s = day.style;
  const {r,g,b} = hex2rgb(s.bgColor);
  const alpha = s.bgOpacity / 100;
  Object.assign(box.style, {
    left:         `${day.position.x}%`,
    top:          `${day.position.y}%`,
    width:        `${s.width}%`,
    height:       `${s.height}%`,
    background:   `rgba(${r},${g},${b},${alpha})`,
    border:       `${s.borderWidth}px solid ${s.borderColor}`,
    borderRadius: `${s.borderRadius}px`,
    fontFamily:   `'${s.fontFamily}', sans-serif`,
    color:         s.fontColor,
  });
}

function fillBoxContent(box, dayKey) {
  const day = state.days[dayKey];
  const s = day.style;
  const tzShort = tzShortName(state.mainTimezone);

  let addTZHtml = '';
  if (!day.noStream && state.additionalTimezones.length) {
    addTZHtml = state.additionalTimezones.map(tz => {
      const t = convertTime(day.hour, day.minute, day.period, state.mainTimezone, tz);
      const short = tzShortName(tz);
      return `<span style="font-size:${Math.round(s.tzFontSize * 1.3)}px">${esc(short)}&nbsp;${esc(t)}</span>`;
    }).join('');
  }

  const resizeHandle = state.gridMode ? '' : `<div class="resize-handle" title="Drag to resize"></div>`;

  if (day.noStream) {
    box.innerHTML = `<div class="box-inner">
      <div class="box-day-name"    style="font-size:${s.dayFontSize}px;color:${s.fontColor}">${esc(DAY_SHORT[dayKey])}</div>
      <div class="box-no-stream-label" style="font-size:${Math.round(s.timeFontSize*0.6)}px;color:${s.fontColor};margin-top:6px">NO STREAM</div>
    </div>${resizeHandle}`;
  } else {
    const timeStr = `${day.hour}:${String(day.minute).padStart(2,'0')} ${day.period}`;
    box.innerHTML = `<div class="box-inner">
      <div class="box-day-name" style="font-size:${s.dayFontSize}px">${esc(DAY_SHORT[dayKey])}</div>
      <div class="box-time-main" style="font-size:${s.timeFontSize}px;color:${s.accentColor}">${esc(timeStr)}</div>
      <div class="box-tz-label"  style="font-size:${s.tzFontSize}px">${esc(tzShort)}</div>
      ${addTZHtml ? `<div class="box-additional-times" style="font-size:${Math.round(s.tzFontSize * 1.3)}px;gap:3px 8px">${addTZHtml}</div>` : ''}
      ${day.title ? `<div class="box-title" style="font-size:${s.titleFontSize}px;margin-top:3px">${esc(day.title)}</div>` : ''}
    </div>${resizeHandle}`;
  }
}

// Measures how big this box's own content actually needs to be. Box
// width/height are normally fixed (see applyBoxStyles), so this briefly
// switches them to 'auto' to read the box's natural shrink-to-fit size, then
// restores the fixed values. Includes a 30% buffer so "the minimum" is
// comfortable padding around the content, not a razor-tight fit against it.
// Used both to floor the resize handle/number inputs (so a box can never be
// shrunk smaller than its own text needs, which used to clip it down to
// unreadable) and by "Fit to Content" to size a box directly.
function measureNaturalBoxSize(dayKey) {
  const canvas = document.getElementById('schedule-canvas');
  const box = canvas.querySelector(`.day-box[data-day="${dayKey}"]`);
  if (!box) return { width: 5, height: 5 };
  const canvasRect = canvas.getBoundingClientRect();

  const prevWidth  = box.style.width;
  const prevHeight = box.style.height;
  const currentPxWidth = box.getBoundingClientRect().width;

  // .box-additional-times (the extra-timezone list) is flex-wrap:wrap by
  // design — but CSS shrink-to-fit's "preferred width" (what width:'auto'
  // below resolves to) is defined as the width with *no* wrapping at all, as
  // if every extra timezone sat on one line. With 2-3 added zones that can
  // be 2-3x wider than the box actually needs once it's allowed to wrap,
  // which pinned the floor near the max-size cap and made "shrink after
  // growing" feel broken. Capping it to the box's current width first makes
  // it wrap the same way it already does, so the measurement reflects a
  // wrapped layout instead of one unwrapped mega-line.
  const additionalTimes = box.querySelector('.box-additional-times');
  const prevATMaxWidth = additionalTimes ? additionalTimes.style.maxWidth : null;
  if (additionalTimes) additionalTimes.style.maxWidth = `${currentPxWidth}px`;

  box.style.width  = 'auto';
  box.style.height = 'auto';

  const naturalRect = box.getBoundingClientRect();

  box.style.width  = prevWidth;
  box.style.height = prevHeight;
  if (additionalTimes) additionalTimes.style.maxWidth = prevATMaxWidth;

  // Hybrid buffer (10% relative + 3 flat percentage points) instead of a
  // pure multiplier — a flat ×1.3 gave tiny content barely-there padding
  // (6% → 8%) while blowing up already-substantial content (72% → 94%,
  // right against the max-size cap). The additive term matters more the
  // smaller the content is; the relative term keeps scaling sanely as
  // content grows, instead of ballooning with it.
  const buffer = v => v * 1.1 + 3;
  const maxUsable = 100 - 2 * CANVAS_MARGIN;
  return {
    width:  Math.min(maxUsable, buffer((naturalRect.width  / canvasRect.width)  * 100)),
    height: Math.min(maxUsable, buffer((naturalRect.height / canvasRect.height) * 100)),
  };
}

// ── Grid Layout ────────────────────────────────────────────────────────────
// Mobile-friendly alternative to freeform drag/resize (see state.gridMode).
// Enabled days flow into rows in state.gridOrder (independent of DAY_KEYS —
// dragging a box on the canvas reorders this, not the day itself): a 'full'
// day takes its own row; consecutive 'half' days pair up two-to-a-row, each
// preferring the side named by its own gridAlign ('left'/'center'/'right'),
// resolved by resolvePairSides when both want the same side. An unpaired
// 'half' sits in its own row per its own gridAlign. Row height always
// auto-fits whichever box in that row needs the most room, measured with
// the box pinned to its real target width — unlike measureNaturalBoxSize's
// width:'auto' trick (needed there because the target width is unknown),
// here the width is already decided by the row, so wrapped content (e.g.
// .box-additional-times) measures correctly with no extra handling.
const GRID_GUTTER = 2;
const GRID_ROW_GAP = 2;

function sanitizeGridOrder(order) {
  if (!Array.isArray(order)) return [...DAY_KEYS];
  const deduped = [...new Set(order.filter(k => DAY_KEYS.includes(k)))];
  if (deduped.length !== DAY_KEYS.length) return [...DAY_KEYS];
  return deduped;
}

function getGridOrder() {
  return sanitizeGridOrder(state.gridOrder);
}
 
function groupLayoutRows(layout) {
  const rows = [];
  Object.entries(layout)
    .sort((a, b) => a[1].y - b[1].y)
    .forEach(([k, pos]) => {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last.y - pos.y) < 1 && Math.abs(last.height - pos.height) < 1) {
        last.keys.push(k);
      } else {
        rows.push({ y: pos.y, height: pos.height, keys: [k] });
      }
    });
  return rows;
}
 
// Resolves which of two paired half-width days lands left vs right. `a` is
// the one encountered first in gridOrder. Each day's own gridAlign is
// honoured when only one of the pair wants a given side; if both want the
// same explicit side, the earlier one (a) wins it and b is bumped to the
// other side — an explicit tiebreak rather than an arbitrary one, since drag
// reordering means "earlier" is something the user directly controls.
function resolvePairSides(a, b) {
  const A = state.days[a].gridAlign || 'left';
  const B = state.days[b].gridAlign || 'left';
  if (A === B && (A === 'left' || A === 'right')) {
    return A === 'right' ? { left: b, right: a } : { left: a, right: b };
  }
  if (A === 'right') return { left: b, right: a };
  if (B === 'right') return { left: a, right: b };
  if (A === 'left')  return { left: a, right: b };
  if (B === 'left')  return { left: b, right: a };
  return { left: a, right: b }; // both center/unset — encounter order
}

function computeGridLayout() {
  const canvas = document.getElementById('schedule-canvas');
  const canvasRect = canvas.getBoundingClientRect();
  const canvasWidth = canvasRect.width || canvas.clientWidth;
  const canvasHeight = canvasRect.height || canvas.clientHeight;
  const usableWidth = 100 - 2 * CANVAS_MARGIN;
  const halfWidth = (usableWidth - GRID_GUTTER) / 2;
 
  if (!canvasWidth || !canvasHeight) {
    const fallback = {};
    getGridOrder().filter(k => state.days[k].enabled).forEach(k => {
      const day = state.days[k];
      fallback[k] = { x: day.position.x, y: day.position.y, width: day.style.width, height: day.style.height };
    });
    return fallback;
  }
 
  const enabledDays = getGridOrder().filter(k => state.days[k].enabled);

  // Group into rows. A leftover unpaired 'half' at a boundary gets its own
  // row, positioned per its own gridAlign.
  const rows = [];
  let pendingHalf = null;
  enabledDays.forEach(k => {
    const span = state.days[k].gridSpan || 'full';
    if (span === 'half') {
      if (pendingHalf) { rows.push([pendingHalf, k]); pendingHalf = null; }
      else pendingHalf = k;
    } else {
      if (pendingHalf) { rows.push([pendingHalf]); pendingHalf = null; }
      rows.push([k]);
    }
  });
  if (pendingHalf) rows.push([pendingHalf]);

  const layout = {};
  let y = CANVAS_MARGIN;
  rows.forEach(row => {
    const isFullRow = row.length === 1 && (state.days[row[0]].gridSpan || 'full') !== 'half';
    const cellWidthPct = isFullRow ? usableWidth : halfWidth;
    const cellWidthPx = (cellWidthPct / 100) * canvasWidth;

    let rowHeightPct = 0;
    row.forEach(k => {
      const box = canvas.querySelector(`.day-box[data-day="${k}"]`);
      if (!box) return;
      const prevW = box.style.width, prevH = box.style.height;
      box.style.width = `${cellWidthPx}px`;
      box.style.height = 'auto';
      const naturalH = box.getBoundingClientRect().height;
      box.style.width = prevW;
      box.style.height = prevH;
      const naturalPct = canvasHeight ? (naturalH / canvasHeight) * 100 : 0;
      rowHeightPct = Math.max(rowHeightPct, naturalPct, parseFloat(state.days[k].style.height) || 0);
    });
    // Same hybrid buffer as measureNaturalBoxSize — comfortable padding
    // instead of a razor-tight fit against the measured content.
    rowHeightPct = rowHeightPct * 1.1 + 2;

    if (isFullRow) {
      layout[row[0]] = { x: CANVAS_MARGIN, y, width: cellWidthPct, height: rowHeightPct };
    } else if (row.length === 2) {
      const { left, right } = resolvePairSides(row[0], row[1]);
      layout[left]  = { x: CANVAS_MARGIN, y, width: cellWidthPct, height: rowHeightPct };
      layout[right] = { x: CANVAS_MARGIN + cellWidthPct + GRID_GUTTER, y, width: cellWidthPct, height: rowHeightPct };
    } else {
      const align = state.days[row[0]].gridAlign || 'left';
      const x = align === 'right'  ? CANVAS_MARGIN + usableWidth - cellWidthPct
              : align === 'center' ? CANVAS_MARGIN + (usableWidth - cellWidthPct) / 2
              : CANVAS_MARGIN;
      layout[row[0]] = { x, y, width: cellWidthPct, height: rowHeightPct };
    }
    y += rowHeightPct + GRID_ROW_GAP;
  });

  return layout;
}

function applyGridLayout() {
  const layout = computeGridLayout();
  Object.entries(layout).forEach(([k, pos]) => {
    const box = document.querySelector(`.day-box[data-day="${k}"]`);
    if (!box) return;
    box.style.left   = `${pos.x}%`;
    box.style.top    = `${pos.y}%`;
    box.style.width  = `${pos.width}%`;
    box.style.height = `${pos.height}%`;
  });
}

// ── Grid Drag-to-Reorder ───────────────────────────────────────────────────
// In grid mode, size/position are computed (see computeGridLayout), so
// dragging doesn't move a box pixel-by-pixel — it drops onto a target row
// and reorders state.gridOrder, plus (for a half-width box) sets gridAlign
// from how far left/center/right within the row it was dropped. The box
// itself floats via a CSS transform layered on top of its grid position
// while dragging (no state mutation until drop), then applyGridLayout snaps
// everything into its new resting place with a short CSS transition.

// Finds which OTHER enabled day's row is vertically closest to (cx, cy) —
// shared by the live drop indicator and the actual drop handler so the
// indicator always previews exactly what dropping now would do.
function findGridDropTarget(dayKey, cy) {
  const layout = computeGridLayout();
  const rows = groupLayoutRows(layout).filter(row => !row.keys.includes(dayKey));
  let targetRow = null, minDist = Infinity;
  rows.forEach(row => {
    const center = row.y + row.height / 2;
    const d = Math.abs(cy - center);
    if (d < minDist) { minDist = d; targetRow = row; }
  });
  return { targetRow, layout };
}

function boxCenterPct(box) {
  const canvas = document.getElementById('schedule-canvas');
  const canvasRect = canvas.getBoundingClientRect();
  const canvasWidth = canvasRect.width || canvas.clientWidth;
  const canvasHeight = canvasRect.height || canvas.clientHeight;
  const r = box.getBoundingClientRect();
  return {
    cx: canvasWidth ? ((r.left + r.width / 2 - canvasRect.left) / canvasWidth) * 100 : 50,
    cy: canvasHeight ? ((r.top + r.height / 2 - canvasRect.top) / canvasHeight) * 100 : 50,
  };
}

function resolveDropAlign(cx) {
  const usableWidth = 100 - 2 * CANVAS_MARGIN;
  const rel = (cx - CANVAS_MARGIN) / usableWidth;
  return rel < 0.33 ? 'left' : rel > 0.67 ? 'right' : 'center';
}

function showGridDropIndicator(box) {
  const canvas = document.getElementById('schedule-canvas');
  const dayKey = box.dataset.day;
  const { cx, cy } = boxCenterPct(box);
  const { targetRow, layout } = findGridDropTarget(dayKey, cy);
  let indicator = document.getElementById('grid-drop-indicator');
  if (!targetRow) { if (indicator) indicator.style.display = 'none'; return; }
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'grid-drop-indicator';
    canvas.appendChild(indicator);
  }
  const lineY = cy > (targetRow.y + targetRow.height / 2)
    ? targetRow.y + targetRow.height + GRID_ROW_GAP / 2
    : targetRow.y - GRID_ROW_GAP / 2;
  indicator.style.display = 'block';
  indicator.style.left    = `${CANVAS_MARGIN}%`;
  indicator.style.width   = `${100 - 2 * CANVAS_MARGIN}%`;
  indicator.style.top     = `${lineY}%`;
  indicator.dataset.align = resolveDropAlign(cx);
}

function hideGridDropIndicator() {
  const indicator = document.getElementById('grid-drop-indicator');
  if (indicator) indicator.remove();
}

function applyGridReorder(dayKey, box) {
  const { cx, cy } = boxCenterPct(box);
  const { targetRow } = findGridDropTarget(dayKey, cy);
 
  let order = getGridOrder().filter(k => k !== dayKey);
  if (targetRow) {
    const align = resolveDropAlign(cx);
    const firstKey = targetRow.keys[0];
    let idx = order.indexOf(firstKey);
    if (targetRow.keys.length === 1) {
      if (align === 'right') idx += 1;
    } else {
      if (align === 'right') idx += 1;
    }
    order.splice(idx, 0, dayKey);
  } else {
    order.push(dayKey);
  }
  state.gridOrder = order;

  // Only meaningful for a half-width box, but harmless to set unconditionally
  // — a full-width box ignores its own gridAlign in computeGridLayout.
  state.days[dayKey].gridAlign = resolveDropAlign(cx);

  renderAllBoxes();
  saveToStorage();
}

function gridDragConfig() {
  return {
    inertia: false,
    listeners: {
      start(ev) {
        const box = ev.target;
        box.classList.add('grid-dragging');
        box.dataset.dragX = '0';
        box.dataset.dragY = '0';
      },
      move(ev) {
        const box = ev.target;
        const x = (parseFloat(box.dataset.dragX) || 0) + ev.dx;
        const y = (parseFloat(box.dataset.dragY) || 0) + ev.dy;
        box.dataset.dragX = x;
        box.dataset.dragY = y;
        box.style.transform = `translate(${x}px, ${y}px)`;
        showGridDropIndicator(box);
      },
      end(ev) {
        const box = ev.target;
        applyGridReorder(box.dataset.day, box);
        hideGridDropIndicator();
      },
    },
  };
}

function highlightSelected() {
  document.querySelectorAll('.day-box').forEach(b => {
    b.classList.toggle('selected', b.dataset.day === state.selectedDay);
  });
}

// ── Drag & Drop ────────────────────────────────────────────────────────────

function snapPosition(dayKey, rawX, rawY) {
  const THRESHOLD = 5;
  const GAP = 1;
  const canvas = document.getElementById('schedule-canvas');
  const canvasRect = canvas.getBoundingClientRect();

  function boxPct(key) {
    const el = canvas.querySelector(`[data-day="${key}"]`);
    if (!el) return { w: parseFloat(state.days[key].style.width), h: parseFloat(state.days[key].style.height) };
    const r = el.getBoundingClientRect();
    return { w: (r.width / canvasRect.width) * 100, h: (r.height / canvasRect.height) * 100 };
  }

  const { w, h } = boxPct(dayKey);
  let bestDX = THRESHOLD + 1, bestDY = THRESHOLD + 1, snapDX = 0, snapDY = 0;

  for (const key of DAY_KEYS) {
    if (key === dayKey) continue;
    const other = state.days[key];
    if (!other.enabled) continue;
    const ox = other.position.x, oy = other.position.y;
    const { w: ow, h: oh } = boxPct(key);

    const xPairs = [
      [rawX,       ox],
      [rawX + w/2, ox + ow/2],
      [rawX + w,   ox + ow],
      [rawX + w,   ox - GAP],
      [rawX,       ox + ow + GAP],
    ];
    const yPairs = [
      [rawY,       oy],
      [rawY + h/2, oy + oh/2],
      [rawY + h,   oy + oh],
      [rawY + h,   oy - GAP],
      [rawY,       oy + oh + GAP],
    ];

    for (const [my, target] of xPairs) {
      const d = Math.abs(my - target);
      if (d < bestDX) { bestDX = d; snapDX = target - my; }
    }
    for (const [my, target] of yPairs) {
      const d = Math.abs(my - target);
      if (d < bestDY) { bestDY = d; snapDY = target - my; }
    }
  }

  return [
    bestDX <= THRESHOLD ? rawX + snapDX : rawX,
    bestDY <= THRESHOLD ? rawY + snapDY : rawY,
  ];
}

// Resize only ever grows a box from its top-left anchor (position never
// changes — only the right/bottom edges move, see resizeConfig), so the only
// way it can collide with another enabled box is by growing into one that's
// to the right (for width) or below (for height). Unlike drag — which allows
// free overlap, snapPosition is just an alignment aid — an uncapped resize
// growing into a neighbour let that neighbour's (later-in-DOM-order, so
// visually on top) box physically cover this box's own resize handle,
// making the box un-shrinkable afterwards since there was nothing left to
// click. Only a box sharing this one's other axis (i.e. actually in the way)
// constrains the cap; unrelated boxes elsewhere on the canvas don't.
function maxSizeAvoidingNeighbors(dayKey) {
  const day = state.days[dayKey];
  const x1 = day.position.x, y1 = day.position.y;
  let maxWidth  = 100 - CANVAS_MARGIN - x1;
  let maxHeight = 100 - CANVAS_MARGIN - y1;

  DAY_KEYS.forEach(k => {
    if (k === dayKey) return;
    const other = state.days[k];
    if (!other.enabled) return;
    const ox1 = other.position.x, oy1 = other.position.y;
    const ox2 = ox1 + other.style.width, oy2 = oy1 + other.style.height;

    // To the right and within our current vertical band — caps width.
    if (ox1 >= x1 && y1 < oy2 && y1 + day.style.height > oy1) {
      maxWidth = Math.min(maxWidth, ox1 - x1);
    }
    // Below and within our current horizontal band — caps height.
    if (oy1 >= y1 && x1 < ox2 && x1 + day.style.width > ox1) {
      maxHeight = Math.min(maxHeight, oy1 - y1);
    }
  });

  return { width: maxWidth, height: maxHeight };
}

function dragConfig() {
  return {
    inertia: false,
    listeners: {
      move(ev) {
        const canvas = document.getElementById('schedule-canvas');
        const rect = canvas.getBoundingClientRect();
        const dayKey = ev.target.dataset.day;
        const day = state.days[dayKey];
        // Box width/height are fixed to style.width/height (see applyBoxStyles),
        // so this now matches the configured size exactly — kept as a measured
        // value rather than trusting style.width/height directly since it's a
        // trivially-correct source of truth for "how much room is left".
        const elRect = ev.target.getBoundingClientRect();
        const actualW = (elRect.width  / rect.width)  * 100;
        const actualH = (elRect.height / rect.height) * 100;
        const dxP = (ev.dx / rect.width)  * 100;
        const dyP = (ev.dy / rect.height) * 100;
        day.position.x = Math.max(CANVAS_MARGIN, Math.min(day.position.x + dxP, 100 - CANVAS_MARGIN - actualW));
        day.position.y = Math.max(CANVAS_MARGIN, Math.min(day.position.y + dyP, 100 - CANVAS_MARGIN - actualH));
        ev.target.style.left = `${day.position.x}%`;
        ev.target.style.top  = `${day.position.y}%`;
      },
      end(ev) {
        const dayKey = ev.target.dataset.day;
        const day = state.days[dayKey];
        const canvasRect = document.getElementById('schedule-canvas').getBoundingClientRect();
        const elRect = ev.target.getBoundingClientRect();
        const actualW = (elRect.width  / canvasRect.width)  * 100;
        const actualH = (elRect.height / canvasRect.height) * 100;
        const [snapX, snapY] = snapPosition(dayKey, day.position.x, day.position.y);
        day.position.x = Math.max(CANVAS_MARGIN, Math.min(snapX, 100 - CANVAS_MARGIN - actualW));
        day.position.y = Math.max(CANVAS_MARGIN, Math.min(snapY, 100 - CANVAS_MARGIN - actualH));
        ev.target.style.left = `${day.position.x}%`;
        ev.target.style.top  = `${day.position.y}%`;
        saveToStorage();
      },
    },
  };
}

function resizeConfig() {
  let minSize = { width: 5, height: 5 };
  let maxSize = { width: 100, height: 100 };
  return {
    edges: { left: false, top: false, right: '.resize-handle', bottom: '.resize-handle' },
    listeners: {
      start(ev) {
        // Both measured once per gesture, not per move event: minSize
        // requires a reflow (temporarily un-fixing the box's size), and
        // maxSize is constant through the gesture anyway since resize never
        // moves this box's own position — only *other* boxes' positions
        // would change it, and they don't move mid-gesture.
        const dayKey = ev.target.dataset.day;
        minSize = measureNaturalBoxSize(dayKey);
        maxSize = maxSizeAvoidingNeighbors(dayKey);
      },
      move(ev) {
        const canvas = document.getElementById('schedule-canvas');
        const rect = canvas.getBoundingClientRect();
        const dayKey = ev.target.dataset.day;
        const day = state.days[dayKey];
        const s = day.style;
        const dwP = (ev.deltaRect.width  / rect.width)  * 100;
        const dhP = (ev.deltaRect.height / rect.height) * 100;
        // Bounded the same way dragging is: can't grow past CANVAS_MARGIN from
        // the canvas edge or into a neighbouring box (maxSize — see
        // maxSizeAvoidingNeighbors), and never below what the box's own
        // content needs (minSize) — previously the floor was a flat 5%,
        // which let a box shrink small enough to clip its own text down to
        // a single letter.
        s.width  = Math.max(minSize.width,  Math.min(s.width  + dwP, maxSize.width));
        s.height = Math.max(minSize.height, Math.min(s.height + dhP, maxSize.height));
        ev.target.style.width  = `${s.width}%`;
        ev.target.style.height = `${s.height}%`;
        if (dayKey === state.selectedDay) {
          set('box-width',  Math.round(s.width  * 10) / 10);
          set('box-height', Math.round(s.height * 10) / 10);
        }
      },
      end(ev) {
        saveToStorage();
      },
    },
  };
}

function initDragging() {
  document.querySelectorAll('.day-box').forEach(el => {
    if (state.gridMode) {
      interact(el).draggable(gridDragConfig());
    } else {
      interact(el).draggable(dragConfig());
      interact(el).resizable(resizeConfig());
    }
  });
}

// ── Background ─────────────────────────────────────────────────────────────

function applyBackground() {
  const bgLayer = document.getElementById('bg-layer');
  const overlay = document.getElementById('bg-overlay');
  bgLayer.style.backgroundImage    = state.background.image ? `url(${state.background.image})` : 'none';
  bgLayer.style.backgroundSize     = `${state.background.scale}%`;
  bgLayer.style.backgroundPosition = `${state.background.posX}% ${state.background.posY}%`;
  bgLayer.style.filter              = `brightness(${state.background.brightness}%)`;
  const {r,g,b} = hex2rgb(state.background.overlayColor);
  overlay.style.background          = `rgba(${r},${g},${b},${state.background.overlayOpacity/100})`;
}

// ── Canvas Resize ──────────────────────────────────────────────────────────

function applyCanvasPreset(preset) {
  const prevCategory = presetCategory(state.canvasPreset);
  const nextCategory = presetCategory(preset);
  state.canvasPreset = preset;
  const { w: pw, h: ph, ratio } = CANVAS_PRESETS[preset];
  const wrapper = document.getElementById('schedule-wrapper');
  wrapper.style.aspectRatio = ratio;
  if (ph > pw) {
    // Portrait — constrain by height so the full tall canvas is visible
    wrapper.style.width    = 'auto';
    wrapper.style.height   = 'calc(100vh - 80px)';
    wrapper.style.maxWidth = '100%';
    wrapper.style.maxHeight = '';
  } else {
    // Landscape / square — constrain by width
    wrapper.style.width    = '100%';
    wrapper.style.height   = 'auto';
    wrapper.style.maxWidth = '';
    wrapper.style.maxHeight = 'calc(100vh - 80px)';
  }

  // Orientation actually changed (not just switching resolution within the same
  // orientation) — the previous layout's positions/sizes likely don't fit the
  // new shape, so swap in the tuned defaults for the new orientation.
  if (nextCategory !== prevCategory) {
    applyLayoutForCategory(nextCategory);
    renderAllBoxes();
  }
}

// ── Controls: load state → UI ──────────────────────────────────────────────

function loadDayControls(dayKey) {
  const day = state.days[dayKey];
  const s = day.style;

  document.getElementById('day-no-stream').checked = day.noStream;
  const settingsDiv = document.getElementById('day-stream-settings');
  settingsDiv.style.opacity       = day.noStream ? '0.4' : '1';
  settingsDiv.style.pointerEvents = day.noStream ? 'none' : '';

  document.getElementById('day-hour').value   = day.hour;
  document.getElementById('day-minute').value = String(day.minute).padStart(2,'0');
  document.getElementById('day-period').value = day.period;
  document.getElementById('day-title').value  = day.title;
  updateCharCount(day.title);

  set('box-bg-color',      s.bgColor);
  set('box-bg-opacity',    s.bgOpacity);   setVal('box-opacity-val', `${s.bgOpacity}%`);
  set('box-border-color',  s.borderColor);
  set('box-border-width',  s.borderWidth);
  set('box-border-radius', s.borderRadius);
  set('box-font-family',   s.fontFamily);
  set('box-font-color',    s.fontColor);
  set('box-accent-color',  s.accentColor);
  set('box-day-size',      s.dayFontSize);
  set('box-time-size',     s.timeFontSize);
  set('box-title-size',    s.titleFontSize);
  set('box-tz-size',       s.tzFontSize);
  set('box-width',         s.width);
  set('box-height',        s.height);

  const span = day.gridSpan || 'full';
  const align = day.gridAlign || 'left';
  document.querySelectorAll('.span-visual-btn').forEach(btn => {
    const match = span === 'full' ? btn.dataset.span === 'full' : (btn.dataset.span === 'half' && btn.dataset.align === align);
    btn.classList.toggle('active', match);
  });
}

// Shows the grid Full/Half span control (and hides the freeform width/height
// inputs) when grid mode is on, and vice versa — the two are mutually
// exclusive ways of sizing a box.
function updateGridModeUI() {
  document.getElementById('grid-span-section').style.display    = state.gridMode ? '' : 'none';
  document.getElementById('freeform-dims-section').style.display = state.gridMode ? 'none' : '';
}

function set(id, val)    { const el = document.getElementById(id); if (el) el.value = val; }
function setVal(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function updateCharCount(v) { setVal('title-char-count', `${v.length}/35`); }

// ── Controls: bind UI → state ──────────────────────────────────────────────

function bindDayControls() {
  // No stream toggle
  document.getElementById('day-no-stream').addEventListener('change', e => {
    state.days[state.selectedDay].noStream = e.target.checked;
    const s = document.getElementById('day-stream-settings');
    s.style.opacity = e.target.checked ? '0.4' : '1';
    s.style.pointerEvents = e.target.checked ? 'none' : '';
    renderBox(state.selectedDay); saveToStorage();
  });

  // Time
  ['day-hour','day-minute','day-period'].forEach(id => {
    document.getElementById(id).addEventListener('change', e => {
      const d = state.days[state.selectedDay];
      if (id === 'day-hour')   d.hour   = parseInt(e.target.value, 10);
      if (id === 'day-minute') d.minute = parseInt(e.target.value, 10);
      if (id === 'day-period') d.period = e.target.value;
      renderBox(state.selectedDay); saveToStorage();
    });
  });

  // Title
  document.getElementById('day-title').addEventListener('input', e => {
    state.days[state.selectedDay].title = e.target.value;
    updateCharCount(e.target.value);
    renderBox(state.selectedDay); saveToStorage();
  });

  // Style bindings  [id, stateKey, valueType]
  const bindings = [
    ['box-bg-color',      'bgColor',       'value'],
    ['box-bg-opacity',    'bgOpacity',     'num'],
    ['box-border-color',  'borderColor',   'value'],
    ['box-border-width',  'borderWidth',   'num'],
    ['box-border-radius', 'borderRadius',  'num'],
    ['box-font-family',   'fontFamily',    'value'],
    ['box-font-color',    'fontColor',     'value'],
    ['box-accent-color',  'accentColor',   'value'],
    ['box-day-size',      'dayFontSize',   'num'],
    ['box-time-size',     'timeFontSize',  'num'],
    ['box-title-size',    'titleFontSize', 'num'],
    ['box-tz-size',       'tzFontSize',    'num'],
    ['box-width',         'width',         'num'],
    ['box-height',        'height',        'num'],
  ];

  bindings.forEach(([id, key, type]) => {
    const el = document.getElementById(id);
    const ev = (el.tagName === 'INPUT' && el.type === 'range') ? 'input' : 'change';
    el.addEventListener(ev, e => {
      let val = type === 'num' ? parseFloat(e.target.value) : e.target.value;
      // Same floor as the resize handle — typing a value smaller than the
      // box's own content needs would otherwise clip it down to unreadable.
      if (id === 'box-width' || id === 'box-height') {
        const min = measureNaturalBoxSize(state.selectedDay);
        val = Math.max(val, id === 'box-width' ? min.width : min.height);
        e.target.value = Math.round(val * 10) / 10;
      }
      state.days[state.selectedDay].style[key] = val;
      if (id === 'box-bg-opacity') setVal('box-opacity-val', `${Math.round(val)}%`);
      renderBox(state.selectedDay); saveToStorage();
    });
  });

  // Fit to Content — sizes the box to exactly hug its current text at its
  // current font size, with the same breathing-room buffer used as the
  // resize floor. A reliable starting point instead of eyeballing a drag.
  document.getElementById('fit-content-btn').addEventListener('click', () => {
    const day = state.days[state.selectedDay];
    const fit = measureNaturalBoxSize(state.selectedDay);
    day.style.width  = Math.round(fit.width  * 10) / 10;
    day.style.height = Math.round(fit.height * 10) / 10;
    set('box-width',  day.style.width);
    set('box-height', day.style.height);
    renderBox(state.selectedDay); saveToStorage();
  });

  // Grid layout (Full / Half-Left / Half-Center / Half-Right)
  document.querySelectorAll('.span-visual-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const day = state.days[state.selectedDay];
      day.gridSpan  = btn.dataset.span;
      day.gridAlign = btn.dataset.align;
      document.querySelectorAll('.span-visual-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderAllBoxes(); saveToStorage();
    });
  });

  // Apply to all
  document.getElementById('apply-to-all-btn').addEventListener('click', () => {
    const src = { ...state.days[state.selectedDay].style };
    DAY_KEYS.forEach(k => { state.days[k].style = { ...src }; });
    renderAllBoxes(); saveToStorage();
  });
}

function pickImageFile(callback) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;width:1px;height:1px';
  document.body.appendChild(input);
  input.addEventListener('change', e => {
    const file = e.target.files[0];
    document.body.removeChild(input);
    if (file) callback(file);
  }, { once: true });
  input.click();
}

function loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = ev => {
    state.background.image = ev.target.result;
    applyBackground();
    saveToStorage();
  };
  reader.readAsDataURL(file);
}

function bindBackgroundControls() {
  document.getElementById('bg-upload-btn').addEventListener('click', () => {
    pickImageFile(loadImageFile);
  });

  // Drag-and-drop onto canvas area
  const dropzone = document.getElementById('upload-dropzone');
  const canvasArea = document.getElementById('canvas-area');
  [dropzone, canvasArea].forEach(el => {
    el.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
    el.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    el.addEventListener('drop', e => {
      e.preventDefault(); dropzone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) loadImageFile(file);
    });
  });

  document.getElementById('clear-bg-btn').addEventListener('click', () => {
    state.background.image = null;
    state.background.posX = 50; state.background.posY = 50;
    state.background.scale = 100;
    set('bg-scale', 100); setVal('bg-scale-val', '100%');
    exitPanMode(); applyBackground(); saveToStorage();
  });

  // ── Background Repositioning (pan mode) ──────────────────────────────────
  let panMode = false;
  let panDragging = false, panLastX = 0, panLastY = 0;
  const canvas = document.getElementById('schedule-canvas');
  const panBtn = document.getElementById('pan-bg-btn');

  function exitPanMode() {
    panMode = false; panDragging = false;
    panBtn.classList.remove('active');
    panBtn.textContent = '\u2725 Pan / Zoom';
    canvas.style.cursor = '';
    document.querySelectorAll('.day-box').forEach(el => el.style.pointerEvents = '');
  }

  panBtn.addEventListener('click', () => {
    if (!state.background.image) return;
    panMode = !panMode;
    if (panMode) {
      panBtn.classList.add('active'); panBtn.textContent = '\u2713 Done';
      canvas.style.cursor = 'grab';
      document.querySelectorAll('.day-box').forEach(el => el.style.pointerEvents = 'none');
    } else {
      exitPanMode();
    }
  });

  function panStart(x, y) {
    if (!panMode || !state.background.image) return false;
    panDragging = true; panLastX = x; panLastY = y;
    canvas.style.cursor = 'grabbing'; return true;
  }
  function panMove(x, y) {
    if (!panDragging) return;
    const rect = canvas.getBoundingClientRect();
    const dx = (x - panLastX) / rect.width  * 100;
    const dy = (y - panLastY) / rect.height * 100;
    panLastX = x; panLastY = y;
    state.background.posX = Math.max(0, Math.min(100, state.background.posX - dx));
    state.background.posY = Math.max(0, Math.min(100, state.background.posY - dy));
    applyBackground();
  }
  function panEnd() {
    if (!panDragging) return;
    panDragging = false;
    if (panMode) canvas.style.cursor = 'grab';
    saveToStorage();
  }

  // Mouse
  canvas.addEventListener('mousedown', e => { if (panStart(e.clientX, e.clientY)) e.preventDefault(); });
  window.addEventListener('mousemove', e => panMove(e.clientX, e.clientY));
  window.addEventListener('mouseup', panEnd);

  // Mouse wheel zoom in pan mode
  canvas.addEventListener('wheel', e => {
    if (!panMode || !state.background.image) return;
    e.preventDefault();
    state.background.scale = Math.max(20, Math.min(300,
      Math.round(state.background.scale - e.deltaY * 0.15)
    ));
    set('bg-scale', state.background.scale);
    setVal('bg-scale-val', `${state.background.scale}%`);
    applyBackground();
  }, { passive: false });

  // Touch: single-finger pan + two-finger pinch-to-zoom
  let pinchStartDist = 0, pinchStartScale = 100;
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 2 && panMode && state.background.image) {
      pinchStartDist  = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartScale = state.background.scale;
      e.preventDefault();
    } else if (panStart(e.touches[0].clientX, e.touches[0].clientY)) {
      e.preventDefault();
    }
  }, { passive: false });
  window.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && panMode && state.background.image) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      state.background.scale = Math.max(20, Math.min(300,
        Math.round(pinchStartScale * dist / pinchStartDist)
      ));
      set('bg-scale', state.background.scale);
      setVal('bg-scale-val', `${state.background.scale}%`);
      applyBackground();
      e.preventDefault();
    } else if (panDragging) {
      panMove(e.touches[0].clientX, e.touches[0].clientY);
      e.preventDefault();
    }
  }, { passive: false });
  window.addEventListener('touchend', panEnd);

  document.getElementById('overlay-opacity').addEventListener('input', e => {
    state.background.overlayOpacity = parseInt(e.target.value, 10);
    setVal('overlay-opacity-val', `${e.target.value}%`);
    applyBackground(); saveToStorage();
  });

  document.getElementById('overlay-color').addEventListener('input', e => {
    state.background.overlayColor = e.target.value; applyBackground(); saveToStorage();
  });

  document.getElementById('bg-brightness').addEventListener('input', e => {
    state.background.brightness = parseInt(e.target.value, 10);
    setVal('bg-brightness-val', `${e.target.value}%`);
    applyBackground(); saveToStorage();
  });

  document.getElementById('bg-scale').addEventListener('input', e => {
    state.background.scale = parseInt(e.target.value, 10);
    setVal('bg-scale-val', `${e.target.value}%`);
    applyBackground(); saveToStorage();
  });

  document.getElementById('canvas-size').addEventListener('change', e => {
    applyCanvasPreset(e.target.value); saveToStorage();
  });

  document.getElementById('grid-mode-toggle').addEventListener('change', e => {
    state.gridMode = e.target.checked;
    updateGridModeUI();
    renderAllBoxes(); saveToStorage();
  });

  document.getElementById('reset-positions-btn').addEventListener('click', () => {
    applyLayoutForCategory(presetCategory(state.canvasPreset));
    renderAllBoxes(); saveToStorage();
  });
}

function bindTZControls() {
  document.getElementById('main-timezone').addEventListener('change', e => {
    state.mainTimezone = e.target.value; renderAllBoxes(); saveToStorage();
  });

  document.getElementById('add-tz-btn').addEventListener('click', () => {
    const tz = document.getElementById('add-tz-select').value;
    if (!state.additionalTimezones.includes(tz)) {
      state.additionalTimezones.push(tz);
      renderAdditionalTZList(); renderAllBoxes(); saveToStorage();
    }
  });
}

function bindExportControls() {
  document.getElementById('export-filename').addEventListener('input', e => {
    state.exportFilename = e.target.value; saveToStorage();
  });

  document.getElementById('export-format').addEventListener('change', e => {
    document.getElementById('quality-row').style.display = e.target.value === 'jpeg' ? 'flex' : 'none';
  });

  document.getElementById('export-quality').addEventListener('input', e => {
    setVal('export-quality-val', `${Math.round(e.target.value * 100)}%`);
  });

  document.getElementById('export-btn').addEventListener('click', exportImage);

  document.getElementById('discord-webhook').addEventListener('input', e => {
    state.discordWebhook = e.target.value; saveToStorage();
  });
  document.getElementById('discord-btn').addEventListener('click', postToDiscord);

  document.getElementById('save-config-btn').addEventListener('click', saveConfigFile);
  document.getElementById('load-config-btn').addEventListener('click', () => document.getElementById('config-upload').click());
  document.getElementById('config-upload').addEventListener('change', e => {
    const file = e.target.files[0]; if (file) loadConfigFile(file);
    e.target.value = '';
  });
}

// ── Timezone UI ────────────────────────────────────────────────────────────

function populateTZSelects() {
  ['main-timezone', 'add-tz-select'].forEach(id => {
    const sel = document.getElementById(id);
    sel.innerHTML = '';
    TIMEZONES.forEach(group => {
      const og = document.createElement('optgroup');
      og.label = group.group;
      group.zones.forEach(z => {
        const opt = document.createElement('option');
        opt.value = z.value; opt.textContent = z.label;
        og.appendChild(opt);
      });
      sel.appendChild(og);
    });
  });
  document.getElementById('main-timezone').value = state.mainTimezone;
}

function renderAdditionalTZList() {
  const container = document.getElementById('additional-tz-list');
  container.innerHTML = '';
  state.additionalTimezones.forEach((tz, i) => {
    const item = document.createElement('div');
    item.className = 'tz-item';
    item.innerHTML = `<span>${esc(tzLabel(tz))}</span><button class="btn-icon" title="Remove">✕</button>`;
    item.querySelector('button').addEventListener('click', () => {
      state.additionalTimezones.splice(i, 1);
      renderAdditionalTZList(); renderAllBoxes(); saveToStorage();
    });
    container.appendChild(item);
  });
}

// ── Time Dropdowns ─────────────────────────────────────────────────────────

function populateTimeDropdowns() {
  const hourSel = document.getElementById('day-hour');
  const minSel  = document.getElementById('day-minute');
  for (let h = 1; h <= 12; h++) {
    const o = document.createElement('option'); o.value = h; o.textContent = h;
    hourSel.appendChild(o);
  }
  for (let m = 0; m < 60; m++) {
    const o = document.createElement('option');
    o.value = m; o.textContent = String(m).padStart(2,'0');
    minSel.appendChild(o);
  }
}

// ── Day Visibility Toggles ─────────────────────────────────────────────────

function populateDayVisToggles() {
  const container = document.getElementById('day-visibility-toggles');
  container.innerHTML = '';
  DAY_KEYS.forEach(k => {
    const lbl = document.createElement('label');
    lbl.className = 'day-toggle-item';
    lbl.innerHTML = `<input type="checkbox" ${state.days[k].enabled ? 'checked' : ''}><span>${DAY_SHORT[k]}</span>`;
    lbl.querySelector('input').addEventListener('change', e => {
      state.days[k].enabled = e.target.checked;
      renderBox(k); saveToStorage();
    });
    container.appendChild(lbl);
  });
}

// ── Export ─────────────────────────────────────────────────────────────────

// Hides editor chrome, rasterises #schedule-canvas via html2canvas, and — when a
// background image is present — composites it manually at native resolution
// (see two-pass compositing note below). Returns the finished canvas. All hidden
// UI and inline styles are restored before this resolves, whether it succeeds or throws.
async function renderScheduleCanvas() {
  const sidebar   = document.getElementById('sidebar');
  const hint      = document.getElementById('canvas-hint');
  const mobileBtn = document.getElementById('mobile-menu-btn');
  const mobOver   = document.getElementById('mobile-overlay');

  sidebar.style.display   = 'none';
  hint.style.display      = 'none';
  mobileBtn.style.display = 'none';
  if (mobOver) mobOver.style.display = 'none';
  document.querySelectorAll('.day-box.selected').forEach(b => b.classList.remove('selected'));

  await document.fonts.ready;
  await new Promise(r => setTimeout(r, 100)); // allow reflow

  const canvas    = document.getElementById('schedule-canvas');
  const bgLayer   = document.getElementById('bg-layer');
  const bgOverlay = document.getElementById('bg-overlay');
  const scale     = parseFloat(document.getElementById('export-scale').value);
  const preset    = CANVAS_PRESETS[state.canvasPreset];
  const rect      = canvas.getBoundingClientRect();
  const exportScale = scale * (preset.w / rect.width);

  // When a background image is present, hide it from html2canvas and composite
  // it manually at native resolution — this prevents html2canvas from blurring
  // the image by scaling it up from CSS pixel dimensions.
  const hasBg         = !!state.background.image;
  const savedBgImg    = bgLayer.style.backgroundImage;
  const savedBgSize   = bgLayer.style.backgroundSize;
  const savedBgPos    = bgLayer.style.backgroundPosition;
  const savedBgFilter = bgLayer.style.filter;
  const savedOverlay  = bgOverlay.style.background;
  const savedCanvasBg = canvas.style.background;

  if (hasBg) {
    bgLayer.style.backgroundImage = 'none';
    bgOverlay.style.background    = 'transparent';
    canvas.style.background       = 'transparent';
  }

  try {
    const rendered = await html2canvas(canvas, {
      scale: exportScale, useCORS: true, allowTaint: true,
      backgroundColor: hasBg ? null : '#1a1a2e', logging: false,
    });

    let exportCanvas = rendered;

    if (hasBg) {
      // Build composite: base colour → background image → colour overlay → day boxes
      const comp = document.createElement('canvas');
      comp.width  = rendered.width;
      comp.height = rendered.height;
      const ctx = comp.getContext('2d');

      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, comp.width, comp.height);

      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          // Match CSS background-size: ${scale}% (width-based, auto height)
          const drawW = comp.width * (state.background.scale / 100);
          const drawH = drawW * (img.naturalHeight / img.naturalWidth);
          // Match CSS background-position percentage semantics
          const drawX = (comp.width  - drawW) * (state.background.posX / 100);
          const drawY = (comp.height - drawH) * (state.background.posY / 100);

          ctx.filter = `brightness(${state.background.brightness}%)`;
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
          ctx.filter = 'none';

          // Colour overlay
          const { r, g, b } = hex2rgb(state.background.overlayColor);
          ctx.fillStyle = `rgba(${r},${g},${b},${state.background.overlayOpacity / 100})`;
          ctx.fillRect(0, 0, comp.width, comp.height);

          resolve();
        };
        img.onerror = reject;
        img.src = state.background.image;
      });

      // Day boxes on top (html2canvas output has transparent background)
      ctx.drawImage(rendered, 0, 0);
      exportCanvas = comp;
    }

    return exportCanvas;
  } finally {
    bgLayer.style.backgroundImage    = savedBgImg;
    bgLayer.style.backgroundSize     = savedBgSize;
    bgLayer.style.backgroundPosition = savedBgPos;
    bgLayer.style.filter             = savedBgFilter;
    bgOverlay.style.background       = savedOverlay;
    canvas.style.background          = savedCanvasBg;
    sidebar.style.display   = '';
    hint.style.display      = '';
    mobileBtn.style.display = '';
    if (mobOver) mobOver.style.display = '';
    highlightSelected();
  }
}

async function exportImage() {
  const btn = document.getElementById('export-btn');
  btn.textContent = '⏳ Rendering…'; btn.disabled = true;

  try {
    const exportCanvas = await renderScheduleCanvas();
    const format  = document.getElementById('export-format').value;
    const quality = parseFloat(document.getElementById('export-quality').value);
    const mime    = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const isIOS   = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIOS) {
      const dataUrl = exportCanvas.toDataURL('image/png');
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;inset:0;background:#000;z-index:9999;' +
        'display:flex;flex-direction:column;align-items:center;overflow-y:auto;padding:20px;gap:14px;';
      const msg = document.createElement('p');
      msg.textContent = 'Long-press the image → Save to Photos';
      msg.style.cssText = 'color:#eee;font-family:sans-serif;font-size:15px;text-align:center;flex-shrink:0;';
      const imgEl = document.createElement('img');
      imgEl.src = dataUrl;
      imgEl.style.cssText = 'max-width:100%;height:auto;border-radius:6px;';
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕  Close';
      closeBtn.style.cssText = 'padding:10px 28px;background:#9146ff;color:#fff;border:none;' +
        'border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;flex-shrink:0;';
      closeBtn.addEventListener('click', () => document.body.removeChild(el));
      el.append(msg, imgEl, closeBtn);
      document.body.appendChild(el);
    } else {
      exportCanvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = `${sanitizeFilename(state.exportFilename)}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, mime, quality);
    }
  } catch (err) {
    alert('Export failed: ' + err.message);
  } finally {
    btn.textContent = '💾 Export as Image'; btn.disabled = false;
  }
}

async function postToDiscord() {
  const webhookUrl = state.discordWebhook.trim();
  if (!webhookUrl) { alert('Add a Discord webhook URL first.'); return; }

  const btn = document.getElementById('discord-btn');
  const originalLabel = btn.textContent;
  btn.textContent = '⏳ Posting…'; btn.disabled = true;

  try {
    const exportCanvas = await renderScheduleCanvas();
    const format  = document.getElementById('export-format').value;
    const quality = parseFloat(document.getElementById('export-quality').value);
    const mime    = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const blob    = await new Promise(resolve => exportCanvas.toBlob(resolve, mime, quality));

    const formData = new FormData();
    formData.append('file', blob, `${sanitizeFilename(state.exportFilename)}.${format}`);

    const res = await fetch(webhookUrl, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`Discord returned ${res.status}`);

    btn.textContent = '✅ Posted!';
    setTimeout(() => { btn.textContent = originalLabel; btn.disabled = false; }, 1500);
  } catch (err) {
    alert('Failed to post to Discord: ' + err.message);
    btn.textContent = originalLabel; btn.disabled = false;
  }
}

// ── Save / Load ────────────────────────────────────────────────────────────

function saveToStorage() {
  try {
    const data = {
      background: { ...state.background, image: null },
      canvasPreset: state.canvasPreset,
      exportFilename: state.exportFilename,
      discordWebhook: state.discordWebhook,
      mainTimezone: state.mainTimezone,
      additionalTimezones: state.additionalTimezones,
      gridMode: state.gridMode,
      gridOrder: state.gridOrder,
      days: state.days,
    };
    localStorage.setItem('ss_config', JSON.stringify(data));
    if (state.background.image) {
      try { localStorage.setItem('ss_bg', state.background.image); } catch(_) { /* image too large */ }
    } else {
      localStorage.removeItem('ss_bg');
    }
  } catch(_) {}
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem('ss_config');
    if (raw) {
      const d = JSON.parse(raw);
      if (d.background)           Object.assign(state.background, d.background);
      if (d.canvasPreset)         state.canvasPreset         = d.canvasPreset;
      if (d.exportFilename)       state.exportFilename       = d.exportFilename;
      if (d.discordWebhook)       state.discordWebhook       = d.discordWebhook;
      if (d.mainTimezone)         state.mainTimezone         = d.mainTimezone;
      if (d.additionalTimezones)  state.additionalTimezones  = d.additionalTimezones;
      if (d.gridMode !== undefined) state.gridMode           = d.gridMode;
      if (d.gridOrder)            state.gridOrder            = sanitizeGridOrder(d.gridOrder);
      if (d.days) DAY_KEYS.forEach((k, i) => {
        if (d.days[k]) {
          state.days[k] = { ...mkDay(i), ...d.days[k] };
          state.days[k].style = { ...DEFAULT_STYLE, ...d.days[k].style };
        }
      });

      // One-time migration: configs saved before portrait got its own layout
      // have the landscape row positions applied to a 9:16 canvas, which
      // overlaps badly (see LAYOUTS comment). If every day is still sitting
      // at the untouched landscape default, swap in the portrait layout.
      if (presetCategory(state.canvasPreset) === 'portrait') {
        const stillLandscapeDefault = DAY_KEYS.every((k, i) =>
          state.days[k].position.x === DEFAULT_POSITIONS[i][0] &&
          state.days[k].position.y === DEFAULT_POSITIONS[i][1]);
        if (stillLandscapeDefault) applyLayoutForCategory('portrait');
      } else {
        // One-time migration: configs saved before landscape/square fonts were
        // resized for mobile still carry the old desktop-tuned sizes
        // (14/26/13/11), which clip badly (see .day-box{overflow:hidden}) on
        // a mobile-width canvas —
        // this app's primary use case. Only touch a day whose fonts still
        // exactly match the old defaults, so per-day customisation is untouched.
        const OLD = { dayFontSize: 14, timeFontSize: 26, titleFontSize: 13, tzFontSize: 11 };
        const layout = LAYOUTS[presetCategory(state.canvasPreset)];
        DAY_KEYS.forEach(k => {
          const s = state.days[k].style;
          if (s.dayFontSize === OLD.dayFontSize && s.timeFontSize === OLD.timeFontSize &&
              s.titleFontSize === OLD.titleFontSize && s.tzFontSize === OLD.tzFontSize) {
            s.dayFontSize = layout.dayFontSize;
            s.timeFontSize = layout.timeFontSize;
            s.titleFontSize = layout.titleFontSize;
            s.tzFontSize = layout.tzFontSize;
          }
        });
      }
    }
    const bg = localStorage.getItem('ss_bg');
    if (bg) state.background.image = bg;
  } catch(_) {}
}

function saveConfigFile() {
  const data = {
    background: { ...state.background },
    canvasPreset: state.canvasPreset,
    exportFilename: state.exportFilename,
    mainTimezone: state.mainTimezone,
    additionalTimezones: state.additionalTimezones,
    gridMode: state.gridMode,
    gridOrder: state.gridOrder,
    days: state.days,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'stream-schedule-config.json'; a.click();
  URL.revokeObjectURL(url);
}

function loadConfigFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const d = JSON.parse(e.target.result);
      if (d.background)          Object.assign(state.background, d.background);
      if (d.canvasPreset)        state.canvasPreset        = d.canvasPreset;
      if (d.exportFilename)      state.exportFilename      = d.exportFilename;
      if (d.mainTimezone)        state.mainTimezone        = d.mainTimezone;
      if (d.additionalTimezones) state.additionalTimezones = d.additionalTimezones;
      if (d.gridMode !== undefined) state.gridMode         = d.gridMode;
      if (d.gridOrder)              state.gridOrder        = sanitizeGridOrder(d.gridOrder);
      if (d.days) DAY_KEYS.forEach((k, i) => {
        if (d.days[k]) {
          state.days[k] = { ...mkDay(i), ...d.days[k] };
          state.days[k].style = { ...DEFAULT_STYLE, ...d.days[k].style };
        }
      });
      syncAllUI(); saveToStorage();
    } catch(err) { alert('Failed to load config: ' + err.message); }
  };
  reader.readAsText(file);
}

// ── Full UI Sync ───────────────────────────────────────────────────────────

function syncAllUI() {
  const bg = state.background;
  set('overlay-opacity',  bg.overlayOpacity);  setVal('overlay-opacity-val',  `${bg.overlayOpacity}%`);
  set('overlay-color',    bg.overlayColor);
  set('bg-brightness',    bg.brightness);      setVal('bg-brightness-val',    `${bg.brightness}%`);
  set('bg-scale',         bg.scale ?? 100);    setVal('bg-scale-val',         `${bg.scale ?? 100}%`);
  set('canvas-size',      state.canvasPreset);
  document.getElementById('grid-mode-toggle').checked = state.gridMode;
  updateGridModeUI();
  set('export-filename',  state.exportFilename);
  set('discord-webhook',  state.discordWebhook);
  applyCanvasPreset(state.canvasPreset);
  applyBackground();
  populateDayVisToggles();
  document.getElementById('main-timezone').value = state.mainTimezone;
  renderAdditionalTZList();
  loadDayControls(state.selectedDay);
  renderAllBoxes();
}

// ── Init ───────────────────────────────────────────────────────────────────

function init() {
  loadFromStorage();

  populateTimeDropdowns();
  populateTZSelects();
  populateDayVisToggles();

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // Day selector buttons
  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedDay = btn.dataset.day;
      loadDayControls(state.selectedDay);
      highlightSelected();
    });
  });

  // Click on a box to select it
  document.getElementById('schedule-canvas').addEventListener('click', e => {
    const box = e.target.closest('.day-box');
    if (!box) return;
    const dayKey = box.dataset.day;
    state.selectedDay = dayKey;
    document.querySelectorAll('.day-btn').forEach(b => b.classList.toggle('active', b.dataset.day === dayKey));
    loadDayControls(dayKey);
    highlightSelected();
    // Switch to Day tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    document.querySelector('.tab[data-tab="day"]').classList.add('active');
    document.getElementById('tab-day').classList.add('active');
  });

  bindDayControls();
  bindBackgroundControls();
  bindTZControls();
  bindExportControls();

  // Mobile sidebar toggle
  (function () {
    const mbtn    = document.getElementById('mobile-menu-btn');
    const overlay = document.getElementById('mobile-overlay');
    const sb      = document.getElementById('sidebar');
    function openSidebar()  { sb.classList.add('mobile-open');    overlay.classList.add('visible'); }
    function closeSidebar() { sb.classList.remove('mobile-open'); overlay.classList.remove('visible'); }
    mbtn.addEventListener('click', () =>
      sb.classList.contains('mobile-open') ? closeSidebar() : openSidebar()
    );
    overlay.addEventListener('click', closeSidebar);
    // Auto-open sidebar when a day box is tapped on mobile
    document.getElementById('schedule-canvas').addEventListener('click', e => {
      if (e.target.closest('.day-box') && window.matchMedia('(max-width:700px)').matches) openSidebar();
    });
  })();

  syncAllUI();
}

document.addEventListener('DOMContentLoaded', init);
