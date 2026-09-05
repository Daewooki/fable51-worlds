// Single shared HTML-escaping helper. Use this for EVERY user- or server-derived string
// interpolated into an HTML template-literal string (innerHTML) in this app — project/shot
// names, world ids, captions, status/error text, log tails, etc. Prefer building elements
// with document.createElement + textContent/value instead of innerHTML where practical;
// `esc()` is for the places a template literal is still the simplest approach.
const ESCAPE_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
