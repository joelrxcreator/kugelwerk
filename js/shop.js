// Lohmarer Weihnachtsmarkt · Namenskugeln – Kundenseite
(function () {
  'use strict';
  const { rpc } = window.KW_API;
  const I = window.KW_ICON;
  const $ = (s, el = document) => el.querySelector(s);
  const app = $('#app');

  // ---------- Hilfen ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = n => (Math.round(n * 100) / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const hhmm = d => new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  const minsUntil = d => Math.max(0, Math.round((new Date(d) - Date.now()) / 60000));
  const nr = n => '#' + String(n).padStart(2, '0');
  const NAME_OK = /^[A-Za-zÀ-ÖØ-öø-ÿĀ-žẞ' .&-]*$/;
  const MAX_NAME = 16;
  const REVIVE_MS = 4 * 3600e3;   // verfallene Bestellungen können 4 Std. lang noch bezahlt werden

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privater Modus */ } }
  };

  const VARIANT_FALLBACK = [
    { key: 'herzen', label: 'Herzen' }, { key: 'sterne', label: 'Sterne' },
    { key: 'glanzsterne', label: 'Glanzsterne' }, { key: 'schneeflocken', label: 'Schneeflocken' },
    { key: 'pfoten', label: 'Pfoten' }
  ];
  const MOTIF_ICON = { herzen: 'heart', sterne: 'star', glanzsterne: 'sparkles', schneeflocken: 'snowflake', pfoten: 'paw' };
  const SOFT = { glanzsterne: 'Glanz&shy;sterne', schneeflocken: 'Schnee&shy;flocken' };
  const img = key => `img/v-${key}.jpg`;
  const thumb = key => `img/v-${key}-s.jpg`;
  const motif = key => `<span class="motif">${I(MOTIF_ICON[key] || 'star')}</span>`;

  // ---------- Zustand ----------
  const S = {
    info: null,
    variants: VARIANT_FALLBACK,
    draft: store.get('kw.draft', null) || [{ name: '', variant: 'herzen' }],
    active: 0,
    tokens: store.get('kw.orders', []),
    orders: [],
    view: 'shop',
    current: null,
    busy: false
  };
  if (!Array.isArray(S.draft) || !S.draft.length) S.draft = [{ name: '', variant: 'herzen' }];
  S.active = S.draft.length - 1;
  const saveDraft = () => store.set('kw.draft', S.draft);
  const saveTokens = () => store.set('kw.orders', S.tokens);
  const labelOf = key => (S.variants.find(v => v.key === key) || VARIANT_FALLBACK.find(v => v.key === key) || { label: key }).label;
  const canOrder = () => !S.info || (S.info.accepting && !S.info.sold_out);
  const revivable = o => o.status === 'verfallen' && Date.now() - new Date(o.created_at) < REVIVE_MS;

  function priceFor(n) {
    const i = S.info || { price_single: 2.5, price_bulk: 2, bulk_from: 3 };
    const each = n >= i.bulk_from ? +i.price_bulk : +i.price_single;
    return { each, total: each * n, full: n * +i.price_single, bulk: n >= i.bulk_from, need: Math.max(0, i.bulk_from - n), info: i };
  }

  // ---------- Toast ----------
  let toastT;
  function toast(msg, err = false) {
    const t = $('#toast');
    t.textContent = msg; t.classList.toggle('err', err); t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3400);
  }
  function errText(e) {
    const c = (e && e.code) || '';
    if (c === 'offline') return 'Keine Verbindung – bitte nochmal versuchen.';
    if (c === 'not_accepting') return 'Gerade nehmen wir keine neuen Bestellungen an.';
    if (c === 'sold_out') return 'Für heute sind leider alle Druckplätze vergeben.';
    if (c === 'busy') return 'Gerade ist sehr viel los – bitte in einer Minute nochmal.';
    if (c.startsWith('bad_name')) return 'Bitte prüfe die Namen (nur Buchstaben, max. 16 Zeichen).';
    if (c.startsWith('bad_variant')) return 'Ein Motiv ist gerade nicht verfügbar – bitte ein anderes wählen.';
    if (c === 'wrong_code') return 'Der Code stimmt nicht. Frag kurz an der Kasse nach.';
    if (c === 'locked') return 'Zu viele Versuche – bitte kurz am Stand melden.';
    return 'Da ist etwas schiefgelaufen. Bitte nochmal versuchen.';
  }

  // ---------- Schneeflocken wie auf dem Flyer ----------
  const FLAKE = `<svg viewBox="-50 -50 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round">${
    [0, 60, 120, 180, 240, 300].map(a => `<g transform="rotate(${a})"><path d="M0 0V-44"/><path d="M0-20 -11-31M0-20 11-31"/><path d="M0-32 -8-40M0-32 8-40"/></g>`).join('')}</g></svg>`;
  (function flakes() {
    const box = document.createElement('div'); box.className = 'flakes'; box.setAttribute('aria-hidden', 'true');
    box.innerHTML = [1, 2, 3, 4, 5, 6].map(i => FLAKE.replace('<svg ', `<svg class="f${i}" `)).join('');
    document.body.prepend(box);
  })();

  // ---------- Kopfzeile ----------
  function renderTop() {
    const el = $('#topRight');
    const open = S.orders.filter(o => ['unbezahlt', 'bezahlt', 'fertig'].includes(o.status));
    if (S.view === 'shop' && open.length) {
      const o = open[0];
      const lbl = o.status === 'fertig' ? 'Abholbereit!' : o.status === 'unbezahlt' ? 'Jetzt bezahlen' : (o.number ? `Bestellung ${nr(o.number)}` : 'Meine Bestellung');
      el.innerHTML = `<button class="chip ${o.status !== 'bezahlt' ? 'solid' : ''}" id="toOrder">${I('package')}${esc(open.length > 1 ? 'Meine Bestellungen' : lbl)}</button>`;
      $('#toOrder').onclick = () => open.length > 1 ? go('list') : go('order', o.token);
    } else if (S.info && S.view === 'shop') {
      el.innerHTML = !S.info.accepting ? `<span class="chip">Pause</span>`
        : S.info.sold_out ? `<span class="chip">Heute ausgebucht</span>`
        : `<span class="chip live">ca. ${S.info.wait_minutes} Min.</span>`;
    } else el.innerHTML = '';
  }

  // ---------- Navigation ----------
  function go(view, token = null, push = true) {
    S.view = view; S.current = token;
    if (push) history.pushState({ view, token }, '', view === 'shop' ? location.pathname : `#${view}`);
    render(); scrollTo(0, 0);
  }
  addEventListener('popstate', e => { const st = e.state || { view: 'shop' }; S.view = st.view; S.current = st.token; render(); });

  function render() {
    renderTop();
    if (S.view === 'order') {
      const o = S.orders.find(x => x.token === S.current);
      if (o) return renderOrder(o);
      S.view = 'shop';
    }
    if (S.view === 'list') return renderList();
    document.title = 'Namenskugeln · Lohmarer Weihnachtsmarkt';
    renderShop();
  }

  // ================= SHOP =================
  function renderShop() {
    const info = S.info, p = priceFor(1);
    app.innerHTML = `
      <section class="hero">
        <div class="brush" aria-label="Lohmarer Familien- und Kunsthandwerker Weihnachtsmarkt">
          <div class="l1">Lohmarer</div>
          <div class="l2">Familien- und Kunsthandwerker</div>
          <div class="l3">Weihnachtsmarkt</div>
        </div>
        <div class="hero-media">
          <img src="img/hero.jpg" alt="Weiße 3D-gedruckte Weihnachtskugeln mit Namen am Tannenbaum" onerror="this.remove()">
          <span class="hero-badge"><span class="dot"></span>Live hier am Stand 3D-gedruckt</span>
        </div>
        <h1>Deine Baumkugel<br>mit deinem Namen</h1>
        <p class="lead">Name eingeben, Motiv wählen – wir drucken sie dir direkt hier am Stand${info && canOrder() ? `. Abholbereit in ca. ${info.wait_minutes} Minuten.` : '.'}</p>
        <div class="price-row">
          <span class="pill">${eur(p.info.price_single)} pro Kugel</span>
          <span class="pill beige">ab ${p.info.bulk_from} Stück nur ${eur(p.info.price_bulk)}</span>
        </div>
        <p class="charity">${I('heart')}<span>Der gesamte Gewinn wird für eine Mädchenstation in Kenia verwendet.</span></p>
        ${info && !info.accepting ? `<div class="note-box warn">${I('clock')}<span>Gerade nehmen wir keine neuen Bestellungen an. Du kannst deine Kugel schon gestalten – schau gleich nochmal vorbei.</span></div>` : ''}
        ${info && info.accepting && info.sold_out ? `<div class="note-box warn">${I('clock')}<span>Für heute sind leider alle Druckplätze vergeben – unsere Drucker schaffen bis Marktende keine weiteren Kugeln. Danke für dein Verständnis!</span></div>` : ''}
      </section>

      <div class="section-title"><h2>Deine Kugeln</h2><span id="countLbl"></span></div>
      <div id="cards"></div>
      <button class="add-btn" id="addBtn">${I('plus')} Noch eine Kugel</button>
      <div class="bulk-hint" id="bulkHint"></div>

      <section class="how" aria-label="So funktioniert's">
        <div class="eyebrow" style="margin:0 4px 2px">So einfach geht's</div>
        <div class="how-step"><span class="n">1</span><div><b>Gestalten</b><small>Namen eingeben und Motiv wählen</small></div></div>
        <div class="how-step"><span class="n">2</span><div><b>An der Kasse bezahlen</b><small>Bar oder Karte – dort scannst du kurz unseren Code</small></div></div>
        <div class="how-step"><span class="n">3</span><div><b>Wir drucken, du holst ab</b><small>Hier siehst du live, wann deine Kugel fertig ist</small></div></div>
      </section>

      <footer class="foot">
        <div class="times"><div>Sa. 05.12. 15:30–21:00 Uhr<br>So. 06.12. 12:00–18:00 Uhr</div><span class="bar"></span><div>Kirchstraße<br>53797 Lohmar</div></div>
        <div class="links"><button id="lookupBtn">Bestellnummer nachschauen</button><button id="privacyBtn">Datenschutz</button></div>
        <img class="mbg" src="img/mbg-logo.svg" alt="MBG Lohmar">
      </footer>`;
    $('#addBtn').onclick = addItem;
    $('#lookupBtn').onclick = openLookup;
    $('#privacyBtn').onclick = openPrivacy;
    renderCards();
    updateDock();
  }

  function renderCards() {
    const box = $('#cards'); if (!box) return;
    box.innerHTML = S.draft.map((it, i) => i === S.active ? cardActive(it, i) : cardRow(it, i)).join('');
    const max = (S.info && S.info.max_items) || 10;
    $('#addBtn').hidden = S.draft.length >= max;
    box.querySelectorAll('.krow').forEach(r => r.onclick = () => { S.active = +r.dataset.i; renderCards(); focusName(); });
    box.querySelectorAll('[data-del]').forEach(b => b.onclick = e => { e.stopPropagation(); removeItem(+b.dataset.del); });
    box.querySelectorAll('.var').forEach(b => b.onclick = () => {
      S.draft[S.active].variant = b.dataset.v; saveDraft();
      box.querySelectorAll('.var').forEach(x => x.setAttribute('aria-pressed', x === b));
      const ph = $('#activePhoto');
      if (ph) { ph.src = img(b.dataset.v); const w = ph.closest('.photo'); w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump'); }
      const cap = $('#activeCap'); if (cap) cap.textContent = labelOf(b.dataset.v);
    });
    const inp = $('#nameInput');
    if (inp) {
      inp.oninput = () => onName(inp);
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } };
      inp.onblur = () => { S.draft[S.active].name = inp.value.trim().replace(/\s+/g, ' '); inp.value = S.draft[S.active].name; saveDraft(); };
    }
    updateBulkHint(); fitPreview();
    const n = S.draft.length; $('#countLbl').textContent = n === 1 ? '1 Kugel' : `${n} Kugeln`;
  }

  function cardActive(it, i) {
    const multi = S.draft.length > 1;
    return `<article class="kcard" data-i="${i}">
      <div class="kcard-head"><span class="eyebrow">Kugel ${i + 1}</span>
        ${multi ? `<button class="icon-btn" data-del="${i}" aria-label="Kugel ${i + 1} entfernen">${I('trash')}</button>` : '<span style="height:44px"></span>'}</div>
      <div class="photo"><img id="activePhoto" src="${img(it.variant)}" alt="Beispielfoto ${esc(labelOf(it.variant))}"><span class="photo-cap">Echtes Beispiel · <b id="activeCap">${esc(labelOf(it.variant))}</b></span></div>
      <div class="kcard-body">
        <div>
          <input id="nameInput" class="input" type="text" inputmode="text" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false"
            enterkeyhint="done" maxlength="${MAX_NAME}" placeholder="Name eingeben, z. B. Emma" value="${esc(it.name)}" aria-label="Name für Kugel ${i + 1}">
          <div class="name-hint" id="nameHint">${it.name ? '' : 'Vorname oder Spitzname – max. 16 Zeichen.'}</div>
          <div class="name-preview ${it.name ? '' : 'empty'}" id="namePrev" aria-hidden="true"><span>${esc(it.name) || 'Dein Name'}</span><small>In dieser Schrift kommt dein Name auf die Kugel</small></div>
        </div>
        <div>
          <div class="eyebrow" style="margin:0 2px 10px">Motiv wählen</div>
          <div class="variants" role="group" aria-label="Motiv">
            ${S.variants.map(v => `<button class="var" data-v="${v.key}" aria-pressed="${v.key === it.variant}">
              <img src="${thumb(v.key)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span>${SOFT[v.key] || esc(v.label)}</span></button>`).join('')}
          </div>
        </div>
      </div>
    </article>`;
  }

  function cardRow(it, i) {
    return `<article class="kcard"><div class="krow" data-i="${i}" role="button" tabindex="0" aria-label="Kugel ${i + 1} bearbeiten">
      ${motif(it.variant)}
      <div class="txt"><div class="nm ${it.name ? 'scr' : 'empty'}">${it.name ? esc(it.name) : 'Name fehlt noch'}</div><div class="vr">${esc(labelOf(it.variant))}</div></div>
      <button class="icon-btn" data-del="${i}" aria-label="Kugel ${i + 1} entfernen">${I('trash')}</button>
    </div></article>`;
  }

  function onName(inp) {
    let v = inp.value;
    const hint = $('#nameHint');
    if (!NAME_OK.test(v)) {
      v = v.replace(/[^A-Za-zÀ-ÖØ-öø-ÿĀ-žẞ' .&-]/g, ''); inp.value = v;
      hint.textContent = 'Bitte nur Buchstaben – keine Zahlen oder Emojis.'; hint.className = 'name-hint err';
    } else { hint.textContent = v.length >= MAX_NAME ? `Maximal ${MAX_NAME} Zeichen.` : ''; hint.className = 'name-hint'; }
    inp.classList.remove('invalid');
    S.draft[S.active].name = v; saveDraft(); updateDock();
    const pv = $('#namePrev'); if (pv) { pv.classList.toggle('empty', !v.trim()); pv.querySelector('span').textContent = v.trim() || 'Dein Name'; fitPreview(); }
  }
  function fitPreview() {
    const pv = $('#namePrev'); if (!pv) return;
    const sp = pv.querySelector('span'); sp.style.fontSize = '';
    let size = parseFloat(getComputedStyle(sp).fontSize);
    while (sp.scrollWidth > pv.clientWidth - 24 && size > 20) { size -= 2; sp.style.fontSize = size + 'px'; }
  }
  function focusName() { const i = $('#nameInput'); if (i && !i.value) setTimeout(() => i.focus(), 50); }

  function addItem() {
    const cur = S.draft[S.active];
    if (cur && !cur.name.trim()) { markMissing(); return; }
    const max = (S.info && S.info.max_items) || 10;
    if (S.draft.length >= max) return;
    S.draft.push({ name: '', variant: cur ? cur.variant : 'herzen' });
    S.active = S.draft.length - 1; saveDraft(); renderCards(); updateDock();
    const card = document.querySelector(`.kcard[data-i="${S.active}"]`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    focusName();
  }
  function removeItem(i) {
    S.draft.splice(i, 1);
    if (!S.draft.length) S.draft.push({ name: '', variant: 'herzen' });
    S.active = Math.min(S.active > i ? S.active - 1 : S.active, S.draft.length - 1);
    saveDraft(); renderCards(); updateDock();
  }
  function markMissing() {
    const inp = $('#nameInput'); if (!inp) return;
    inp.classList.add('invalid'); inp.focus();
    const h = $('#nameHint'); h.textContent = 'Bitte zuerst einen Namen eingeben.'; h.className = 'name-hint err';
    const c = inp.closest('.kcard'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
  }
  function updateBulkHint() {
    const el = $('#bulkHint'); if (!el) return;
    const p = priceFor(S.draft.length);
    el.innerHTML = p.bulk
      ? `<span class="tag">Mengenpreis</span><span>Du zahlst nur <b>${eur(p.each)}</b> pro Kugel.</span>`
      : `<span class="tag">Tipp</span><span>Noch <b>${p.need} ${p.need === 1 ? 'Kugel' : 'Kugeln'}</b>, dann kostet jede nur ${eur(p.info.price_bulk)}.</span>`;
  }
  function updateDock() {
    const dock = $('#dock');
    if (S.view !== 'shop') { dock.hidden = true; return; }
    dock.hidden = false;
    const n = S.draft.length, p = priceFor(n);
    $('#dockLabel').textContent = n === 1 ? '1 Kugel' : `${n} Kugeln`;
    $('#dockTotal').textContent = eur(p.total);
    const st = $('#dockStrike'); st.hidden = !p.bulk; st.textContent = eur(p.full);
    const btn = $('#dockBtn'); btn.disabled = !canOrder(); btn.textContent = 'Weiter'; btn.onclick = openCheckout;
    updateBulkHint();
  }

  // ---------- Sheets ----------
  function sheet(html, { onClose } = {}) {
    const scrim = document.createElement('div'); scrim.className = 'scrim';
    const sh = document.createElement('div'); sh.className = 'sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true');
    sh.innerHTML = `<div class="grab"></div>${html}`;
    document.body.append(scrim, sh);
    requestAnimationFrame(() => { scrim.classList.add('show'); sh.classList.add('show'); });
    let closed = false;
    const close = () => {
      if (closed) return; closed = true;
      scrim.classList.remove('show'); sh.classList.remove('show');
      setTimeout(() => { scrim.remove(); sh.remove(); }, 360);
      onClose && onClose();
    };
    scrim.onclick = close;
    sh.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
    return { el: sh, close };
  }
  function ask({ title, text, ok, cancel = 'Abbrechen' }) {
    return new Promise(res => {
      let v = false;
      const sh = sheet(`<h3>${esc(title)}</h3><p class="sub">${text}</p>
        <div class="pay-actions"><button class="btn" id="askOk">${esc(ok)}</button><button class="btn ghost" data-close>${esc(cancel)}</button></div>`, { onClose: () => res(v) });
      $('#askOk', sh.el).onclick = () => { v = true; sh.close(); };
    });
  }

  async function openCheckout() {
    const inp = $('#nameInput');
    if (inp) { S.draft[S.active].name = inp.value.trim().replace(/\s+/g, ' '); saveDraft(); }
    const missing = S.draft.findIndex(it => !it.name.trim());
    if (missing >= 0) { if (missing !== S.active) { S.active = missing; renderCards(); } markMissing(); return; }
    const n = S.draft.length, p = priceFor(n);
    const sh = sheet(`
      <h3>Alles richtig?</h3>
      <p class="sub">Bitte prüfe die Schreibweise – genau so wird gedruckt.</p>
      <div class="lines">${S.draft.map(it => `<div class="line">${motif(it.variant)}<span class="nm"><span class="scr">${esc(it.name)}</span><small>Schreibweise: ${esc(it.name)}</small></span><span class="vr">${esc(labelOf(it.variant))}</span></div>`).join('')}</div>
      <div class="total"><span>${n === 1 ? '1 Kugel' : `${n} Kugeln à ${eur(p.each)}`}</span><b class="num">${eur(p.total)}</b></div>
      <div class="note">${I('wallet')}<span>Bezahlt wird gleich an der Kasse – bar oder mit Karte. Erst dann starten wir den Druck.</span></div>
      <div class="note" id="etaNote" hidden></div>
      <button class="btn block" id="sendBtn">Bestellung vormerken</button>
      <button class="btn ghost block" data-close>Nochmal ändern</button>`);
    const btn = $('#sendBtn', sh.el);
    // voraussichtliche Abholzeit für genau diese Menge
    rpc('estimate', { p_count: n }).then(e => {
      const el = $('#etaNote', sh.el); if (!el) return;
      el.hidden = false;
      if (e.too_late) { el.innerHTML = `${I('alert')}<span><b>Heute nicht mehr machbar:</b> ${n} ${n === 1 ? 'Kugel wird' : 'Kugeln werden'} vor Marktende nicht mehr fertig.${n > 1 ? ' Versuch es mit weniger Kugeln.' : ''}</span>`; btn.disabled = true; }
      else el.innerHTML = `${I('clock')}<span>Voraussichtlich abholbereit gegen <b>${hhmm(e.eta)} Uhr</b> (nach dem Bezahlen).</span>`;
    }).catch(() => { });
    btn.onclick = async () => {
      if (S.busy) return; S.busy = true;
      btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Wird vorgemerkt …';
      try {
        const res = await rpc('create_order', { p_items: S.draft.map(it => ({ name: it.name, variant: it.variant })) });
        S.tokens.unshift({ t: res.token, at: Date.now() }); saveTokens();
        S.orders.unshift({ ...res.order, token: res.token });
        S.draft = [{ name: '', variant: 'herzen' }]; S.active = 0; saveDraft();
        sh.close(); go('order', res.token);
      } catch (e) {
        toast(errText(e), true);
        if (e.code === 'sold_out' || e.code === 'not_accepting') loadInfo();
        btn.disabled = false; btn.textContent = 'Bestellung vormerken';
      } finally { S.busy = false; }
    };
  }

  function openPrivacy() {
    sheet(`<h3>Datenschutz</h3>
      <div class="legal">
        <p>Wir speichern nur, was wir zum Drucken brauchen: die <b>Namen auf den Kugeln</b>, das gewählte Motiv und den Bestellstatus. Keine Konten, keine E-Mail, keine Telefonnummer, kein Tracking.</p>
        <p>Damit du deine Bestellung später wiederfindest, merkt sich <b>dein Browser</b> einen zufälligen Abholschlüssel. Andere können deine Bestellung nicht sehen.</p>
        <p>Die Daten liegen bei unserem Datenbank-Anbieter (Supabase, Server in Frankfurt) und werden <b>nach dem Weihnachtsmarkt gelöscht</b>.</p>
      </div>
      <button class="btn secondary block" style="margin-top:20px" data-close>Verstanden</button>`);
  }

  function openLookup() {
    const sh = sheet(`<h3>Bestellnummer nachschauen</h3>
      <p class="sub">Gib deine Abholnummer ein, z. B. 12.</p>
      <div style="display:flex;gap:10px;margin-top:16px"><input id="lkIn" class="input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="Nummer" style="flex:1"><button class="btn" id="lkGo" style="flex:none">Prüfen</button></div>
      <div id="lkOut" style="margin-top:16px"></div>
      <button class="btn ghost block" data-close>Schließen</button>`);
    const run = async () => {
      const v = parseInt($('#lkIn', sh.el).value, 10), out = $('#lkOut', sh.el);
      if (!v) return;
      out.innerHTML = '<p class="sub">Suche …</p>';
      try {
        const r = await rpc('lookup_number', { p_number: v });
        if (!r) { out.innerHTML = '<p class="sub">Unter dieser Nummer gibt es keine Bestellung.</p>'; return; }
        const map = { bezahlt: r.eta ? `In Arbeit – fertig ca. ${hhmm(r.eta)} Uhr` : 'In Arbeit', fertig: 'Abholbereit! Komm gern vorbei.', abgeholt: 'Schon abgeholt.', storniert: 'Storniert.' };
        out.innerHTML = `<div class="tile"><small>Bestellung ${nr(r.number)}</small><b class="sm">${esc(map[r.status] || r.status)}</b></div>`;
      } catch (e) { out.innerHTML = `<p class="sub">${esc(errText(e))}</p>`; }
    };
    $('#lkGo', sh.el).onclick = run;
    $('#lkIn', sh.el).onkeydown = e => { if (e.key === 'Enter') run(); };
    setTimeout(() => $('#lkIn', sh.el).focus(), 350);
  }

  // ================= BESTELLUNGEN =================
  function renderList() {
    $('#dock').hidden = true;
    document.title = 'Meine Bestellungen · Namenskugeln';
    const list = S.orders.filter(o => ['unbezahlt', 'bezahlt', 'fertig', 'abgeholt'].includes(o.status) || revivable(o));
    app.innerHTML = `
      <button class="btn ghost backlink" id="back">${I('chevronLeft')} Neue Kugel gestalten</button>
      <div class="section-title" style="margin-top:8px"><h2>Meine Bestellungen</h2></div>
      <div class="list-orders">${list.map(o => `<button class="ocard" data-t="${esc(o.token)}">
        <span class="no">${o.number ? nr(o.number) : '–'}</span>
        <span class="tx"><b>${esc(o.items.map(i => i.name).join(', '))}</b><small>${esc(statusShort(o))}</small></span>${I('chevronRight')}</button>`).join('')}</div>`;
    $('#back').onclick = () => go('shop');
    app.querySelectorAll('.ocard').forEach(b => b.onclick = () => go('order', b.dataset.t));
  }
  function statusShort(o) {
    if (o.status === 'unbezahlt') return 'Noch nicht bezahlt';
    if (o.status === 'verfallen') return 'Reservierung abgelaufen';
    if (o.status === 'fertig') return 'Abholbereit';
    if (o.status === 'abgeholt') return 'Abgeholt';
    if (o.items.some(i => i.status === 'druck')) return 'Wird gerade gedruckt';
    return o.eta ? `In der Warteschlange · ca. ${hhmm(o.eta)} Uhr` : 'In der Warteschlange';
  }
  function phase(o) {
    if (o.status === 'unbezahlt') return 'pay';
    if (o.status === 'verfallen' || o.status === 'storniert') return 'gone';
    if (o.status === 'fertig') return 'ready';
    if (o.status === 'abgeholt') return 'done';
    if (o.items.some(i => i.status === 'druck')) return 'print';
    return 'queue';
  }

  function renderOrder(o) {
    $('#dock').hidden = true;
    const ph = phase(o);
    document.title = ph === 'ready' ? `✓ Abholbereit ${nr(o.number)} · Namenskugeln` : ph === 'pay' ? 'Jetzt bezahlen · Namenskugeln' : `Bestellung ${o.number ? nr(o.number) : ''} · Namenskugeln`;
    const others = S.orders.filter(x => x.token !== o.token && ['unbezahlt', 'bezahlt', 'fertig'].includes(x.status)).length;
    const back = `<button class="btn ghost backlink" id="back">${I('chevronLeft')} ${others ? 'Alle Bestellungen' : 'Weitere Kugel bestellen'}</button>`;
    app.innerHTML = back + (ph === 'pay' ? payView(o) : ph === 'gone' ? goneView(o) : statusView(o, ph));
    $('#back').onclick = () => others ? go('list') : go('shop');
    bindOrder(o);
  }
  const itemsLines = o => `<div class="items-list">${o.items.map(it => `<div class="line">${motif(it.variant)}<span class="nm"><span class="scr">${esc(it.name)}</span></span><span class="vr">${esc(labelOf(it.variant))}</span></div>`).join('')}</div>`;

  function payView(o) {
    return `<section class="pay-hero">
        <div class="pay-art">${phoneArt()}</div>
        <h1>Fast geschafft!</h1>
        <p>Jetzt nur noch an der Kasse bezahlen.</p>
        <div class="pay-amount"><span>Betrag</span><b class="num">${eur(o.total)}</b></div>
      </section>
      <div class="pay-steps">
        <div class="pay-step"><span class="n">1</span><div><b>Bezahl an der Kasse</b><small>Bar oder mit Karte – sag einfach, dass du online bestellt hast.</small></div></div>
        <div class="pay-step"><span class="n">2</span><div><b>Scanne dort unseren QR-Code</b><small>Mit deiner normalen Handy-Kamera. Dann startet dein Druck.</small></div></div>
      </div>
      <div class="pay-actions">
        <button class="btn" id="scanBtn">${I('scan')} QR-Code hier scannen</button>
        <button class="btn secondary" id="codeBtn">${I('keypad')} Code eintippen</button>
      </div>
      <div class="pay-meta">${I('clock')} Für dich reserviert – noch ${minsUntil(o.expires_at)} Min.</div>
      <div class="section-title" style="margin-top:28px"><h2 style="font-size:24px">Deine Bestellung</h2><button class="btn ghost small" id="editBtn" style="margin-right:-12px">Ändern</button></div>
      ${itemsLines(o)}`;
  }

  function goneView(o) {
    const canPay = revivable(o);
    return `<section class="pay-hero">
        <h1 style="margin-top:16px">${o.status === 'verfallen' ? 'Reservierung abgelaufen' : 'Bestellung storniert'}</h1>
        <p>${o.status === 'verfallen'
          ? (canPay ? 'Du hast an der Kasse schon bezahlt? Dann scanne einfach jetzt den Code – deine Bestellung ist sofort wieder da.' : 'Die Bestellung wurde nicht rechtzeitig bezahlt. Kein Problem – du kannst sie mit einem Tipp neu vormerken.')
          : 'Diese Bestellung wurde storniert. Bei Fragen melde dich gern am Stand.'}</p>
      </section>
      <div style="margin-top:20px">${itemsLines(o)}</div>
      <div class="pay-actions">
        ${canPay ? `<button class="btn" id="scanBtn">${I('scan')} Bezahlt – Code scannen</button><button class="btn secondary" id="codeBtn">${I('keypad')} Code eintippen</button>` : ''}
        <button class="btn ${canPay ? 'ghost' : ''}" id="againBtn">${I('refresh')} Neu vormerken</button>
      </div>`;
  }

  function statusView(o, ph) {
    const steps = [['Bezahlt', 1], ['Warte­schlange', 2], ['Im Druck', 3], ['Abholbereit', 4]];
    const cur = { queue: 2, print: 3, ready: 4, done: 5 }[ph];
    const lead = { queue: 'Nenn diese Nummer bei der Abholung.', print: 'Nenn diese Nummer bei der Abholung.', ready: 'Komm vorbei und nenn diese Nummer.', done: 'Danke & frohe Weihnachten!' }[ph];
    return `<div class="ticket">
        <div class="ticket-top">
          <div class="eyebrow">Deine Abholnummer</div>
          <div class="big-num">${o.number ? `<small>#</small>${String(o.number).padStart(2, '0')}` : '–'}</div>
          <p class="lead">${lead}</p>
        </div>
        <div class="ticket-cut"></div>
        <div class="ticket-bottom"><div class="steps">${steps.map(([l, k]) => `<div class="step ${k < cur ? 'done' : k === cur ? 'now' : ''}"><span class="dot">${k < cur ? I('check') : ''}</span><span>${l}</span></div>`).join('')}</div></div>
      </div>
      <div class="status-card" id="statusCard">${statusCard(o, ph)}</div>
      <div class="section-title" style="margin-top:28px"><h2 style="font-size:24px">Deine Kugeln</h2><span>${eur(o.total)} · bezahlt</span></div>
      ${itemsLines(o)}
      ${ph === 'queue' || ph === 'print' ? `<div class="hint-box">${I('pencil')}<span>Tippfehler entdeckt? Sag kurz am Stand Bescheid – solange noch nicht gedruckt wird, korrigieren wir das gern.</span></div>` : ''}
      <div class="hint-box">${I('info')}<span>Du kannst diese Seite einfach schließen. Wenn du sie wieder öffnest, siehst du hier den aktuellen Stand.</span></div>
      <div class="pay-actions"><button class="btn secondary" id="moreBtn">${I('plus')} Weitere Kugel bestellen</button></div>`;
  }

  function statusCard(o, ph) {
    const etaTiles = () => {
      const m = o.eta ? minsUntil(o.eta) : null;
      return `<div class="eta-row"><div class="tile"><small>Abholung ca.</small><b>${o.eta ? hhmm(o.eta) + ' Uhr' : '–'}</b></div>
        <div class="tile"><small>Noch etwa</small><b>${m != null ? (m <= 1 ? 'gleich' : m + ' Min.') : '–'}</b></div></div>`;
    };
    if (ph === 'queue') return `<div class="status-head"><div class="art">${queueArt()}</div><div>
        <h2>In der Warteschlange</h2><p>${o.ahead > 0 ? `Noch ${o.ahead} ${o.ahead === 1 ? 'Kugel' : 'Kugeln'} vor dir.` : 'Du bist als Nächstes dran!'}</p></div></div>${etaTiles()}`;
    if (ph === 'print') {
      const pr = o.items.filter(i => i.status === 'druck' && i.started_at);
      let pct = 3;
      if (pr.length) { const st = new Date(pr[0].started_at).getTime(), dur = (pr[0].minutes || 20) * 60000; pct = Math.min(97, Math.max(3, (Date.now() - st) / dur * 100)); }
      return `<div class="status-head"><div class="art">${printerArt()}</div><div>
          <h2>Wird gerade gedruckt</h2><p>Schicht für Schicht entsteht deine Kugel.</p></div></div>
        <div class="progress" aria-label="Druckfortschritt ${pct.toFixed(0)} Prozent"><i style="width:${pct.toFixed(0)}%"></i></div>${etaTiles()}`;
    }
    if (ph === 'ready') return `<div class="status-head"><div class="art">${readyArt()}</div><div>
        <h2>Abholbereit!</h2><p>Deine Kugel${o.items.length > 1 ? 'n sind' : ' ist'} fertig. Komm einfach zum Stand.</p></div></div>`;
    return `<div class="status-head"><div class="art">${doneArt()}</div><div><h2>Abgeholt</h2><p>Viel Freude damit am Weihnachtsbaum!</p></div></div>`;
  }

  // ---------- Illustrationen (sauber, im Flyer-Stil) ----------
  const OL = '#4c4e34', BE = '#e7c3a4', CR = '#fffbf3';
  const ORN = (x, y, r, fill = 'none', sw = 3) => `<circle cx="${x}" cy="${y - r - 4}" r="3.2" fill="none" stroke="${OL}" stroke-width="2.2"/><circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${OL}" stroke-width="${sw}"/>`;
  function printerArt() {
    // Draufsicht: die Düse zieht den Kugel-Ring auf der Druckplatte nach
    const ring = 'M60 36 A26 26 0 1 1 59.99 36';
    return `<svg viewBox="0 0 120 120" aria-hidden="true">
      <rect x="4" y="4" width="112" height="112" rx="22" fill="${OL}"/>
      <rect x="13" y="13" width="94" height="94" rx="14" fill="#5b5d42"/>
      <g stroke="${CR}" stroke-opacity=".08" stroke-width="1">${[29, 45, 61, 77, 93].map(v => `<path d="M13 ${v}H107M${v} 13V107"/>`).join('')}</g>
      <circle cx="60" cy="27" r="4.2" fill="none" stroke="${CR}" stroke-opacity=".25" stroke-width="2.6"/>
      <path d="${ring}" fill="none" stroke="${CR}" stroke-opacity=".14" stroke-width="6"/>
      <path d="${ring}" pathLength="100" fill="none" stroke="${CR}" stroke-width="6" stroke-linecap="round" stroke-dasharray="100" stroke-dashoffset="100">
        <animate attributeName="stroke-dashoffset" values="100;0;0;100" keyTimes="0;.82;.94;1" dur="5s" repeatCount="indefinite"/>
      </path>
      <g>
        <animateMotion dur="5s" repeatCount="indefinite" path="${ring}" keyPoints="0;1;1;0" keyTimes="0;.82;.94;1" calcMode="linear"/>
        <circle r="10" fill="${BE}" opacity=".25"/>
        <circle r="7" fill="${BE}"/>
        <circle r="2.6" fill="${OL}"/>
      </g>
    </svg>`;
  }
  function queueArt() {
    return `<svg viewBox="0 0 120 92" aria-hidden="true">
      <path d="M4 16 Q60 34 116 16" fill="none" stroke="${OL}" stroke-opacity=".35" stroke-width="2"/>
      <g class="bob"><path d="M24 22V36" stroke="${OL}" stroke-opacity=".35" stroke-width="1.6"/>${ORN(24, 54, 13, 'none', 2.6)}</g>
      <g class="bob d2"><path d="M60 25V40" stroke="${OL}" stroke-opacity=".5" stroke-width="1.6"/>${ORN(60, 62, 17, BE, 3.2)}<path d="M53 62l5 5 9-10" fill="none" stroke="${OL}" stroke-width="0" /></g>
      <g class="bob d3"><path d="M96 22V36" stroke="${OL}" stroke-opacity=".35" stroke-width="1.6"/>${ORN(96, 54, 13, 'none', 2.6)}</g>
    </svg>`;
  }
  function readyArt() {
    return `<svg viewBox="0 0 120 110" aria-hidden="true">
      <path d="M60 2V16" stroke="${OL}" stroke-opacity=".4" stroke-width="1.8"/>
      <g class="swing">${ORN(60, 56, 30, BE, 4)}<path d="M60 40l3.6 10.4L74 54l-10.4 3.6L60 68l-3.6-10.4L46 54l10.4-3.6z" fill="${OL}"/></g>
      <circle cx="90" cy="84" r="15" fill="#5e7a43"/><path d="M83 84l5 5 9-10" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="twinkle" d="M18 30l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" fill="${BE}"/>
      <path class="twinkle d2" d="M104 22l1.8 4.2 4.2 1.8-4.2 1.8-1.8 4.2-1.8-4.2-4.2-1.8 4.2-1.8z" fill="${OL}" opacity=".6"/>
    </svg>`;
  }
  function doneArt() {
    return `<svg viewBox="0 0 120 110" aria-hidden="true"><path d="M60 2V16" stroke="${OL}" stroke-opacity=".4" stroke-width="1.8"/>
      <g class="swing">${ORN(60, 56, 30, CR, 4)}<path d="M60 70c-9-6-14-10-14-16a7 7 0 0 1 14-2 7 7 0 0 1 14 2c0 6-5 10-14 16z" fill="${BE}"/></g></svg>`;
  }
  function phoneArt() {
    return `<svg viewBox="0 0 150 120" aria-hidden="true">
      <rect x="18" y="22" width="58" height="58" rx="10" fill="#fff" stroke="${OL}" stroke-width="2.5"/>
      <g fill="${OL}"><rect x="26" y="30" width="14" height="14" rx="2.5"/><rect x="54" y="30" width="14" height="14" rx="2.5"/><rect x="26" y="58" width="14" height="14" rx="2.5"/>
      <rect x="46" y="49" width="5" height="5"/><rect x="55" y="58" width="5" height="5"/><rect x="62" y="65" width="7" height="7"/><rect x="46" y="63" width="5" height="9"/></g>
      <g class="phone-scan"><rect x="80" y="12" width="52" height="96" rx="12" fill="${OL}"/><rect x="85" y="20" width="42" height="76" rx="7" fill="${CR}"/>
      <rect x="94" y="38" width="24" height="24" rx="4" fill="none" stroke="${OL}" stroke-width="2" stroke-dasharray="5 4"/>
      <rect class="scanline" x="92" y="38" width="28" height="2" rx="1" fill="${BE}"/>
      <circle cx="106" cy="102" r="2.5" fill="${BE}"/></g>
    </svg>`;
  }

  // ---------- Aktionen ----------
  function bindOrder(o) {
    const b = id => document.getElementById(id);
    if (b('scanBtn')) b('scanBtn').onclick = () => openScanner();
    if (b('codeBtn')) b('codeBtn').onclick = () => openCodeEntry();
    if (b('editBtn')) b('editBtn').onclick = async () => {
      if (!await ask({ title: 'Bestellung ändern?', text: 'Deine Kugeln kommen zurück zum Bearbeiten. Danach merkst du sie einfach neu vor.', ok: 'Ja, ändern' })) return;
      try { await rpc('cancel_order', { p_token: o.token }); } catch (e) { toast(errText(e), true); return; }
      backToDraft(o);
    };
    if (b('againBtn')) b('againBtn').onclick = () => backToDraft(o);
    if (b('moreBtn')) b('moreBtn').onclick = () => go('shop');
  }
  function backToDraft(o) {
    S.draft = o.items.map(i => ({ name: i.name, variant: i.variant })); S.active = S.draft.length - 1; saveDraft();
    S.tokens = S.tokens.filter(x => x.t !== o.token); saveTokens();
    S.orders = S.orders.filter(x => x.token !== o.token);
    go('shop');
  }

  async function confirmCode(code, { silent = false } = {}) {
    const pending = S.orders.filter(x => x.status === 'unbezahlt' || revivable(x));
    if (!pending.length) return false;
    let ok = null, err = null;
    for (const o of pending) {
      try { const r = await rpc('confirm_payment', { p_token: o.token, p_code: code }); if (r && r.error) { const e = new Error(r.error); e.code = r.error; throw e; } Object.assign(o, r); if (o.status === 'bezahlt') ok = ok || o; }
      catch (e) { err = e; }
    }
    if (ok) { confetti(); go('order', ok.token); toast('Bezahlt! Wir starten deinen Druck.'); return true; }
    if (!silent) toast(errText(err), true);
    return false;
  }

  function openCodeEntry() {
    const sh = sheet(`<h3>Code eintippen</h3>
      <p class="sub">Den 4-stelligen Code bekommst du an der Kasse beim Bezahlen.</p>
      <div class="code-input" id="codeBoxes">${[0, 1, 2, 3].map(i => `<input inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="Ziffer ${i + 1}" autocomplete="off">`).join('')}</div>
      <button class="btn block" id="codeGo" style="margin-top:20px" disabled>Bestätigen</button>
      <button class="btn ghost block" data-close>Abbrechen</button>`);
    const boxes = [...sh.el.querySelectorAll('#codeBoxes input')], goBtn = $('#codeGo', sh.el);
    const val = () => boxes.map(b => b.value).join('');
    boxes.forEach((bx, i) => {
      bx.oninput = () => {
        const d = bx.value.replace(/\D/g, '');
        if (d.length > 1) { d.split('').slice(0, 4 - i).forEach((c, k) => boxes[i + k].value = c); boxes[Math.min(3, i + d.length - 1)].focus(); }
        else { bx.value = d; if (d && i < 3) boxes[i + 1].focus(); }
        goBtn.disabled = val().length !== 4;
        if (val().length === 4) goBtn.click();
      };
      bx.onkeydown = e => { if (e.key === 'Backspace' && !bx.value && i > 0) boxes[i - 1].focus(); };
    });
    goBtn.onclick = async () => {
      if (goBtn.dataset.busy) return; goBtn.dataset.busy = 1; goBtn.innerHTML = '<span class="spin"></span>';
      const ok = await confirmCode(val());
      delete goBtn.dataset.busy; goBtn.textContent = 'Bestätigen';
      if (ok) sh.close();
      else { const g = $('#codeBoxes', sh.el); g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake'); boxes.forEach(b => b.value = ''); boxes[0].focus(); goBtn.disabled = true; }
    };
    setTimeout(() => boxes[0].focus(), 350);
  }

  let jsqrLoading;
  const loadJsQR = () => window.jsQR ? Promise.resolve() : (jsqrLoading = jsqrLoading || new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'vendor/jsqr.js'; s.onload = res; s.onerror = rej; document.head.append(s);
  }));
  function codeFromText(t) {
    try { const k = new URL(t).searchParams.get('k'); if (k) return k; } catch { }
    const m = String(t).match(/\b(\d{4})\b/); return m ? m[1] : null;
  }
  async function openScanner() {
    let stream = null, raf = 0, done = false;
    const stop = () => { done = true; cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach(t => t.stop()); };
    const sh = sheet(`<h3>QR-Code scannen</h3>
      <p class="sub">Halte die Kamera auf den Code an der Kasse.</p>
      <div class="scanner"><video playsinline muted autoplay></video><div class="frame"></div><div class="msg" id="scanMsg">Kamera wird gestartet …</div></div>
      <button class="btn ghost block" id="toCode" style="margin-top:8px">Lieber Code eintippen</button>
      <button class="btn ghost block" data-close>Abbrechen</button>`, { onClose: stop });
    $('#toCode', sh.el).onclick = () => { sh.close(); openCodeEntry(); };
    const video = $('video', sh.el), msg = $('#scanMsg', sh.el);
    try { [stream] = await Promise.all([navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }), loadJsQR()]); }
    catch { msg.textContent = 'Kein Kamerazugriff – tippe den Code einfach ein.'; return; }
    if (done) { stream.getTracks().forEach(t => t.stop()); return; }
    video.srcObject = stream; await video.play().catch(() => { });
    msg.textContent = 'Suche QR-Code …';
    const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
    let busy = false;
    const tick = async () => {
      if (done) return;
      if (video.readyState >= 2 && !busy) {
        const w = 360, h = Math.round(video.videoHeight / video.videoWidth * w) || 360;
        cv.width = w; cv.height = h; cx.drawImage(video, 0, 0, w, h);
        const r = window.jsQR(cx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
        const code = r && codeFromText(r.data);
        if (code) {
          busy = true; msg.textContent = 'Code erkannt …'; if (navigator.vibrate) navigator.vibrate(40);
          if (await confirmCode(code)) { sh.close(); return; }
          busy = false; msg.textContent = 'Das war nicht unser Kassen-Code.';
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('canvas'); c.className = 'confetti'; document.body.append(c);
    const dpr = Math.min(2, devicePixelRatio || 1); c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const cols = ['#4c4e34', '#e7c3a4', '#5e7a43', '#d9ad87', '#ffffff'];
    const P = Array.from({ length: 140 }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 80, y: innerHeight * .35, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4, s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: cols[(Math.random() * cols.length) | 0], star: Math.random() < .35 }));
    const t0 = performance.now();
    (function f(t) {
      const el = (t - t0) / 1000; g.clearRect(0, 0, innerWidth, innerHeight);
      P.forEach(p => {
        p.vy += .38; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.globalAlpha = Math.max(0, 1 - el / 2.6);
        if (p.star) { g.beginPath(); for (let i = 0; i < 12; i++) { const rr = i % 2 ? p.s * .3 : p.s; const a = i * Math.PI / 6; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); }
        else g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        if (p.c === '#ffffff') { g.strokeStyle = '#e3d6c6'; g.lineWidth = 1; g.stroke && g.strokeRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); }
        g.restore();
      });
      if (el < 2.8) requestAnimationFrame(f); else c.remove();
    })(t0);
  }

  // ---------- Daten ----------
  let refreshing = false;
  async function refreshOrders() {
    if (!S.tokens.length || refreshing) return;
    refreshing = true;
    try {
      const sig = o => o.status + '|' + o.items.map(i => i.status).join() + '|' + (o.eta || '') + '|' + o.ahead;
      const prev = new Map(S.orders.map(o => [o.token, sig(o)]));
      const prevStatus = new Map(S.orders.map(o => [o.token, o.status]));
      const list = await rpc('get_orders', { p_tokens: S.tokens.map(x => x.t) });
      const found = new Set(list.map(o => o.token)), now = Date.now();
      S.tokens = S.tokens.filter(x => found.has(x.t) || now - x.at < 5 * 60000);
      const stale = new Set(list.filter(o =>
        (['verfallen', 'storniert'].includes(o.status) && now - new Date(o.created_at) > 12 * 3600e3) ||
        (o.status === 'abgeholt' && now - new Date(o.picked_at || o.created_at) > 36 * 3600e3)).map(o => o.token));
      S.tokens = S.tokens.filter(x => !stale.has(x.t)); saveTokens();
      S.orders = list.filter(o => !stale.has(o.token));
      const cur = S.orders.find(o => o.token === S.current);
      if (cur && prevStatus.get(cur.token) && prevStatus.get(cur.token) !== 'fertig' && cur.status === 'fertig') { confetti(); if (navigator.vibrate) navigator.vibrate([60, 60, 60]); }
      const changed = !prev.size || S.orders.some(o => prev.get(o.token) !== sig(o)) || prev.size !== S.orders.length;
      const typing = document.activeElement && document.activeElement.tagName === 'INPUT';
      if (changed && !(typing && S.view === 'shop')) render();
      else if (S.view === 'order' && cur) { const sc = $('#statusCard'); if (sc) sc.innerHTML = statusCard(cur, phase(cur)); }
      else renderTop();
    } catch { /* still – nächster Versuch */ } finally { refreshing = false; }
  }

  async function loadInfo() {
    try {
      const info = await rpc('public_info');
      const before = S.info ? `${S.info.accepting}|${S.info.sold_out}|${S.info.wait_minutes}` : '';
      S.info = info;
      if (Array.isArray(info.variants) && info.variants.length) S.variants = info.variants;
      const keys = S.variants.map(v => v.key);
      S.draft.forEach(it => { if (!keys.includes(it.variant)) it.variant = keys[0]; });
      const typing = document.activeElement && document.activeElement.tagName === 'INPUT';
      if (S.view === 'shop' && `${info.accepting}|${info.sold_out}|${info.wait_minutes}` !== before) { if (!typing) renderShop(); else updateDock(); }
      renderTop();
    } catch { /* offline – Gestalten geht trotzdem */ }
  }

  async function boot() {
    const code = new URLSearchParams(location.search).get('k');
    if (code) history.replaceState({ view: 'shop' }, '', location.pathname);
    render();
    await Promise.all([loadInfo(), refreshOrders()]);
    if (code) {
      if (S.orders.some(o => o.status === 'unbezahlt' || revivable(o))) await confirmCode(code);
      else if (S.orders.some(o => ['bezahlt', 'fertig'].includes(o.status))) {
        go('order', S.orders.find(o => ['bezahlt', 'fertig'].includes(o.status)).token, false); toast('Deine Bestellung ist schon bezahlt.');
      } else toast('Gestalte zuerst deine Kugel – den Code scannst du beim Bezahlen.');
      return startPolling();
    }
    const open = S.orders.filter(o => ['unbezahlt', 'bezahlt', 'fertig'].includes(o.status));
    if (open.length === 1) go('order', open[0].token, false);
    else if (open.length > 1) go('list', null, false);
    startPolling();
  }
  function startPolling() {
    setInterval(() => { if (document.visibilityState === 'visible') refreshOrders(); }, 10000);
    setInterval(() => { if (document.visibilityState === 'visible' && S.view === 'shop') loadInfo(); }, 45000);
    setInterval(() => { if (S.view === 'order' && document.visibilityState === 'visible') { const o = S.orders.find(x => x.token === S.current); const sc = $('#statusCard'); if (o && sc) sc.innerHTML = statusCard(o, phase(o)); } }, 30000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { refreshOrders(); loadInfo(); } });
  }

  ['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
  document.addEventListener('contextmenu', e => { if (!e.target.closest('input, textarea')) e.preventDefault(); });
  if (document.fonts) document.fonts.load("40px Kugelschrift").then(fitPreview).catch(() => { });
  history.replaceState({ view: 'shop' }, '', location.pathname + location.search);
  boot();
})();
