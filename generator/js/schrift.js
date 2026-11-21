// Schrift laden (Heartland Script .otf/.ttf, lokal im Browser gespeichert) und Namen in Umrisse umwandeln.
// Nutzt opentype.js (vendor/opentype.min.js, global opentype).

const DB = 'kugelwerk-generator', STORE = 'dateien', KEY = 'schrift';

function db() {
  return new Promise((ok, fehler) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fehler(r.error);
  });
}

export async function schriftSpeichern(datei) {
  const buf = await datei.arrayBuffer();
  schriftAusPuffer(buf); // prüft, ob lesbar
  const d = await db();
  await new Promise((ok, f) => {
    const t = d.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put({ name: datei.name, buf }, KEY);
    t.oncomplete = ok; t.onerror = () => f(t.error);
  });
  return datei.name;
}

export async function schriftLaden() {
  const d = await db();
  const e = await new Promise((ok, f) => {
    const r = d.transaction(STORE).objectStore(STORE).get(KEY);
    r.onsuccess = () => ok(r.result); r.onerror = () => f(r.error);
  });
  if (!e) return null;
  return { name: e.name, font: schriftAusPuffer(e.buf) };
}

export function schriftAusPuffer(buf) {
  return globalThis.opentype.parse(buf);
}

// Name -> Form in Schrift-Einheiten (1 Einheit = 1/1000 Geviert), y nach oben.
// Jede Glyphe wird einzeln geliefert (für Prüfungen); dazu die Gesamtform.
export function nameZuForm(font, text) {
  const pfad = font.getPath(text, 0, 0, 1000, { kerning: true, features: { liga: true, rlig: true } });
  const form = [];
  let akt = null, x = 0, y = 0;
  const N = 14; // Unterteilung je Kurve
  for (const c of pfad.commands) {
    if (c.type === 'M') { akt = [[c.x, -c.y]]; form.push(akt); x = c.x; y = c.y; }
    else if (c.type === 'L') { akt.push([c.x, -c.y]); x = c.x; y = c.y; }
    else if (c.type === 'Q') {
      for (let i = 1; i <= N; i++) {
        const t = i / N, u = 1 - t;
        akt.push([u * u * x + 2 * u * t * c.x1 + t * t * c.x, -(u * u * y + 2 * u * t * c.y1 + t * t * c.y)]);
      }
      x = c.x; y = c.y;
    } else if (c.type === 'C') {
      for (let i = 1; i <= N; i++) {
        const t = i / N, u = 1 - t;
        akt.push([
          u * u * u * x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
          -(u * u * u * y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y),
        ]);
      }
      x = c.x; y = c.y;
    }
  }
  return form.filter(p => p.length > 2).map(p => {
    const e = p[0], l = p[p.length - 1];
    return (Math.abs(e[0] - l[0]) < 1e-6 && Math.abs(e[1] - l[1]) < 1e-6) ? p.slice(0, -1) : p;
  });
}
