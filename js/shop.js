// Kugelwerk – Kundenseite
(function () {
  'use strict';
  const { rpc } = window.KW_API;
  const I = window.KW_ICON;
  const $ = (s, el = document) => el.querySelector(s);
  const app = $('#app');

  // ---------- Hilfen ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = n => (Math.round(n * 100) / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const hhmm = d => new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const minsUntil = d => Math.max(0, Math.round((new Date(d) - Date.now()) / 60000));
  const nr = n => '#' + String(n).padStart(2, '0');
  const NAME_OK = /^[A-Za-zÀ-ÖØ-öø-ÿĀ-žẞ' .&-]*$/;
  const MAX_NAME = 16;

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privat-modus */ } }
  };

  const VARIANT_FALLBACK = [
    { key: 'herzen', label: 'Herzen' }, { key: 'sterne', label: 'Sterne' },
    { key: 'glanzsterne', label: 'Glanzsterne' }, { key: 'schneeflocken', label: 'Schneeflocken' },
    { key: 'pfoten', label: 'Pfoten' }
  ];
  const img = key => `img/v-${key}.jpg`;
  const thumb = key => `img/v-${key}-s.jpg`;
  const motif = key => `img/v-${key}-m.jpg`;
  const SOFT = { glanzsterne: 'Glanz&shy;sterne', schneeflocken: 'Schnee&shy;flocken' };

  // ---------- Zustand ----------
  const S = {
    info: null,
    variants: VARIANT_FALLBACK,
    draft: store.get('kw.draft', null) || [{ name: '', variant: 'herzen' }],
    active: 0,
    tokens: store.get('kw.orders', []),   // [{t, at}]
    orders: [],                             // vom Server
    view: 'shop',                           // shop | order | list
    current: null,                          // token
    busy: false
  };
  if (!Array.isArray(S.draft) || !S.draft.length) S.draft = [{ name: '', variant: 'herzen' }];
  S.active = S.draft.length - 1;

  const saveDraft = () => store.set('kw.draft', S.draft);
  const saveTokens = () => store.set('kw.orders', S.tokens);
  const labelOf = key => (S.variants.find(v => v.key === key) || VARIANT_FALLBACK.find(v => v.key === key) || { label: key }).label;

  // ---------- Preise ----------
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
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200);
  }
  function errText(e) {
    const c = e && e.code || '';
    if (c === 'offline') return 'Keine Verbindung – bitte nochmal versuchen.';
    if (c === 'not_accepting') return 'Gerade nehmen wir keine neuen Bestellungen an.';
    if (c === 'busy') return 'Gerade ist sehr viel los – bitte in einer Minute nochmal.';
    if (c.startsWith('bad_name')) return 'Bitte prüfe die Namen (nur Buchstaben, max. 16 Zeichen).';
    if (c === 'wrong_code') return 'Der Code stimmt nicht. Frag kurz an der Kasse nach.';
    if (c === 'locked') return 'Zu viele Versuche – bitte kurz an der Kasse melden.';
    return 'Da ist etwas schiefgelaufen. Bitte nochmal versuchen.';
  }

  // ---------- Schnee ----------
  (function snow() {
    const box = $('#snow'); if (!box || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (let i = 0; i < 22; i++) {
      const f = document.createElement('i');
      const s = 3 + Math.random() * 5;
      f.style.cssText = `left:${Math.random() * 100}%;width:${s}px;height:${s}px;opacity:${.5 + Math.random() * .5};animation-duration:${9 + Math.random() * 10}s;animation-delay:${-Math.random() * 18}s;--dx:${(Math.random() * 60 - 30).toFixed(0)}px`;
      box.appendChild(f);
    }
  })();

  // ---------- Kopfzeile ----------
  function renderTop() {
    const el = $('#topRight');
    const open = S.orders.filter(o => ['unbezahlt', 'bezahlt', 'fertig'].includes(o.status));
    if (S.view === 'shop' && open.length) {
      const o = open[0];
      const lbl = o.status === 'fertig' ? 'Abholbereit!' : o.status === 'unbezahlt' ? 'Bezahlen' : (o.number ? `Bestellung ${nr(o.number)}` : 'Meine Bestellung');
      el.innerHTML = `<button class="chip ${o.status === 'fertig' || o.status === 'unbezahlt' ? 'red' : ''}" id="toOrder">${I('package')}${esc(open.length > 1 ? 'Meine Bestellungen' : lbl)}</button>`;
      $('#toOrder').onclick = () => open.length > 1 ? go('list') : go('order', o.token);
    } else if (S.info) {
      el.innerHTML = S.info.accepting
        ? `<span class="chip live">ca. ${S.info.wait_minutes} Min.</span>`
        : `<span class="chip">Pause</span>`;
    } else el.innerHTML = '';
  }

  // ---------- Navigation ----------
  function go(view, token = null, push = true) {
    S.view = view; S.current = token;
    if (push) history.pushState({ view, token }, '', view === 'shop' ? location.pathname : `#${view}${token ? '-' + token.slice(0, 6) : ''}`);
    render(); scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }
  addEventListener('popstate', e => {
    const st = e.state || { view: 'shop' };
    S.view = st.view; S.current = st.token; render();
  });

  function render() {
    renderTop();
    if (S.view === 'order') {
      const o = S.orders.find(x => x.token === S.current);
      if (o) return renderOrder(o);
      S.view = 'shop';
    }
    if (S.view === 'list') return renderList();
    renderShop();
  }

  // ================= SHOP =================
  function renderShop() {
    const info = S.info;
    const p = priceFor(1);
    app.className = 'wrap view-shop';
    app.innerHTML = `
      <section class="hero">
        <div class="hero-media">
          <img src="img/hero.jpg" alt="Weiße 3D-gedruckte Weihnachtskugeln mit Namen am Tannenbaum" onerror="this.remove()">
          <span class="hero-badge"><span class="dot"></span>Wird live hier am Stand gedruckt</span>
        </div>
        <h1>Deine Baumkugel<br><span class="script">mit deinem Namen</span></h1>
        <p>Name eingeben, Motiv wählen – wir drucken sie dir direkt hier am Stand${info ? `, abholbereit in ca. ${info.wait_minutes} Minuten` : ''}.</p>
        <div class="price-row">
          <span class="pill">${eur(p.info.price_single)} pro Kugel</span>
          <span class="pill gold">ab ${p.info.bulk_from} Stück nur ${eur(p.info.price_bulk)}</span>
        </div>
        ${info && !info.accepting ? `<div class="closed-note">${I('clock')}<span>Gerade machen wir eine kurze Druckpause. Du kannst deine Kugel schon gestalten – bestellen geht gleich wieder.</span></div>` : ''}
      </section>

      <div class="section-title"><h2>Deine Kugeln</h2><span id="countLbl"></span></div>
      <div id="cards"></div>
      <button class="add-btn" id="addBtn">${I('plus')} Noch eine Kugel</button>
      <div class="bulk-hint" id="bulkHint"></div>

      <section class="how" aria-label="So funktioniert's">
        <div class="eyebrow" style="margin:0 4px 2px">So einfach geht's</div>
        <div class="how-step"><span class="n">${I('pencil')}</span><div><b>Gestalten</b><small>Namen eingeben und Motiv auswählen</small></div></div>
        <div class="how-step"><span class="n">${I('wallet')}</span><div><b>An der Kasse bezahlen</b><small>Bar oder Karte – dort scannst du kurz unseren Code</small></div></div>
        <div class="how-step"><span class="n">${I('printer')}</span><div><b>Wir drucken</b><small>Hier siehst du live, wann deine Kugel fertig ist</small></div></div>
      </section>

      <footer class="foot">
        <button id="lookupBtn">Bestellnummer nachschauen</button>
        <button id="privacyBtn">Datenschutz</button>
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
    $('#countLbl').textContent = S.draft.length === 1 ? '1 Kugel' : `${S.draft.length} Kugeln`;
    const addBtn = $('#addBtn');
    const max = (S.info && S.info.max_items) || 10;
    addBtn.hidden = S.draft.length >= max;
    // Events
    box.querySelectorAll('.krow').forEach(r => r.onclick = () => { S.active = +r.dataset.i; renderCards(); focusName(); });
    box.querySelectorAll('[data-del]').forEach(b => b.onclick = e => { e.stopPropagation(); removeItem(+b.dataset.del); });
    box.querySelectorAll('.var').forEach(b => b.onclick = () => {
      const i = S.active; S.draft[i].variant = b.dataset.v; saveDraft();
      box.querySelectorAll('.var').forEach(x => x.setAttribute('aria-pressed', x === b));
      const ph = $('#activePhoto'); if (ph) { ph.src = img(b.dataset.v); ph.closest('.photo').classList.remove('bump'); void ph.offsetWidth; ph.closest('.photo').classList.add('bump'); }
      const cap = $('#activeCap'); if (cap) cap.textContent = labelOf(b.dataset.v);
    });
    const inp = $('#nameInput');
    if (inp) {
      inp.oninput = () => onName(inp);
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } };
      inp.onblur = () => { S.draft[S.active].name = inp.value.trim().replace(/\s+/g, ' '); inp.value = S.draft[S.active].name; saveDraft(); };
    }
    updateBulkHint();
  }

  function cardActive(it, i) {
    const multi = S.draft.length > 1;
    return `<article class="kcard" data-i="${i}">
      <div class="kcard-head">
        <span class="eyebrow">Kugel ${i + 1}</span>
        ${multi ? `<button class="icon-btn" data-del="${i}" aria-label="Kugel ${i + 1} entfernen">${I('trash')}</button>` : '<span style="height:44px"></span>'}
      </div>
      <div class="photo"><img id="activePhoto" src="${img(it.variant)}" alt="Beispielfoto ${esc(labelOf(it.variant))}"><span class="photo-cap">Beispiel · <b id="activeCap">${esc(labelOf(it.variant))}</b></span></div>
      <div class="kcard-body">
        <div>
          <label class="field">
            <input id="nameInput" class="input" type="text" inputmode="text" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false"
              enterkeyhint="done" maxlength="${MAX_NAME}" placeholder="Name eingeben, z. B. Emma" value="${esc(it.name)}" aria-label="Name für Kugel ${i + 1}">
          </label>
          <div class="name-hint" id="nameHint">${it.name ? '' : 'Vorname oder Spitzname – passt immer in die Kugel.'}</div>
          <div class="name-show" id="nameShow" ${it.name ? '' : 'hidden'}>${esc(it.name)}</div>
        </div>
        <div>
          <div class="eyebrow" style="margin:0 2px 10px">Motiv wählen</div>
          <div class="variants" role="group" aria-label="Motiv">
            ${S.variants.map(v => `<button class="var" data-v="${v.key}" aria-pressed="${v.key === it.variant}">
                <img src="${thumb(v.key)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span>${SOFT[v.key] || esc(v.label)}</span>
              </button>`).join('')}
          </div>
        </div>
      </div>
    </article>`;
  }

  function cardRow(it, i) {
    return `<article class="kcard"><div class="krow" data-i="${i}" role="button" tabindex="0" aria-label="Kugel ${i + 1} bearbeiten">
      <div class="mini"><img src="${motif(it.variant)}" alt=""></div>
      <div class="txt">
        <div class="nm ${it.name ? '' : 'empty'}">${it.name ? esc(it.name) : 'Name fehlt noch'}</div>
        <div class="vr">${esc(labelOf(it.variant))}</div>
      </div>
      <button class="icon-btn" data-del="${i}" aria-label="Kugel ${i + 1} entfernen">${I('trash')}</button>
    </div></article>`;
  }

  function onName(inp) {
    let v = inp.value;
    const hint = $('#nameHint');
    if (!NAME_OK.test(v)) {
      v = v.replace(/[^A-Za-zÀ-ÖØ-öø-ÿĀ-žẞ' .&-]/g, '');
      inp.value = v;
      hint.textContent = 'Bitte nur Buchstaben – keine Zahlen oder Emojis.'; hint.className = 'name-hint err';
    } else {
      hint.textContent = v.length >= MAX_NAME ? `Maximal ${MAX_NAME} Zeichen.` : ''; hint.className = 'name-hint';
    }
    inp.classList.remove('invalid');
    S.draft[S.active].name = v; saveDraft();
    const show = $('#nameShow');
    show.hidden = !v.trim(); show.textContent = v.trim();
    updateDock();
  }

  function focusName() { const i = $('#nameInput'); if (i && !i.value) setTimeout(() => i.focus({ preventScroll: false }), 50); }

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
    const inp = $('#nameInput');
    if (inp) {
      inp.classList.add('invalid'); inp.focus();
      const h = $('#nameHint'); h.textContent = 'Bitte zuerst einen Namen eingeben.'; h.className = 'name-hint err';
      inp.closest('.kcard').classList.remove('shake'); void inp.offsetWidth; inp.closest('.kcard').classList.add('shake');
    }
  }

  function updateBulkHint() {
    const el = $('#bulkHint'); if (!el) return;
    const p = priceFor(S.draft.length);
    if (p.bulk) el.innerHTML = `<span class="tag">Mengenpreis</span><span>Du zahlst nur <b>${eur(p.each)}</b> pro Kugel.</span>`;
    else el.innerHTML = `<span class="tag">Tipp</span><span>Noch <b>${p.need} ${p.need === 1 ? 'Kugel' : 'Kugeln'}</b>, dann kostet jede nur ${eur(p.info.price_bulk)}.</span>`;
  }

  function updateDock() {
    const dock = $('#dock');
    if (S.view !== 'shop') { dock.hidden = true; return; }
    dock.hidden = false; dock.classList.remove('hide');
    const n = S.draft.length, p = priceFor(n);
    $('#dockLabel').textContent = n === 1 ? '1 Kugel' : `${n} Kugeln`;
    $('#dockTotal').textContent = eur(p.total);
    const st = $('#dockStrike'); st.hidden = !p.bulk; st.textContent = eur(p.full);
    const btn = $('#dockBtn');
    btn.disabled = !!(S.info && !S.info.accepting);
    btn.textContent = 'Weiter';
    btn.onclick = openCheckout;
    updateBulkHint();
    const lbl = $('#countLbl'); if (lbl) lbl.textContent = n === 1 ? '1 Kugel' : `${n} Kugeln`;
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

  function openCheckout() {
    const inp = $('#nameInput');
    if (inp) { S.draft[S.active].name = inp.value.trim().replace(/\s+/g, ' '); saveDraft(); }
    const missing = S.draft.findIndex(it => !it.name.trim());
    if (missing >= 0) {
      if (missing !== S.active) { S.active = missing; renderCards(); }
      markMissing(); return;
    }
    const n = S.draft.length, p = priceFor(n);
    const sh = sheet(`
      <h3>Alles richtig?</h3>
      <p class="sub">Bitte prüfe die Schreibweise – so wird gedruckt.</p>
      <div class="lines">${S.draft.map(it => `<div class="line"><div class="mini"><img src="${motif(it.variant)}" alt=""></div><span class="nm">${esc(it.name)}</span><span class="vr">${esc(labelOf(it.variant))}</span></div>`).join('')}</div>
      <div class="total"><span>${n === 1 ? '1 Kugel' : `${n} Kugeln à ${eur(p.each)}`}</span><b class="num">${eur(p.total)}</b></div>
      <div class="note">${I('wallet')}<span>Bezahlt wird gleich an der Kasse – bar oder mit Karte. Erst dann starten wir den Druck.</span></div>
      <button class="btn block" id="sendBtn">Bestellung vormerken</button>
      <button class="btn ghost block" data-close>Nochmal ändern</button>`);
    const btn = $('#sendBtn', sh.el);
    btn.onclick = async () => {
      if (S.busy) return; S.busy = true;
      btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Wird vorgemerkt …';
      try {
        const res = await rpc('create_order', { p_items: S.draft.map(it => ({ name: it.name, variant: it.variant })) });
        S.tokens.unshift({ t: res.token, at: Date.now() }); saveTokens();
        S.orders.unshift({ ...res.order, token: res.token });
        S.draft = [{ name: '', variant: 'herzen' }]; S.active = 0; saveDraft();
        sh.close();
        go('order', res.token);
      } catch (e) {
        toast(errText(e), true);
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
      <p class="sub">Gib die Nummer von heute ein, z. B. 12.</p>
      <div style="display:flex;gap:10px;margin-top:16px"><input id="lkIn" class="input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="Nummer" style="flex:1"><button class="btn" id="lkGo" style="flex:none">Prüfen</button></div>
      <div id="lkOut" style="margin-top:16px"></div>
      <button class="btn ghost block" data-close>Schließen</button>`);
    const run = async () => {
      const v = parseInt($('#lkIn', sh.el).value, 10); const out = $('#lkOut', sh.el);
      if (!v) return;
      out.innerHTML = '<p class="sub">Suche …</p>';
      try {
        const r = await rpc('lookup_number', { p_number: v });
        if (!r) { out.innerHTML = '<p class="sub">Unter dieser Nummer gibt es heute keine Bestellung.</p>'; return; }
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
    document.getElementById('dock').hidden = true;
    const list = S.orders.filter(o => ['unbezahlt', 'bezahlt', 'fertig', 'abgeholt'].includes(o.status));
    app.className = 'wrap view-order';
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
    document.getElementById('dock').hidden = true;
    const ph = phase(o);
    app.className = 'wrap view-order';
    const others = S.orders.filter(x => x.token !== o.token && ['unbezahlt', 'bezahlt', 'fertig'].includes(x.status)).length;
    const back = `<button class="btn ghost backlink" id="back">${I('chevronLeft')} ${others ? 'Alle Bestellungen' : 'Weitere Kugel bestellen'}</button>`;
    if (ph === 'pay') app.innerHTML = back + payView(o);
    else if (ph === 'gone') app.innerHTML = back + goneView(o);
    else app.innerHTML = back + statusView(o, ph);
    $('#back').onclick = () => others ? go('list') : go('shop');
    bindOrder(o, ph);
  }

  function itemsLines(o) {
    return `<div class="items-list">${o.items.map(it => `<div class="line"><div class="mini"><img src="${motif(it.variant)}" alt=""></div><span class="nm">${esc(it.name)}</span><span class="vr">${esc(labelOf(it.variant))}</span></div>`).join('')}</div>`;
  }

  function payView(o) {
    const left = minsUntil(o.expires_at);
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
      <div class="pay-meta">${I('clock')} Für dich reserviert – noch ${left} Min.</div>
      <div class="section-title" style="margin-top:28px"><h2 style="font-size:18px">Deine Bestellung</h2><button class="btn ghost small" id="editBtn" style="margin-right:-12px">Ändern</button></div>
      ${itemsLines(o)}`;
  }

  function goneView(o) {
    return `<section class="pay-hero">
        <h1 style="margin-top:20px">${o.status === 'verfallen' ? 'Reservierung abgelaufen' : 'Bestellung storniert'}</h1>
        <p>${o.status === 'verfallen' ? 'Die Bestellung wurde nicht rechtzeitig bezahlt. Kein Problem – du kannst sie mit einem Tipp neu vormerken.' : 'Diese Bestellung wurde storniert.'}</p>
      </section>
      ${itemsLines(o)}
      <div class="pay-actions"><button class="btn" id="againBtn">${I('refresh')} Nochmal bestellen</button></div>`;
  }

  function statusView(o, ph) {
    const steps = [['Bezahlt', 1], ['Warteschlange', 2], ['Im Druck', 3], ['Abholbereit', 4]];
    const cur = { queue: 2, print: 3, ready: 4, done: 5 }[ph];
    const stepper = `<div class="steps">${steps.map(([l, k]) => `<div class="step ${k < cur ? 'done' : k === cur ? 'now' : ''}"><span class="dot">${k < cur ? I('check') : ''}</span><span>${l}</span></div>`).join('')}</div>`;
    const lead = { queue: 'Nenn diese Nummer bei der Abholung.', print: 'Nenn diese Nummer bei der Abholung.', ready: 'Komm vorbei und nenn diese Nummer.', done: 'Danke & frohe Weihnachten!' }[ph];
    return `<div class="ticket">
        <div class="ticket-top">
          <div class="eyebrow">Deine Abholnummer</div>
          <div class="big-num">${o.number ? `<small>#</small>${String(o.number).padStart(2, '0')}` : '–'}</div>
          <p class="lead">${lead}</p>
        </div>
        <div class="ticket-cut"></div>
        <div class="ticket-bottom">${stepper}</div>
      </div>
      <div class="status-card" id="statusCard">${statusCard(o, ph)}</div>
      <div class="section-title" style="margin-top:28px"><h2 style="font-size:18px">Deine Kugeln</h2><span>${eur(o.total)} · bezahlt</span></div>
      ${itemsLines(o)}
      <div class="hint-box">${I('info')}<span>Du kannst diese Seite einfach schließen. Wenn du sie wieder öffnest, siehst du hier den aktuellen Stand.</span></div>
      <div class="pay-actions"><button class="btn secondary" id="moreBtn">${I('plus')} Weitere Kugel bestellen</button></div>`;
  }

  function statusCard(o, ph) {
    if (ph === 'queue') {
      const m = o.eta ? minsUntil(o.eta) : null;
      return `<div class="status-head"><div class="art wait-art">${waitArt()}</div><div>
          <h2>In der Warteschlange</h2><p>${o.ahead > 0 ? `Noch ${o.ahead} ${o.ahead === 1 ? 'Kugel' : 'Kugeln'} vor dir.` : 'Du bist als Nächstes dran!'}</p></div></div>
        <div class="eta-row"><div class="tile"><small>Abholung ca.</small><b>${o.eta ? hhmm(o.eta) + ' Uhr' : '–'}</b></div>
        <div class="tile"><small>Noch etwa</small><b>${m != null ? (m <= 1 ? 'gleich' : m + ' Min.') : '–'}</b></div></div>`;
    }
    if (ph === 'print') {
      const pr = o.items.filter(i => i.status === 'druck' && i.started_at);
      let pct = 0;
      if (pr.length) {
        const st = new Date(pr[0].started_at).getTime(), dur = (pr[0].minutes || 20) * 60000;
        pct = Math.min(97, Math.max(3, (Date.now() - st) / dur * 100));
      }
      const m = o.eta ? minsUntil(o.eta) : null;
      return `<div class="status-head"><div class="art">${printerArt()}</div><div>
          <h2>Wird gerade gedruckt</h2><p>Schicht für Schicht entsteht deine Kugel.</p></div></div>
        <div class="progress" aria-label="Druckfortschritt"><i style="width:${pct.toFixed(0)}%"></i></div>
        <div class="eta-row"><div class="tile"><small>Abholung ca.</small><b>${o.eta ? hhmm(o.eta) + ' Uhr' : '–'}</b></div>
        <div class="tile"><small>Noch etwa</small><b>${m != null ? (m <= 1 ? 'gleich' : m + ' Min.') : '–'}</b></div></div>`;
    }
    if (ph === 'ready') {
      return `<div class="status-head"><div class="art">${readyArt(o)}</div><div>
          <h2>Abholbereit!</h2><p>Deine Kugel${o.items.length > 1 ? 'n sind' : ' ist'} fertig. Komm einfach zum Stand.</p></div></div>`;
    }
    return `<div class="status-head"><div class="art">${readyArt(o)}</div><div>
        <h2>Abgeholt</h2><p>Viel Freude damit am Weihnachtsbaum!</p></div></div>`;
  }

  // ---------- Illustrationen ----------
  function printerArt() {
    return `<svg class="printer-art" viewBox="0 0 120 120" aria-hidden="true">
      <rect class="frame" x="8" y="8" width="104" height="104" rx="14"/>
      <rect x="16" y="26" width="88" height="5" rx="2.5" fill="#d9d3c9"/>
      <rect class="bed" x="22" y="92" width="76" height="6" rx="2"/>
      <g class="reveal"><g transform="translate(60 72)">
        <circle r="16" fill="none" stroke="#c3343c" stroke-width="4"/>
        <circle cy="-20" r="3.4" fill="none" stroke="#c3343c" stroke-width="2.4"/>
        <path d="M-6 2c3-6 9-6 12 0" fill="none" stroke="#c3343c" stroke-width="3" stroke-linecap="round"/>
      </g></g>
      <g class="head-y" style="transform-origin:60px 48px"><g class="head">
        <rect x="49" y="28" width="22" height="16" rx="4" fill="#1d2621"/>
        <rect x="55" y="31" width="10" height="3" rx="1.5" fill="#fff" opacity=".5"/>
        <path d="M57 44h6l-3 5z" fill="#1d2621"/>
        <circle class="nozzle-glow" cx="60" cy="50.5" r="1.8"/>
      </g></g>
    </svg>`;
  }
  function waitArt() {
    const k = (S.orders.find(x => x.token === S.current) || { items: [{ variant: 'herzen' }] }).items[0].variant;
    return `<div class="photo-round"><img src="${motif(k)}" alt=""></div>`;
  }
  function readyArt(o) {
    return `<div class="photo-round swing"><img src="${motif(o.items[0].variant)}" alt=""></div>`;
  }
  function phoneArt() {
    return `<svg viewBox="0 0 150 120" aria-hidden="true">
      <rect x="20" y="22" width="56" height="56" rx="8" fill="#fff" stroke="#1d2621" stroke-width="2.5"/>
      <g fill="#1d2621"><rect x="27" y="29" width="14" height="14" rx="2"/><rect x="55" y="29" width="14" height="14" rx="2"/><rect x="27" y="57" width="14" height="14" rx="2"/>
      <rect x="46" y="48" width="5" height="5"/><rect x="55" y="57" width="5" height="5"/><rect x="62" y="64" width="7" height="7"/><rect x="46" y="62" width="5" height="9"/></g>
      <g class="phone-scan"><rect x="78" y="14" width="52" height="94" rx="11" fill="#c3343c"/><rect x="83" y="22" width="42" height="74" rx="6" fill="#fff"/>
      <rect x="92" y="38" width="24" height="24" rx="3" fill="none" stroke="#c3343c" stroke-width="2" stroke-dasharray="5 4"/>
      <rect class="scanline" x="90" y="38" width="28" height="2" rx="1" fill="#c3343c"/>
      <circle cx="104" cy="102" r="2.5" fill="#fff" opacity=".7"/></g>
    </svg>`;
  }

  // ---------- Bestell-Aktionen ----------
  function bindOrder(o, ph) {
    const b = id => document.getElementById(id);
    if (b('scanBtn')) b('scanBtn').onclick = () => openScanner(o);
    if (b('codeBtn')) b('codeBtn').onclick = () => openCodeEntry(o);
    if (b('editBtn')) b('editBtn').onclick = async () => {
      if (!confirm('Bestellung ändern? Sie wird dafür kurz zurück in den Warenkorb gelegt.')) return;
      try { await rpc('cancel_order', { p_token: o.token }); } catch (e) { toast(errText(e), true); return; }
      S.draft = o.items.map(i => ({ name: i.name, variant: i.variant })); S.active = S.draft.length - 1; saveDraft();
      S.tokens = S.tokens.filter(x => x.t !== o.token); saveTokens();
      S.orders = S.orders.filter(x => x.token !== o.token);
      go('shop');
    };
    if (b('againBtn')) b('againBtn').onclick = () => {
      S.draft = o.items.map(i => ({ name: i.name, variant: i.variant })); S.active = S.draft.length - 1; saveDraft();
      S.tokens = S.tokens.filter(x => x.t !== o.token); saveTokens();
      S.orders = S.orders.filter(x => x.token !== o.token);
      go('shop');
    };
    if (b('moreBtn')) b('moreBtn').onclick = () => go('shop');
  }

  async function confirmCode(code, { silent = false } = {}) {
    const pending = S.orders.filter(x => x.status === 'unbezahlt');
    if (!pending.length) return false;
    let ok = null, err = null;
    for (const o of pending) {
      try {
        const r = await rpc('confirm_payment', { p_token: o.token, p_code: code });
        Object.assign(o, r); ok = ok || o;
      } catch (e) { err = e; }
    }
    if (ok) {
      confetti();
      go('order', ok.token);
      toast('Bezahlt! Wir starten deinen Druck.');
      return true;
    }
    if (!silent) toast(errText(err), true);
    return false;
  }

  function openCodeEntry(o) {
    const sh = sheet(`<h3>Code eintippen</h3>
      <p class="sub">Den 4-stelligen Code bekommst du an der Kasse beim Bezahlen.</p>
      <div class="code-input" id="codeBoxes">${[0, 1, 2, 3].map(i => `<input inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="Ziffer ${i + 1}" autocomplete="one-time-code">`).join('')}</div>
      <button class="btn block" id="codeGo" style="margin-top:20px" disabled>Bestätigen</button>
      <button class="btn ghost block" data-close>Abbrechen</button>`);
    const boxes = [...sh.el.querySelectorAll('#codeBoxes input')];
    const go_ = $('#codeGo', sh.el);
    const val = () => boxes.map(b => b.value).join('');
    boxes.forEach((bx, i) => {
      bx.oninput = () => {
        const d = bx.value.replace(/\D/g, '');
        if (d.length > 1) { d.split('').slice(0, 4 - i).forEach((c, k) => boxes[i + k].value = c); boxes[Math.min(3, i + d.length - 1)].focus(); }
        else { bx.value = d; if (d && i < 3) boxes[i + 1].focus(); }
        go_.disabled = val().length !== 4;
        if (val().length === 4) go_.click();
      };
      bx.onkeydown = e => { if (e.key === 'Backspace' && !bx.value && i > 0) boxes[i - 1].focus(); };
    });
    go_.onclick = async () => {
      if (go_.dataset.busy) return; go_.dataset.busy = 1;
      go_.innerHTML = '<span class="spin"></span>';
      const ok = await confirmCode(val());
      delete go_.dataset.busy; go_.textContent = 'Bestätigen';
      if (ok) sh.close();
      else { const g = $('#codeBoxes', sh.el); g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake'); boxes.forEach(b => b.value = ''); boxes[0].focus(); go_.disabled = true; }
    };
    setTimeout(() => boxes[0].focus(), 350);
  }

  let jsqrLoading;
  function loadJsQR() {
    if (window.jsQR) return Promise.resolve();
    return jsqrLoading || (jsqrLoading = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'vendor/jsqr.js'; s.onload = res; s.onerror = rej; document.head.append(s);
    }));
  }

  function codeFromText(t) {
    try { const u = new URL(t); const k = u.searchParams.get('k'); if (k) return k; } catch { /* kein Link */ }
    const m = String(t).match(/\b(\d{4})\b/); return m ? m[1] : null;
  }

  async function openScanner(o) {
    let stream = null, raf = 0, done = false;
    const sh = sheet(`<h3>QR-Code scannen</h3>
      <p class="sub">Halte die Kamera auf den Code an der Kasse.</p>
      <div class="scanner"><video playsinline muted autoplay></video><div class="frame"></div><div class="msg" id="scanMsg">Kamera wird gestartet …</div></div>
      <button class="btn ghost block" id="toCode" style="margin-top:8px">Lieber Code eintippen</button>
      <button class="btn ghost block" data-close>Abbrechen</button>`, { onClose: stop });
    function stop() { done = true; cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach(t => t.stop()); }
    $('#toCode', sh.el).onclick = () => { sh.close(); openCodeEntry(o); };
    const video = $('video', sh.el), msg = $('#scanMsg', sh.el);
    try {
      [stream] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }),
        loadJsQR()
      ]);
    } catch (e) {
      msg.textContent = 'Kein Kamerazugriff – tippe den Code einfach ein.';
      return;
    }
    if (done) { stream.getTracks().forEach(t => t.stop()); return; }
    video.srcObject = stream; await video.play().catch(() => {});
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
          busy = true; msg.textContent = 'Code erkannt …';
          if (navigator.vibrate) navigator.vibrate(40);
          const ok = await confirmCode(code);
          if (ok) { sh.close(); return; }
          busy = false; msg.textContent = 'Das war nicht unser Kassen-Code.';
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
  }

  // ---------- Konfetti ----------
  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('canvas'); c.className = 'confetti'; document.body.append(c);
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const cols = ['#c3343c', '#2e6a4f', '#c99a3a', '#ffffff', '#e86f76'];
    const P = Array.from({ length: 140 }, () => ({
      x: innerWidth / 2 + (Math.random() - .5) * 80, y: innerHeight * .35,
      vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4, s: 5 + Math.random() * 6,
      r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: cols[(Math.random() * cols.length) | 0], star: Math.random() < .3
    }));
    let t0 = performance.now();
    (function f(t) {
      const el = (t - t0) / 1000;
      g.clearRect(0, 0, innerWidth, innerHeight);
      P.forEach(p => {
        p.vy += .38; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.globalAlpha = Math.max(0, 1 - el / 2.6);
        if (p.c === '#ffffff') { g.strokeStyle = '#e4ddd2'; g.lineWidth = 1; }
        if (p.star) { g.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? p.s * .4 : p.s; const a = i * Math.PI / 5; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); if (p.c === '#ffffff') g.stroke(); }
        else { g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); }
        g.restore();
      });
      if (el < 2.8) requestAnimationFrame(f); else c.remove();
    })(t0);
  }

  // ---------- Daten laden ----------
  let refreshing = false;
  async function refreshOrders() {
    if (!S.tokens.length || refreshing) return;
    refreshing = true;
    try {
      const prev = new Map(S.orders.map(o => [o.token, o.status + '|' + o.items.map(i => i.status).join()]));
      const list = await rpc('get_orders', { p_tokens: S.tokens.map(x => x.t) });
      const found = new Set(list.map(o => o.token));
      // Aufräumen: unbekannte Schlüssel und alte, erledigte Bestellungen vergessen
      const now = Date.now();
      S.tokens = S.tokens.filter(x => found.has(x.t) || now - x.at < 5 * 60000);
      const stale = new Set(list.filter(o =>
        (['verfallen', 'storniert'].includes(o.status) && now - new Date(o.created_at) > 12 * 3600e3) ||
        (o.status === 'abgeholt' && now - new Date(o.picked_at || o.created_at) > 36 * 3600e3)).map(o => o.token));
      S.tokens = S.tokens.filter(x => !stale.has(x.t)); saveTokens();
      S.orders = list.filter(o => !stale.has(o.token));
      // Wechsel auf "fertig" -> kleine Feier
      const cur = S.orders.find(o => o.token === S.current);
      const changed = S.orders.some(o => prev.get(o.token) !== o.status + '|' + o.items.map(i => i.status).join());
      if (cur && prev.has(cur.token) && prev.get(cur.token).split('|')[0] !== 'fertig' && cur.status === 'fertig') confetti();
      if (changed || !prev.size) render();
      else if (S.view === 'order' && cur) { const sc = $('#statusCard'); if (sc) sc.innerHTML = statusCard(cur, phase(cur)); else render(); }
    } catch (e) { /* still: nächster Versuch */ } finally { refreshing = false; }
  }

  async function loadInfo() {
    try {
      const info = await rpc('public_info');
      S.info = info;
      if (Array.isArray(info.variants) && info.variants.length) S.variants = info.variants;
      // Entwurf auf verfügbare Motive korrigieren
      const keys = S.variants.map(v => v.key);
      S.draft.forEach(it => { if (!keys.includes(it.variant)) it.variant = keys[0]; });
      if (S.view === 'shop') {
        const hadFocus = document.activeElement && document.activeElement.id === 'nameInput';
        if (!hadFocus) renderShop(); else { updateDock(); }
      }
      renderTop();
    } catch (e) { /* offline – Seite funktioniert trotzdem zum Gestalten */ }
  }

  // ---------- Start ----------
  async function boot() {
    const params = new URLSearchParams(location.search);
    const code = params.get('k');
    if (code) history.replaceState(null, '', location.pathname);
    render();
    await Promise.all([loadInfo(), refreshOrders()]);

    if (code) {
      const pending = S.orders.filter(o => o.status === 'unbezahlt');
      if (pending.length) { await confirmCode(code); }
      else if (S.orders.some(o => ['bezahlt', 'fertig'].includes(o.status))) {
        const o = S.orders.find(o => ['bezahlt', 'fertig'].includes(o.status));
        go('order', o.token, false); toast('Deine Bestellung ist schon bezahlt.');
      } else {
        toast('Gestalte zuerst deine Kugel – den Code scannst du beim Bezahlen.');
      }
      return startPolling();
    }
    // Offene Bestellung? Dann direkt dorthin.
    const open = S.orders.filter(o => ['unbezahlt', 'bezahlt', 'fertig'].includes(o.status));
    if (open.length === 1) go('order', open[0].token, false);
    else if (open.length > 1) go('list', null, false);
    startPolling();
  }

  function startPolling() {
    setInterval(() => { if (document.visibilityState === 'visible') refreshOrders(); }, 10000);
    setInterval(() => { if (document.visibilityState === 'visible' && S.view === 'shop') loadInfo(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { refreshOrders(); loadInfo(); } });
  }

  // Kein Zoom per Geste (iOS)
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
  document.addEventListener('contextmenu', e => { if (!e.target.closest('input, textarea')) e.preventDefault(); });

  history.replaceState({ view: 'shop' }, '', location.pathname + location.search);
  boot();
})();
