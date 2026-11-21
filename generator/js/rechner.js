// Hintergrund-Rechner (Web Worker): berechnet Kugeln, ohne die Seite zu blockieren.
// Mehrere davon laufen parallel (eine Kugel pro Rechner).

const laden = async url => (0, eval)(await (await fetch(url)).text()); // Bibliothek global verfügbar machen
let bereit = null, font = null, teileDaten = null, baueKugel = null;

async function init(schriftPuffer, teile, version) {
  await laden('../../vendor/clipper.js');
  await laden('../../vendor/opentype.min.js');
  await laden('../../vendor/earcut.min.js');
  const S = await import(`./schrift.js?v=${version}`);
  ({ baueKugel } = await import(`./kugel.js?v=${version}`));
  font = S.schriftAusPuffer(schriftPuffer);
  teileDaten = teile;
}

self.onmessage = async e => {
  const m = e.data;
  if (m.typ === 'init') { bereit = init(m.schrift, m.teile, m.version); return; }
  if (m.typ === 'kugel') {
    try {
      await bereit;
      const k = baueKugel({ font, teileDaten, name: m.name, motiv: m.motiv, einstellungen: m.einstellungen });
      self.postMessage({ id: m.id, ergebnis: k });
    } catch (err) {
      self.postMessage({ id: m.id, fehler: err.message || String(err) });
    }
  }
};
