// Live-Vorschau einer Namenskugel als SVG – nachgebaut nach den echten Druckvorlagen.
(function () {
  const FONT = "'Pacifico', 'Snell Roundhand', cursive";
  const VIEW = { w: 200, h: 214, cx: 100, cy: 120, r: 84, ring: 7 };

  // --- Motive (Koordinaten relativ, Größe s = halbe Breite) -----------------
  function snowflake(x, y, s, rot = 0) {
    const sw = s * 0.16;
    let p = '';
    for (let i = 0; i < 6; i++) {
      p += `<g transform="rotate(${i * 60})">
        <line x1="0" y1="0" x2="0" y2="${-s}"/>
        <line x1="0" y1="${-s * 0.55}" x2="${-s * 0.3}" y2="${-s * 0.8}"/>
        <line x1="0" y1="${-s * 0.55}" x2="${s * 0.3}" y2="${-s * 0.8}"/>
        <line x1="0" y1="${-s * 0.25}" x2="${-s * 0.2}" y2="${-s * 0.42}"/>
        <line x1="0" y1="${-s * 0.25}" x2="${s * 0.2}" y2="${-s * 0.42}"/>
      </g>`;
    }
    return `<g transform="translate(${x} ${y}) rotate(${rot})" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round">${p}</g>`;
  }
  function paw(x, y, s, rot = 0) {
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s / 10})" fill="currentColor">
      <path d="M0 1.2c3.4 0 6.2 2.9 6.2 5.6 0 2.2-1.9 3-3.6 3-1 0-1.8-.5-2.6-.5s-1.6.5-2.6.5c-1.7 0-3.6-.8-3.6-3 0-2.7 2.8-5.6 6.2-5.6z"/>
      <ellipse cx="-7.2" cy="-1.2" rx="2.3" ry="3" transform="rotate(-25 -7.2 -1.2)"/>
      <ellipse cx="-3" cy="-6.6" rx="2.4" ry="3.2" transform="rotate(-8 -3 -6.6)"/>
      <ellipse cx="3" cy="-6.6" rx="2.4" ry="3.2" transform="rotate(8 3 -6.6)"/>
      <ellipse cx="7.2" cy="-1.2" rx="2.3" ry="3" transform="rotate(25 7.2 -1.2)"/>
    </g>`;
  }
  function sparkle(x, y, s) {
    const k = 0.18;
    return `<path transform="translate(${x} ${y}) scale(${s})" fill="currentColor"
      d="M0 -1 Q${k} -${k} 1 0 Q${k} ${k} 0 1 Q-${k} ${k} -1 0 Q-${k} -${k} 0 -1Z"/>`;
  }
  function starPts(s) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.45 : s;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      pts.push(`${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`);
    }
    return pts.join(' ');
  }
  function star(x, y, s, rot = 0, outline = false) {
    return outline
      ? `<polygon transform="translate(${x} ${y}) rotate(${rot})" points="${starPts(s)}" fill="none" stroke="currentColor" stroke-width="${s * 0.2}" stroke-linejoin="round"/>`
      : `<polygon transform="translate(${x} ${y}) rotate(${rot})" points="${starPts(s)}" fill="currentColor" stroke="currentColor" stroke-width="${s * 0.12}" stroke-linejoin="round"/>`;
  }
  const HEART = 'M0 0.9 C-0.35 0.6 -1 0.15 -1 -0.35 C-1 -0.8 -0.6 -1.05 -0.25 -1 C-0.1 -0.98 0 -0.85 0 -0.7 C0 -0.85 0.1 -0.98 0.25 -1 C0.6 -1.05 1 -0.8 1 -0.35 C1 0.15 0.35 0.6 0 0.9Z';
  function hearts(x, y, s, rot = 0) {
    const sw = 0.16;
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linejoin="round">
      <path d="${HEART}" transform="translate(-0.45 0.15) rotate(-12)"/>
      <path d="${HEART}" transform="translate(0.55 -0.2) rotate(10) scale(.9)"/>
    </g>`;
  }

  const MOTIFS = {
    herzen: () => hearts(68, 72, 22, -10) + hearts(136, 166, 22, 6),
    sterne: () => star(64, 70, 14, -10, true) + star(154, 92, 20, 12) + star(42, 154, 18, -14) + star(122, 188, 14, 8, true),
    glanzsterne: () => sparkle(32, 100, 19) + sparkle(150, 62, 10) + sparkle(166, 150, 19) + sparkle(48, 170, 9),
    schneeflocken: () => snowflake(142, 76, 22, 10) + snowflake(60, 166, 20, -6),
    pfoten: () => paw(140, 74, 20, 20) + paw(60, 164, 20, -25)
  };

  // Textbreite messen (für automatische Schriftgröße)
  const cvs = document.createElement('canvas').getContext('2d');
  function fitSize(name, maxW, maxSize) {
    cvs.font = `${maxSize}px ${FONT}`;
    const w = cvs.measureText(name).width || 1;
    return Math.max(14, Math.min(maxSize, maxSize * maxW / w));
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /**
   * @param {string} name
   * @param {string} variant
   * @param {object} opt { placeholder, className, title }
   */
  function svg(name, variant, opt = {}) {
    const { cx, cy, r, ring } = VIEW;
    const shown = (name || '').trim() || opt.placeholder || '';
    const size = fitSize(shown || 'Name', 146, 46);
    const motif = (MOTIFS[variant] || (() => ''))();
    const ghost = !(name || '').trim();
    return `<svg class="${opt.className || 'orn'}" viewBox="0 0 ${VIEW.w} ${VIEW.h}" role="img" aria-label="${esc(opt.title || `Kugel ${shown} mit ${variant}`)}">
      <g fill="none" stroke="currentColor" stroke-width="${ring}">
        <circle cx="${cx}" cy="${cy}" r="${r}"/>
        <circle cx="${cx}" cy="22" r="8.5" stroke-width="5.5"/>
      </g>
      <path d="M${cx - 12} ${cy - r + 1} Q${cx} ${cy - r - 9} ${cx + 12} ${cy - r + 1}" fill="currentColor"/>
      <rect x="${cx - 5}" y="28" width="10" height="10" fill="currentColor"/>
      <g class="orn-motif">${motif}</g>
      <text x="${cx}" y="${cy + size * 0.18}" text-anchor="middle" dominant-baseline="middle"
        font-family="${FONT}" font-size="${size.toFixed(1)}" fill="currentColor"
        ${ghost ? 'opacity=".28"' : ''} transform="rotate(-6 ${cx} ${cy})">${esc(shown)}</text>
    </svg>`;
  }

  window.KW_ORN = { svg, MOTIFS, VIEW };
})();
