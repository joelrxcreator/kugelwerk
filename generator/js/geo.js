// Flache Geometrie (2D) in Millimetern. Nutzt Clipper (vendor/clipper.js, global ClipperLib).
// Eine "Form" ist eine Liste von Pfaden [[x,y],...]; Außenkanten und Löcher gemischt (Füllregel NonZero/EvenOdd
// wird von Clipper beim Vereinigen aufgelöst). Ergebnisse von Clipper sind sauber orientiert.

const C = () => globalThis.ClipperLib;
const SK = 1000; // 1 Einheit = 1 µm

export function zuClipper(form) {
  return form.map(p => p.map(([x, y]) => ({ X: Math.round(x * SK), Y: Math.round(y * SK) })));
}
export function vonClipper(paths) {
  return paths.map(p => p.map(q => [q.X / SK, q.Y / SK]));
}

function bool(typ, a, b, fill = 'nonzero') {
  const L = C();
  const c = new L.Clipper();
  c.AddPaths(zuClipper(a), L.PolyType.ptSubject, true);
  if (b) c.AddPaths(zuClipper(b), L.PolyType.ptClip, true);
  const out = new L.Paths();
  const ft = fill === 'evenodd' ? L.PolyFillType.pftEvenOdd : L.PolyFillType.pftNonZero;
  c.Execute(typ, out, ft, ft);
  return vonClipper(out);
}
export const vereinige = (a, b, fill) => bool(C().ClipType.ctUnion, a, b || [], fill);
export const schneide = (a, b) => bool(C().ClipType.ctIntersection, a, b);
export const ohne = (a, b) => bool(C().ClipType.ctDifference, a, b);

export function versatz(form, d, rund = true, toleranz = 0.02) {
  const L = C();
  const co = new L.ClipperOffset(2, toleranz * SK);
  co.AddPaths(zuClipper(form), rund ? L.JoinType.jtRound : L.JoinType.jtMiter, L.EndType.etClosedPolygon);
  const out = new L.Paths();
  co.Execute(out, d * SK);
  return vonClipper(out);
}

// Linie mit runden Enden als Fläche ("Brücke")
export function kapsel(a, b, breite) {
  const L = C();
  const co = new L.ClipperOffset(2, 0.02 * SK);
  co.AddPath(zuClipper([[a, b]])[0], L.JoinType.jtRound, L.EndType.etOpenRound);
  const out = new L.Paths();
  co.Execute(out, (breite / 2) * SK);
  return vonClipper(out);
}

export function flaeche(form) {
  let s = 0;
  for (const p of form) s += pfadFlaeche(p);
  return Math.abs(s);
}
export function pfadFlaeche(p) {
  let s = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1]);
  return s / 2;
}

export function grenzen(form) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of form) for (const [x, y] of p) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, b: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

// Flächenschwerpunkt
export function schwerpunkt(form) {
  let A = 0, sx = 0, sy = 0;
  for (const p of form) for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const f = p[j][0] * p[i][1] - p[i][0] * p[j][1];
    A += f; sx += (p[j][0] + p[i][0]) * f; sy += (p[j][1] + p[i][1]) * f;
  }
  return A ? [sx / (3 * A), sy / (3 * A)] : [0, 0];
}

export const verschiebe = (form, dx, dy) => form.map(p => p.map(([x, y]) => [x + dx, y + dy]));
export const skaliere = (form, s) => form.map(p => p.map(([x, y]) => [x * s, y * s]));
export function drehe(form, grad) {
  const r = grad * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return form.map(p => p.map(([x, y]) => [x * c - y * s, x * s + y * c]));
}
export const spiegleX = form => form.map(p => p.map(([x, y]) => [-x, y]).reverse());

// Zerlegt eine Form in zusammenhängende Teile; jedes Teil = [außen, ...löcher]
export function teile(form) {
  const L = C();
  const c = new L.Clipper();
  c.AddPaths(zuClipper(form), L.PolyType.ptSubject, true);
  const tree = new L.PolyTree();
  c.Execute(L.ClipType.ctUnion, tree, L.PolyFillType.pftNonZero, L.PolyFillType.pftNonZero);
  const erg = [];
  const lauf = node => {
    for (const k of node.Childs()) {
      if (!k.IsHole()) {
        const t = [k.Contour()];
        for (const h of k.Childs()) { t.push(h.Contour()); lauf(h); }
        erg.push(vonClipper(t));
      }
    }
  };
  lauf(tree);
  return erg;
}

// Punkt in Form? (für einfache Prüfungen)
export function enthaelt(form, [x, y]) {
  let inn = false;
  for (const p of form) for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inn = !inn;
  }
  return inn;
}

// Nächste Punkte zweier Formen (Kanten-zu-Kanten-Abstand)
export function naechstePunkte(a, b) {
  let best = { d: Infinity };
  const kanten = f => { const k = []; for (const p of f) for (let i = 0; i < p.length; i++) k.push([p[i], p[(i + 1) % p.length]]); return k; };
  const ka = kanten(a), kb = kanten(b);
  // grob: Punkte von a gegen Kanten von b und umgekehrt
  const pk = (P, [A, B]) => {
    const dx = B[0] - A[0], dy = B[1] - A[1], l = dx * dx + dy * dy;
    let t = l ? ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / l : 0;
    t = Math.max(0, Math.min(1, t));
    const Q = [A[0] + t * dx, A[1] + t * dy];
    return [Math.hypot(P[0] - Q[0], P[1] - Q[1]), Q];
  };
  const bb = grenzen(b), ba = grenzen(a);
  for (const [P] of ka) {
    if (P[0] < bb.x0 - best.d || P[0] > bb.x1 + best.d || P[1] < bb.y0 - best.d || P[1] > bb.y1 + best.d) continue;
    for (const k of kb) { const [d, Q] = pk(P, k); if (d < best.d) best = { d, a: P, b: Q }; }
  }
  for (const [P] of kb) {
    if (P[0] < ba.x0 - best.d || P[0] > ba.x1 + best.d || P[1] < ba.y0 - best.d || P[1] > ba.y1 + best.d) continue;
    for (const k of ka) { const [d, Q] = pk(P, k); if (d < best.d) best = { d, a: Q, b: P }; }
  }
  return best;
}

// Breite der Verbindung zwischen zwei Formen (wie Joel misst: Abstand zwischen dem Punkt,
// wo sich die Teile zu berühren beginnen, und dem Punkt, wo es aufhört).
// Liefert 0, wenn sie sich nicht überlappen.
export function verbindung(a, b) {
  if (!schneide(a, b).length) return 0;
  const sehnen = (rand, flaeche) => {
    const L = C();
    const c = new L.Clipper();
    // Rand als offene Linien (geschlossen = erster Punkt am Ende wiederholt)
    for (const p of zuClipper(rand)) c.AddPath(p.concat([p[0]]), L.PolyType.ptSubject, false);
    c.AddPaths(zuClipper(flaeche), L.PolyType.ptClip, true);
    const tree = new L.PolyTree();
    c.Execute(L.ClipType.ctIntersection, tree, L.PolyFillType.pftNonZero, L.PolyFillType.pftNonZero);
    const offen = L.Clipper.OpenPathsFromPolyTree(tree);
    // an Endpunkten aneinanderhängende Stücke zusammenfügen (Pfad-Anfang liegt evtl. innen)
    const st = offen.map(p => p.map(q => [q.X / SK, q.Y / SK]));
    for (let i = 0; i < st.length; i++) for (let j = 0; j < st.length; j++) {
      if (i === j || !st[i] || !st[j]) continue;
      const e = st[i][st[i].length - 1], s = st[j][0];
      if (Math.hypot(e[0] - s[0], e[1] - s[1]) < 1e-3) { st[i] = st[i].concat(st[j].slice(1)); st[j] = null; j = -1; }
    }
    let m = 0;
    for (const p of st) if (p && p.length > 1) {
      const e = p[0], f = p[p.length - 1];
      const sehne = Math.hypot(e[0] - f[0], e[1] - f[1]);
      // Rand liegt komplett in der anderen Fläche -> fest eingebettet
      if (sehne < 1e-3 && p.length > 3) return Infinity;
      m = Math.max(m, sehne);
    }
    return m;
  };
  return Math.min(sehnen(a, b), sehnen(b, a));
}

// Teilstücke einer Linie, die innerhalb einer Form liegen: [[p,q], ...]
export function linieInForm(linie, form) {
  const L = C();
  const c = new L.Clipper();
  c.AddPath(zuClipper([linie])[0], L.PolyType.ptSubject, false);
  c.AddPaths(zuClipper(form), L.PolyType.ptClip, true);
  const tree = new L.PolyTree();
  c.Execute(L.ClipType.ctIntersection, tree, L.PolyFillType.pftNonZero, L.PolyFillType.pftNonZero);
  return L.Clipper.OpenPathsFromPolyTree(tree).map(p => [[p[0].X / SK, p[0].Y / SK], [p[p.length - 1].X / SK, p[p.length - 1].Y / SK]]);
}

// Linie (offener Pfad) mit runden Enden als Fläche
export function strich(punkte, breite) {
  const L = C();
  const co = new L.ClipperOffset(2, 0.02 * SK);
  co.AddPath(zuClipper([punkte])[0], L.JoinType.jtRound, L.EndType.etOpenRound);
  const out = new L.Paths();
  co.Execute(out, (breite / 2) * SK);
  return vonClipper(out);
}
