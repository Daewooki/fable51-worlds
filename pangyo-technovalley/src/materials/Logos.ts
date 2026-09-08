// Canvas text primitives and the logo registry used by Signage.ts. Everything is drawn with canvas paths/text (no images).
// A logo is a LogoDef: colours, a natural aspect (w/h; omitted = fill the sign) and a draw(c) that paints into c.box.

export type Ctx = CanvasRenderingContext2D;
export interface Box { x: number; y: number; w: number; h: number }
export interface TextStyle {
  font?: string; weight?: string | number; italic?: boolean;
  /** letter spacing in em; when defined text is drawn per-glyph (script fonts should leave it undefined). */
  spacing?: number; upper?: boolean; color?: string;
  outline?: string; outlineW?: number; align?: 'left' | 'center' | 'right';
  /** max glyph height as a fraction of the box height (default 1). */
  maxH?: number; /** explicit font size in px (skips fitting). */ size?: number;
  shadow?: string; shadowDx?: number; shadowDy?: number; /** neon-style blur radius in em. */ glow?: number;
}
export interface TextMetrics2 { w: number; asc: number; desc: number }
export interface DrawnText { size: number; w: number; x: number; y: number; chars: number[] }

/** Font stacks (macOS-first, with generic fallbacks). Keys are accepted anywhere a `font` is requested. */
export const FONT: Record<string, string> = {
  serif: 'Georgia, "Times New Roman", Times, serif',
  didot: 'Didot, "Bodoni 72", "Bodoni MT", Georgia, "Times New Roman", serif',
  bodoni: '"Bodoni 72", Didot, "Bodoni MT", Georgia, serif',
  baskerville: 'Baskerville, "Libre Baskerville", Georgia, serif',
  sans: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  futura: 'Futura, "Avenir Next", "Century Gothic", "Helvetica Neue", Helvetica, Arial, sans-serif',
  condensed: '"Arial Narrow", "Helvetica Neue Condensed", "Roboto Condensed", Impact, sans-serif',
  impact: 'Impact, "Arial Black", "Helvetica Neue", sans-serif',
  rounded: '"Arial Rounded MT Bold", "Helvetica Neue", Helvetica, Arial, sans-serif',
  script: '"Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive',
  brush: '"Brush Script MT", "Snell Roundhand", "Segoe Script", cursive',
  optima: 'Optima, "Gill Sans", "Helvetica Neue", Helvetica, sans-serif',
  gill: '"Gill Sans", Optima, "Helvetica Neue", Helvetica, sans-serif',
  copperplate: 'Copperplate, "Copperplate Gothic", Georgia, serif',
  mono: 'Menlo, Consolas, "Courier New", monospace',
};
export function resolveFont(f?: string): string { return f ? (FONT[f] || f) : FONT.sans; }
function fontStr(size: number, s: TextStyle) { return `${s.italic ? 'italic ' : ''}${s.weight ?? 600} ${size}px ${resolveFont(s.font)}`; }

export function measureText(ctx: Ctx, str: string, size: number, s: TextStyle): TextMetrics2 {
  ctx.font = fontStr(size, s);
  const m = ctx.measureText(str);
  let w = m.width;
  if (s.spacing !== undefined) { w = 0; const sp = s.spacing * size; for (const ch of str) w += ctx.measureText(ch).width + sp; w -= sp; }
  return { w, asc: m.actualBoundingBoxAscent, desc: m.actualBoundingBoxDescent };
}
/** Font size at which `str` fits inside `box` (both width and glyph height). */
export function fitTextSize(ctx: Ctx, str: string, box: Box, s: TextStyle): number {
  const ref = 100; const m = measureText(ctx, str, ref, s);
  const hh = Math.max(1, m.asc + m.desc);
  return Math.min(box.w / Math.max(1, m.w), (box.h * (s.maxH ?? 1)) / hh) * ref;
}
/** Draw `str` at an explicit size, centred on (x,y) unless align says otherwise. Returns per-glyph centre x positions. */
export function drawTextAt(ctx: Ctx, str: string, x: number, y: number, size: number, s: TextStyle): DrawnText {
  if (s.upper) str = str.toUpperCase();
  ctx.font = fontStr(size, s); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const m = measureText(ctx, str, size, s);
  const baseY = y + (m.asc - m.desc) / 2;
  const x0 = s.align === 'left' ? x : s.align === 'right' ? x - m.w : x - m.w / 2;
  const perChar = s.spacing !== undefined; const sp = (s.spacing || 0) * size;
  const glyphs = [...str]; const chars: number[] = [];
  { let cx = x0; for (const ch of glyphs) { const cw = ctx.measureText(ch).width; chars.push(cx + cw / 2); cx += cw + sp; } }
  const paint = (dx: number, dy: number, stroke: boolean) => {
    if (!perChar) { stroke ? ctx.strokeText(str, x0 + dx, baseY + dy) : ctx.fillText(str, x0 + dx, baseY + dy); return; }
    let cx = x0 + dx;
    for (const ch of glyphs) { const cw = ctx.measureText(ch).width; stroke ? ctx.strokeText(ch, cx, baseY + dy) : ctx.fillText(ch, cx, baseY + dy); cx += cw + sp; }
  };
  if (s.shadow) { ctx.fillStyle = s.shadow; paint((s.shadowDx ?? 0.04) * size, (s.shadowDy ?? 0.05) * size, false); }
  if (s.outline) { ctx.strokeStyle = s.outline; ctx.lineWidth = (s.outlineW ?? 0.08) * size; ctx.lineJoin = 'round'; ctx.miterLimit = 2; paint(0, 0, true); }
  ctx.fillStyle = s.color || '#111';
  if (s.glow) { ctx.save(); ctx.shadowColor = s.color || '#fff'; ctx.shadowBlur = s.glow * size; paint(0, 0, false); paint(0, 0, false); ctx.restore(); }
  paint(0, 0, false);
  return { size, w: m.w, x: x0, y: baseY, chars };
}
/** Fit + draw `str` centred in `box`. */
export function drawText(ctx: Ctx, str: string, box: Box, s: TextStyle = {}): DrawnText {
  if (s.upper) str = str.toUpperCase();
  const size = s.size ?? fitTextSize(ctx, str, box, s);
  const x = s.align === 'left' ? box.x : s.align === 'right' ? box.x + box.w : box.x + box.w / 2;
  return drawTextAt(ctx, str, x, box.y + box.h / 2, size, { ...s, upper: false });
}
/** Draw several lines sharing one font size (largest that fits every line in its row). */
export function drawLines(ctx: Ctx, lines: string[], box: Box, s: TextStyle = {}, gap = 0.15): DrawnText[] {
  const rowsB = rows(box, ...lines.map(() => 1));
  const size = Math.min(...lines.map((l, i) => fitTextSize(ctx, s.upper ? l.toUpperCase() : l, inset(rowsB[i], 0, gap / 2), s)));
  return lines.map((l, i) => drawText(ctx, l, rowsB[i], { ...s, size }));
}
/** Vertical stack: one glyph per row (blade signs). */
export function drawStack(ctx: Ctx, str: string, box: Box, s: TextStyle = {}): void {
  const g = [...(s.upper ? str.toUpperCase() : str)]; const r = rows(box, ...g.map(() => 1));
  const size = Math.min(...g.map((ch, i) => fitTextSize(ctx, ch === ' ' ? 'I' : ch, inset(r[i], 0.05, 0.12), { ...s, spacing: undefined })));
  g.forEach((ch, i) => { if (ch !== ' ') drawText(ctx, ch, r[i], { ...s, size, spacing: undefined, upper: false }); });
}

// ---- box helpers ------------------------------------------------------------------------------------------
export function fitBox(w: number, h: number, aspect: number, pad = 0): Box {
  const pw = w * (1 - 2 * pad), ph = h * (1 - 2 * pad);
  let cw = pw, ch = pw / aspect; if (ch > ph) { ch = ph; cw = ph * aspect; }
  return { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch };
}
export function inset(b: Box, fx: number, fy = fx): Box { return { x: b.x + b.w * fx, y: b.y + b.h * fy, w: b.w * (1 - 2 * fx), h: b.h * (1 - 2 * fy) }; }
export function rows(b: Box, ...fr: number[]): Box[] { const t = fr.reduce((a, c) => a + c, 0); let y = b.y; return fr.map((f) => { const h = b.h * f / t; const r = { x: b.x, y, w: b.w, h }; y += h; return r; }); }
export function cols(b: Box, ...fr: number[]): Box[] { const t = fr.reduce((a, c) => a + c, 0); let x = b.x; return fr.map((f) => { const w = b.w * f / t; const r = { x, y: b.y, w, h: b.h }; x += w; return r; }); }
/** Run `fn` in a 100 × (100/aspect) unit space fitted inside `region` (uniform scale). */
export function mark(ctx: Ctx, region: Box, aspect: number, fn: (ctx: Ctx) => void): Box {
  const b = fitBox(region.w, region.h, aspect); b.x += region.x; b.y += region.y;
  ctx.save(); ctx.translate(b.x, b.y); ctx.scale(b.w / 100, b.w / 100); fn(ctx); ctx.restore(); return b;
}
export function circle(ctx: Ctx, x: number, y: number, r: number, fill?: string | null, stroke?: string, lw = 1) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill?: string | null, stroke?: string, lw = 1) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
export function star(ctx: Ctx, cx: number, cy: number, ro: number, ri: number, n: number, fill: string, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? ri : ro; const a = rot + (i * Math.PI) / n; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
export function poly(ctx: Ctx, pts: number[][], fill: string) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
export function stroke(ctx: Ctx, pts: number[][], color: string, lw: number, cap: CanvasLineCap = 'round') {
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = cap; ctx.lineJoin = 'round'; ctx.stroke();
}

// ---- logo definitions -------------------------------------------------------------------------------------
export interface LogoCtx {
  ctx: Ctx; box: Box; w: number; h: number; fg: string; bg: string | null; accent: string;
  /** Knock a region out (paint bg colour, or erase when transparent). */ punch: (fn: (ctx: Ctx) => void) => void;
}
export interface LogoDef {
  /** natural content aspect (w/h). Omit to fill the whole padded sign. */ aspect?: number;
  fg: string; bg: string | null; accent?: string; pad?: number; illuminated?: boolean;
  /** brand display name (used for fallbacks / labels). */ name?: string;
  draw: (c: LogoCtx) => void;
}

const T = (c: LogoCtx, s: string, st: TextStyle = {}, b: Box = c.box) => drawText(c.ctx, s, b, { color: c.fg, ...st });
const L = (c: LogoCtx, lines: string[], st: TextStyle = {}, b: Box = c.box, gap?: number) => drawLines(c.ctx, lines, b, { color: c.fg, ...st }, gap);
const rule = (c: LogoCtx, b: Box, color: string, frac = 0.6, thick = 0.08) => { c.ctx.fillStyle = color; c.ctx.fillRect(b.x + b.w * (1 - frac) / 2, b.y + b.h * (0.5 - thick / 2), b.w * frac, Math.max(1, b.h * thick)); };
/** Text-only wordmark definition. */
const wm = (text: string, st: TextStyle, def: Partial<LogoDef> = {}): LogoDef => ({ fg: '#111', bg: null, name: text, ...def, draw: (c) => T(c, text, st) });
/** Two-line wordmark (shared font size unless sizes differ via rows). */
const wm2 = (a: string, sa: TextStyle, b: string, sb: TextStyle, fr: [number, number], def: Partial<LogoDef> = {}): LogoDef => ({
  fg: '#111', bg: null, name: `${a} ${b}`, ...def, draw: (c) => { const [r1, r2] = rows(c.box, fr[0], fr[1]); T(c, a, sa, inset(r1, 0, 0.06)); T(c, b, sb, inset(r2, 0, 0.1)); },
});

const INK = "#111";
/**
 * Logo registry. This world ships no third-party brand marks: only a neutral text wordmark.
 * Add entries here (or via a data file) when a place-specific mark is wanted.
 */
export const LOGOS: Record<string, LogoDef> = {
  generic: { fg: INK, bg: null, name: 'Sign', draw: (c) => T(c, c.ctx.canvas.dataset.text || 'SIGN', { font: 'sans', weight: 600, spacing: 0.06 }) },
};

/** Alternate spellings / names -> logo keys. Keys here are already normalized (lowercase alnum). */
export const ALIASES: Record<string, string> = {};

/** Lowercase, strip accents / parentheticals / punctuation. */
export function normalizeBrand(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\([^)]*\)/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
const KEYS_BY_LEN = Object.keys(LOGOS).filter((k) => k !== 'generic').sort((a, b) => b.length - a.length);
/** Resolve any brand / storefront name to a logo key (null when unknown). */
export function findLogoKey(name: string): string | null {
  const n = normalizeBrand(name); if (!n) return null;
  if (LOGOS[n]) return n; if (ALIASES[n]) return ALIASES[n];
  const t = n.replace(/^the/, ''); if (LOGOS[t]) return t; if (ALIASES[t]) return ALIASES[t];
  for (const k of KEYS_BY_LEN) if (k.length >= 4 && (n.startsWith(k) || t.startsWith(k))) return k;
  for (const a of Object.keys(ALIASES)) if (a.length >= 6 && n.startsWith(a)) return ALIASES[a];
  for (const k of KEYS_BY_LEN) if (k.length >= 5 && n.includes(k)) return k;
  return null;
}
export const LOGO_KEYS = Object.keys(LOGOS).filter((k) => k !== 'generic');
