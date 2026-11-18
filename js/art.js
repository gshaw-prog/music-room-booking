// Decorative music graphics (inline SVG strings). All are aria-hidden.
// Colours come from CSS via currentColor / classes so they follow the palette.

// One note glyph. x,y = notehead centre. type: quarter | half | eighth.
function note(x, y, type = 'quarter', cls = '') {
  const sx = x + 7.8;
  const head = type === 'half'
    ? `<ellipse cx="${x}" cy="${y}" rx="7.6" ry="5.1" transform="rotate(-22 ${x} ${y})" fill="none" stroke="currentColor" stroke-width="2.6"/>`
    : `<ellipse cx="${x}" cy="${y}" rx="9" ry="6.4" transform="rotate(-22 ${x} ${y})"/>`;
  const flag = type === 'eighth'
    ? `<path d="M${sx} ${y - 46}c1 12 14 14 11 32" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`
    : '';
  return `<g class="n ${cls}">${head}<rect x="${sx - 1.3}" y="${y - 46}" width="2.6" height="46"/>${flag}</g>`;
}
function beamed(x1, y1, x2, y2, cls = '') {
  const a = x1 + 7.8, b = x2 + 7.8;
  return `<g class="n ${cls}">${note(x1, y1)}${note(x2, y2)}<path d="M${a - 1.3} ${y1 - 46}L${b + 1.3} ${y2 - 46}v7L${a - 1.3} ${y1 - 39}z"/></g>`;
}
const staffLines = (w, y0 = 30, gap = 15) =>
  [0, 1, 2, 3, 4].map((i) => `<line x1="0" x2="${w}" y1="${y0 + i * gap}" y2="${y0 + i * gap}"/>`).join('');

// Staff with drifting notes, sits behind the home-page greeting.
export function heroStaff() {
  return `<svg class="hero-art" viewBox="0 0 900 130" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
    <g class="staff">${staffLines(900)}</g>
    <g class="notes-g">
      ${note(330, 82, 'quarter', 'd1')}${beamed(400, 67, 445, 52, 'd2')}${note(520, 90, 'half', 'd3')}
      ${note(590, 60, 'eighth', 'd1')}${beamed(660, 75, 705, 82, 'd2')}${note(780, 52, 'half', 'd3')}
      <g class="n d1"><rect x="850" y="30" width="3" height="60"/><rect x="858" y="30" width="8" height="60"/></g>
    </g></svg>`;
}

// Banner for the sign-in card: staff, notes and a strip of piano keys.
export function authBanner() {
  const whites = 28, kw = 420 / whites, pattern = [1, 1, 0, 1, 1, 1, 0];
  let keys = '';
  for (let i = 0; i < whites; i++) keys += `<rect class="wk" x="${(i * kw).toFixed(2)}" y="92" width="${(kw - 1).toFixed(2)}" height="38" rx="2"/>`;
  for (let i = 0; i < whites - 1; i++) if (pattern[i % 7]) keys += `<rect class="bk" x="${((i + 1) * kw - kw * 0.32).toFixed(2)}" y="92" width="${(kw * 0.64).toFixed(2)}" height="23" rx="1.5"/>`;
  return `<svg class="auth-banner" viewBox="0 0 420 130" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <rect class="bg" width="420" height="130"/>
    <g class="staff">${staffLines(420, 30, 11)}</g>
    <g class="notes-g">${note(60, 68, 'quarter', 'd1')}${beamed(115, 63, 150, 52, 'd2 brass')}${note(215, 74, 'half', 'd3')}
      ${note(275, 57, 'eighth', 'd1 brass')}${beamed(330, 66, 365, 72, 'd2')}</g>
    <rect class="felt" y="86" width="420" height="6"/>${keys}</svg>`;
}

// Success badge: a pair of beamed quavers.
export function successNotes() {
  return `<svg viewBox="0 0 60 60" width="34" height="34" aria-hidden="true"><g fill="currentColor">
    <ellipse cx="19" cy="44" rx="8" ry="5.8" transform="rotate(-22 19 44)"/><ellipse cx="41" cy="38" rx="8" ry="5.8" transform="rotate(-22 41 38)"/>
    <rect x="24.5" y="10" width="3" height="34"/><rect x="46.5" y="5" width="3" height="33"/><path d="M24.5 10L49.5 5v8L24.5 18z"/></g></svg>`;
}

// Footer: staff ending in a final barline.
export function footerArt() {
  return `<svg class="footer-art" viewBox="0 0 400 46" preserveAspectRatio="none" aria-hidden="true">
    <g class="staff">${staffLines(392, 3, 10)}</g><rect x="384" y="3" width="2" height="40"/><rect x="390" y="3" width="6" height="40"/></svg>`;
}
