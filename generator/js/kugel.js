// Baut eine Namenskugel (flach, in mm) nach Joels Regeln:
// 1. Name setzen, Größe so, dass er mittig sitzt und den Ring nicht berührt.
// 2. Lose Teile verbinden: i-/Umlaut-Punkte mit dünner Brücke, abgesetzte Buchstaben ranschieben oder überbrücken.
// 3. Motive diagonal an den Ring setzen, leicht verschieben/drehen, bis sie Ring UND Namen sicher berühren.
// 4. Alles vereinigen und prüfen (ein Teil, Verbindungen >= 0,8 mm).

import * as G from './geo.js?v=6';
import { STANDARD, MOTIVE, SUCHE } from './einstellungen.js?v=6';
import { nameZuForm, nameGlyphen } from './schrift.js?v=6';

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

function groesseFuer(form, cfg, innen, kern = 0) {
  const b = G.grenzen(form);
  const [mx, my] = optischeMitte(form);
  let maxD = 0;
  for (const p of form) for (const [x, y] of p) maxD = Math.max(maxD, Math.hypot(x - mx, y - my));
  // Höhe: gesamt höchstens nameMaxHoehe – außer die Großbuchstaben-Höhe (kern) bleibt dann unnötig klein
  const hoehe = Math.max(cfg.nameMaxHoehe / b.h, kern ? cfg.nameMaxKern / kern : 0);
  return Math.min(cfg.nameMaxBreite / b.b, hoehe, (innen - cfg.abstandRing) / maxD);
}

function zentriere(form) {
  const [mx, my] = optischeMitte(form);
  return [G.verschiebe(form, -mx, -my), -mx, -my];
}

// ---------- Name: lose Teile verbinden ----------
function verbindeName(form, cfg, protokoll, glyphen = []) {
  let stuecke = G.teile(form).map(f => ({ form: f, flaeche: G.flaeche(f), glyphen: new Set() }));
  // jedem Stück seine Buchstaben zuordnen (z. B. „gehört zum T“)
  glyphen.forEach((g, gi) => {
    const bg = G.grenzen(g.form);
    let bestS = null, bestA = 0;
    for (const st of stuecke) {
      const bs = G.grenzen(st.form);
      if (bs.x1 < bg.x0 || bs.x0 > bg.x1 || bs.y1 < bg.y0 || bs.y0 > bg.y1) continue;
      const a = G.flaeche(G.schneide(st.form, g.form));
      if (a > bestA) { bestA = a; bestS = st; }
      if (a > 0.5 * G.flaeche(st.form)) st.glyphen.add(gi);
    }
    if (bestS) bestS.glyphen.add(gi);
  });
  const groesste = Math.max(...stuecke.map(s => s.flaeche));
  const bruecken = [];
  const verbindungen = [];

  // Gruppen (Union-Find)
  const gruppe = stuecke.map((_, i) => i);
  const wurzel = i => (gruppe[i] === i ? i : (gruppe[i] = wurzel(gruppe[i])));
  const istPunkt = s => s.flaeche < groesste * 0.06;

  // Punkte (i, Umlaute) erst ganz am Ende anbinden, wenn alle Buchstaben an ihrem Platz sind
  const punkte = stuecke.filter(istPunkt);
  const punktFormen = punkte.map(p => p.form);
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
    // Nach einem T (oder F) keine Verbindung zum nächsten Buchstaben – sieht nie schön aus (Joel: „bei T ist das so eine Sache“)
    const gGlyphen = w => new Set(stuecke.flatMap((st, i) => (wurzel(i) === w ? [...st.glyphen] : [])));
    const [links, rechts] = G.grenzen(fa).cx < G.grenzen(fb).cx ? [a, b] : [b, a];
    const gl = [...gGlyphen(links)], gr = gGlyphen(rechts);
    const letzter = gl.length ? Math.max(...gl) : -1;
    const ohneBruecke = letzter >= 0 && !gr.has(letzter) && cfg.ohneVerbindungNach.includes(glyphen[letzter].zeichen);

    {
      // Abgesetzter Anfangs- oder Endbuchstabe: ranschieben (wie bei "Paul")
      const bk = G.grenzen(fk), bg = G.grenzen(fg);
      let richtung = 0;
      if (bk.cx < bg.x0 + 0.25 * bg.b) richtung = 1;        // links -> nach rechts schieben
      else if (bk.cx > bg.x1 - 0.25 * bg.b) richtung = -1;  // rechts -> nach links
      const klein_ = G.flaeche(fk) < 0.15 * groesste;       // Bindestrich, Balken o. ä.
      let geschoben = false;
      // nur Buchstaben nebeneinander schieben (nicht z. B. einen T-Balken über dem Stamm)
      const nebeneinander = Math.min(bk.y1, bg.y1) - Math.max(bk.y0, bg.y0) > 0.5 * Math.min(bk.h, bg.h);
      if (richtung && !klein_ && nebeneinander && !ohneBruecke && np.d > 0.05) {
        for (let s = 0.1; s <= cfg.maxSchieben + 1e-9; s += 0.1) {
          const neu = G.verschiebe(fk, richtung * s, 0);
          const v = G.verbindung(neu, fg);
          if (v >= cfg.zielVerbindung) {
            const schnitt = G.schneide(neu, fg);
            // nur an EINER Stelle punktuell berühren, nicht der Länge nach ankleben,
            // und nicht in einen i-Punkt hineinrutschen (wie bei "Wilma")
            const passt = G.teile(schnitt).length === 1 && v <= cfg.maxBeruehrung &&
              G.flaeche(schnitt) < 0.12 * G.flaeche(fk) &&
              !punktFormen.some(pf => G.schneide(neu, G.versatz(pf, 0.6)).length);
            if (passt) {
              stuecke.forEach((st, i) => { if (wurzel(i) === klein) { st.form = G.verschiebe(st.form, richtung * s, 0); st.dx = (st.dx || 0) + richtung * s; } });
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
        } else if (ohneBruecke) {
          protokoll.push(`Nach „${glyphen[letzter].zeichen}“ keine Brücke – Teil hängt an einem Motiv`);
        } else if (np.d <= cfg.kleineLuecke || (klein_ && np.d <= cfg.maxBruecke)) {
          // winzige Lücke (T-Balken) oder kleines Zeichen (Bindestrich): an der engsten Stelle
          const br = brueckeZwischen(fk, fg, cfg.brueckeBuchstabe);
          br.gruppe = klein; bruecken.push(br);
          protokoll.push(`Kleine Brücke (${np.d.toFixed(1)} mm Lücke)`);
        } else {
          // größere Lücke: Schreibschrift-Bogen von unten aus dem linken Buchstaben
          // oben in den ersten Strich des rechten Buchstabens (V -> i, W -> i, Y -> u, V -> e)
          const [gL, gR, fl, fr] = G.grenzen(fk).cx < G.grenzen(fg).cx ? [klein, gross, fk, fg] : [gross, klein, fg, fk];
          const zielGlyph = Math.min(...gGlyphen(gR));
          const dxZiel = (stuecke.find((st, i) => wurzel(i) === gR && st.glyphen.has(zielGlyph)) || {}).dx || 0;
          const andere = stuecke.filter((st, i) => wurzel(i) !== gL && wurzel(i) !== gR).flatMap(st => st.form);
          const br = isFinite(zielGlyph) && glyphen[zielGlyph]
            ? schwungBruecke(fl, fr, G.verschiebe(glyphen[zielGlyph].form, dxZiel, 0), andere, cfg) : null;
          if (br) {
            br.gruppe = klein; bruecken.push(br);
            protokoll.push(`Schreibschrift-Bogen zum „${glyphen[zielGlyph].zeichen}“`);
          } else {
            protokoll.push(`Lücke ${np.d.toFixed(1)} mm – Teil bleibt getrennt und hängt an einem Motiv (wie bei „Tina“)`);
          }
        }
      }
    }
    gruppe[wurzel(klein)] = wurzel(gross);
  }
  const buchstaben = stuecke.flatMap(s => s.form);
  for (const pk of punkte) {
    bruecken.push(punktBruecke(pk.form, buchstaben, cfg.brueckePunkt));
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

// Brücke vom i-Punkt genau mittig in den Stängel darunter (Mitte Punkt -> Mitte Stängel)
function punktBruecke(punkt, buchstaben, breite) {
  const ziel = punktZiel(punkt, buchstaben);
  const [cx, cy] = G.schwerpunkt(punkt);
  // Querschnitt des Stängels etwas unterhalb seiner Spitze messen und dessen Mitte nehmen
  const tiefe = 1.4, neigung = 0.3;
  const y = ziel.b[1] - tiefe, xErwartet = ziel.b[0] - neigung * tiefe;
  const strecken = G.linieInForm([[xErwartet - 6, y], [xErwartet + 6, y]], buchstaben);
  let mitte = null;
  for (const [p, q] of strecken) {
    const m = [(p[0] + q[0]) / 2, y];
    if (!mitte || Math.abs(m[0] - xErwartet) < Math.abs(mitte[0] - xErwartet)) mitte = m;
  }
  if (!mitte) return brueckeVon(ziel, breite);
  return { form: G.kapsel([cx, cy], mitte, breite), von: [cx, cy], bis: mitte, breite };
}

// Geschwungene Brücke wie in Schreibschrift: vom tiefsten Punkt des linken Buchstabens (V-Spitze, W-Tal,
// Y unten) weich nach rechts und dann von unten in den OBEREN Teil des ersten Strichs des nächsten
// Buchstabens (i-Stamm, linke Zacke vom u). Liefert null, wenn das nicht schön geht.
function schwungBruecke(links, rechts, glyph, andere, cfg) {
  const bl = G.grenzen(links), bg = G.grenzen(glyph);
  // Start: tiefster Punkt in der rechten Hälfte des linken Buchstabens, nicht unter der Grundlinie (y = 0)
  let p = null;
  for (const pf of links) for (const pt of pf) {
    if (pt[0] < bl.cx || pt[1] < -0.5) continue;
    if (!p || pt[1] < p[1] - 0.2 || (Math.abs(pt[1] - p[1]) <= 0.2 && pt[0] > p[0])) p = pt;
  }
  if (!p) return null;
  // Ziel: erster Strich des rechten Buchstabens (linke 45 %), dort der obere Bereich
  const streifen = [[[bg.x0 - 0.5, -50], [bg.x0 + 0.45 * bg.b, -50], [bg.x0 + 0.45 * bg.b, 200], [bg.x0 - 0.5, 200]]];
  const erster = G.schneide(G.schneide(rechts, glyph.length ? G.versatz(glyph, 0.05) : rechts), streifen);
  if (!erster.length) return null;
  const oben = G.grenzen(erster).y1;
  if (oben <= p[1] + 1) return null;
  // So hoch wie möglich in den Strich gleiten – aber ohne haarfeine Ritzen (< ~0,7 mm), die sich nicht sauber drucken
  const U0 = G.vereinige(links.concat(rechts));
  const ritzen = (U, box) => {
    const zu = G.versatz(G.versatz(U, 0.35), -0.35);
    return G.flaeche(G.schneide(G.ohne(zu, U), box));
  };
  for (const anteil of [0.72, 0.62, 0.52, 0.42, 0.32]) {
    const yq = p[1] + anteil * (oben - p[1]);
    const quer = G.linieInForm([[bg.x0 - 1, yq], [bg.x0 + 0.45 * bg.b + 1, yq]], erster).sort((m, n) => m[0][0] - n[0][0]);
    if (!quer.length) continue;
    const e = [(quer[0][0][0] + quer[0][1][0]) / 2, yq];
    const dx = e[0] - p[0], dy = e[1] - p[1];
    if (dx < 1 || dx > cfg.maxSchwung) continue;
    // Kubische Kurve: unten waagerecht los, dann von links-unten schräg in den Strich
    const P0 = [p[0] - 0.3, p[1] + 0.6];
    const P1 = [p[0] + 0.5 * dx, p[1] - 0.12 * dy];
    const P2 = [e[0] - 0.35 * dx, e[1] - 0.55 * dy];
    const punkte = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32, u = 1 - t;
      punkte.push([0, 1].map(k => u * u * u * P0[k] + 3 * u * u * t * P1[k] + 3 * u * t * t * P2[k] + t * t * t * e[k]));
    }
    const form = G.strich(punkte, cfg.brueckeBuchstabe);
    if (andere.length && G.schneide(form, G.versatz(andere, 0.4)).length) continue;
    // nur dort prüfen, wo der Bogen in den rechten Buchstaben einläuft (letztes Drittel)
    const bb = G.grenzen([punkte.slice(20)]);
    const box = [[[bb.x0 - 1, bb.y0 - 1], [bb.x1 + 1, bb.y0 - 1], [bb.x1 + 1, bb.y1 + 1], [bb.x0 - 1, bb.y1 + 1]]];
    if (ritzen(G.vereinige(U0.concat(form)), box) - ritzen(U0, box) > 0.25) continue;
    return { form, von: p, bis: e, breite: cfg.brueckeBuchstabe };
  }
  return null;
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

// Innenräume eines Motivs (Löcher + enge Buchten), durch die der Ring nicht laufen soll
function innenraeume(flaechen) {
  const roh = flaechen.flat();
  const aussen = G.vereinige(flaechen.map(f => f[0]));
  const zu = G.versatz(G.versatz(roh, 1.5), -1.5);
  return G.ohne(G.vereinige(aussen.concat(zu)), roh);
}

function platziere(stueck, ring, name, belegt, innen, aussen, cfg, zielTeil = name, nameZone = name, nameTeile = [], obergrenze = Infinity) {
  const { flaechen, luecken, winkel: w0, haupt, drehMax = 0, drehZiel = 0, groesse = 1, start = null } = stueck;
  const roh = flaechen.flat();
  const rohGrob = vereinfache(roh, 0.04); // für die schnelle Vorprüfung
  let best = null;

  // Nur den Teil von Ring/Name betrachten, der in der Nähe liegt (macht alles viel schneller)
  const ausschnitt = (form, b) => G.schneide(form, [[[b.x0 - 1, b.y0 - 1], [b.x1 + 1, b.y0 - 1], [b.x1 + 1, b.y1 + 1], [b.x0 - 1, b.y1 + 1]]]);
  const ueberlappt = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const belegtB = belegt.map(f => ({ f, b: G.grenzen(f) }));
  const lage = (f, dreh, k, u, r) => G.verschiebe(G.skaliere(G.drehe(f, dreh), k), u[0] * r, u[1] * r);
  // Ring/Name nur einmal pro Winkel zuschneiden (spart sehr viel Rechenzeit)
  let radius = 0;
  for (const p of roh) for (const [x, y] of p) radius = Math.max(radius, Math.hypot(x, y));
  radius *= groesse;
  const nahCache = new Map();
  const nah = w => {
    const key = Math.round(w * 10);
    if (!nahCache.has(key)) {
      const u = [Math.cos(rad(w)), Math.sin(rad(w))], m = aussen - radius - SUCHE.nachInnen / 2;
      const h = radius + SUCHE.nachInnen / 2 + 2;
      const box = { x0: u[0] * m - h, x1: u[0] * m + h, y0: u[1] * m - h, y1: u[1] * m + h };
      nahCache.set(key, { ring: ausschnitt(ring, box), name: ausschnitt(name, box), nameGrob: vereinfache(ausschnitt(name, box), 0.04), zone: ausschnitt(nameZone, box), ziel: zielTeil === name ? null : ausschnitt(zielTeil, box),
        teile: nameTeile.length > 1 ? nameTeile.map(t => ausschnitt(t, box)).filter(t => t.length) : [] });
    }
    return nahCache.get(key);
  };

  // Schritt 1 (schnell): Lage berechnen, grobe Ausschlüsse, Untergrenze der Bewertung
  const vorpruefen = (w, dreh, k, d) => {
    let form = G.skaliere(G.drehe(roh, dreh), k);
    const u = [Math.cos(rad(w)), Math.sin(rad(w))];
    const r = maxRadius(form, u, aussen - cfg.randAussen) - d;
    if (!isFinite(r)) return null;
    form = G.verschiebe(form, u[0] * r, u[1] * r);
    const grob = G.verschiebe(G.skaliere(G.drehe(rohGrob, dreh), k), u[0] * r, u[1] * r);
    const b = G.grenzen(form);
    for (const x of belegtB) if (ueberlappt(b, x.b) && G.flaeche(G.schneide(grob, x.f)) > 0.05) return null;
    const nc = nah(w);
    const ueber = nc.nameGrob.length ? G.flaeche(G.schneide(grob, nc.nameGrob)) : 0;
    if (haupt ? ueber <= 0 : ueber > 0.3) return null;
    // Motiv soll sich an den Ring schmiegen und den Namen nur wenig verdecken
    // „Nähe“ zu den Buchstaben: Fläche im Umkreis von 2 mm um den Namen (Motiv soll nicht in Buchstaben hineinragen, z. B. ins E)
    const naehe = nc.zone.length ? G.flaeche(G.schneide(grob, nc.zone)) - ueber : 0;
    // Besteht der Name aus Teilen (z. B. „T“ + „im“): Bonus, wenn dieses Motiv beide Teile verbindet
    const beruehrt = haupt ? nc.teile.filter(t => G.schneide(grob, t).length) : [];
    const verbindetTeile = beruehrt.length >= 2 ? -cfg.bonusTeileVerbinden : 0;
    const unten = Math.abs(w - w0) * 0.25 + Math.abs(dreh - drehZiel) * 0.12 + d * 2 + Math.abs(k - 1) * cfg.strafeGroesse + ueber * 0.4 + naehe * 0.15 + verbindetTeile;
    return { form, u, r, b, nc, ueber, unten, w, dreh, k, d, beruehrt, verbindetTeile };
  };
  // Schritt 2 (genau): Ring nicht durchs Motiv-Innere, Verbindungen messen
  const pruefen = c => {
    const { form, u, r, nc, ueber, w, dreh, k, d } = c;
    const ringNah = nc.ring, nameNah = nc.name;
    if (luecken && luecken.length && G.flaeche(G.schneide(lage(luecken, dreh, k, u, r), ringNah)) > 0.3) return null;
    let vName = 0;
    if (haupt) {
      vName = G.verbindung(form, nc.ziel || nameNah);
      if (vName < cfg.minVerbindung) return null;
    }
    const vRing = G.verbindung(form, ringNah);
    if (vRing < cfg.minVerbindung) return null;
    // Einzelflächen (z. B. beide Herzen) müssen jeweils sicher hängen
    if (flaechen.length > 1) {
      const alle = ringNah.concat(nameNah);
      const einzel = flaechen.map(f => lage(f, dreh, k, u, r));
      for (let i = 0; i < einzel.length; i++) {
        if (G.verbindung(einzel[i], alle) >= cfg.minVerbindung) continue;
        const rest = einzel.filter((_, j) => j !== i).flat();
        if (G.verbindung(einzel[i], rest) < cfg.minVerbindung) return null;
      }
    }
    const schwach = Math.min(vRing, haupt ? vName : 99) < cfg.zielVerbindung ? 15 : 0;
    // Bonus nur, wenn wirklich beide Teile sicher (>= 0,8 mm) verbunden sind
    let korrektur = 0;
    if (c.verbindetTeile && c.beruehrt.filter(t => G.verbindung(form, t) >= cfg.minVerbindung).length < 2) korrektur = -c.verbindetTeile;
    return { form, wert: c.unten + schwach + korrektur, verbindetTeile: c.verbindetTeile && !korrektur, winkel: w, drehung: dreh, groesse: k, nachInnen: d, vRing, vName, ueber };
  };
  // Kandidaten nach Untergrenze sortieren und nur so lange genau prüfen, wie noch Besseres möglich ist
  const bewerte = kandidaten => {
    const vor = kandidaten.map(([w, dr, k, d]) => vorpruefen(w, dr, k, d)).filter(Boolean).sort((a, b) => a.unten - b.unten);
    for (const c of vor) {
      if (c.unten >= (best ? best.wert : obergrenze)) break;
      const e = pruefen(c);
      if (e && (!best || e.wert < best.wert)) best = e;
    }
  };

  const bereich = (mitte, weite, schritt) => {
    const l = [];
    for (let x = -weite; x <= weite + 1e-9; x += schritt) l.push(mitte + x);
    return l;
  };
  const drehungen = drehMax ? bereich(0, drehMax, Math.max(SUCHE.drehSchritt * 2, drehMax / 2)) : [0];
  // Nur Feinsuche um eine bekannte Lage (für „alle Motive gemeinsam etwas größer/kleiner“)
  if (start) {
    const kand = [];
    for (const w of bereich(start.winkel, SUCHE.winkelSchritt * 2, SUCHE.winkelSchritt)) {
      if (Math.abs(w - w0) > SUCHE.winkel) continue;
      for (const dr of drehMax ? bereich(start.drehung, SUCHE.drehSchritt * 2, SUCHE.drehSchritt).filter(x => Math.abs(x) <= drehMax) : [0])
        for (let d = Math.max(0, start.nachInnen - 1.5); d <= start.nachInnen + 1.5 + 1e-9; d += 0.5) kand.push([w, dr, groesse, d]);
    }
    bewerte(kand);
    return best;
  }
  // Größe ist für alle Teile eines Motivs gleich (wird außen festgelegt)
  for (const k of [groesse]) {
    // grob suchen (Ebene für Ebene nach innen, solange das noch besser werden kann) …
    for (let d = 0; d <= SUCHE.nachInnen + 1e-9; d += SUCHE.innenSchritt) {
      if (d * 2 - cfg.bonusTeileVerbinden >= (best ? best.wert : obergrenze)) break;
      const kand = [];
      for (const w of bereich(w0, SUCHE.winkel, SUCHE.winkelSchritt * 2)) for (const dr of drehungen) kand.push([w, dr, k, d]);
      bewerte(kand);
    }
    // … dann um den besten Treffer fein nachsuchen
    if (best) {
      const g = best, kand = [];
      const feinD = drehMax ? bereich(g.drehung, SUCHE.drehSchritt * 2, SUCHE.drehSchritt).filter(x => Math.abs(x) <= drehMax) : [0];
      for (const w of bereich(g.winkel, SUCHE.winkelSchritt * 2, SUCHE.winkelSchritt).filter(x => Math.abs(x - w0) <= SUCHE.winkel))
        for (const dr of feinD)
          for (const d of [g.nachInnen, g.nachInnen - SUCHE.innenSchritt / 2, g.nachInnen - SUCHE.innenSchritt / 4, g.nachInnen + SUCHE.innenSchritt / 4])
            if (d >= 0) kand.push([w, dr, k, d]);
      bewerte(kand);
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

// Punkte, die fast auf einer Linie liegen, weglassen (Douglas-Peucker light)
function vereinfache(form, tol) {
  return form.map(p => {
    const out = [p[0]];
    for (let i = 1; i < p.length; i++) {
      const a = out[out.length - 1], b = p[i], c = p[(i + 1) % p.length];
      const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1;
      if (Math.abs((b[0] - a[0]) * dy - (b[1] - a[1]) * dx) / l > tol) out.push(b);
    }
    return out;
  }).filter(p => p.length > 2);
}

// ---------- Hauptfunktion ----------
export function baueKugel({ font, teileDaten, name, motiv, einstellungen = {} }) {
  const cfg = { ...STANDARD, ...einstellungen };
  const protokoll = [];
  const ring = ringForm(teileDaten);
  const innen = teileDaten.ring.innenRadius, aussen = teileDaten.ring.aussenRadius;
  const roh = G.vereinige(nameZuForm(font, name.trim()));
  const glyphenRoh = nameGlyphen(font, name.trim());
  if (!roh.length) throw new Error('Name ist leer');

  // Größe bestimmen und Teile verbinden; falls der Name dadurch zu breit wird, etwas kleiner
  const kern = (font.tables && font.tables.os2 && font.tables.os2.sCapHeight) || 700; // Großbuchstaben-Höhe in Schrift-Einheiten
  let s = groesseFuer(roh, cfg, innen, kern);
  let n;
  for (let versuch = 0; versuch < 10; versuch++) {
    const p = [];
    n = verbindeName(G.skaliere(roh, s), cfg, p, glyphenRoh.map(g => ({ ...g, form: G.skaliere(g.form, s) })));
    const [z, dx, dy] = zentriere(n.form);
    n.form = z;
    n.bruecken = n.bruecken.map(b => ({ ...b, form: G.verschiebe(b.form, dx, dy) }));
    const neu = groesseFuer(n.form, cfg, innen, kern * s);
    if (neu >= 0.999) { protokoll.push(...p); break; }
    s *= Math.max(0.9, neu * 0.995);
    if (versuch === 9) protokoll.push(...p);
  }
  const nameForm = n.form;
  const nb = G.grenzen(nameForm);
  protokoll.unshift(`Name ${nb.b.toFixed(1)} × ${nb.h.toFixed(1)} mm`);
  const klein = kern * s < cfg.nameMinHoehe;

  // Motive: beide Diagonalen probieren und die schönere nehmen
  const def = MOTIVE[motiv];
  if (!def) throw new Error('Unbekanntes Motiv: ' + motiv);
  const teilCache = {};
  const teilDaten = name => (teilCache[name] ||= (() => {
    const flaechen = teilForm(teileDaten, name);
    return { flaechen, luecken: def.innenFrei ? innenraeume(flaechen) : null };
  })());
  // grob genug für die Bewertung (wenige Punkte = schnell)
  const nameZone = vereinfache(G.versatz(nameForm, 2, true, 0.25), 0.15);
  const nameTeile = G.teile(nameForm);
  const varianten = [def.teile, def.teile.map(t => ({ ...t, winkel: 180 - t.winkel, drehZiel: -(t.drehZiel || 0) }))];
  // Eine komplette Anordnung (alle Teile) für eine Diagonale und eine Größe berechnen
  const anordnen = (vi, k, grenze = Infinity, vorlage = null) => {
    const teile = varianten[vi];
    const m = [], belegt = [], p = [];
    const reihenfolge = teile.map((t, i) => ({ ...t, i })).sort((a, b) => b.haupt - a.haupt);
    // Besteht der Name aus mehreren Teilen (z. B. "T" + "ina"), braucht jedes Teil ein eigenes Motiv als Halt
    const ziele = zieleVerteilen(nameTeile, reihenfolge.filter(t => t.haupt), innen);
    if (ziele.fehlt) p.push('Name hat mehr Teile als Motive – bitte prüfen');
    let summe = vi ? (def.spiegeln ?? 0) : 0; // manche Motive lieber in Joels Standard-Diagonale
    const bonusRest = () => (nameTeile.length > 1 ? cfg.bonusTeileVerbinden : 0) * reihenfolge.filter(t => t.haupt && !m.includes(t)).length;
    for (const t of reihenfolge) {
      const ziel = t.haupt && ziele.zu ? ziele.zu.get(t) : nameForm;
      // was für dieses Teil noch übrig ist, damit die Anordnung besser als die bisher beste wird
      const rest = grenze - summe + (m.length < reihenfolge.length - 1 ? 0 : 0);
      if (rest + bonusRest() <= 0) return { summe: Infinity, p, vi, k, m };
      const start = vorlage && vorlage.m.find(x => x.i === t.i && x.form);
      const erg = platziere({ ...teilDaten(t.teil), winkel: t.winkel, haupt: t.haupt, drehMax: def.drehen || 0, drehZiel: t.drehZiel || 0, groesse: k, start },
        ring, nameForm, belegt, innen, aussen, cfg, ziel, nameZone, nameTeile, isFinite(grenze) ? rest + bonusRest() : Infinity);
      if (!erg && isFinite(grenze)) return { summe: Infinity, p, vi, k, m };
      if (erg) {
        belegt.push(erg.form);
        m.push({ ...t, ...erg });
        summe += erg.wert;
        if (erg.verbindetTeile) p.push(`${t.teil} verbindet die Namensteile`);
      } else {
        m.push({ ...t, form: null });
        summe += 1000;
        p.push(`Kein guter Platz für ${t.teil} gefunden`);
      }
    }
    if (Math.abs(k - 1) > 0.001) p.push(`Motive alle etwas ${k > 1 ? 'größer' : 'kleiner'} (${Math.round(k * 100)} %)`);
    return { summe, p, vi, k, m };
  };
  const varSummen = [];
  const merke = e => { varSummen.push(`${e.vi ? 'B' : 'A'}${Math.round(e.k * 100)}:${Math.round(e.summe)}`); return e; };
  // 1. beide Diagonalen in Originalgröße
  let wahl = merke(anordnen(0, 1));
  { const e = merke(anordnen(1, 1, wahl.summe < 1000 ? wahl.summe : Infinity)); if (e.summe < wahl.summe) wahl = e; }
  // 2. bei der besseren Diagonale: alle Motive gemeinsam etwas kleiner/größer probieren (max. ± 10 %)
  for (const k of SUCHE.feinGroesse) {
    const basis = wahl;
    const e = merke(anordnen(basis.vi, k, basis.summe < 1000 ? basis.summe : Infinity, basis.summe < 1000 ? basis : null));
    if (e.summe < wahl.summe) wahl = e;
  }
  // 3. Notfall: passt gar nichts, beide Diagonalen mit +10 %
  if (wahl.summe >= 1000) for (const vi of [0, 1]) {
    const e = merke(anordnen(vi, SUCHE.notGroesse));
    if (e.summe < wahl.summe) wahl = e;
  }
  const motive = wahl.m;
  const h = motive.find(m => m.haupt && m.form);
  const obenRechts = h && Math.sin(rad(h.winkel)) * Math.cos(rad(h.winkel)) > 0;
  protokoll.push(...wahl.p, obenRechts ? 'Motive: oben rechts / unten links' : 'Motive: oben links / unten rechts');

  // Alles vereinigen, kleine Ritzen schließen
  let gesamt = G.vereinige(ring.concat(nameForm, ...motive.filter(m => m.form).map(m => m.form)));
  if (cfg.glaetten > 0) gesamt = G.versatz(G.versatz(gesamt, cfg.glaetten), -cfg.glaetten);

  const pruefung = pruefe({ gesamt, ring, nameForm, motive, cfg });
  // Mehrere Wörter (z. B. „Oma & Opa“): lassen sich nicht sauber verbinden -> je Name eine eigene Kugel
  if (/\s/.test(name.trim())) pruefung.ok = false, pruefung.fehler.unshift('Mehrere Wörter – bitte je Name eine eigene Kugel (z. B. „Oma“ und „Opa“ einzeln)');
  if (klein) pruefung.hinweise.push('Langer Name – Schrift wird recht klein');
  return { name, motiv, cfg, ring, nameForm, bruecken: n.bruecken, motive, gesamt, pruefung, protokoll, varSummen };
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
