// Namenskugeln · Lohmarer Weihnachtsmarkt – Backoffice
(function () {
  'use strict';
  const { rpc } = window.KW_API;
  const I = window.KW_ICON;
  const $ = (s, el = document) => el.querySelector(s);
  const root = $('#root');

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = n => (+n || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const hhmm = d => d ? new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–';
  const nr = n => n ? '#' + String(n).padStart(2, '0') : '–';
  const mins = ms => Math.round(ms / 60000);
  const ago = d => { const m = mins(Date.now() - new Date(d)); return m < 1 ? 'gerade eben' : m < 60 ? `vor ${m} Min.` : `vor ${Math.floor(m / 60)} Std. ${m % 60} Min.`; };
  const MOTIF_ICON = { herzen: 'heart', sterne: 'star', glanzsterne: 'sparkles', schneeflocken: 'snowflake', pfoten: 'paw' };
  const motifIco = k => `<span class="mot">${I(MOTIF_ICON[k] || 'star')}</span>`;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
    del(k) { try { localStorage.removeItem(k); } catch { } }
  };

  const S = {
    session: store.get('kw.admin', null),
    data: null,
    sel: new Set(),          // ausgewählte Kugel-IDs für die nächste Platte
    userTouchedSel: false,
    printer: 1,
    sound: store.get('kw.sound', true),
    seenPaid: null,          // IDs bezahlter Bestellungen (für Ton bei neuen)
    fresh: new Set(),        // frisch eingegangen (Markierung)
    lastOk: 0,
    showDone: false,
    showUnpaid: true,
    wake: false,
    busy: false
  };

  // ---------- Toast ----------
  let tt;
  function toast(m, err = false, undo = null) {
    const t = $('#toast'); t.textContent = m; t.classList.toggle('err', err); t.classList.add('show');
    if (undo) { const b = document.createElement('button'); b.className = 'toast-undo'; b.textContent = 'Rückgängig'; b.onclick = () => { t.classList.remove('show'); undo(); }; t.append(b); }
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), undo ? 8000 : 3000);
  }
  function errMsg(e) {
    const c = (e && e.code) || '';
    if (c === 'offline') return 'Keine Verbindung zum Server.';
    if (c === 'wrong_password') return 'Passwort stimmt nicht.';
    if (c === 'too_many_attempts') return 'Zu viele Versuche – bitte 15 Minuten warten.';
    if (c === 'not_authorized') return 'Bitte neu anmelden.';
    if (c === 'too_short') return 'Mindestens 8 Zeichen.';
    if (c === 'no_items') return 'Diese Kugeln sind nicht mehr in der Warteschlange.';
    return 'Fehler: ' + (e && e.message || 'unbekannt');
  }

  // ---------- Ton ----------
  let actx;
  function chime() {
    if (!S.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime;
      [880, 1318.5, 1760].forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0, t + i * .12); g.gain.linearRampToValueAtTime(.18, t + i * .12 + .02);
        g.gain.exponentialRampToValueAtTime(.001, t + i * .12 + .6);
        o.connect(g).connect(actx.destination); o.start(t + i * .12); o.stop(t + i * .12 + .65);
      });
    } catch { }
  }

  // ---------- Dialoge ----------
  function dialog({ title, text = '', input = null, ok = 'OK', cancel = 'Abbrechen', danger = false }) {
    return new Promise(resolve => {
      const scrim = document.createElement('div'); scrim.className = 'modal-scrim dlg-scrim';
      const d = document.createElement('div'); d.className = 'dlg'; d.setAttribute('role', 'dialog');
      d.innerHTML = `<h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}
        ${input ? `<input class="input" id="dlgIn" type="${input.type || 'text'}" value="${esc(input.value || '')}" placeholder="${esc(input.placeholder || '')}" autocomplete="off">` : ''}
        <div class="acts">${cancel ? `<button class="btn secondary" data-a="0">${esc(cancel)}</button>` : ''}<button class="btn ${danger ? '' : 'pine'}" data-a="1">${esc(ok)}</button></div>`;
      document.body.append(scrim, d);
      requestAnimationFrame(() => { scrim.classList.add('show'); d.classList.add('show'); });
      const inp = $('#dlgIn', d);
      const done = v => { scrim.remove(); d.remove(); resolve(v); };
      d.querySelectorAll('[data-a]').forEach(b => b.onclick = () => done(b.dataset.a === '1' ? (inp ? inp.value : true) : null));
      scrim.onclick = () => done(null);
      d.onkeydown = e => { if (e.key === 'Enter') done(inp ? inp.value : true); if (e.key === 'Escape') done(null); };
      setTimeout(() => (inp || d.querySelector('[data-a="1"]')).focus(), 50);
    });
  }

  // ---------- Login ----------
  function renderLogin(msg = '') {
    root.innerHTML = `<div class="login"><form class="login-card" id="lf">
      <img class="login-logo" src="img/mbg-logo.svg" alt="MBG Lohmar">
      <h1>Namenskugeln · Backoffice</h1>
      <p>Bitte mit dem Backoffice-Passwort anmelden.</p>
      <input class="input" id="pw" type="password" placeholder="Passwort" autocomplete="current-password" required>
      <button class="btn" type="submit" id="lb">Anmelden</button>
      <div class="err-line" id="le">${esc(msg)}</div>
    </form></div>`;
    $('#pw').focus();
    $('#lf').onsubmit = async e => {
      e.preventDefault();
      const b = $('#lb'); b.disabled = true; b.innerHTML = '<span class="spin"></span>';
      try {
        const tok = await rpc('admin_login', { p_password: $('#pw').value });
        S.session = tok; store.set('kw.admin', tok);
        start();
      } catch (er) { $('#le').textContent = errMsg(er); b.disabled = false; b.textContent = 'Anmelden'; }
    };
  }
  function logo() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="14" r="7"/><circle cx="12" cy="4.6" r="1.6"/><path d="M12 6.2V7"/><path d="m12 11 .9 1.9 2 .2-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.2Z" fill="currentColor" stroke-width="1"/></svg>`;
  }

  // ---------- Daten ----------
  async function act(fn, args = {}, okMsg) {
    try {
      await rpc(fn, { p_session: S.session, ...args });
      if (okMsg) toast(okMsg);
      await load();
      return true;
    } catch (e) {
      if (e.code === 'not_authorized') return logout(true);
      toast(errMsg(e), true); return false;
    }
  }

  let loading = false;
  async function load() {
    if (loading) return; loading = true;
    try {
      const d = await rpc('admin_state', { p_session: S.session });
      S.data = d; S.lastOk = Date.now();
      // neue bezahlte Bestellungen erkennen
      const paid = d.orders.filter(o => o.status === 'bezahlt').map(o => o.id);
      if (S.seenPaid) {
        const nw = paid.filter(id => !S.seenPaid.has(id));
        if (nw.length) { chime(); nw.forEach(id => S.fresh.add(id)); setTimeout(() => { nw.forEach(id => S.fresh.delete(id)); render(); }, 12000); }
      }
      S.seenPaid = new Set(paid);
      // Auswahl aufräumen
      const waitingIds = new Set(waiting().map(i => i.id));
      [...S.sel].forEach(id => { if (!waitingIds.has(id)) S.sel.delete(id); });
      if (!S.userTouchedSel || !S.sel.size) autoSelect();
      render();
    } catch (e) {
      if (e.code === 'not_authorized') return logout(true);
      render();
    } finally { loading = false; }
  }

  function waiting() {
    if (!S.data) return [];
    const out = [];
    S.data.orders.filter(o => o.status === 'bezahlt').forEach(o => (o.items || []).forEach(i => { if (i.status === 'wartet') out.push({ ...i, order: o }); }));
    return out;
  }
  function autoSelect() {
    S.sel.clear(); S.userTouchedSel = false;
    const max = S.data ? S.data.settings.max_per_plate : 4;
    waiting().slice(0, max).forEach(i => S.sel.add(i.id));
  }
  const plateMin = n => { const a = S.data.settings.plate_minutes || [19, 32, 45, 57]; return a[Math.min(Math.max(n, 1), a.length) - 1]; };

  async function logout(expired = false) {
    if (!expired && S.session) { try { await rpc('admin_logout', { p_session: S.session }); } catch { } }
    S.session = null; store.del('kw.admin'); S.data = null;
    renderLogin(expired ? 'Sitzung abgelaufen – bitte neu anmelden.' : '');
  }

  // ---------- Rendering ----------
  function render() {
    if (!S.session) return renderLogin();
    if (!S.data) { root.innerHTML = `<div class="login"><div class="login-card"><img class="login-logo" src="img/mbg-logo.svg" alt="MBG Lohmar"><p>Lade Bestellungen …</p></div></div>`; return; }
    const d = S.data, st = d.settings;
    const scrollY = window.scrollY;
    const unpaid = d.orders.filter(o => o.status === 'unbezahlt' || o.status === 'verfallen');
    const ready = d.orders.filter(o => o.status === 'fertig');
    const done = d.orders.filter(o => ['abgeholt', 'storniert'].includes(o.status)).sort((a, b) => new Date(b.picked_at || b.paid_at || b.created_at) - new Date(a.picked_at || a.paid_at || a.created_at));
    const w = waiting();
    const printing = d.plates.filter(p => p.status === 'druck');
    const stale = Date.now() - S.lastOk > 15000;
    document.title = (w.length ? `(${w.length}) ` : '') + 'Backoffice · Namenskugeln';

    root.innerHTML = `
    <header class="bar">
      <div class="title"><img class="bar-logo" src="img/mbg-logo.svg" alt="MBG Lohmar"><span>Namenskugeln <small>Backoffice</small></span></div>
      <div class="stat"><small>Heute</small><b>${d.stats.today_items} Kugeln · ${eur(d.stats.today_revenue)}</b></div>
      <div class="stat"><small>Neue Wartezeit</small><b>ca. ${d.wait_minutes} Min.</b></div>
      ${d.closing ? `<div class="stat"><small>Bestellschluss</small><b class="${new Date(Date.now() + d.wait_minutes * 60000) > new Date(d.closing) ? 'danger' : ''}">${new Date(Date.now() + d.wait_minutes * 60000) > new Date(d.closing) ? 'ausgebucht' : 'bis ' + hhmm(d.closing) + ' Uhr'}</b></div>` : ''}
      <div class="spacer"></div>
      <span class="live ${stale ? 'off' : ''}">${stale ? 'Keine Verbindung' : 'Live'}</span>
      <button class="tbtn ${st.accepting ? 'on' : 'off'}" id="accBtn" title="Neue Bestellungen annehmen">${st.accepting ? 'Offen' : 'Pausiert'}</button>
      <div class="stepper" title="Zusätzliche Wartezeit für Kunden"><button id="exMinus" aria-label="5 Minuten weniger">−</button><span>${st.extra_minutes >= 0 ? '+' : ''}${st.extra_minutes} Min.</span><button id="exPlus" aria-label="5 Minuten mehr">+</button></div>
      <button class="tbtn icon" id="themeBtn" title="Hell / Dunkel umschalten">${I('moon')}</button>
      <button class="tbtn icon ${S.wake ? 'on' : ''}" id="wakeBtn" title="Bildschirm wach halten">${I('monitor')}</button>
      <button class="tbtn icon" id="sndBtn" title="Ton bei neuen Bestellungen">${I(S.sound ? 'bell' : 'bellOff')}</button>
      <button class="tbtn icon" id="setBtn" title="Einstellungen">${I('settings')}</button>
    </header>

    <main class="board">
      <section class="col">
        <div class="col-head"><h2>Warteschlange</h2><span class="count ${w.length ? 'red' : 'muted'}">${w.length}</span></div>
        ${w.length ? plannerHtml(printing) : ''}
        ${queueHtml()}
        ${unpaid.length ? `
          <button class="sub-head ${S.showUnpaid ? 'open' : ''}" id="tglUnpaid">${I('chevronRight')} Nicht bezahlt / abgelaufen (${unpaid.length})</button>
          ${S.showUnpaid ? unpaid.map(o => unpaidHtml(o)).join('') : ''}` : ''}
      </section>

      <section class="col">
        <div class="col-head"><h2>Im Druck</h2><span class="count ${printing.length ? 'red' : 'muted'}">${printing.length}</span></div>
        ${printersHtml(printing)}
      </section>

      <section class="col col-ready">
        <div class="col-head"><h2>Abholbereit</h2><span class="count ${ready.length ? 'pine' : 'muted'}">${ready.length}</span></div>
        ${ready.length ? ready.map(o => readyHtml(o)).join('') : `<div class="empty">Noch nichts fertig.</div>`}
        ${done.length ? `<button class="sub-head ${S.showDone ? 'open' : ''}" id="tglDone">${I('chevronRight')} Erledigt (${done.length})</button>
          ${S.showDone ? done.map(o => `<div class="done-row"><span class="no">${nr(o.number)}</span><span class="nm">${esc((o.items || []).map(i => i.name).join(', '))}</span><small>${o.status === 'storniert' ? 'storniert' : 'abgeholt ' + hhmm(o.picked_at)}</small><button class="mini-btn" data-undo="${o.id}" title="Rückgängig">${I('undo')}</button></div>`).join('') : ''}` : ''}
      </section>
    </main>`;
    window.scrollTo(0, scrollY);
    bind();
  }

  function plannerHtml(printing) {
    const st = S.data.settings;
    const n = S.sel.size;
    const busy = new Set(printing.map(p => p.printer));
    const free = []; for (let i = 1; i <= st.printers; i++) if (!busy.has(i)) free.push(i);
    if (!free.includes(S.printer)) S.printer = free[0] || 1;
    const end = new Date(Date.now() + plateMin(n || 1) * 60000);
    return `<div class="planner">
      <div class="txt"><b>${n ? `Nächste Platte: ${n} ${n === 1 ? 'Kugel' : 'Kugeln'}` : 'Kugeln auswählen'}</b>
        <small>${n ? `ca. ${plateMin(n)} Min. · fertig gegen ${hhmm(end)} Uhr` : 'Tippe unten auf die Kugeln für die nächste Platte.'}${free.length ? '' : ' · startbar, sobald ein Drucker frei ist'}</small></div>
      ${st.printers > 1 ? `<select id="prSel" aria-label="Drucker">${Array.from({ length: st.printers }, (_, k) => k + 1).map(i => `<option value="${i}" ${i === S.printer ? 'selected' : ''}>Drucker ${i}${busy.has(i) ? ' (belegt)' : ''}</option>`).join('')}</select>` : ''}
      <button class="btn" id="startBtn" ${n && free.length ? '' : 'disabled'}>${I('printer')} ${free.length ? 'Druck starten' : 'Drucker belegt'}</button>
    </div>`;
  }

  function queueHtml() {
    const orders = S.data.orders.filter(o => o.status === 'bezahlt' && (o.items || []).some(i => i.status === 'wartet'));
    if (!orders.length) return `<div class="empty">Keine wartenden Kugeln. Neue Bestellungen erscheinen hier automatisch – mit Ton.</div>`;
    return orders.map(o => `<article class="ocard ${S.fresh.has(o.id) ? 'new' : ''}">
      <div class="ohead"><span class="ono">${nr(o.number)}</span>
        <div class="ometa"><b>bezahlt ${hhmm(o.paid_at)}</b> · ${o.item_count} ${o.item_count === 1 ? 'Kugel' : 'Kugeln'} · ${eur(o.total)}<br>Kunde sieht: fertig ca. ${hhmm(o.eta)}${o.paid_by === 'backoffice' ? ' · manuell bezahlt' : ''}</div>
        <button class="mini-btn" data-cancel="${o.id}" title="Bestellung stornieren">${I('trash')}</button>
      </div>
      <div class="items">${o.items.map(i => i.status === 'wartet' ? `
        <div class="irow ${S.sel.has(i.id) ? 'sel' : ''}" data-sel="${i.id}">
          <span class="chk">${S.sel.has(i.id) ? I('check') : ''}</span>
          ${motifIco(i.variant)}
          <span class="nm">${esc(i.name)}</span>
          <button class="mini-btn" data-copy="${esc(i.name)}" title="Name kopieren (für Bambu Studio)">${I('copy')}</button>
          <span class="vchip">${esc(label(i.variant))}</span>
          <button class="mini-btn" data-edit="${i.id}" title="Name korrigieren">${I('pencil')}</button>
        </div>` : `
        <div class="irow static"><span class="chk" style="opacity:.3"></span>${motifIco(i.variant)}<span class="nm" style="opacity:.5">${esc(i.name)}</span><span class="st">${i.status === 'druck' ? 'im Druck' : 'fertig'}</span></div>`).join('')}
      </div></article>`).join('');
  }

  function printersHtml(printing) {
    const st = S.data.settings;
    const out = [];
    for (let p = 1; p <= st.printers; p++) {
      const plate = printing.find(x => x.printer === p) || null;
      const label = st.printers > 1 ? `Drucker ${p}` : 'Drucker';
      if (!plate) { out.push(`<div class="pcard idle"><div class="ptop"><b>${label}</b><span class="ptag idle">frei</span></div><div style="color:var(--ink-3);font-size:14px">Wähle links Kugeln aus und starte den Druck.</div></div>`); continue; }
      out.push(plateHtml(plate, label));
    }
    // Platten auf Druckern, die es nicht mehr gibt
    printing.filter(x => x.printer > st.printers).forEach(pl => out.push(plateHtml(pl, `Drucker ${pl.printer}`)));
    return out.join('');
  }

  function plateHtml(pl, label) {
    const items = [];
    S.data.orders.forEach(o => (o.items || []).forEach(i => { if (i.plate_id === pl.id) items.push({ ...i, order: o }); }));
    const start = new Date(pl.started_at).getTime(), dur = pl.minutes * 60000;
    const left = start + dur - Date.now();
    const pct = Math.min(100, Math.max(0, (Date.now() - start) / dur * 100));
    const over = left < 0;
    return `<div class="pcard" data-plate="${pl.id}">
      <div class="ptop"><b>${label}</b><span class="ptag ${over ? 'over' : ''}">${over ? 'Zeit um – fertig?' : 'druckt'}</span>
        <span class="ptime num">${over ? `+${mins(-left)} Min.` : `noch ${Math.max(1, mins(left))} Min.`}</span></div>
      <div class="pbar"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="plist">${items.map(i => `<div><span class="no">${nr(i.order.number)}</span><span class="nm">${esc(i.name)}</span><span class="vchip">${esc(label2(i.variant))}</span><button class="mini-btn" data-copy="${esc(i.name)}" title="Name kopieren">${I('copy')}</button></div>`).join('')}</div>
      <div class="pactions">
        <a class="btn secondary" href="${genLink(label, items)}" target="_blank" rel="noopener" title="Fertige 3MF-Datei für Bambu Studio erzeugen">${I('download')} 3D-Datei</a>
        <button class="btn pine" data-finish="${pl.id}">${I('check')} Fertig</button>
        <button class="btn secondary" data-time="${pl.id}" title="Druckzeit anpassen">${I('clock')} ${pl.minutes} Min.</button>
        <button class="btn secondary" data-abort="${pl.id}" title="Abbrechen – Kugeln zurück in die Warteschlange">${I('undo')}</button>
      </div>
    </div>`;
  }

  // Link zum 3D-Generator (generator/) mit den Kugeln dieser Platte
  function genLink(titel, items) {
    const kugeln = items.map(i => ({ nr: nr(i.order.number), name: i.name, motiv: i.variant }));
    return `generator/?titel=${encodeURIComponent(titel)}&kugeln=${encodeURIComponent(JSON.stringify(kugeln))}`;
  }

  function readyHtml(o) {
    return `<article class="ocard"><div class="rcard">
      <span class="ono">${nr(o.number)}</span>
      <div class="names"><b>${esc((o.items || []).map(i => i.name).join(', '))}</b><small>fertig seit ${hhmm(o.ready_at)} · ${eur(o.total)}</small></div>
      <button class="btn pine" data-pick="${o.id}">Abgeholt</button>
    </div></article>`;
  }

  function unpaidHtml(o) {
    const left = S.data.settings.unpaid_ttl_min - mins(Date.now() - new Date(o.created_at));
    return `<article class="ocard" style="opacity:.88"><div class="rcard">
      <div class="names"><b class="plain">${esc((o.items || []).map(i => i.name).join(', '))}</b><small>${eur(o.total)} · vorgemerkt ${ago(o.created_at)} · ${o.status === 'verfallen' ? '<span class="danger">abgelaufen</span>' : `verfällt in ${Math.max(0, left)} Min.`}</small></div>
      <button class="btn secondary small" data-paid="${o.id}" title="Wenn der Kunde den Code nicht scannen kann">Bezahlt</button>
      <button class="mini-btn" data-cancel="${o.id}" title="Löschen">${I('trash')}</button>
    </div></article>`;
  }

  const label = k => { const v = (S.data.settings.variants || []).find(v => v.key === k); return v ? v.label : k; };
  const label2 = label;

  // ---------- Events ----------
  function bind() {
    const on = (sel, fn) => root.querySelectorAll(sel).forEach(el => el.onclick = e => { e.stopPropagation(); fn(el, e); });
    on('#accBtn', () => act('admin_update_settings', { p_patch: { accepting: !S.data.settings.accepting } }, S.data.settings.accepting ? 'Bestellungen pausiert' : 'Bestellungen wieder offen'));
    on('#exPlus', () => act('admin_update_settings', { p_patch: { extra_minutes: S.data.settings.extra_minutes + 5 } }));
    on('#exMinus', () => act('admin_update_settings', { p_patch: { extra_minutes: Math.max(-60, S.data.settings.extra_minutes - 5) } }));
    on('#sndBtn', () => { S.sound = !S.sound; store.set('kw.sound', S.sound); if (S.sound) chime(); render(); });
    on('#setBtn', openSettings);
    on('#tglDone', () => { S.showDone = !S.showDone; render(); });
    on('#tglUnpaid', () => { S.showUnpaid = !S.showUnpaid; render(); });
    on('[data-sel]', el => {
      const id = el.dataset.sel;
      const max = S.data.settings.max_per_plate;
      if (S.sel.has(id)) S.sel.delete(id);
      else { if (S.sel.size >= max) { toast(`Maximal ${max} Kugeln pro Platte.`, true); return; } S.sel.add(id); }
      S.userTouchedSel = true; render();
    });
    const prSel = $('#prSel'); if (prSel) prSel.onchange = () => { S.printer = +prSel.value; };
    on('#startBtn', async el => {
      if (S.busy) return; S.busy = true; el.disabled = true;
      const ids = [...S.sel];
      const ok = await act('admin_start_plate', { p_item_ids: ids, p_printer: S.printer }, `Druck gestartet (${ids.length} ${ids.length === 1 ? 'Kugel' : 'Kugeln'})`);
      if (ok) autoSelect();
      S.busy = false; render();
    });
    on('[data-finish]', async el => {
      const id = el.dataset.finish;
      if (await act('admin_finish_plate', { p_plate: id })) toast('Platte fertig – Kunden sehen „Abholbereit“', false, () => act('admin_reopen_plate', { p_plate: id }, 'Zurück im Druck'));
    });
    on('[data-copy]', async el => {
      try { await navigator.clipboard.writeText(el.dataset.copy); toast(`„${el.dataset.copy}“ kopiert`); }
      catch { const r = document.createRange(); const n = el.previousElementSibling; r.selectNodeContents(n); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Markiert – mit ⌘C kopieren'); }
    });
    on('#wakeBtn', toggleWake);
    on('#themeBtn', () => {
      const t = getTheme(), dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
      setTheme(dark ? 'light' : 'dark'); toast(dark ? 'Helles Design' : 'Dunkles Design');
    });
    on('[data-abort]', async el => {
      if (await dialog({ title: 'Druck abbrechen?', text: 'Die Kugeln kommen zurück in die Warteschlange.', ok: 'Abbrechen & zurücklegen', cancel: 'Weiter drucken', danger: true }))
        act('admin_cancel_plate', { p_plate: el.dataset.abort }, 'Zurück in der Warteschlange');
    });
    on('[data-time]', async el => {
      const pl = S.data.plates.find(p => p.id === el.dataset.time);
      const v = await dialog({ title: 'Druckzeit dieser Platte', text: 'Gesamtdauer in Minuten (z. B. aus Bambu Studio). Die Abholzeiten passen sich automatisch an.', input: { type: 'number', value: pl.minutes }, ok: 'Speichern' });
      if (v != null && +v > 0) act('admin_set_plate_minutes', { p_plate: pl.id, p_minutes: Math.round(+v) }, 'Druckzeit gespeichert');
    });
    on('[data-pick]', async el => {
      const id = el.dataset.pick;
      if (await act('admin_set_order_status', { p_order: id, p_status: 'abgeholt' })) toast('Als abgeholt markiert', false, () => act('admin_set_order_status', { p_order: id, p_status: 'zurueck' }, 'Rückgängig gemacht'));
    });
    on('[data-undo]', el => act('admin_set_order_status', { p_order: el.dataset.undo, p_status: 'zurueck' }, 'Rückgängig gemacht'));
    on('[data-paid]', async el => {
      if (await dialog({ title: 'Als bezahlt markieren?', text: 'Nur wenn an der Kasse wirklich bezahlt wurde. Die Bestellung bekommt dann eine Nummer und kommt in die Warteschlange.', ok: 'Ja, bezahlt' }))
        act('admin_set_order_status', { p_order: el.dataset.paid, p_status: 'bezahlt' }, 'Als bezahlt markiert');
    });
    on('[data-cancel]', async el => {
      if (await dialog({ title: 'Bestellung stornieren?', text: 'Sie verschwindet aus der Warteschlange. Unter „Erledigt“ kannst du das rückgängig machen.', ok: 'Stornieren', danger: true }))
        act('admin_set_order_status', { p_order: el.dataset.cancel, p_status: 'storniert' }, 'Storniert');
    });
    on('[data-edit]', async el => {
      let item; S.data.orders.forEach(o => (o.items || []).forEach(i => { if (i.id === el.dataset.edit) item = i; }));
      const v = await dialog({ title: 'Name korrigieren', input: { value: item.name }, ok: 'Speichern' });
      if (v != null && v.trim() && v.trim() !== item.name) act('admin_update_item', { p_item: item.id, p_name: v.trim(), p_variant: item.variant }, 'Name geändert');
    });
  }

  // ---------- Einstellungen ----------
  function shopUrl() { return location.href.replace(/admin\.html.*$/, '').replace(/[?#].*$/, ''); }
  function qrSvg(text) {
    const q = window.qrcode(0, 'M'); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }
  function download(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name;
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function svgToPng(svg, name) {
    const img = new Image(); const size = 1200;
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.drawImage(img, 0, 0, size, size);
      c.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); }, 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function openSettings() {
    const st = S.data.settings;
    const scrim = document.createElement('div'); scrim.className = 'modal-scrim';
    const dr = document.createElement('aside'); dr.className = 'drawer'; dr.setAttribute('role', 'dialog');
    const shop = shopUrl(), payUrl = `${shop}?k=${st.pay_code}`;
    const pm = st.plate_minutes || [19, 32, 45, 57];
    dr.innerHTML = `
      <div class="drawer-head"><h2>Einstellungen</h2><button class="tbtn icon" data-x>${I('x')}</button></div>
      <div class="drawer-body">
        <div class="group-title">Darstellung (nur Backoffice)</div>
        <div class="group"><div class="row"><div class="lbl"><b>Design</b><small>Die Kundenseite bleibt immer hell.</small></div>
          <div class="seg" role="radiogroup" aria-label="Design">${[['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([k, l]) => `<button role="radio" aria-checked="${getTheme() === k}" data-theme-set="${k}">${l}</button>`).join('')}</div></div></div>

        <div class="group-title">QR-Codes zum Drucken</div>
        <div class="group">
          <div class="qr-box"><div class="qr">${qrSvg(shop)}</div><div class="info"><b>Bestell-Code (für den Stand)</b><code>${esc(shop)}</code>
            <div class="btns"><button class="btn secondary small" data-dl="shop-svg">${I('download')} SVG</button><button class="btn secondary small" data-dl="shop-png">PNG</button></div></div></div>
          <div class="qr-box" style="border-top:1px solid var(--line)"><div class="qr">${qrSvg(payUrl)}</div><div class="info"><b>Kassen-Code (nur beim Bezahlen zeigen)</b>
            <div>Zahlencode: <span class="big-code">${esc(st.pay_code)}</span></div>
            <div class="btns"><button class="btn secondary small" data-dl="pay-svg">${I('download')} SVG</button><button class="btn secondary small" data-dl="pay-png">PNG</button><button class="btn secondary small" id="newCode">Neuer Code</button></div></div></div>
        </div>
        <p style="color:var(--ink-3);font-size:13px;margin:8px 6px 0">SVG lässt sich in Bambu Studio importieren und als 3D-Relief drucken. Nach „Neuer Code“ gilt der alte Kassen-Code nicht mehr – dann den neuen drucken.</p>

        <div class="group-title">Drucker & Zeiten</div>
        <div class="group">
          <div class="row"><div class="lbl"><b>Anzahl Drucker</b><small>Mehr Drucker = kürzere Wartezeit</small></div><input type="number" min="1" max="8" id="sPrinters" value="${st.printers}"><span class="unit"></span></div>
          <div class="row"><div class="lbl"><b>Max. Kugeln pro Platte</b></div><input type="number" min="1" max="12" id="sMax" value="${st.max_per_plate}"><span class="unit"></span></div>
          ${pm.map((m, i) => `<div class="row"><div class="lbl"><b>Druckzeit mit ${i + 1} ${i ? 'Kugeln' : 'Kugel'}</b></div><input type="number" min="1" max="600" data-pm="${i}" value="${m}"><span class="unit">Min.</span></div>`).join('')}
          <div class="row"><div class="lbl"><b>Puffer bis zur Abholung</b><small>Abkühlen, Ablösen, Einpacken</small></div><input type="number" min="0" max="120" id="sBuf" value="${st.buffer_minutes}"><span class="unit">Min.</span></div>
        </div>

        <div class="group-title">Preise & Bestellungen</div>
        <div class="group">
          <div class="row"><div class="lbl"><b>Preis pro Kugel</b></div><input type="number" step="0.10" min="0" id="sP1" value="${(+st.price_single).toFixed(2)}"><span class="unit">€</span></div>
          <div class="row"><div class="lbl"><b>Mengenpreis</b><small>pro Kugel</small></div><input type="number" step="0.10" min="0" id="sP2" value="${(+st.price_bulk).toFixed(2)}"><span class="unit">€</span></div>
          <div class="row"><div class="lbl"><b>Mengenpreis ab</b></div><input type="number" min="1" max="50" id="sBulk" value="${st.bulk_from}"><span class="unit">Stk.</span></div>
          <div class="row"><div class="lbl"><b>Max. Kugeln pro Bestellung</b></div><input type="number" min="1" max="40" id="sMaxItems" value="${st.max_items}"><span class="unit"></span></div>
          <div class="row"><div class="lbl"><b>Reservierung ohne Bezahlung</b><small>Danach verfällt die Bestellung</small></div><input type="number" min="5" max="240" id="sTtl" value="${st.unpaid_ttl_min}"><span class="unit">Min.</span></div>
        </div>
        <div class="group-title">Markttage & Bestellschluss</div>
        <div class="group">
          ${closingRows(st.closing || {})}
          <div class="row"><div class="lbl"><small>Keine neuen Bestellungen, die erst nach Marktende fertig würden. Uhrzeit leer lassen = kein Bestellschluss an dem Tag.</small></div><button class="btn secondary small" id="addDay">+ Tag</button></div>
        </div>

        <div class="group-title">Motive</div>
        <div class="group">${(st.variants || []).map((v, i) => `<div class="row">${motifIco(v.key)}<div class="lbl"><b>${esc(v.label)}</b><small>${v.active ? 'wird angeboten' : 'ausgeblendet'}</small></div><button class="switch" role="switch" aria-checked="${!!v.active}" data-var="${i}" aria-label="${esc(v.label)} anbieten"></button></div>`).join('')}</div>

        <div style="display:flex;gap:10px;margin-top:18px"><button class="btn pine" id="saveSet" style="flex:1">Speichern</button></div>

        <div class="group-title">Sicherheit & Datenschutz</div>
        <div class="group">
          <div class="row"><div class="lbl"><b>Passwort ändern</b></div><button class="btn secondary small" id="chPw">Ändern</button></div>
          <div class="row"><div class="lbl"><b class="danger">Erledigte Bestellungen löschen</b><small>Abgeholte, stornierte und verfallene endgültig entfernen (z. B. nach dem Markt)</small></div><button class="btn small danger-btn" id="purge">Löschen</button></div>
          <div class="row"><div class="lbl"><b>Abmelden</b><small>auf diesem Gerät</small></div><button class="btn secondary small" id="lo">${I('logout')}</button></div>
        </div>
      </div>`;
    document.body.append(scrim, dr);
    requestAnimationFrame(() => { scrim.classList.add('show'); dr.classList.add('show'); });
    const close = () => { scrim.classList.remove('show'); dr.classList.remove('show'); setTimeout(() => { scrim.remove(); dr.remove(); }, 350); };
    scrim.onclick = close; $('[data-x]', dr).onclick = close;
    const vars = (st.variants || []).map(v => ({ ...v }));
    dr.querySelectorAll('[data-var]').forEach(b => b.onclick = () => {
      const v = vars[+b.dataset.var]; v.active = !v.active;
      if (!vars.some(x => x.active)) { v.active = true; toast('Mindestens ein Motiv muss aktiv sein.', true); }
      b.setAttribute('aria-checked', v.active); b.previousElementSibling.querySelector('small').textContent = v.active ? 'wird angeboten' : 'ausgeblendet';
    });
    dr.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => {
      const [which, fmt] = b.dataset.dl.split('-');
      const svg = qrSvg(which === 'shop' ? shop : payUrl).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
      const name = which === 'shop' ? 'kugelwerk-bestellen' : 'kugelwerk-kasse-' + st.pay_code;
      fmt === 'svg' ? download(name + '.svg', svg, 'image/svg+xml') : svgToPng(svg, name + '.png');
    });
    $('#newCode', dr).onclick = async () => {
      if (!await dialog({ title: 'Neuen Kassen-Code erzeugen?', text: 'Der alte QR-Code an der Kasse funktioniert danach <b>nicht mehr</b>. Nur machen, wenn jemand den Code missbraucht.', ok: 'Neuen Code erzeugen', danger: true })) return;
      const code = String(Math.floor(1000 + Math.random() * 9000));
      if (await act('admin_update_settings', { p_patch: { pay_code: code } }, 'Neuer Kassen-Code: ' + code)) { close(); setTimeout(openSettings, 400); }
    };
    dr.querySelectorAll('[data-theme-set]').forEach(b => b.onclick = () => {
      setTheme(b.dataset.themeSet);
      dr.querySelectorAll('[data-theme-set]').forEach(x => x.setAttribute('aria-checked', x === b));
    });
    const bindClosing = () => dr.querySelectorAll('[data-cdel]').forEach(b => b.onclick = () => b.closest('.closing-row').remove());
    bindClosing();
    $('#addDay', dr).onclick = () => { const last = [...dr.querySelectorAll('.closing-row')].pop(); last.insertAdjacentHTML('afterend', closingRows({ '': '' }).replace('value=""', 'value=""')); bindClosing(); };
    $('#saveSet', dr).onclick = async () => {
      const num = (id, d) => { const v = parseFloat($(id, dr).value); return isFinite(v) ? v : d; };
      const patch = {
        printers: Math.round(Math.min(8, Math.max(1, num('#sPrinters', st.printers)))),
        max_per_plate: Math.round(Math.min(12, Math.max(1, num('#sMax', st.max_per_plate)))),
        plate_minutes: [...dr.querySelectorAll('[data-pm]')].map(i => Math.max(1, Math.round(+i.value || 1))),
        buffer_minutes: Math.round(Math.max(0, num('#sBuf', st.buffer_minutes))),
        price_single: Math.max(0, num('#sP1', st.price_single)),
        price_bulk: Math.max(0, num('#sP2', st.price_bulk)),
        bulk_from: Math.round(Math.max(1, num('#sBulk', st.bulk_from))),
        max_items: Math.round(Math.min(40, Math.max(1, num('#sMaxItems', st.max_items)))),
        unpaid_ttl_min: Math.round(Math.min(240, Math.max(5, num('#sTtl', st.unpaid_ttl_min)))),
        closing: readClosing(dr),
        variants: vars
      };
      // Druckzeiten-Liste an "max pro Platte" anpassen
      while (patch.plate_minutes.length < patch.max_per_plate) {
        const a = patch.plate_minutes, step = a.length > 1 ? a[a.length - 1] - a[a.length - 2] : 13;
        a.push(a[a.length - 1] + Math.max(1, step));
      }
      patch.plate_minutes = patch.plate_minutes.slice(0, patch.max_per_plate);
      if (await act('admin_update_settings', { p_patch: patch }, 'Gespeichert')) close();
    };
    $('#chPw', dr).onclick = async () => {
      const old = await dialog({ title: 'Aktuelles Passwort', input: { type: 'password' }, ok: 'Weiter' }); if (old == null) return;
      const nw = await dialog({ title: 'Neues Passwort', text: 'Mindestens 8 Zeichen. Andere Geräte werden abgemeldet.', input: { type: 'password' }, ok: 'Speichern' }); if (nw == null) return;
      act('admin_change_password', { p_old: old, p_new: nw }, 'Passwort geändert');
    };
    $('#purge', dr).onclick = async () => {
      const v = await dialog({ title: 'Endgültig löschen?', text: 'Alle abgeholten, stornierten und verfallenen Bestellungen werden gelöscht. Zur Bestätigung <b>LÖSCHEN</b> eintippen.', input: { placeholder: 'LÖSCHEN' }, ok: 'Endgültig löschen', danger: true });
      if (v == null) return;
      if (v.trim().toUpperCase() !== 'LÖSCHEN') return toast('Abgebrochen – Wort stimmte nicht.', true);
      try { const n = await rpc('admin_purge', { p_session: S.session }); toast(`${n} Bestellungen gelöscht`); load(); } catch (e) { toast(errMsg(e), true); }
    };
    $('#lo', dr).onclick = () => { close(); logout(); };
  }

  // ---------- Start ----------
  let timer;
  function closingRows(c) {
    const days = Object.keys(c).sort();
    if (!days.length) days.push('');
    return days.map(d => `<div class="row closing-row"><div class="lbl"><b>Markttag</b></div><input type="date" class="wide" data-cday value="${esc(d)}"><input type="time" data-ctime value="${esc(c[d] || '')}"><button class="mini-btn" data-cdel title="Tag entfernen">${I('x')}</button></div>`).join('');
  }
  function readClosing(dr) {
    const out = {};
    dr.querySelectorAll('.closing-row').forEach(r => {
      const d = r.querySelector('[data-cday]').value, t = r.querySelector('[data-ctime]').value;
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && /^\d{1,2}:\d{2}$/.test(t)) out[d] = t;
    });
    return out;
  }
  function getTheme() { return store.get('kw.theme', 'auto'); }
  function setTheme(t) {
    store.set('kw.theme', t);
    document.documentElement.setAttribute('data-theme', t);
    syncThemeColor();
  }
  function syncThemeColor() {
    const t = getTheme(), dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = dark ? '#14150f' : '#fffbf3';
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeColor);
  syncThemeColor();

  let wakeLock = null;
  async function toggleWake() {
    try {
      if (wakeLock) { await wakeLock.release(); wakeLock = null; S.wake = false; toast('Bildschirm darf wieder ausgehen'); }
      else { wakeLock = await navigator.wakeLock.request('screen'); S.wake = true; toast('Bildschirm bleibt an'); wakeLock.addEventListener('release', () => { if (S.wake && document.visibilityState === 'visible') return; }); }
    } catch { toast('Dieser Browser kann den Bildschirm nicht wach halten – in den Mac-Einstellungen „Bildschirm aus“ auf „Nie“ stellen.', true); }
    render();
  }
  document.addEventListener('visibilitychange', async () => { if (S.wake && document.visibilityState === 'visible') { try { wakeLock = await navigator.wakeLock.request('screen'); } catch { } } });

  function start() {
    render(); load();
    clearInterval(timer);
    timer = setInterval(() => { if (document.visibilityState === 'visible') load(); else if (Date.now() - S.lastOk > 20000) load(); }, 3000);
    // Fortschrittsbalken jede 20 s neu zeichnen, auch ohne neue Daten
    setInterval(() => { if (S.data && !document.querySelector('.dlg, .drawer')) render(); }, 20000);
    // Ton freischalten (Browser erlauben Audio erst nach einer Interaktion)
    document.addEventListener('click', () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch { } }, { once: true });
  }
  if (S.session) start(); else renderLogin();
})();
