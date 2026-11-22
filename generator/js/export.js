// Flache Form -> 3D-Körper (gerade hochgezogen) -> 3MF (Bambu Studio) oder STL.
// Gedruckt wird umgedreht (Schauseite liegt auf der Platte), deshalb wird für den Druck gespiegelt.

import * as G from './geo.js?v=4';
import { STANDARD } from './einstellungen.js?v=4';

const signierteFlaeche = p => {
  let s = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return s / 2;
};

// Form -> Dreiecksnetz { v: [x,y,z,...], f: [a,b,c,...] }
export function hochziehen(form, hoehe) {
  const v = [], f = [];
  for (const teil of G.teile(form)) {
    let [aussen, ...loecher] = teil;
    if (signierteFlaeche(aussen) < 0) aussen = aussen.slice().reverse();
    loecher = loecher.map(l => (signierteFlaeche(l) > 0 ? l.slice().reverse() : l));
    const ringe = [aussen, ...loecher];
    const flach = [], lochStart = [];
    for (const r of ringe) {
      if (r !== aussen) lochStart.push(flach.length / 2);
      for (const [x, y] of r) flach.push(x, y);
    }
    const n = flach.length / 2;
    const basis = v.length / 3;
    for (let i = 0; i < n; i++) v.push(flach[2 * i], flach[2 * i + 1], 0);
    for (let i = 0; i < n; i++) v.push(flach[2 * i], flach[2 * i + 1], hoehe);
    const tri = globalThis.earcut(flach, lochStart, 2);
    for (let i = 0; i < tri.length; i += 3) {
      let [a, b, c] = [tri[i], tri[i + 1], tri[i + 2]];
      const ax = flach[2 * a], ay = flach[2 * a + 1];
      const cr = (flach[2 * b] - ax) * (flach[2 * c + 1] - ay) - (flach[2 * b + 1] - ay) * (flach[2 * c] - ax);
      if (cr < 0) [b, c] = [c, b]; // jetzt gegen den Uhrzeigersinn (Normale +z)
      f.push(basis + n + a, basis + n + b, basis + n + c); // oben
      f.push(basis + a, basis + c, basis + b);             // unten
    }
    // Seitenwände
    let start = 0;
    for (const r of ringe) {
      for (let i = 0; i < r.length; i++) {
        const a = basis + start + i, b = basis + start + ((i + 1) % r.length);
        f.push(a, b, b + n, a, b + n, a + n);
      }
      start += r.length;
    }
  }
  return { v, f };
}

// ---------- 3MF ----------
function modelXml(objekte) {
  let o = '', b = '';
  objekte.forEach((ob, i) => {
    const id = i + 1;
    const vs = [], ts = [];
    for (let k = 0; k < ob.netz.v.length; k += 3) vs.push(`<vertex x="${ob.netz.v[k].toFixed(3)}" y="${ob.netz.v[k + 1].toFixed(3)}" z="${ob.netz.v[k + 2].toFixed(3)}"/>`);
    for (let k = 0; k < ob.netz.f.length; k += 3) ts.push(`<triangle v1="${ob.netz.f[k]}" v2="${ob.netz.f[k + 1]}" v3="${ob.netz.f[k + 2]}"/>`);
    o += `<object id="${id}" name="${xmlText(ob.name)}" type="model"><mesh><vertices>${vs.join('')}</vertices><triangles>${ts.join('')}</triangles></mesh></object>`;
    b += `<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${ob.x.toFixed(3)} ${ob.y.toFixed(3)} 0" printable="1"/>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="de-DE" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Application">Kugelwerk-Generator</metadata><resources>${o}</resources><build>${b}</build></model>`;
}
const xmlText = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>';
const RELS = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';

// Positionen auf der Druckplatte (Mitte jeder Kugel), bis zu 4 Stück
export function plattenPositionen(anzahl, groessen, cfg = STANDARD) {
  const P = cfg.plattenGroesse, m = P / 2, g = cfg.plattenAbstand;
  const bx = Math.max(...groessen.map(s => s.b)) + g, by = Math.max(...groessen.map(s => s.h)) + g;
  if (anzahl === 1) return [[m, m]];
  if (anzahl === 2) return [[m - bx / 2, m], [m + bx / 2, m]];
  const pos = [[m - bx / 2, m + by / 2], [m + bx / 2, m + by / 2], [m - bx / 2, m - by / 2], [m + bx / 2, m - by / 2]];
  if (anzahl === 3) pos[2] = [m, m - by / 2];
  return pos.slice(0, anzahl);
}

// kugeln: [{ titel, gesamt (Form), hoehe }]
export function platte3mf(kugeln, cfg = STANDARD) {
  const gedreht = kugeln.map(k => {
    const druck = G.spiegleX(k.gesamt); // umgedreht drucken
    const b = G.grenzen(druck);
    return { ...k, druck: G.verschiebe(druck, -b.cx, -b.cy), b };
  });
  const pos = plattenPositionen(gedreht.length, gedreht.map(k => k.b), cfg);
  const objekte = gedreht.map((k, i) => ({ name: k.titel, netz: hochziehen(k.druck, k.hoehe), x: pos[i][0], y: pos[i][1] }));
  const enc = new TextEncoder();
  return zip([
    ['[Content_Types].xml', enc.encode(CONTENT_TYPES)],
    ['_rels/.rels', enc.encode(RELS)],
    ['3D/3dmodel.model', enc.encode(modelXml(objekte))],
  ]);
}

// ---------- STL (binär) ----------
export function stl(form, hoehe, { umgedreht = true } = {}) {
  const druck = umgedreht ? G.spiegleX(form) : form;
  const { v, f } = hochziehen(druck, hoehe);
  const n = f.length / 3;
  const buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf);
  dv.setUint32(80, n, true);
  let o = 84;
  for (let i = 0; i < f.length; i += 3) {
    const p = [f[i], f[i + 1], f[i + 2]].map(k => [v[3 * k], v[3 * k + 1], v[3 * k + 2]]);
    const u = p[1].map((x, j) => x - p[0][j]), w = p[2].map((x, j) => x - p[0][j]);
    const nn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const l = Math.hypot(...nn) || 1;
    for (const x of nn) { dv.setFloat32(o, x / l, true); o += 4; }
    for (const q of p) for (const x of q) { dv.setFloat32(o, x, true); o += 4; }
    o += 2;
  }
  return new Uint8Array(buf);
}

// ---------- ZIP (ohne Kompression) ----------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(d) { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export function zip(dateien) {
  const enc = new TextEncoder();
  const teile = [], zentral = [];
  let off = 0;
  for (const [name, daten] of dateien) {
    const nb = enc.encode(name), crc = crc32(daten);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, daten.length, true); h.setUint32(22, daten.length, true);
    h.setUint16(26, nb.length, true);
    teile.push(new Uint8Array(h.buffer), nb, daten);
    const z = new DataView(new ArrayBuffer(46));
    z.setUint32(0, 0x02014b50, true); z.setUint16(4, 20, true); z.setUint16(6, 20, true);
    z.setUint32(16, crc, true); z.setUint32(20, daten.length, true); z.setUint32(24, daten.length, true);
    z.setUint16(28, nb.length, true); z.setUint32(42, off, true);
    zentral.push(new Uint8Array(z.buffer), nb);
    off += 30 + nb.length + daten.length;
  }
  const zl = zentral.reduce((s, x) => s + x.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, dateien.length, true); e.setUint16(10, dateien.length, true);
  e.setUint32(12, zl, true); e.setUint32(16, off, true);
  const alle = [...teile, ...zentral, new Uint8Array(e.buffer)];
  const out = new Uint8Array(alle.reduce((s, x) => s + x.length, 0));
  let p = 0; for (const x of alle) { out.set(x, p); p += x.length; }
  return out;
}
