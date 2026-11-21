// SVG-Vorschau einer Kugel (Ansicht von vorne, y nach oben)

const d = form => form.map(p => 'M' + p.map(([x, y]) => `${x.toFixed(2)},${(-y).toFixed(2)}`).join('L') + 'Z').join('');

export function vorschauSvg(k, { breite = 320, farben = false, titel = true } = {}) {
  const R = 56;
  let inhalt = '';
  if (farben) {
    inhalt += `<path d="${d(k.ring)}" fill="#cfc6b8" fill-rule="evenodd"/>`;
    for (const m of k.motive) if (m.form) inhalt += `<path d="${d(m.form)}" fill="${m.haupt ? '#8a9a5b' : '#b5a27a'}" fill-rule="evenodd"/>`;
    inhalt += `<path d="${d(k.nameForm)}" fill="#4c4e34" fill-rule="evenodd"/>`;
    for (const b of k.bruecken) inhalt += `<path d="${d(b.form)}" fill="#c0392b"/>`;
  } else {
    inhalt += `<path d="${d(k.gesamt)}" fill="currentColor" fill-rule="evenodd"/>`;
  }
  const text = titel ? `<text x="0" y="${R + 6}" font-size="5" text-anchor="middle" fill="${k.pruefung.ok ? '#4c4e34' : '#c0392b'}" font-family="sans-serif">${k.pruefung.ok ? '✓' : '✗ ' + k.pruefung.fehler[0]}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-R} ${-R - 10} ${2 * R} ${2 * R + 18}" width="${breite}">${inhalt}${text}</svg>`;
}
