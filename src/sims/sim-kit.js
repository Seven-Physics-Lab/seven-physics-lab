/*  sim-kit.js  —  shared runtime for IB Physics simulations
 *  Zero dependencies. Framework agnostic. Safe to import once and share
 *  across every simulation on the site.
 *
 *  Every simulation module exports a single default function:
 *
 *      export default function mount(container, options) {
 *        ...                        // build UI inside container
 *        return { destroy() {} }    // must remove listeners + stop loops
 *      }
 *
 *  Nothing here touches document.body, window globals, or any element
 *  outside the container it is given.
 */

/* ------------------------------------------------------------------ *
 * 1. Scoped stylesheet
 *    Injected once per page, never again, regardless of how many sims
 *    are mounted. Every selector is prefixed .ibs so it cannot reach
 *    the host site, and the root resets inherited typography so the
 *    host site cannot reach in.
 * ------------------------------------------------------------------ */

const STYLE_ID = 'ibs-kit-styles';

const BASE_CSS = `
.ibs{
  /* --- theme tokens: override any of these from the host site ---
     The palette is deliberately three colours. Brand teal carries every
     piece of emphasis, black carries the apparatus and the data, white
     is the ground. Nothing else is introduced, because a second hue on
     a physics diagram is read as a second meaning. */
  --ibs-font:  'Quicksand', ui-rounded, -apple-system, "Segoe UI", Roboto, sans-serif;
  --ibs-serif: Georgia, "Times New Roman", serif;   /* physics symbols */
  --ibs-mono:  ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  --ibs-bg:           #ffffff;
  --ibs-text:         #000000;
  --ibs-muted:        rgba(0,0,0,.55);
  --ibs-accent:       #005F6A;
  --ibs-accent-hover: #00727f;
  --ibs-accent-soft:  rgba(0,95,106,.10);
  --ibs-accent-line:  rgba(0,95,106,.18);
  --ibs-frame:        rgba(0,0,0,.15);   /* graph frames and rules */
  --ibs-radius: 10px;

  /* SVG text is measured in viewBox units, so it shrinks with the drawing
     when a sim is squeezed into a narrow column. A sim can raise this to
     keep its labels at a constant physical size on a phone. */
  --ibs-tscale: 1;

  /* --- reset so host styles cannot bleed in --- */
  font-family: var(--ibs-font);
  font-size: 14px;
  font-weight: 400;
  line-height: 1.45;
  color: var(--ibs-text);
  background: var(--ibs-bg);
  display: block;
  position: relative;
  text-align: left;
  -webkit-font-smoothing: antialiased;
  container-type: inline-size;
}
/* Specificity note: every selector below is at least 0-1-0 (.ibs …) so
   ordinary host CSS on bare element selectors (button{}, input{}, div{},
   Tailwind preflight, Bootstrap, WordPress themes) always loses to it.
   Host rules marked !important can still reach in — if your site has
   those, mount with { shadow: true } for hard isolation. */
.ibs *, .ibs *::before, .ibs *::after{ box-sizing: border-box; }
.ibs *{ line-height: inherit; font-family: inherit; }
/* the UA rule for [hidden] is display:none, which any later display
   declaration beats. A sim that hides one control must be able to rely
   on el.hidden actually hiding it. */
.ibs [hidden]{ display:none !important; }
.ibs p, .ibs h1, .ibs h2, .ibs h3, .ibs h4, .ibs ul, .ibs ol, .ibs figure{ margin:0; padding:0; }
.ibs ul, .ibs ol{ list-style:none; }
.ibs button, .ibs input, .ibs select, .ibs label, .ibs textarea{
  font:inherit; color:inherit; margin:0; letter-spacing:inherit; text-transform:none;
}
.ibs i, .ibs .ibs-sym{ font-family:var(--ibs-serif); font-style:italic; }
.ibs sub{ font-size:.72em; }
.ibs sup{ font-size:.72em; }

@media (prefers-color-scheme: dark){
  .ibs:not([data-ibs-theme="light"]){
    --ibs-bg:#0f1417; --ibs-text:#f2f6f6; --ibs-muted:rgba(255,255,255,.58);
    --ibs-accent:#4fc3c0; --ibs-accent-hover:#67d3d0;
    --ibs-accent-soft:rgba(79,195,192,.14); --ibs-accent-line:rgba(79,195,192,.26);
    --ibs-frame:rgba(255,255,255,.22);
  }
}
.ibs[data-ibs-theme="dark"]{
  --ibs-bg:#0f1417; --ibs-text:#f2f6f6; --ibs-muted:rgba(255,255,255,.58);
  --ibs-accent:#4fc3c0; --ibs-accent-hover:#67d3d0;
  --ibs-accent-soft:rgba(79,195,192,.14); --ibs-accent-line:rgba(79,195,192,.26);
  --ibs-frame:rgba(255,255,255,.22);
}

/* ---------- header ---------- */
.ibs-head{
  border-bottom:3px solid var(--ibs-accent); padding-bottom:10px; margin-bottom:14px;
}
.ibs-head h3{
  color:var(--ibs-accent); font-weight:700; font-size:22px; letter-spacing:.2px; display:inline;
}
.ibs-head span{
  color:var(--ibs-text); font-weight:500; font-size:13.5px; margin-left:10px;
}

/* ---------- layout ---------- */
.ibs-row{ display:flex; gap:14px; align-items:flex-start; }
.ibs-col{ min-width:0; }
.ibs-col--fill{ flex:1 1 auto; min-width:0; }

/* ---------- panel: a bordered box under a teal title bar ---------- */
.ibs-panel{
  background:var(--ibs-bg); border:1px solid var(--ibs-accent-line);
  border-radius:var(--ibs-radius); overflow:hidden; margin-bottom:12px;
}
.ibs-panel > .ibs-panel__title{
  background:var(--ibs-accent); color:#fff; font-size:12.5px; font-weight:600;
  letter-spacing:.8px; text-transform:uppercase; padding:6px 12px; display:block;
}
.ibs-panel__body{ padding:12px 14px; }
.ibs-canvas{ display:block; width:100%; touch-action:none; }

/* ---------- control strip ---------- */
.ibs-controls{
  display:flex; flex-wrap:wrap; gap:10px 16px; align-items:center;
  padding:12px 14px; border:1px solid var(--ibs-accent-line);
  border-radius:var(--ibs-radius); margin-bottom:12px;
}
.ibs-controls__label{ font-size:12px; font-weight:600; color:var(--ibs-accent); }

.ibs-ctl{ display:flex; align-items:center; gap:7px; font-size:13px; font-weight:500; }
.ibs-ctl__sym{
  font-weight:600; color:var(--ibs-accent);
  font-style:italic; font-family:var(--ibs-serif); font-size:15px;
}
.ibs-ctl__sym--word{ font-style:normal; font-family:var(--ibs-font); font-size:13px; }
.ibs-ctl__val{ font-size:12.5px; font-variant-numeric:tabular-nums; min-width:4.2em; }

.ibs-range{
  -webkit-appearance:none; appearance:none; width:110px; height:18px;
  background:transparent; accent-color:var(--ibs-accent); cursor:pointer; display:block;
}
.ibs-range:focus-visible{ outline:2px solid var(--ibs-accent); outline-offset:3px; border-radius:3px; }
.ibs-range::-webkit-slider-runnable-track{ height:4px; border-radius:2px; background:var(--ibs-accent-line); }
.ibs-range::-moz-range-track{ height:4px; border-radius:2px; background:var(--ibs-accent-line); }
.ibs-range::-webkit-slider-thumb{
  -webkit-appearance:none; appearance:none; width:14px; height:14px; margin-top:-5px;
  border-radius:50%; background:var(--ibs-accent); border:2px solid var(--ibs-bg);
  box-shadow:0 0 0 1px var(--ibs-accent);
}
.ibs-range::-moz-range-thumb{
  width:14px; height:14px; border-radius:50%; background:var(--ibs-accent);
  border:2px solid var(--ibs-bg); box-shadow:0 0 0 1px var(--ibs-accent);
}
.ibs-range:disabled{ opacity:.45; cursor:not-allowed; }

.ibs-btn{
  font-family:inherit; font-weight:600; font-size:12.5px; padding:7px 12px;
  border-radius:8px; border:1.5px solid var(--ibs-accent);
  background:var(--ibs-bg); color:var(--ibs-accent); cursor:pointer; white-space:nowrap;
}
.ibs-btn:hover{ background:var(--ibs-accent-soft); }
.ibs-btn[aria-pressed="true"]{ background:var(--ibs-accent); color:#fff; }
.ibs-btn[aria-pressed="true"]:hover{ background:var(--ibs-accent-hover); }
.ibs-btn:focus-visible{ outline:2px solid var(--ibs-accent); outline-offset:2px; }
.ibs-btn:disabled{ opacity:.45; cursor:not-allowed; }
.ibs-btns{ display:flex; flex-wrap:wrap; gap:8px; }

.ibs-select{
  padding:6px 9px; border:1.5px solid var(--ibs-accent); border-radius:8px;
  background:var(--ibs-bg); color:var(--ibs-accent); font-size:12.5px;
  font-weight:600; cursor:pointer; max-width:100%;
}
.ibs-select:focus-visible{ outline:2px solid var(--ibs-accent); outline-offset:2px; }

.ibs-check{ display:inline-flex; align-items:center; gap:7px; cursor:pointer;
            font-size:13px; font-weight:500; }
.ibs-check input{ width:15px; height:15px; accent-color:var(--ibs-accent); cursor:pointer; }

/* ---------- readouts: the numbers live here, never on the drawing ---------- */
.ibs-reads{
  display:grid; grid-template-columns:repeat(2,1fr); gap:8px;
  padding:12px 14px; border:1px solid var(--ibs-accent-line); border-radius:var(--ibs-radius);
}
@container (max-width: 430px){ .ibs-reads{ grid-template-columns:1fr; } }
.ibs-rd{ background:var(--ibs-accent-soft); border-radius:8px; padding:7px 10px; }
.ibs-rd .k{ font-size:11.5px; font-weight:600; color:var(--ibs-accent); letter-spacing:.3px; }
.ibs-rd .k i{ font-size:12.5px; }
.ibs-rd .v{ font-size:14px; font-weight:600; margin-top:2px;
            font-variant-numeric:tabular-nums; color:var(--ibs-text); }

/* ---------- note ---------- */
.ibs-note{
  font-size:12.5px; color:var(--ibs-text); padding:10px 14px;
  border-left:3px solid var(--ibs-accent); background:var(--ibs-accent-soft);
  border-radius:0 8px 8px 0; margin-top:12px; line-height:1.65;
}
.ibs-note b:first-child{ color:var(--ibs-accent); }
.ibs-note i{ font-size:13.5px; }

/* ---------- svg text defaults (used by the Plot helper) ---------- */
.ibs text{ font-family:var(--ibs-font); fill:var(--ibs-muted);
           font-size:calc(11px * var(--ibs-tscale)); }
.ibs .ibs-axis-line{ stroke:var(--ibs-accent-line); stroke-width:1; fill:none; }
.ibs .ibs-gridline{ stroke:var(--ibs-accent-line); stroke-width:1; opacity:.6; }
.ibs .ibs-tick{ font-size:calc(10px * var(--ibs-tscale));
                fill:var(--ibs-muted); font-family:var(--ibs-font); }
.ibs .ibs-axis-title{ font-size:calc(11px * var(--ibs-tscale));
                      fill:var(--ibs-text); font-family:var(--ibs-serif); font-style:italic; }

.ibs-sr{
  position:absolute; width:1px; height:1px; padding:0; margin:-1px;
  overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0;
}
@media (prefers-reduced-motion: reduce){
  .ibs *{ transition-duration:.01ms !important; }
}
`;

export function injectStyles(css = BASE_CSS, id = STYLE_ID) {
  if (typeof document === 'undefined') return;
  if (document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}

/* ------------------------------------------------------------------ *
 * 2. DOM helpers
 * ------------------------------------------------------------------ */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Create an HTML element. attrs: {class, text, html, style:{}, on:{}, ...} */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  applyAttrs(node, attrs);
  append(node, children);
  return node;
}

/** Create an SVG element in the correct namespace. */
export function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  applyAttrs(node, attrs, true);
  append(node, children);
  return node;
}

function applyAttrs(node, attrs, isSvg) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'class') node.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (!isSvg && k in node && k !== 'list' && typeof v !== 'object') node[k] = v;
    else node.setAttribute(k, v);
  }
}

function append(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

/* ------------------------------------------------------------------ *
 * 3. Number formatting
 * ------------------------------------------------------------------ */

/** Fixed-width friendly number. fmt(9.806, 2) -> "9.81" */
export function fmt(x, dp = 2) {
  if (!isFinite(x)) return '—';
  return x.toFixed(dp);
}

/** Scientific notation with a proper times sign. sci(6.626e-34, 3) -> "6.626 × 10⁻³⁴" */
export function sci(x, sig = 3) {
  if (x === 0) return '0';
  if (!isFinite(x)) return '—';
  const e = Math.floor(Math.log10(Math.abs(x)));
  const m = x / Math.pow(10, e);
  return `${m.toFixed(sig)} × 10${sup(e)}`;
}

const SUPS = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export function sup(n) { return String(n).split('').map(c => SUPS[c] ?? c).join(''); }

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/* ------------------------------------------------------------------ *
 * 4. Controls
 *    Each returns { node, get(), set(v), el } so a sim can read state
 *    without keeping its own parallel copy.
 * ------------------------------------------------------------------ */

let uid = 0;
const nextId = () => `ibs${++uid}`;

/**
 * An inline control: symbol, track, value, all on one line.
 *
 * `label` is HTML so the physics symbol can be set in serif italics the
 * way it is printed in a textbook: 'θ<sub>0</sub>', '<i>L</i>'. Pass
 * `word: true` for a plain-language label such as "sim speed".
 */
export function slider({ label, min, max, step = 'any', value, unit = '',
                         format, onInput, disabled, word = false }) {
  const id = nextId();
  const show = format || (v => `${fmt(v, decimals(step))}${unit ? ' ' + unit : ''}`);
  const out = el('span', { class: 'ibs-ctl__val', text: show(value) });
  const input = el('input', {
    class: 'ibs-range', type: 'range', id,
    min, max, step, value, disabled: !!disabled,
    on: { input: () => { out.textContent = show(+input.value); onInput && onInput(+input.value); } },
  });
  const node = el('div', { class: 'ibs-ctl' }, [
    el('label', { class: 'ibs-ctl__sym' + (word ? ' ibs-ctl__sym--word' : ''),
                  htmlFor: id, html: label }),
    input, out,
  ]);
  return {
    node, el: input,
    get: () => +input.value,
    set(v) { input.value = v; out.textContent = show(+input.value); },
    /* a control whose sensible range depends on the arrangement — the distance
     * from a barrier that has to stay on the drawing, say — can move its ends,
     * carrying the handle with it rather than leaving it outside the track */
    setRange(lo, hi) {
      input.min = lo; input.max = hi;
      const v = +input.value;
      if (v < lo) this.set(lo); else if (v > hi) this.set(hi);
      return +input.value;
    },
    disable(d) { input.disabled = !!d; },
  };
}

function decimals(step) {
  if (step === 'any') return 2;
  const s = String(step);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

export function button({ label, onClick, pressed, title }) {
  const b = el('button', {
    class: 'ibs-btn',
    type: 'button', title,
    'aria-pressed': pressed === undefined ? null : String(!!pressed),
    text: label,
    on: { click: () => onClick && onClick(b) },
  });
  return {
    node: b, el: b,
    setLabel(t) { b.textContent = t; },
    setPressed(p) { b.setAttribute('aria-pressed', String(!!p)); },
    disable(d) { b.disabled = !!d; },
  };
}

export function toggle({ label, checked = false, onChange }) {
  const input = el('input', {
    type: 'checkbox', checked,
    on: { change: () => onChange && onChange(input.checked) },
  });
  const node = el('label', { class: 'ibs-check' }, [input, el('span', { text: label })]);
  return { node, el: input, get: () => input.checked, set(v) { input.checked = !!v; } };
}

export function select({ label, options, value, onChange }) {
  const id = nextId();
  const sel = el('select', {
    class: 'ibs-select', id,
    on: { change: () => onChange && onChange(sel.value) },
  }, options.map(o => el('option', {
    value: o.value ?? o, text: o.label ?? o, selected: (o.value ?? o) === value,
  })));
  const node = el('div', { class: 'ibs-ctl' }, [
    label ? el('label', { class: 'ibs-ctl__sym ibs-ctl__sym--word', htmlFor: id, html: label }) : null,
    sel,
  ]);
  return { node, el: sel, get: () => sel.value, set(v) { sel.value = v; } };
}

/**
 * The readout grid. Every number a simulation produces belongs here, in
 * two tinted columns under the drawing, and not written on top of the
 * apparatus: a diagram stays readable only while it is a diagram.
 *
 * `label` is HTML, so a key can be printed the way it appears in the
 * data booklet: '<i>ω</i><sub>0</sub> = √(<i>g</i>/<i>L</i>)'.
 */
export function readouts(items, { columns = 2 } = {}) {
  const cells = {};
  const node = el('div', { class: 'ibs-reads' }, items.map(it => {
    const v = el('div', { class: 'v', text: it.value ?? '—' });
    cells[it.key] = v;
    return el('div', { class: 'ibs-rd' }, [el('div', { class: 'k', html: it.label }), v]);
  }));
  if (columns !== 2) node.style.gridTemplateColumns = `repeat(${columns},1fr)`;
  return {
    node,
    set(key, text) { if (cells[key]) cells[key].textContent = text; },
    setAll(obj) { for (const [k, v] of Object.entries(obj)) this.set(k, v); },
  };
}

/** a bordered strip of controls, as one row of the control stack */
export function controls(children, { label } = {}) {
  const kids = Array.isArray(children) ? children : [children];
  return el('div', { class: 'ibs-controls' },
    (label ? [el('span', { class: 'ibs-controls__label', html: label })] : []).concat(kids));
}

/** kept for compatibility with sims written against the earlier kit */
export function panel(children) { return controls(children); }

/** a canvas (or anything else) under a teal title bar */
export function panelBox(title, children) {
  const kids = Array.isArray(children) ? children : [children];
  return el('div', { class: 'ibs-panel' },
    [el('h3', { class: 'ibs-panel__title', html: title })].concat(kids));
}

/** the simulation's own heading: teal title, rule beneath, plain subtitle */
export function heading(title, subtitle) {
  return el('div', { class: 'ibs-head' }, [
    el('h3', { html: title }),
    subtitle ? el('span', { html: subtitle }) : null,
  ]);
}

export function note(html) {
  return el('div', { class: 'ibs-note', html });
}

/* ------------------------------------------------------------------ *
 * 5. Animation loop
 *    Pauses when the sim scrolls out of view so 25 sims on one page
 *    never fight for frames. Respects prefers-reduced-motion by
 *    starting paused unless the sim opts out.
 * ------------------------------------------------------------------ */

export function loop(step, { element, autoStart = true, maxDt = 0.05 } = {}) {
  let raf = 0, last = 0;
  let running = false;      // is a frame actually scheduled
  let visible = true;       // is the sim on screen
  let wanted = autoStart;   // has the caller asked it to run

  function frame(t) {
    if (!running) return;
    const dt = last ? Math.min((t - last) / 1000, maxDt) : 0;
    last = t;
    step(dt, t / 1000);
    raf = requestAnimationFrame(frame);
  }
  function rawStart() {
    if (running || !visible) return;
    running = true; last = 0; raf = requestAnimationFrame(frame);
  }
  function rawStop() { running = false; cancelAnimationFrame(raf); raf = 0; }

  // Pause while scrolled out of view, and resume on the way back, so a page
  // holding several simulations only animates the ones being looked at.
  // The observer drives the raw start/stop, never the public ones, otherwise
  // going offscreen would clear the caller's intent and it would never resume.
  let io = null;
  if (element && typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver(entries => {
      visible = entries[entries.length - 1].isIntersecting;
      if (!visible) rawStop();
      else if (wanted) rawStart();
    }, { threshold: 0 });
    io.observe(element);
  }

  const api = {
    start() { wanted = true; rawStart(); },
    stop() { wanted = false; rawStop(); },
    /** what the caller asked for, which is what a Play/Pause button should show */
    get running() { return wanted; },
    /** whether frames are actually being scheduled right now */
    get active() { return running; },
    toggle() { wanted ? api.stop() : api.start(); return wanted; },
    destroy() { wanted = false; rawStop(); if (io) io.disconnect(); },
  };

  if (autoStart) api.start();
  return api;
}

export const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ *
 * 6. Plot — a small responsive SVG graphing surface
 *    Data coordinates in, screen coordinates out. No library needed.
 * ------------------------------------------------------------------ */

export class Plot {
  /**
   * @param {object} o
   * @param {number} o.width,o.height   viewBox size (the SVG scales to fit)
   * @param {[number,number]} o.xDomain,o.yDomain
   * @param {string} o.xLabel,o.yLabel
   * @param {object} o.pad  {l,r,t,b}
   */
  constructor(o = {}) {
    this.w = o.width ?? 420;
    this.h = o.height ?? 220;
    this.pad = Object.assign({ l: 46, r: 14, t: 26, b: 34 }, o.pad);
    this.xDomain = o.xDomain ?? [0, 1];
    this.yDomain = o.yDomain ?? [0, 1];
    this.svg = svg('svg', {
      viewBox: `0 0 ${this.w} ${this.h}`,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': o.ariaLabel || `${o.yLabel || 'y'} against ${o.xLabel || 'x'}`,
    });
    this.gGrid = svg('g');
    this.gData = svg('g');
    this.gOver = svg('g');
    /* Data is clipped to the plot area. Without this a curve that runs off the
       top of the domain — a resonance peak drawn for a sharper Q than the axis
       was scaled for — escapes the frame and draws over whatever is above it.
       Overlays are NOT clipped, because handles and corner notes are meant to
       sit out in the margin. */
    this.clipId = 'ibs-clip-' + nextId();
    this.clipRect = svg('rect', { x: 0, y: 0, width: 1, height: 1 });
    this.svg.append(
      svg('defs', {}, [svg('clipPath', { id: this.clipId }, [this.clipRect])]),
      this.gGrid, this.gData, this.gOver
    );
    this.gData.setAttribute('clip-path', `url(#${this.clipId})`);
    this.xLabel = o.xLabel || '';
    this.yLabel = o.yLabel || '';
    this.xTicks = o.xTicks ?? 5;
    this.xTickLabels = o.xTickLabels !== false;
    this.yTicks = o.yTicks ?? 4;
    this.tickFmt = o.tickFmt || (v => (Math.abs(v) >= 1000 || (v !== 0 && Math.abs(v) < 0.01) ? sci(v, 1) : fmt(v, decimalsFor(v))));
    this.drawAxes();
  }

  get plotW() { return this.w - this.pad.l - this.pad.r; }
  get plotH() { return this.h - this.pad.t - this.pad.b; }

  X(v) {
    const [a, b] = this.xDomain;
    return this.pad.l + ((v - a) / (b - a)) * this.plotW;
  }
  Y(v) {
    const [a, b] = this.yDomain;
    return this.pad.t + this.plotH - ((v - a) / (b - a)) * this.plotH;
  }
  /** inverse: screen x -> data x */
  invX(px) {
    const [a, b] = this.xDomain;
    return a + ((px - this.pad.l) / this.plotW) * (b - a);
  }
  /** inverse: screen y -> data y */
  invY(py) {
    const [a, b] = this.yDomain;
    return a + ((this.pad.t + this.plotH - py) / this.plotH) * (b - a);
  }

  setDomain(xDomain, yDomain) {
    if (xDomain) this.xDomain = xDomain;
    if (yDomain) this.yDomain = yDomain;
    this.drawAxes();
  }

  /**
   * Match the viewBox to the width the plot is actually rendered at.
   *
   * SVG text is measured in viewBox units, so a plot authored at 1120 units
   * and rendered into a 400 px phone column draws its labels at a third of
   * their intended size. Re-laying the plot out at the real width keeps one
   * unit equal to one CSS pixel, so type, handles and line weights stay the
   * size they were designed at, at every width.
   */
  setSize(w, h) {
    const nw = Math.max(220, Math.round(w));
    const nh = Math.max(80, Math.round(h ?? this.h));
    if (nw === this.w && nh === this.h) return false;
    this.w = nw; this.h = nh;
    this.svg.setAttribute('viewBox', `0 0 ${nw} ${nh}`);
    this.drawAxes();
    return true;
  }

  drawAxes() {
    this.gGrid.replaceChildren();
    const { l, t, b } = this.pad;
    if (this.clipRect) {
      this.clipRect.setAttribute('x', l);
      this.clipRect.setAttribute('y', t);
      this.clipRect.setAttribute('width', Math.max(1, this.plotW));
      this.clipRect.setAttribute('height', Math.max(1, this.plotH));
    }
    const x0 = this.X(clampToDomain(0, this.xDomain));
    const y0 = this.Y(clampToDomain(0, this.yDomain));

    for (let i = 0; i <= this.yTicks; i++) {
      const v = lerp(this.yDomain[0], this.yDomain[1], i / this.yTicks);
      const y = this.Y(v);
      this.gGrid.append(
        svg('line', { class: 'ibs-gridline', x1: l, x2: l + this.plotW, y1: y, y2: y }),
        svg('text', { class: 'ibs-tick', x: l - 6, y: y + 3.5, 'text-anchor': 'end', text: this.tickFmt(v) })
      );
    }
    for (let i = 0; i <= this.xTicks; i++) {
      const v = lerp(this.xDomain[0], this.xDomain[1], i / this.xTicks);
      const x = this.X(v);
      this.gGrid.append(svg('line', { class: 'ibs-gridline', x1: x, x2: x, y1: t, y2: t + this.plotH }));
      if (this.xTickLabels) this.gGrid.append(
        svg('text', { class: 'ibs-tick', x, y: t + this.plotH + 14, 'text-anchor': 'middle', text: this.tickFmt(v) })
      );
    }
    // axes drawn through zero when zero is inside the domain, inside an outer
    // frame so a Plot reads the same as a Recorder trace
    this.gGrid.append(
      svg('rect', { x: l, y: t, width: this.plotW, height: this.plotH,
                    fill: 'none', stroke: 'var(--ibs-frame)', 'stroke-width': 1 }),
      svg('line', { class: 'ibs-axis-line', x1: l, x2: l + this.plotW, y1: y0, y2: y0, 'stroke-width': 1.4 }),
      svg('line', { class: 'ibs-axis-line', x1: x0, x2: x0, y1: t, y2: t + this.plotH, 'stroke-width': 1.4 })
    );
    if (this.xLabel) this.gGrid.append(svg('text', {
      class: 'ibs-axis-title', x: l + this.plotW, y: this.h - 4, 'text-anchor': 'end', text: this.xLabel,
    }));
    if (this.yLabel) this.gGrid.append(svg('text', {
      class: 'ibs-axis-title', x: 4, y: t - 11, 'text-anchor': 'start', text: this.yLabel,
    }));
  }

  clear() { this.gData.replaceChildren(); }
  clearOverlay() { this.gOver.replaceChildren(); }

  /** points: [[x,y],...] in data coordinates */
  line(points, { color = 'var(--ibs-accent)', width = 2, dash, opacity = 1, layer } = {}) {
    if (!points.length) return null;
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${this.X(p[0]).toFixed(2)},${this.Y(p[1]).toFixed(2)}`).join('');
    const path = svg('path', {
      d, fill: 'none', stroke: color, 'stroke-width': width,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      'stroke-dasharray': dash, opacity,
    });
    (layer === 'over' ? this.gOver : this.gData).appendChild(path);
    return path;
  }

  /** filled area between the curve and a baseline y value */
  area(points, { color = 'var(--ibs-accent)', opacity = 0.14, baseline = 0, layer } = {}) {
    if (!points.length) return null;
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${this.X(p[0]).toFixed(2)},${this.Y(p[1]).toFixed(2)}`).join('')
      + `L${this.X(points[points.length - 1][0]).toFixed(2)},${this.Y(baseline).toFixed(2)}`
      + `L${this.X(points[0][0]).toFixed(2)},${this.Y(baseline).toFixed(2)}Z`;
    const path = svg('path', { d, fill: color, opacity, stroke: 'none' });
    (layer === 'over' ? this.gOver : this.gData).appendChild(path);
    return path;
  }

  dot(x, y, { color = 'var(--ibs-accent)', r = 4, layer = 'over' } = {}) {
    const c = svg('circle', {
      cx: this.X(x), cy: this.Y(y), r, fill: color,
      stroke: 'var(--ibs-bg)', 'stroke-width': 1.5,
    });
    (layer === 'over' ? this.gOver : this.gData).appendChild(c);
    return c;
  }

  vline(x, { color = 'var(--ibs-muted)', dash = '4 3', label, layer = 'over' } = {}) {
    const g = svg('g');
    g.append(svg('line', {
      x1: this.X(x), x2: this.X(x), y1: this.pad.t, y2: this.pad.t + this.plotH,
      stroke: color, 'stroke-width': 1.2, 'stroke-dasharray': dash,
    }));
    if (label) g.append(svg('text', {
      x: this.X(x) + 4, y: this.pad.t + 10, class: 'ibs-tick', fill: color, text: label,
    }));
    (layer === 'over' ? this.gOver : this.gData).appendChild(g);
    return g;
  }

  text(x, y, str, { color = 'var(--ibs-muted)', anchor = 'start', dx = 0, dy = 0, size, weight, layer = 'over' } = {}) {
    const t = svg('text', {
      x: this.X(x) + dx, y: this.Y(y) + dy, fill: color, 'text-anchor': anchor,
      'font-size': size, 'font-weight': weight, text: str,
    });
    (layer === 'over' ? this.gOver : this.gData).appendChild(t);
    return t;
  }
}

function decimalsFor(v) {
  const a = Math.abs(v);
  if (a === 0) return 0;
  if (a >= 100) return 0;
  if (a >= 10) return 1;
  if (a >= 1) return 1;
  return 2;
}
function clampToDomain(v, [a, b]) { return clamp(v, Math.min(a, b), Math.max(a, b)); }

/* ------------------------------------------------------------------ *
 * 7. Pointer dragging on an SVG surface
 *    Converts pointer events to viewBox coordinates and handles
 *    capture + cleanup. Returns an unbind function.
 * ------------------------------------------------------------------ */

export function draggable(svgEl, { onStart, onMove, onEnd, cursor = 'grab' } = {}) {
  svgEl.style.cursor = cursor;
  let active = false;

  const toLocal = e => {
    const r = svgEl.getBoundingClientRect();
    const vb = svgEl.viewBox.baseVal;
    const sx = vb && vb.width ? vb.width / r.width : 1;
    const sy = vb && vb.height ? vb.height / r.height : 1;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  };

  const down = e => {
    active = true;
    svgEl.setPointerCapture(e.pointerId);
    svgEl.style.cursor = 'grabbing';
    onStart && onStart(toLocal(e), e);
    e.preventDefault();
  };
  const move = e => {
    const p = toLocal(e);
    if (active) { onMove && onMove(p, e); e.preventDefault(); }
    else if (onMove && onMove.hover) onMove.hover(p, e);
  };
  const up = e => {
    if (!active) return;
    active = false;
    try { svgEl.releasePointerCapture(e.pointerId); } catch (_) {}
    svgEl.style.cursor = cursor;
    onEnd && onEnd(toLocal(e), e);
  };

  svgEl.addEventListener('pointerdown', down);
  svgEl.addEventListener('pointermove', move);
  svgEl.addEventListener('pointerup', up);
  svgEl.addEventListener('pointercancel', up);

  return () => {
    svgEl.removeEventListener('pointerdown', down);
    svgEl.removeEventListener('pointermove', move);
    svgEl.removeEventListener('pointerup', up);
    svgEl.removeEventListener('pointercancel', up);
  };
}

/* ------------------------------------------------------------------ *
 * 8. Root builder
 *    Creates the scoped root element every sim lives inside, and a
 *    disposer that guarantees full teardown.
 * ------------------------------------------------------------------ */

/**
 * Build the scoped root every simulation lives inside.
 *
 * theme:  omitted or 'light'  ->  always light, whatever the visitor's device
 *         'dark'              ->  always dark
 *         'auto'              ->  follows the device's prefers-color-scheme
 *
 * Light is the default because a simulation is a diagram: it should look the
 * same for every student, and match the page it sits on rather than the
 * operating system it happens to be opened on.
 */
export function createRoot(container, { id, title, theme, shadow = false } = {}) {
  let host = container;

  if (shadow && typeof container.attachShadow === 'function') {
    // Hard isolation: nothing in the host stylesheet can reach in, not even
    // !important rules. CSS custom properties still inherit through, so
    // --ibs-accent and friends keep working for theming.
    const sh = container.shadowRoot || container.attachShadow({ mode: 'open' });
    sh.replaceChildren();
    const st = document.createElement('style');
    st.textContent = BASE_CSS;
    sh.appendChild(st);
    host = sh;
  } else {
    injectStyles();
  }

  const root = el('div', {
    class: 'ibs',
    dataset: { ibsSim: id || 'sim' },
    role: 'group',
    'aria-label': title || 'Physics simulation',
  });
  if (theme !== 'auto') root.setAttribute('data-ibs-theme', theme === 'dark' ? 'dark' : 'light');
  host.appendChild(root);

  const disposers = [];
  return {
    root,
    /** register anything that must be undone on destroy */
    onDestroy(fn) { disposers.push(fn); },
    destroy() {
      for (const fn of disposers.splice(0).reverse()) { try { fn(); } catch (_) {} }
      root.remove();
    },
  };
}

/**
 * Keep SVG text at a constant physical size however the sim is scaled.
 * Call from redraw with the plot's viewBox width and its rendered element.
 */
export function textScale(root, viewBoxWidth, el, max = 1.55) {
  const w = (el && el.clientWidth) || viewBoxWidth;
  const k = clamp(viewBoxWidth / w, 1, max);
  root.style.setProperty('--ibs-tscale', k.toFixed(3));
  return k;
}

/* ------------------------------------------------------------------ *
 * 9. Canvas rendering
 *    Simulations that draw a physical apparatus use canvas rather than
 *    SVG: gradients, shading and hundreds of trail points are cheap, and
 *    a chart recorder redrawn every frame stays at 60fps.
 *
 *    A surface has FIXED logical coordinates. It scales to the container
 *    width and the device pixel ratio underneath, so drawing code never
 *    deals with either, and lines stay sharp on a retina screen.
 * ------------------------------------------------------------------ */

export function surface(logicalW, logicalH, opts = {}) {
  const el = document.createElement('canvas');
  el.className = 'ibs-canvas';
  if (opts.label) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', opts.label); }
  const ctx = el.getContext('2d');
  let scale = 1, LW = logicalW, LH = logicalH;

  function fit() {
    const cw = el.clientWidth || LW;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    scale = cw / LW;
    el.width = Math.max(1, Math.round(cw * dpr));
    el.height = Math.max(1, Math.round(LH * scale * dpr));
    el.style.height = (LH * scale) + 'px';
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    return scale;
  }
  /** pointer position in logical coordinates */
  function at(e) {
    const r = el.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (LW / r.width),
             y: (e.clientY - r.top) * (LW / r.width) };
  }
  /**
   * Change the logical coordinate system.
   *
   * An apparatus drawing should scale as a whole, so most surfaces keep the
   * size they were built with. A surface that is mostly a numeric scale — a
   * track with metre markings, say — wants one logical unit to stay one CSS
   * pixel instead, so its labels do not shrink to nothing on a phone.
   */
  function setLogical(w, h) {
    LW = Math.max(120, Math.round(w));
    if (h != null) LH = Math.max(60, Math.round(h));
  }
  return {
    el, ctx, fit, at, setLogical,
    get w() { return LW; }, get h() { return LH; },
    get scale() { return scale; },
  };
}

/** read the live theme tokens so canvas drawing follows the CSS variables */
/**
 * Read the live theme tokens so canvas drawing follows the CSS variables.
 *
 * The palette is three colours: accent, text, ground, plus two tints of
 * the accent. There is deliberately no second hue. On a physics diagram a
 * colour is read as a meaning, so a drawing with five of them asks the
 * reader to decode a key before they can look at the apparatus.
 */
export function palette(root) {
  const cs = getComputedStyle(root);
  const g = n => cs.getPropertyValue('--ibs-' + n).trim();
  const accent = g('accent') || '#005F6A';
  const text = g('text') || '#000';
  return {
    bg: g('bg') || '#fff',
    text, muted: g('muted') || 'rgba(0,0,0,.55)',
    accent, soft: g('accent-soft'), line: g('accent-line'),
    frame: g('frame') || 'rgba(0,0,0,.15)',
    font: g('font') || 'sans-serif',
    serif: g('serif') || 'Georgia, serif',
    mono: g('mono') || 'monospace',
    /** italic serif, the way physics symbols are set in print */
    sym: (size, weight = 600) => `italic ${weight} ${size}px ${g('serif') || 'Georgia, serif'}`,
  };
}

/** arrow with a solid head; returns false if too short to draw meaningfully */
export function carrow(ctx, x1, y1, x2, y2, o = {}) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < (o.min ?? 2)) return false;
  const w = o.width ?? 2.4, head = Math.min(o.head ?? 9, len * 0.7);
  const ux = dx / len, uy = dy / len;
  ctx.save();
  ctx.strokeStyle = o.color; ctx.fillStyle = o.color;
  ctx.lineWidth = w; ctx.lineCap = 'round';
  if (o.dash) ctx.setLineDash(o.dash);
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2 - ux * head * 0.6, y2 - uy * head * 0.6); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * ux - head * 0.42 * uy, y2 - head * uy + head * 0.42 * ux);
  ctx.lineTo(x2 - head * ux + head * 0.42 * uy, y2 - head * uy - head * 0.42 * ux);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  return true;
}

/** hatched block, for walls, floors and clamps */
export function chatch(ctx, x, y, w, h, o = {}) {
  const gap = o.gap ?? 9, len = o.len ?? 11, side = o.side ?? 'bottom';
  ctx.save();
  ctx.strokeStyle = o.color; ctx.lineWidth = o.width ?? 1.2;
  ctx.beginPath();
  if (side === 'bottom') {
    ctx.moveTo(x, y); ctx.lineTo(x + w, y);
    for (let i = x; i <= x + w; i += gap) { ctx.moveTo(i, y); ctx.lineTo(i - len * 0.7, y + len); }
  } else {                                  // left-hand wall
    ctx.moveTo(x, y); ctx.lineTo(x, y + h);
    for (let i = y; i <= y + h; i += gap) { ctx.moveTo(x, i); ctx.lineTo(x - len, i + len * 0.7); }
  }
  ctx.stroke(); ctx.restore();
}

/** text with an optional halo so it stays readable over any drawing */
export function ctext(ctx, str, x, y, o = {}) {
  ctx.save();
  ctx.font = o.font || '12px sans-serif';
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.baseline || 'alphabetic';
  if (o.halo) { ctx.strokeStyle = o.halo; ctx.lineWidth = o.haloWidth ?? 3.5;
                ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
  ctx.fillStyle = o.color || '#000';
  ctx.fillText(str, x, y);
  ctx.restore();
}

/** rounded rectangle path, for older engines without roundRect */
export function croundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** annotation box with a leader line to the thing it is describing */
export function callout(ctx, lines, x, y, tx, ty, o = {}) {
  const P = o.palette, f = `500 11.5px ${P.font}`;
  ctx.save();
  ctx.font = f;
  let w = 0;
  for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
  const h = lines.length * 15 + 12, bw = w + 16;
  ctx.strokeStyle = o.line || P.accent; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + bw / 2, y + h / 2); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.globalAlpha = 1;
  croundRect(ctx, x, y, bw, h, 7);
  ctx.fillStyle = P.bg; ctx.fill();
  ctx.strokeStyle = o.line || P.accent; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = P.text; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  lines.forEach((l, i) => ctx.fillText(l, x + 8, y + 17 + i * 15));
  ctx.beginPath(); ctx.arc(tx, ty, 3, 0, Math.PI * 2);
  ctx.fillStyle = o.line || P.accent; ctx.fill();
  ctx.restore();
}

/**
 * Chart recorder: a scrolling trace drawn left to right, sliding once the
 * window fills, exactly like a pen recorder. Handles its own axes, grid,
 * autoscaling and pen dot.
 */
export class Recorder {
  constructor(surf, o = {}) {
    this.s = surf;
    this.window = o.window ?? 12;              // seconds visible
    this.xLabel = o.xLabel || 't / s';
    this.yLabel = o.yLabel || '';
    this.pad = Object.assign({ l: 54, r: 14, t: 16, b: 34 }, o.pad);
    this.series = [];                          // {name, color, data:[[t,y]], dash, width}
    this.yMin = o.yMin;                        // fixed domain, or undefined to autoscale
    this.yMax = o.yMax;
    this.minSpan = o.minSpan ?? 1e-9;
    this.symmetric = o.symmetric !== false;
  }
  /** colour may be a literal, or a palette key such as 'accent' or 'c2',
   *  which is resolved at draw time so the trace follows the theme */
  add(name, color, o = {}) {
    const s = { name, color, data: [], dash: o.dash, width: o.width ?? 2, hidden: false };
    this.series.push(s);
    return s;
  }
  push(t, values) {
    this.series.forEach((s, i) => {
      if (values[i] == null) return;
      s.data.push([t, values[i]]);
      const cut = t - this.window * 1.3;
      while (s.data.length && s.data[0][0] < cut) s.data.shift();
    });
  }
  clear() { this.series.forEach(s => { s.data.length = 0; }); }

  /**
   * Drawn to match a laboratory chart recorder and nothing else: a thin
   * frame, a dashed zero line, faint gridlines on absolute seconds, the
   * trace in brand teal and a black pen dot at its tip. Axis titles are
   * set in italic serif, the way they are printed on a graph.
   */
  draw(t, P) {
    const { ctx, w, h } = this.s, p = this.pad;
    const X0 = p.l, X1 = w - p.r, Y0 = p.t, Y1 = h - p.b, PH = Y1 - Y0;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);

    let lo = this.yMin, hi = this.yMax;
    if (lo == null || hi == null) {
      let m = this.minSpan;
      for (const s of this.series) for (const d of s.data) m = Math.max(m, Math.abs(d[1]));
      m *= 1.15;
      lo = -m; hi = m;
    }
    const t0 = Math.max(0, t - this.window);
    const TX = u => X0 + (u - t0) / this.window * (X1 - X0);
    const TY = v => Y1 - (v - lo) / (hi - lo) * PH;

    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(X0, Y0, X1 - X0, PH);
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(X0, TY(0)); ctx.lineTo(X1, TY(0)); ctx.stroke();
    ctx.restore();

    // gridlines on absolute seconds, so the grid slides with the record
    ctx.font = `500 9.5px ${P.font}`; ctx.fillStyle = P.muted;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let u = Math.ceil(t0 / 2) * 2; u <= t0 + this.window + 1e-9; u += 2) {
      const gx = TX(u);
      if (gx < X0 - 0.5 || gx > X1 + 0.5) continue;
      if (gx > X0 + 0.5 && gx < X1 - 0.5) {
        ctx.strokeStyle = P.line;
        ctx.beginPath(); ctx.moveTo(gx, Y0); ctx.lineTo(gx, Y1); ctx.stroke();
      }
      ctx.fillText(u.toFixed(0), gx, Y1 + 4);
    }

    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('+' + hi.toPrecision(2), X0 - 5, Y0 + 5);
    ctx.fillText('0', X0 - 5, TY(0));
    ctx.fillText(lo.toPrecision(2).replace('-', '\u2212'), X0 - 5, Y1 - 5);

    ctx.fillStyle = P.text; ctx.font = P.sym(12);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(this.xLabel, (X0 + X1) / 2, Y1 + 30);
    ctx.save();
    ctx.translate(12, (Y0 + Y1) / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(this.yLabel, 0, 0);
    ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.rect(X0, Y0 - 2, X1 - X0, PH + 4); ctx.clip();
    for (const s of this.series) {
      if (s.hidden || s.data.length < 2) continue;
      ctx.strokeStyle = P[s.color] || s.color; ctx.lineWidth = s.width;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (s.dash) ctx.setLineDash(s.dash); else ctx.setLineDash([]);
      ctx.beginPath();
      let started = false;
      for (const d of s.data) {
        const gx = TX(d[0]);
        if (gx < X0 - 4) continue;
        started ? ctx.lineTo(gx, TY(d[1])) : ctx.moveTo(gx, TY(d[1]));
        started = true;
      }
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();

    // the pen, on the leading series only
    const lead = this.series.find(s => !s.hidden && s.data.length);
    if (lead) {
      const d = lead.data[lead.data.length - 1];
      ctx.fillStyle = P.text;
      ctx.beginPath(); ctx.arc(TX(d[0]), TY(d[1]), 3.6, 0, Math.PI * 2); ctx.fill();
    }
    return { X0, X1, Y0, Y1, TX, TY, lo, hi };
  }
}

/* ------------------------------------------------------------------ *
 * 10. Label placement
 *     Vector labels want to sit at the tip of the arrow they belong to,
 *     but arrows converge: near a pendulum's turning point the weight,
 *     its tangential component and the velocity all point much the same
 *     way, and three labels land on top of one another. Nudging each one
 *     by hand only moves the problem to a different configuration, so
 *     placement is done once, at draw time, against what has already
 *     been placed this frame.
 * ------------------------------------------------------------------ */

export class Labels {
  /** @param bounds {x0,y0,x1,y1} the region labels must stay inside */
  constructor(ctx, bounds) { this.ctx = ctx; this.bounds = bounds; this.boxes = []; }
  reset(bounds) { this.boxes.length = 0; if (bounds) this.bounds = bounds; }

  /** reserve a region that is not a label: a bob, a block, a bracket.
   *  Labels are then placed around the drawing, not only around each other. */
  block(x0, y0, x1, y1) { this.boxes.push({ x0, y0, x1, y1 }); }

  /**
   * Place one label as close to (x, y) as it can go without touching any
   * label already placed this frame. If it has to move more than a little,
   * a hairline leader is drawn back to the point it describes, so the
   * label never becomes ambiguous.
   */
  add(str, x, y, o = {}) {
    const ctx = this.ctx, font = o.font || '12px sans-serif';
    ctx.save(); ctx.font = font;
    const tw = ctx.measureText(str).width;
    ctx.restore();
    const align = o.align || 'left', pad = 3, h = 15;
    const left = a => a === 'center' ? -tw / 2 - pad : a === 'right' ? -tw - pad : -pad;
    const bw = tw + pad * 2;
    const b = this.bounds;

    const boxAt = yy => {
      let x0 = x + left(align);
      x0 = Math.min(Math.max(x0, b.x0), b.x1 - bw);         // keep it on the canvas
      return { x0, y0: yy - 11, x1: x0 + bw, y1: yy + 4 };
    };
    const hits = q => this.boxes.some(p =>
      q.x0 < p.x1 + 2 && q.x1 > p.x0 - 2 && q.y0 < p.y1 + 2 && q.y1 > p.y0 - 2);

    // try the preferred spot, then step away from it, alternating sides so a
    // label is never pushed far in one direction when the other side is free
    const order = [0];
    for (let i = 1; i <= 7; i++) { order.push(i * 16, -i * 16); }
    if (o.prefer === 'up') order.sort((p, q) => (p > 0) - (q > 0));

    let box = null, dy = 0;
    for (const d of order) {
      const yy = y + d;
      if (yy - 11 < b.y0 || yy + 4 > b.y1) continue;
      const cand = boxAt(yy);
      if (!hits(cand)) { box = cand; dy = d; break; }
    }
    if (!box) { box = boxAt(clamp(y, b.y0 + 11, b.y1 - 4)); dy = box.y0 + 11 - y; }
    this.boxes.push(box);

    const bx = box.x0 + pad, by = box.y0 + 11;
    const drawX = align === 'center' ? bx + tw / 2 : align === 'right' ? bx + tw : bx;

    if (Math.abs(dy) > 6 || Math.abs(box.x0 - (x + left(align))) > 6) {
      // a leader back to the point, so a displaced label still reads clearly
      const ax = o.ax != null ? o.ax : x, ay = o.ay != null ? o.ay : y;
      const tx = clamp(ax, box.x0, box.x1);
      const ty = ay < box.y0 ? box.y0 : ay > box.y1 ? box.y1 : ay;
      ctx.save();
      ctx.strokeStyle = o.color || '#888'; ctx.globalAlpha = 0.45; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.restore();
    }
    ctext(ctx, str, drawX, by, { font, color: o.color, align, halo: o.halo });
    return box;
  }
}

export const KIT_VERSION = '3.0.0';
export { BASE_CSS };
