// Baut eine Namenskugel (flach, in mm) nach Joels Regeln:
// 1. Name setzen, Größe so, dass er mittig sitzt und den Ring nicht berührt.
// 2. Lose Teile verbinden: i-/Umlaut-Punkte mit dünner Brücke, abgesetzte Buchstaben ranschieben oder überbrücken.
// 3. Motive diagonal an den Ring setzen, leicht verschieben/drehen, bis sie Ring UND Namen sicher berühren.
// 4. Alles vereinigen und prüfen (ein Teil, Verbindungen >= 0,8 mm).

import * as G from './geo.js';
import { STANDARD, MOTIVE, SUCHE } from './einstellungen.js';
import { nameZuForm } from './schrift.js';

const rad = g => g * Math.PI / 180;

// ---------- Ring ----------
export function ringForm(teileDaten) {
  const r = teileDaten.ring;
  return r.flaechen.flatMap(f => [f.aussen, ...f.loecher]);
}
export function teilForm(teileDaten, name) {
  const t = teileDaten[name];
  if (!t) throw new Error('Teil fehlt: ' + name);
  return t.flaechen.map(f => [f.aussen, ...f.loecher]); // Liste von Flächen (z. B. 2 Herzen)
}

// ---------- Name: Größe & Lage ----------
function optischeMitte(form) {
  const b = G.grenzen(form), s = G.schwerpunkt(form);
  // Schnörkel haben wenig Fläche -> Schwerpunkt zieht die Mitte zum "Hauptteil" des Namens
  return [0.5 * b.cx + 0.5 * s[0], 0.5 * b.cy + 0.5 * s[1]];
}

function groesseFuer(form, cfg, innen) {
  const b = G.grenzen(form);
  const [mx, my] = optischeMitte(form);
  let maxD = 0;
  for (const p of form) for (const [x, y] of p) maxD = Math.max(maxD, Math.hypot(x - mx, y - my));
  return Math.min(cfg.nameMaxBreite / b.b, cfg.nameMaxHoehe / b.h, (innen - cfg.abstandRing) / maxD);
}

function zentriere(form) {
  const [mx, my] = optischeMitte(form);
  return [G.verschiebe(form, -mx, -my), -mx, -my];
}

// ---------- Name: lose Teile verbinden ----------
function verbindeName(form, cfg, protokoll) {
  let stuecke = G.teile(form).map(f => ({ form: f, flaeche: G.flaeche(f) }));
  const groesste = Math.max(...stuecke.map(s => s.flaeche));
  const bruecken = [];
  const verbindungen = [];

  // Gruppen (Union-Find)
  const gruppe = stuecke.map((_, i) => i);
  const wurzel = i => (gruppe[i] === i ? i : (gruppe[i] = wurzel(gruppe[i])));
  const istPunkt = s => s.flaeche < groesste * 0.06;

  // Punkte (i, Umlaute) erst ganz am Ende anbinden, wenn alle Buchstaben an ihrem Platz sind
  const punkte = stuecke.filter(istPunkt);
  stuecke = stuecke.filter(s => !istPunkt(s));
  gruppe.length = stuecke.length;

  for (let runde = 0; runde < 20; runde++) {
    const wurzeln = [...new Set(stuecke.map((_, i) => wurzel(i)))];
    if (wurzeln.length <= 1) break;
    // Gruppenformen
    const gForm = w => stuecke.flatMap((s, i) => (wurzel(i) === w ? s.form : []));
    // Paar mit der kleinsten Lücke zuerst
    let best = null;
    for (let a = 0; a < wurzeln.length; a++) for (let b = a + 1; b < wurzeln.length; b++) {
      const fa = gForm(wurzeln[a]), fb = gForm(wurzeln[b]);
      const np = G.naechstePunkte(fa, fb);
      if (!best || np.d < best.np.d) best = { a: wurzeln[a], b: wurzeln[b], fa, fb, np };
    }
    if (!best) break;
    const { a, b, fa, fb, np } = best;
    // kleinere Gruppe ist die, die bewegt/angebunden wird
    const [klein, gross, fk, fg] = G.flaeche(fa) < G.flaeche(fb) ? [a, b, fa, fb] : [b, a, fb, fa];

    {
      // Abgesetzter Anfangs- oder Endbuchstabe: ranschieben (wie bei "Paul")
      const bk = G.grenzen(fk), bg = G.grenzen(fg);
      let richtung = 0;
      if (bk.cx < bg.x0 + 0.25 * bg.b) richtung = 1;        // links -> nach rechts schieben
      else if (bk.cx > bg.x1 - 0.25 * bg.b) richtung = -1;  // rechts -> nach links
      let geschoben = false;
      if (richtung && np.d > 0.05) {
        for (let s = 0.1; s <= cfg.maxSchieben + 1e-9; s += 0.1) {
          const neu = G.verschiebe(fk, richtung * s, 0);
          const v = G.verbindung(neu, fg);
          if (v >= cfg.zielVerbindung) {
            const ueber = G.flaeche(G.schneide(neu, fg));
            // nur punktuell berühren – nicht der ganzen Länge nach aneinanderkleben
            const passt = ueber < 0.12 * G.flaeche(fk) && v <= cfg.maxBeruehrung;
            if (passt) {
              stuecke.forEach((st, i) => { if (wurzel(i) === klein) st.form = G.verschiebe(st.form, richtung * s, 0); });
              for (const br of bruecken) if (br.gruppe !== undefined && wurzel(br.gruppe) === klein) br.form = G.verschiebe(br.form, richtung * s, 0);
              protokoll.push(`Buchstabe um ${s.toFixed(1)} mm rangeschoben (Verbindung ${v.toFixed(1)} mm)`);
              verbindungen.push({ art: 'geschoben', breite: v, punkt: np.a });
              geschoben = true;
            }
            break;
          }
        }
      }
      if (!geschoben) {
        const vorher = G.verbindung(fk, fg);
        if (vorher >= cfg.zielVerbindung) {
          protokoll.push('Buchstaben berühren sich schon');
        } else if (np.d <= cfg.maxBruecke) {
          const br = brueckeZwischen(fk, fg, cfg.brueckeBuchstabe);
          br.gruppe = klein;
          bruecken.push(br);
          protokoll.push(`Brücke zwischen Buchstaben (${np.d.toFixed(1)} mm Lücke)`);
        } else {
          protokoll.push(`Lücke ${np.d.toFixed(1)} mm – Teil bleibt getrennt und hängt an einem Motiv (wie bei „Tina“)`);
          // nicht verbinden, aber trotzdem gruppieren, damit die Schleife endet
        }
      }
    }
    gruppe[wurzel(klein)] = wurzel(gross);
  }
  const buchstaben = stuecke.flatMap(s => s.form);
  for (const pk of punkte) {
    bruecken.push(brueckeVon(punktZiel(pk.form, buchstaben), cfg.brueckePunkt));
    protokoll.push('i-/Umlaut-Punkt mit dünner Brücke verbunden');
  }
  const alle = buchstaben.concat(...punkte.map(p => p.form));
  return { form: G.vereinige(alle.concat(...bruecken.map(b => b.form))), bruecken, verbindungen };
}

// Für i-/Umlaut-Punkte: Ziel möglichst senkrecht darunter suchen (wie Joel es in Canva macht)
function punktZiel(punkt, rest) {
  const bp = G.grenzen(punkt);
  const unten = [bp.cx, bp.y0];
  let best = { d: Infinity };
  for (const p of rest) for (let i = 0; i < p.length; i++) {
    const A = p[i], B = p[(i + 1) % p.length];
    for (let t = 0; t < 1; t += 0.25) {
      const q = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
      if (q[1] > bp.cy) continue;
      const dx = q[0] - unten[0], dy = q[1] - unten[1];
      // Schrift ist nach rechts geneigt: "darunter" liegt etwas links
      const kosten = Math.hypot(dx, dy) + 3 * Math.abs(dx - 0.3 * dy);
      if (kosten < best.k || best.k === undefined) best = { k: kosten, d: Math.hypot(dx, dy), a: unten, b: q };
    }
  }
  if (!isFinite(best.d)) return G.naechstePunkte(punkt, rest);
  return best;
}

function brueckeZwischen(a, b, breite) {
  return brueckeVon(G.naechstePunkte(a, b), breite);
}

function brueckeVon(np, breite) {
  let dx = np.b[0] - np.a[0], dy = np.b[1] - np.a[1];
  const l = Math.hypot(dx, dy) || 1;
  dx /= l; dy /= l;
  const rein = breite * 0.5 + 0.2; // etwas in beide Teile hinein
  const p = [np.a[0] - dx * rein, np.a[1] - dy * rein];
  const q = [np.b[0] + dx * rein, np.b[1] + dy * rein];
  return { form: G.kapsel(p, q, breite), von: np.a, bis: np.b, breite };
}

// ---------- Motive ----------
function maxRadius(form, u, R) {
  // größter Abstand r entlang Richtung u, bei dem die Form noch im Kreis R liegt
  let r = Infinity;
  for (const p of form) for (const [x, y] of p) {
    const uv = u[0] * x + u[1] * y, vv = x * x + y * y;
    const disk = uv * uv - vv + R * R;
    r = Math.min(r, disk < 0 ? -Infinity : -uv + Math.sqrt(disk));
  }
  return r;
}

function platziere(stueck, ring, name, belegt, innen, aussen, cfg, zielTeil = name) {
  const { flaechen, winkel: w0, haupt } = stueck;
  const roh = flaechen.flat();
  let best = null;

  // Nur den Teil von Ring/Name betrachten, der in der Nähe liegt (macht alles viel schneller)
  const ausschnitt = (form, b) => G.schneide(form, [[[b.x0 - 1, b.y0 - 1], [b.x1 + 1, b.y0 - 1], [b.x1 + 1, b.y1 + 1], [b.x0 - 1, b.y1 + 1]]]);
  const ueberlappt = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const belegtB = belegt.map(f => ({ f, b: G.grenzen(f) }));

  const pruefe = (w, dreh, k, d) => {
    let form = G.skaliere(G.drehe(roh, dreh), k);
    const u = [Math.cos(rad(w)), Math.sin(rad(w))];
    const r = maxRadius(form, u, aussen - cfg.randAussen) - d;
    if (!isFinite(r)) return null;
    form = G.verschiebe(form, u[0] * r, u[1] * r);
    const b = G.grenzen(form);
    for (const x of belegtB) if (ueberlappt(b, x.b) && G.flaeche(G.schneide(form, x.f)) > 0.05) return null;
    const nameNah = ausschnitt(name, b);
    const ueber = nameNah.length ? G.flaeche(G.schneide(form, nameNah)) : 0;
    let vName = 0;
    if (haupt) {
      if (ueber <= 0) return null;
      const zielNah = zielTeil === name ? nameNah : ausschnitt(zielTeil, b);
      if (!zielNah.length) return null;
      vName = G.verbindung(form, zielNah);
      if (vName < cfg.minVerbindung) return null;
    } else if (ueber > 0.3) return null;
    const ringNah = ausschnitt(ring, b);
    const vRing = G.verbindung(form, ringNah);
    if (vRing < cfg.minVerbindung) return null;
    // Einzelflächen (z. B. beide Herzen) müssen jeweils sicher hängen
    if (flaechen.length > 1) {
      const alle = ringNah.concat(nameNah);
      const einzel = flaechen.map(f => G.verschiebe(G.skaliere(G.drehe(f, dreh), k), u[0] * r, u[1] * r));
      for (let i = 0; i < einzel.length; i++) {
        if (G.verbindung(einzel[i], alle) >= cfg.minVerbindung) continue;
        const rest = einzel.filter((_, j) => j !== i).flat();
        if (G.verbindung(einzel[i], rest) < cfg.minVerbindung) return null;
      }
    }
    const schwach = Math.min(vRing, haupt ? vName : 99) < cfg.zielVerbindung ? 15 : 0;
    const wert = Math.abs(w - w0) * 0.25 + Math.abs(dreh) * 0.12 + d * 1.5 + (k - 1) * 120 + ueber * 0.06 + schwach;
    return { form, wert, winkel: w, drehung: dreh, groesse: k, nachInnen: d, vRing, vName, ueber };
  };

  // grob suchen, dann um den besten Treffer fein nachsuchen
  const bereich = (mitte, weite, schritt) => {
    const l = [];
    for (let x = -weite; x <= weite + 1e-9; x += schritt) l.push(mitte + x);
    return l;
  };
  const besser = e => { if (e && (!best || e.wert < best.wert)) best = e; };
  for (const k of SUCHE.groesser) {
    for (let d = 0; d <= SUCHE.nachInnen + 1e-9 && !best; d += SUCHE.innenSchritt) {
      for (const w of bereich(w0, SUCHE.winkel, SUCHE.winkelSchritt * 2))
        for (const dr of bereich(0, SUCHE.drehung, SUCHE.drehSchritt * 2)) besser(pruefe(w, dr, k, d));
    }
    if (best) {
      const g = best;
      for (const w of bereich(g.winkel, SUCHE.winkelSchritt * 2, SUCHE.winkelSchritt))
        for (const dr of bereich(g.drehung, SUCHE.drehSchritt * 2, SUCHE.drehSchritt))
          for (const d of [g.nachInnen, Math.max(0, g.nachInnen - SUCHE.innenSchritt / 2)]) {
            if (Math.abs(w - w0) <= SUCHE.winkel && Math.abs(dr) <= SUCHE.drehung) besser(pruefe(w, dr, k, d));
          }
      break;
    }
  }
  return best;
}

// Ordnet jedem Haupt-Motiv ein Namensteil zu, sodass jedes Teil mindestens ein Motiv hat
function zieleVerteilen(teile, haupt, innen) {
  if (teile.length <= 1) return {};
  if (teile.length > haupt.length) return { fehlt: true };
  const abst = haupt.map(t => {
    const p = [Math.cos(rad(t.winkel)) * innen * 0.8, Math.sin(rad(t.winkel)) * innen * 0.8];
    return teile.map(f => G.naechstePunkte([[p, [p[0] + 0.01, p[1]], [p[0], p[1] + 0.01]]], f).d);
  });
  let best = null;
  const n = haupt.length, m = teile.length;
  for (let code = 0; code < m ** n; code++) {
    const wahl = []; let c = code;
    for (let i = 0; i < n; i++) { wahl.push(c % m); c = Math.floor(c / m); }
    if (new Set(wahl).size < m) continue; // jedes Teil braucht ein Motiv
    const summe = wahl.reduce((s, j, i) => s + abst[i][j], 0);
    if (!best || summe < best.summe) best = { summe, wahl };
  }
  return { zu: new Map(haupt.map((t, i) => [t, teile[best.wahl[i]]])) };
}

// ---------- Hauptfunktion ----------
export function baueKugel({ font, teileDaten, name, motiv, einstellungen = {} }) {
  const cfg = { ...STANDARD, ...einstellungen };
  const protokoll = [];
  const ring = ringForm(teileDaten);
  const innen = teileDaten.ring.innenRadius, aussen = teileDaten.ring.aussenRadius;
  const roh = G.vereinige(nameZuForm(font, name.trim()));
  if (!roh.length) throw new Error('Name ist leer');

  // Größe bestimmen und Teile verbinden; falls der Name dadurch zu breit wird, etwas kleiner
  let s = groesseFuer(roh, cfg, innen);
  let n;
  for (let versuch = 0; versuch < 10; versuch++) {
    const p = [];
    n = verbindeName(G.skaliere(roh, s), cfg, p);
    const [z, dx, dy] = zentriere(n.form);
    n.form = z;
    n.bruecken = n.bruecken.map(b => ({ ...b, form: G.verschiebe(b.form, dx, dy) }));
    const neu = groesseFuer(n.form, cfg, innen);
    if (neu >= 0.999) { protokoll.push(...p); break; }
    s *= Math.max(0.9, neu * 0.995);
    if (versuch === 9) protokoll.push(...p);
  }
  const nameForm = n.form;
  const nb = G.grenzen(nameForm);
  protokoll.unshift(`Name ${nb.b.toFixed(1)} × ${nb.h.toFixed(1)} mm`);

  // Motive
  const def = MOTIVE[motiv];
  if (!def) throw new Error('Unbekanntes Motiv: ' + motiv);
  const motive = [];
  const belegt = [];
  const reihenfolge = def.teile.map((t, i) => ({ ...t, i })).sort((a, b) => b.haupt - a.haupt);
  // Besteht der Name aus mehreren Teilen (z. B. "T" + "ina"), braucht jedes Teil ein eigenes Motiv als Halt
  const ziele = zieleVerteilen(G.teile(nameForm), reihenfolge.filter(t => t.haupt), innen);
  if (ziele.fehlt) protokoll.push('Name hat mehr Teile als Motive – bitte prüfen');
  for (const t of reihenfolge) {
    const flaechen = teilForm(teileDaten, t.teil);
    const ziel = t.haupt && ziele.zu ? ziele.zu.get(t) : nameForm;
    const erg = platziere({ flaechen, winkel: t.winkel, haupt: t.haupt }, ring, nameForm, belegt, innen, aussen, cfg, ziel);
    if (erg) {
      belegt.push(erg.form);
      motive.push({ ...t, ...erg });
      if (erg.groesse > 1) protokoll.push(`${t.teil} etwas größer (${Math.round(erg.groesse * 100)} %)`);
    } else {
      motive.push({ ...t, form: null });
      protokoll.push(`Kein guter Platz für ${t.teil} gefunden`);
    }
  }

  // Alles vereinigen, kleine Ritzen schließen
  let gesamt = G.vereinige(ring.concat(nameForm, ...motive.filter(m => m.form).map(m => m.form)));
  if (cfg.glaetten > 0) gesamt = G.versatz(G.versatz(gesamt, cfg.glaetten), -cfg.glaetten);

  const pruefung = pruefe({ gesamt, ring, nameForm, motive, cfg });
  return { name, motiv, cfg, ring, nameForm, bruecken: n.bruecken, motive, gesamt, pruefung, protokoll };
}

// ---------- Prüfung ----------
export function pruefe({ gesamt, ring, nameForm, motive, cfg }) {
  const fehler = [], hinweise = [];
  const stuecke = G.teile(gesamt);
  if (stuecke.length !== 1) fehler.push(`${stuecke.length} lose Teile – alles muss zusammenhängen`);
  const fehlt = motive.filter(m => !m.form);
  if (fehlt.length) fehler.push(`${fehlt.length} Motiv(e) konnten nicht platziert werden`);
  for (const m of motive.filter(m => m.form)) {
    if (m.vRing < cfg.minVerbindung) fehler.push(`${m.teil}: Verbindung zum Ring nur ${m.vRing.toFixed(2)} mm`);
    if (m.haupt && m.vName < cfg.minVerbindung) fehler.push(`${m.teil}: Verbindung zum Namen nur ${m.vName.toFixed(2)} mm`);
  }
  // Name darf den Ring nicht direkt berühren
  if (G.schneide(G.versatz(nameForm, 0.3), ring).length) fehler.push('Name berührt den Ring direkt');
  // jeder Teil des Namens muss über ein Motiv am Ring hängen
  const namensTeile = G.teile(nameForm);
  if (namensTeile.length > 1) hinweise.push(`Name besteht aus ${namensTeile.length} Teilen (hält über die Motive)`);
  return { ok: fehler.length === 0, fehler, hinweise };
}
