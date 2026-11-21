// Bedienoberfläche des 3D-Generators.
// Aufruf aus dem Backoffice: generator/?titel=Drucker%201&kugeln=[{"nr":"#07","name":"Emma","motiv":"herzen"}]

import { schriftLaden, schriftSpeichern } from './js/schrift.js?v=2';
import { baueKugel } from './js/kugel.js?v=2';
import { vorschauSvg } from './js/vorschau.js?v=2';
import { platte3mf, stl } from './js/export.js?v=2';
import { MOTIVE, STANDARD } from './js/einstellungen.js?v=2';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lies = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };
const merke = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };

const zustand = {
  font: null, teileDaten: null,
  kugeln: [],           // { nr, name, motiv }
  ergebnisse: new Map(), // schluessel -> Kugel
  titel: '',
  hoehe: lies('kw.gen.hoehe', STANDARD.hoehe),
};

// ---------- Start ----------
async function start() {
  const p = new URLSearchParams(location.search);
  zustand.titel = p.get('titel') || '';
  try { zustand.kugeln = JSON.parse(p.get('kugeln') || '[]'); } catch (e) { zustand.kugeln = []; }
  if (!zustand.kugeln.length) zustand.kugeln = [{ nr: '', name: '', motiv: 'schneeflocken' }];
  $('#untertitel').textContent = zustand.titel || 'Druckplatte';
  $('#hoehe').value = zustand.hoehe;

  zustand.teileDaten = await (await fetch('vorlagen/teile.json?v=1')).json();
  try {
    const s = await schriftLaden();
    if (s) { zustand.font = s.font; zustand.schriftName = s.name; }
  } catch (e) { console.warn(e); }
  zeigeSchrift();
  zeileListe();
  rechne();
}

function zeigeSchrift() {
  $('#ohneSchrift').hidden = !!zustand.font;
  $('#schriftKnopf').textContent = zustand.font ? 'Schrift ✓' : 'Schrift fehlt';
  $('#schriftKnopf').title = zustand.font ? `${zustand.schriftName} – klicken zum Ändern` : 'Schrift-Datei wählen';
  $('#schriftKnopf').classList.toggle('on', !!zustand.font);
  $('#schriftKnopf').classList.toggle('off', !zustand.font);
}

async function schriftGewaehlt(e) {
  const f = e.target.files[0];
  if (!f) return;
  try {
    zustand.schriftName = await schriftSpeichern(f);
    zustand.font = (await schriftLaden()).font;
    zustand.ergebnisse.clear();
    zeigeSchrift();
    rechne();
  } catch (err) {
    alert('Diese Datei konnte nicht gelesen werden. Bitte die .otf- oder .ttf-Datei von Heartland Script wählen.');
  }
  e.target.value = '';
}

// ---------- Eingabe ----------
function zeileListe() {
  const opt = m => Object.entries(MOTIVE).map(([k, v]) => `<option value="${k}" ${k === m ? 'selected' : ''}>${v.titel}</option>`).join('');
  $('#zeilen').innerHTML = zustand.kugeln.map((k, i) => `
    <div class="zeile" data-i="${i}">
      <span class="nr">${esc(k.nr || '#' + (i + 1))}</span>
      <input class="input" data-name value="${esc(k.name)}" placeholder="Name" autocomplete="off" spellcheck="false" maxlength="20">
      <select data-motiv>${opt(k.motiv)}</select>
      <button class="weg" data-weg title="Entfernen" aria-label="Entfernen">×</button>
    </div>`).join('');
  $('#plus').hidden = zustand.kugeln.length >= 4;
}

let timer;
function eingabe(e) {
  const z = e.target.closest('.zeile');
  if (!z) return;
  const k = zustand.kugeln[+z.dataset.i];
  if (e.target.matches('[data-name]')) k.name = e.target.value;
  if (e.target.matches('[data-motiv]')) k.motiv = e.target.value;
  clearTimeout(timer);
  timer = setTimeout(rechne, 450);
}

// ---------- Berechnen ----------
const schluessel = k => `${k.name.trim()}|${k.motiv}`;
let lauf = 0;

async function rechne() {
  const meinLauf = ++lauf;
  zeigeKarten();
  if (!zustand.font) return;
  for (const k of zustand.kugeln) {
    if (!k.name.trim() || zustand.ergebnisse.has(schluessel(k))) continue;
    await new Promise(r => setTimeout(r, 30)); // Anzeige kurz aktualisieren lassen
    if (meinLauf !== lauf) return;
    try {
      const erg = baueKugel({ font: zustand.font, teileDaten: zustand.teileDaten, name: k.name, motiv: k.motiv, einstellungen: { hoehe: zustand.hoehe } });
      zustand.ergebnisse.set(schluessel(k), erg);
    } catch (err) {
      console.error(err);
      zustand.ergebnisse.set(schluessel(k), { fehler: err.message || String(err) });
    }
    zeigeKarten();
  }
}

function zeigeKarten() {
  const farbig = $('#farbig').checked;
  let fertig = 0;
  $('#karten').innerHTML = zustand.kugeln.map((k, i) => {
    const titel = `<div class="kopf">${esc(k.nr || '#' + (i + 1))} ${esc(k.name || '–')} <small>${esc(MOTIVE[k.motiv]?.titel || '')}</small></div>`;
    if (!k.name.trim()) return `<div class="karte">${titel}<div class="status rechnet">Name eingeben</div></div>`;
    if (!zustand.font) return `<div class="karte">${titel}<div class="status fehler">Schrift fehlt</div></div>`;
    const e = zustand.ergebnisse.get(schluessel(k));
    if (!e) return `<div class="karte">${titel}<div class="status rechnet">wird berechnet …</div></div>`;
    if (e.fehler) return `<div class="karte">${titel}<div class="status fehler">${esc(e.fehler)}</div></div>`;
    fertig++;
    const p = e.pruefung;
    const status = p.ok
      ? `<div class="status ok">✓ Druckbereit${p.hinweise.length ? ' · ' + esc(p.hinweise.join(' · ')) : ''}</div>`
      : `<div class="status fehler">✗ ${esc(p.fehler.join(' · '))}</div>`;
    return `<div class="karte">${titel}${vorschauSvg(e, { breite: 400, farben: farbig, titel: false })}${status}
      <details><summary>Was wurde gemacht?</summary><ul>${e.protokoll.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>
      <button class="btn secondary small stl" data-stl="${i}">STL einzeln</button></div>`;
  }).join('');
  const alle = zustand.kugeln.filter(k => k.name.trim());
  $('#laden3mf').disabled = !alle.length || fertig !== alle.length;
  $('#laden3mf').textContent = `3MF für Bambu Studio herunterladen (${alle.length} ${alle.length === 1 ? 'Kugel' : 'Kugeln'})`;
}

// ---------- Herunterladen ----------
function speichern(daten, name, typ) {
  const url = URL.createObjectURL(new Blob([daten], { type: typ }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const dateiName = s => s.replace(/[^\p{L}\p{N}#_-]+/gu, '-').replace(/^-|-$/g, '');

function lade3mf() {
  const kugeln = zustand.kugeln.filter(k => k.name.trim()).map((k, i) => {
    const e = zustand.ergebnisse.get(schluessel(k));
    return { titel: `${k.nr || '#' + (i + 1)} ${k.name.trim()}`, gesamt: e.gesamt, hoehe: zustand.hoehe };
  });
  const name = dateiName(zustand.titel || 'Platte') + '_' + kugeln.map(k => dateiName(k.titel.split(' ').slice(1).join(' '))).join('_');
  speichern(platte3mf(kugeln), name + '.3mf', 'model/3mf');
}

function ladeStl(i) {
  const k = zustand.kugeln[i], e = zustand.ergebnisse.get(schluessel(k));
  speichern(stl(e.gesamt, zustand.hoehe), dateiName(`${k.name.trim()}_${k.motiv}`) + '.stl', 'model/stl');
}

// ---------- Ereignisse ----------
$('#zeilen').addEventListener('input', eingabe);
$('#zeilen').addEventListener('change', eingabe);
$('#zeilen').addEventListener('click', e => {
  if (!e.target.closest('[data-weg]')) return;
  zustand.kugeln.splice(+e.target.closest('.zeile').dataset.i, 1);
  if (!zustand.kugeln.length) zustand.kugeln.push({ nr: '', name: '', motiv: 'schneeflocken' });
  zeileListe(); rechne();
});
$('#plus').addEventListener('click', () => {
  if (zustand.kugeln.length >= 4) return;
  zustand.kugeln.push({ nr: '', name: '', motiv: zustand.kugeln.at(-1)?.motiv || 'schneeflocken' });
  zeileListe();
  $('#zeilen .zeile:last-child [data-name]').focus();
  zeigeKarten();
});
$('#karten').addEventListener('click', e => { const b = e.target.closest('[data-stl]'); if (b) ladeStl(+b.dataset.stl); });
$('#laden3mf').addEventListener('click', lade3mf);
$('#farbig').addEventListener('change', zeigeKarten);
$('#hoehe').addEventListener('change', e => {
  const v = Math.min(10, Math.max(2, parseFloat(String(e.target.value).replace(',', '.')) || STANDARD.hoehe));
  e.target.value = v; zustand.hoehe = v; merke('kw.gen.hoehe', v); // gilt beim Herunterladen
});
$('#schriftKnopf').addEventListener('click', () => $('#schriftDatei').click());
$('#schriftWaehlen').addEventListener('click', () => $('#schriftDatei').click());
$('#schriftDatei').addEventListener('change', schriftGewaehlt);

start();
