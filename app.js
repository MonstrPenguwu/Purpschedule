/* ════════════════════════════════════════════════════
   Stream Schedule Builder — app.js
   ════════════════════════════════════════════════════ */

'use strict';

// ── Constants ──────────────────────────────────────────────────────────────

const DAY_KEYS   = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const DAY_LABELS = { monday:'Monday', tuesday:'Tuesday', wednesday:'Wednesday', thursday:'Thursday', friday:'Friday', saturday:'Saturday', sunday:'Sunday' };
const DAY_SHORT  = { monday:'MON', tuesday:'TUE', wednesday:'WED', thursday:'THU', friday:'FRI', saturday:'SAT', sunday:'SUN' };

const CANVAS_PRESETS = {
  '16:9':     { w:1920, h:1080, ratio:'16/9' },
  '16:9-720': { w:1280, h:720,  ratio:'16/9' },
  '1:1':      { w:1080, h:1080, ratio:'1/1'  },
  '9:16':     { w:1080, h:1920, ratio:'9/16' },
};

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
  dayFontSize: 14, timeFontSize: 26, titleFontSize: 13, tzFontSize: 11,
  width: 14, height: 26,
};

const DEFAULT_POSITIONS = [[4,37],[23,37],[42,37],[61,37],[80,37],[29,67],[57,67]];

function mkDay(i) {
  return {
    enabled: true, noStream: false, title: '',
    hour: 7, minute: 0, period: 'PM',
    position: { x: DEFAULT_POSITIONS[i][0], y: DEFAULT_POSITIONS[i][1] },
    style: { ...DEFAULT_STYLE },
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
  initDragging();
  highlightSelected();
}

function renderBox(dayKey) {
  const canvas = document.getElementById('schedule-canvas');
  let box = canvas.querySelector(`.day-box[data-day="${dayKey}"]`);
  const day = state.days[dayKey];

  if (!day.enabled) { if (box) box.remove(); return; }

  const isNew = !box;
  if (isNew) {
    box = buildBox(dayKey);
    canvas.appendChild(box);
    interact(box).draggable(dragConfig());
  } else {
    applyBoxStyles(box, dayKey);
    fillBoxContent(box, dayKey);
  }
  highlightSelected();
}

function buildBox(dayKey) {
  const box = document.createElement('div');
  box.className = 'day-box';
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
    minWidth:     `${s.width}%`,
    width:        'auto',
    minHeight:    `${s.height}%`,
    height:       'auto',
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

  if (day.noStream) {
    box.innerHTML = `<div class="box-inner">
      <div class="box-day-name"    style="font-size:${s.dayFontSize}px;color:${s.fontColor}">${esc(DAY_LABELS[dayKey])}</div>
      <div class="box-no-stream-label" style="font-size:${Math.round(s.timeFontSize*0.6)}px;color:${s.fontColor};margin-top:6px">NO STREAM</div>
    </div>`;
  } else {
    const timeStr = `${day.hour}:${String(day.minute).padStart(2,'0')} ${day.period}`;
    box.innerHTML = `<div class="box-inner">
      <div class="box-day-name" style="font-size:${s.dayFontSize}px">${esc(DAY_LABELS[dayKey])}</div>
      <div class="box-time-main" style="font-size:${s.timeFontSize}px;color:${s.accentColor}">${esc(timeStr)}</div>
      <div class="box-tz-label"  style="font-size:${s.tzFontSize}px">${esc(tzShort)}</div>
      ${addTZHtml ? `<div class="box-additional-times" style="font-size:${Math.round(s.tzFontSize * 1.3)}px;gap:3px 8px">${addTZHtml}</div>` : ''}
      ${day.title ? `<div class="box-title" style="font-size:${s.titleFontSize}px;margin-top:3px">${esc(day.title)}</div>` : ''}
    </div>`;
  }
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

function dragConfig() {
  return {
    inertia: false,
    listeners: {
      move(ev) {
        const canvas = document.getElementById('schedule-canvas');
        const rect = canvas.getBoundingClientRect();
        const dayKey = ev.target.dataset.day;
        const day = state.days[dayKey];
        const s = day.style;
        const dxP = (ev.dx / rect.width)  * 100;
        const dyP = (ev.dy / rect.height) * 100;
        day.position.x = Math.max(0, Math.min(day.position.x + dxP, 100 - parseFloat(s.width)));
        day.position.y = Math.max(0, Math.min(day.position.y + dyP, 100 - parseFloat(s.height)));
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
        day.position.x = Math.max(0, Math.min(snapX, 100 - actualW));
        day.position.y = Math.max(0, Math.min(snapY, 100 - actualH));
        ev.target.style.left = `${day.position.x}%`;
        ev.target.style.top  = `${day.position.y}%`;
        saveToStorage();
      },
    },
  };
}

function initDragging() {
  document.querySelectorAll('.day-box').forEach(el => interact(el).draggable(dragConfig()));
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
      const val = type === 'num' ? parseFloat(e.target.value) : e.target.value;
      state.days[state.selectedDay].style[key] = val;
      if (id === 'box-bg-opacity') setVal('box-opacity-val', `${Math.round(val)}%`);
      renderBox(state.selectedDay); saveToStorage();
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

  document.getElementById('reset-positions-btn').addEventListener('click', () => {
    DAY_KEYS.forEach((k, i) => { state.days[k].position = { x: DEFAULT_POSITIONS[i][0], y: DEFAULT_POSITIONS[i][1] }; });
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
      if (d.days) DAY_KEYS.forEach((k, i) => {
        if (d.days[k]) {
          state.days[k] = { ...mkDay(i), ...d.days[k] };
          state.days[k].style = { ...DEFAULT_STYLE, ...d.days[k].style };
        }
      });
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
