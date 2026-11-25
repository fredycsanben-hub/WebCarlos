/* Pizzerías Carlos v2 — interacción y animaciones */
(() => {
  'use strict';
  const D = window.CARLOS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const G = window.gsap && !reduced ? window.gsap : null;
  const ST = G && window.ScrollTrigger ? window.ScrollTrigger : null;
  if (G && ST) G.registerPlugin(ST);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  };
  const ICON = {
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  };

  /* =========================================================
     Catálogo
     ========================================================= */
  const SIZE = { S: 'Pequeña', M: 'Mediana', L: 'Familiar' };
  const SIZE_HINT = { S: 'Para 1 persona', M: 'Para 1 o 2', L: 'Para compartir' };
  const BADGE = { N: 'Novedad', R: 'Nueva receta' };
  const CATS = [
    ['pizzas', 'Pizzas'], ['carlogangas', 'Masa madre'], ['calzones', 'Calzones'], ['sinGluten', 'Sin gluten'],
    ['complementos', 'Complementos'], ['panDeAjo', 'Pan de ajo'], ['ensaladas', 'Ensaladas'], ['pastas', 'Pastas'],
    ['postres', 'Postres'], ['bebidas', 'Bebidas'],
  ];
  // "Crea tu pizza" (base PMBA) no es una especialidad: tiene su propia sección
  const BASE_ID = 'PMBA';
  D.menu.pizzas = D.menu.pizzas.filter((p) => p.id !== BASE_ID);
  const catalog = new Map();
  for (const [cat] of CATS) for (const it of D.menu[cat] || []) {
    it.cat = cat; it.key = catalog.has(it.id) ? `${it.id}-${cat}` : it.id;
    it.type = cat === 'pizzas' ? 'pizza' : 'simple';
    catalog.set(it.key, it);
  }
  const pic = (it) => it.cut || it.img;
  const sizesOf = (it) => Object.keys(it.prices);
  const defSize = (it) => (it.prices.M ? 'M' : sizesOf(it)[0]);

  /* =========================================================
     Modalidad: domicilio / recoger
     ========================================================= */
  let mode = store.get('carlos-mode', 'domicilio');
  const modeTxt = () => (mode === 'domicilio' ? 'a domicilio' : 'al recoger');
  const priceOf = (it, size) => (it.prices[size] || it.prices[defSize(it)])[mode];

  function paintModes() {
    $$('[data-mode]').forEach((el) => {
      el.dataset.v = mode;
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', 'Precios para');
      el.innerHTML = `<span class="mode__pill" aria-hidden="true"></span><button type="button" data-set="domicilio" aria-pressed="${mode === 'domicilio'}">Domicilio</button><button type="button" data-set="recoger" aria-pressed="${mode === 'recoger'}">Recoger</button>`;
    });
  }
  function setMode(m) {
    if (m === mode) return;
    mode = m; store.set('carlos-mode', m);
    $$('[data-mode]').forEach((el) => { el.dataset.v = m; $$('button', el).forEach((b) => b.setAttribute('aria-pressed', b.dataset.set === m)); });
    refreshPrices(true);
    renderCart();
    updateBuilder();
    toast(m === 'domicilio' ? 'Precios a domicilio' : 'Precios para recoger');
  }
  function refreshPrices(anim) {
    $$('[data-pid]').forEach((el) => {
      const it = catalog.get(el.dataset.pid); if (!it) return;
      const txt = eur(priceOf(it, el.dataset.size));
      const target = el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild : null;
      if (target && target.nodeValue === txt) return;
      const apply = () => { if (target) target.nodeValue = txt; else el.prepend(document.createTextNode(txt)); };
      if (anim && !reduced) { el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip'); setTimeout(apply, 240); } else apply();
    });
    $$('[data-mode-txt]').forEach((el) => { el.textContent = modeTxt(); });
  }

  /* =========================================================
     Avisos
     ========================================================= */
  let tT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(tT); tT = setTimeout(() => t.classList.remove('on'), 2200); }

  /* =========================================================
     Carrito
     ========================================================= */
  // Línea: { k: clave única, key, size, masa, half, qty } o { k, custom:{...}, qty }
  let cart = store.get('carlos-cart-v2', []).filter((l) => l.custom || catalog.has(l.key));
  const save = () => store.set('carlos-cart-v2', cart);
  const MASA = { MANO: 'Masa clásica', MAPEQ: 'Masa fina', MMADRE: 'Masa madre' };
  function linePrice(l) {
    if (l.custom) return builderPrice(l.custom);
    const it = catalog.get(l.key);
    let p = priceOf(it, l.size);
    if (l.half) { const h = catalog.get(l.half); if (h) p = Math.max(p, priceOf(h, l.size)); }
    return p;
  }
  function lineInfo(l) {
    if (l.custom) {
      const c = l.custom, T = D.builder.toppings;
      const nm = (id) => (T.find((t) => t.id === id) || {}).name || id;
      return { name: 'Tu pizza', img: 'img/pizzas/crea-tu-pizza-pmba.webp', sub: `${SIZE[c.size]}, ${MASA[c.masa].toLowerCase()}, ${nm(c.salsa).toLowerCase()}${c.tops.length ? ', ' + c.tops.map((t) => nm(t).toLowerCase()).join(', ') : ''}` };
    }
    const it = catalog.get(l.key);
    const parts = [];
    if (it.type === 'pizza') parts.push(SIZE[l.size]);
    if (l.masa && l.masa !== 'MANO') parts.push(MASA[l.masa].toLowerCase());
    if (l.half) parts.push('mitad ' + catalog.get(l.half).name);
    return { name: it.name, img: pic(it), sub: parts.join(', ') || it.desc.slice(0, 50) };
  }
  function addLine(line, fromEl, label) {
    const k = JSON.stringify({ ...line, qty: undefined });
    const ex = cart.find((l) => l.k === k);
    if (ex) ex.qty += line.qty; else cart.push({ ...line, k });
    save(); renderCart();
    fly(fromEl, line.custom ? 'img/pizzas/crea-tu-pizza-pmba.webp' : pic(catalog.get(line.key)));
    toast(`${label} añadida al pedido`);
  }
  function fly(fromEl, img) {
    const target = $$('.cart-btn').find((b) => b.offsetParent);
    const bump = () => { if (!target) return; target.classList.remove('bump'); void target.offsetWidth; target.classList.add('bump'); };
    if (!fromEl || !target || reduced) return bump();
    const a = fromEl.getBoundingClientRect(), b = target.getBoundingClientRect();
    const f = document.createElement('div'); f.className = 'fly'; f.innerHTML = `<img src="${img}" alt="">`; document.body.appendChild(f);
    const x0 = a.left + a.width / 2 - 40, y0 = a.top + a.height / 2 - 40, x1 = b.left + b.width / 2 - 40, y1 = b.top + b.height / 2 - 40;
    f.animate([
      { transform: `translate(${x0}px,${y0}px) scale(1.6) rotate(0)` },
      { transform: `translate(${(x0 + x1) / 2}px,${Math.min(y0, y1) - 160}px) scale(1.1) rotate(220deg)`, offset: 0.5 },
      { transform: `translate(${x1}px,${y1}px) scale(.2) rotate(420deg)`, opacity: 0.5 },
    ], { duration: 900, easing: 'cubic-bezier(.55,0,.25,1)' }).onfinish = () => { f.remove(); bump(); };
  }
  const drawer = $('#drawer'), scrim = $('#scrim');
  function renderCart() {
    const n = cart.reduce((a, l) => a + l.qty, 0);
    const total = cart.reduce((a, l) => a + linePrice(l) * l.qty, 0);
    $$('[data-count]').forEach((e) => { e.textContent = n; e.classList.toggle('on', n > 0); });
    $$('[data-bar-title]').forEach((e) => { e.textContent = n ? `${n} ${n === 1 ? 'producto' : 'productos'}` : 'Tu pedido'; });
    $$('[data-bar-sub]').forEach((e) => { e.textContent = n ? `${eur(total)} ${modeTxt()}` : 'Aún está vacío'; });
    drawer.innerHTML = `<div class="drawer__head"><h2>Tu pedido</h2><button class="drawer__close" type="button" data-close-cart aria-label="Cerrar pedido">${ICON.close}</button></div>
      ${n ? `<ul class="drawer__list">${cart.map((l, i) => { const inf = lineInfo(l); return `<li class="line"><img src="${inf.img}" alt=""><div><h3>${esc(inf.name)}</h3><small>${esc(inf.sub)}</small><div class="qty"><button type="button" data-q="-1" data-i="${i}" aria-label="Quitar uno">−</button><output>${l.qty}</output><button type="button" data-q="1" data-i="${i}" aria-label="Añadir otro">+</button></div></div><span class="price">${eur(linePrice(l) * l.qty)}</span></li>`; }).join('')}</ul>`
        : `<div class="drawer__empty"><img src="img/pizzas/carlo-peperoni-pmcarpe.webp" alt=""><strong>Tu pedido está vacío</strong><p>Elige algo de la carta o crea tu propia pizza.</p><a class="btn btn--sm" href="#carta" data-close-cart>Ver la carta</a></div>`}
      <div class="drawer__foot"><div class="mode mode--light" data-mode></div><div class="total"><span>Total ${modeTxt()}</span><span class="price">${eur(total)}</span></div>
      <a class="btn" href="https://www.pizzeriascarlos.es/" target="_blank" rel="noopener"${n ? '' : ' aria-disabled="true" style="opacity:.45;pointer-events:none"'}>Finalizar pedido</a>
      <p class="note">Elegirás tu pizzería, la hora y la forma de pago en el siguiente paso.</p></div>`;
    paintModes();
  }
  let lastFocus;
  function openCart() { lastFocus = document.activeElement; drawer.removeAttribute('inert'); drawer.setAttribute('aria-hidden', 'false'); drawer.classList.add('on'); scrim.classList.add('on'); lock(true); setTimeout(() => $('[data-close-cart]', drawer)?.focus(), 60); }
  function closeCart() { if (!drawer.classList.contains('on')) return; drawer.classList.remove('on'); scrim.classList.remove('on'); drawer.setAttribute('inert', ''); drawer.setAttribute('aria-hidden', 'true'); lock(false); lastFocus?.focus?.(); }

  /* =========================================================
     Carta
     ========================================================= */
  const grid = $('#grid'), catsEl = $('#cats'), chipsEl = $('#chips'), q = $('#q'), empty = $('#empty');
  let curCat = 'pizzas';
  const filters = new Set();
  const FILTERS = [['novedad', 'Novedades', 'nv'], ['sin-gluten', 'Sin gluten', 'sg'], ['vegano', 'Vegano', 'vg'], ['picante', 'Picante', 'pc']];
  catsEl.innerHTML = CATS.filter(([k]) => D.menu[k]?.length).map(([k, l]) => { const f = D.menu[k][0]; return `<button class="cat" type="button" role="tab" id="tab-${k}" aria-selected="${k === curCat}" aria-controls="grid" tabindex="${k === curCat ? 0 : -1}" data-cat="${k}"><img src="${pic(f)}" alt="" loading="lazy">${l}</button>`; }).join('');
  chipsEl.innerHTML = FILTERS.map(([k, l, d]) => `<button class="chip" type="button" aria-pressed="false" data-f="${k}"><i class="dot dot--${d}"></i>${l}</button>`).join('');
  const DOT = { 'sin-gluten': ['sg', 'Sin gluten'], vegano: ['vg', 'Vegano'], picante: ['pc', 'Picante'] };
  function card(it) {
    const s = defSize(it);
    const round = !!it.cut;
    return `<article class="card${round ? ' card--pz' : ''}" data-key="${it.key}">
      <div class="card__media">${BADGE[it.highlight] ? `<span class="badge${it.highlight === 'R' ? ' badge--r' : ''}">${BADGE[it.highlight]}</span>` : ''}<img src="${pic(it)}" alt="" loading="lazy" width="400" height="400"></div>
      <div class="card__body">
        <div class="card__top"><h3><button class="card__open" type="button" aria-haspopup="dialog">${esc(it.name)}</button></h3><span class="card__tags">${it.tags.filter((t) => DOT[t]).map((t) => `<i class="dot dot--${DOT[t][0]}" title="${DOT[t][1]}"></i><span class="sr-only">${DOT[t][1]}</span>`).join('')}</span></div>
        <p>${esc(it.desc)}</p>
        <div class="card__foot"><span class="price" data-pid="${it.key}" data-size="${s}">${eur(priceOf(it, s))}<small>${it.type === 'pizza' ? SIZE[s] + ', ' : ''}<span data-mode-txt>${modeTxt()}</span></small></span>
        <button class="add" type="button" data-add="${it.key}" aria-label="Añadir ${esc(it.name)} al pedido">${ICON.plus}</button></div>
      </div>
    </article>`;
  }
  function visibleItems() {
    const term = norm(q.value.trim());
    const pool = term ? [...catalog.values()] : (D.menu[curCat] || []);
    return pool.filter((it) => {
      if (term && !norm(it.name + ' ' + it.desc).includes(term)) return false;
      for (const f of filters) if (f === 'novedad' ? !BADGE[it.highlight] : !it.tags.includes(f)) return false;
      return true;
    });
  }
  let gridSeen = false;
  function renderGrid(animate = true) {
    const items = visibleItems();
    grid.innerHTML = items.map(card).join('');
    empty.hidden = items.length > 0;
    $$('.cat', catsEl).forEach((b) => b.setAttribute('aria-selected', !q.value.trim() && b.dataset.cat === curCat));
    if (animate && G && gridSeen) animateCards($$('.card', grid));
  }
  function animateCards(cards) {
    G.fromTo(cards, { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'expo.out', stagger: 0.05, clearProps: 'transform,opacity' });
    const imgs = cards.filter((c) => c.classList.contains('card--pz')).map((c) => $('.card__media img', c));
    if (imgs.length) G.fromTo(imgs, { rotation: -140, scale: 0.55 }, { rotation: 0, scale: 1, duration: 1.2, ease: 'expo.out', stagger: 0.05, clearProps: 'transform' });
  }
  catsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    curCat = b.dataset.cat; q.value = '';
    $$('.cat', catsEl).forEach((x) => (x.tabIndex = x === b ? 0 : -1));
    renderGrid();
  });
  catsEl.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const all = $$('.cat', catsEl), i = all.indexOf(document.activeElement);
    const n = all[(i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length]; n.focus(); n.click();
  });
  chipsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    const f = b.dataset.f; filters.has(f) ? filters.delete(f) : filters.add(f);
    b.setAttribute('aria-pressed', filters.has(f)); renderGrid();
  });
  let qT; q.addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => renderGrid(), 180); });

  // Inclinación 3D de las tarjetas
  grid.addEventListener('pointermove', (e) => {
    const c = e.target.closest('.card'); if (!c || reduced || e.pointerType !== 'mouse') return;
    const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    c.style.transform = `perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateY(-6px)`;
  });
  grid.addEventListener('pointerout', (e) => { const c = e.target.closest('.card'); if (c && !c.contains(e.relatedTarget)) c.style.transform = ''; });
  grid.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    const c = e.target.closest('.card');
    if (add) {
      e.stopPropagation();
      const it = catalog.get(add.dataset.add);
      addLine({ key: it.key, size: defSize(it), masa: it.type === 'pizza' ? 'MANO' : null, half: null, qty: 1 }, $('img', c), it.name);
      add.classList.add('ok'); add.innerHTML = ICON.check;
      setTimeout(() => { add.classList.remove('ok'); add.innerHTML = ICON.plus; }, 1300);
      return;
    }
    if (c) openSheet(c.dataset.key);
  });

  /* =========================================================
     Ficha de producto (tamaño, masa, mitad y mitad)
     ========================================================= */
  const sheet = $('#sheet');
  let sItem = null, sQty = 1;
  function openSheet(key) {
    const it = catalog.get(key); if (!it) return;
    sItem = it; sQty = 1;
    const isPz = it.type === 'pizza';
    const sizes = sizesOf(it);
    const others = D.menu.pizzas.filter((p) => p.key !== it.key);
    sheet.innerHTML = `<button class="sheet__close" type="button" data-close-sheet aria-label="Cerrar">${ICON.close}</button>
      <div class="sheet__in">
        <div class="sheet__media${it.cut ? '' : ' is-flat'}">${it.cut ? `<div class="halves" id="halves"><img class="h1" src="${it.cut}" alt="${esc(it.name)}"><img class="h2" id="h2" src="${it.cut}" alt="" hidden></div>` : `<img src="${it.img}" alt="${esc(it.name)}">`}</div>
        <div class="sheet__body">
          ${BADGE[it.highlight] ? `<span class="badge" style="position:static;justify-self:start">${BADGE[it.highlight]}</span>` : ''}
          <h2 id="sheet-title">${esc(it.name)}</h2>
          <p>${esc(it.desc)}</p>
          ${isPz ? `<fieldset class="fs"><legend>Tamaño</legend><div class="opts">${sizes.map((s) => `<label class="opt"><input type="radio" name="sz" value="${s}"${s === defSize(it) ? ' checked' : ''}><span>${SIZE[s]}<small>${SIZE_HINT[s]}</small></span></label>`).join('')}</div></fieldset>
          <fieldset class="fs"><legend>Masa</legend><div class="opts"><label class="opt"><input type="radio" name="masa" value="MANO" checked><span>Clásica<small>Esponjosa</small></span></label><label class="opt"><input type="radio" name="masa" value="MAPEQ"><span>Fina<small>Crujiente</small></span></label></div></fieldset>
          <fieldset class="fs"><legend>¿Por mitades?</legend><div class="half-row"><label class="sr-only" for="half">Segunda mitad</label><select id="half"><option value="">Pizza entera</option>${others.map((p) => `<option value="${p.key}">Mitad ${esc(p.name)}</option>`).join('')}</select></div><p class="note" id="half-note" hidden>En las pizzas por mitades se aplica el precio de la mitad más cara. Se confirma al hacer el pedido.</p></fieldset>` : ''}
          <div class="sheet__actions">
            <div class="qty"><button type="button" data-sq="-1" aria-label="Uno menos">−</button><output id="sq">1</output><button type="button" data-sq="1" aria-label="Uno más">+</button></div>
            <button class="btn" type="button" id="sheet-add">Añadir</button>
          </div>
          <a class="note" href="https://www.pizzeriascarlos.es/alergenos/" target="_blank" rel="noopener">Consultar alérgenos</a>
        </div>
      </div>`;
    sheetTotal();
    sheet.showModal(); lock(true);
  }
  function sheetSel() {
    return { size: $('input[name="sz"]:checked', sheet)?.value || defSize(sItem), masa: $('input[name="masa"]:checked', sheet)?.value || (sItem.type === 'pizza' ? 'MANO' : null), half: $('#half', sheet)?.value || null };
  }
  function sheetTotal() {
    const s = sheetSel();
    const line = { key: sItem.key, ...s, qty: sQty };
    $('#sheet-add', sheet).textContent = `Añadir · ${eur(linePrice(line) * sQty)}`;
    $('#sq', sheet).textContent = sQty;
  }
  sheet.addEventListener('change', (e) => {
    if (e.target.id === 'half') {
      const h2 = $('#h2', sheet), halves = $('#halves', sheet), v = e.target.value;
      $('#half-note', sheet).hidden = !v;
      if (v) {
        h2.src = pic(catalog.get(v)); h2.hidden = false; halves.classList.add('is-half');
        if (G) G.fromTo(h2, { xPercent: 60, rotation: 40, opacity: 0 }, { xPercent: 0, rotation: 0, opacity: 1, duration: 0.8, ease: 'expo.out' });
      } else { h2.hidden = true; halves.classList.remove('is-half'); }
    }
    sheetTotal();
  });
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet || e.target.closest('[data-close-sheet]')) { sheet.close(); return; }
    const sq = e.target.closest('[data-sq]');
    if (sq) { sQty = Math.max(1, Math.min(20, sQty + Number(sq.dataset.sq))); sheetTotal(); }
    if (e.target.closest('#sheet-add')) {
      const s = sheetSel(); const img = $('.sheet__media img', sheet); const r = img.getBoundingClientRect();
      sheet.close();
      addLine({ key: sItem.key, ...s, qty: sQty }, { getBoundingClientRect: () => r }, sItem.name);
    }
  });
  sheet.addEventListener('close', () => lock(false));

  /* =========================================================
     Crea tu pizza (datos reales de ingredientes y precios)
     ========================================================= */
  const B = D.builder;
  const T = B.toppings;
  const MAXTOPS = 7;
  const SAUCE = { SALSTOM: 'radial-gradient(circle at 45% 40%,#e2442f,#b5261a 80%)', SALSAMER: 'radial-gradient(circle at 45% 40%,#86391b,#56200d 80%)', '476668': 'radial-gradient(circle at 45% 40%,#fbf1d8,#e8d6ab 80%)', SALSABRAVAV: 'radial-gradient(circle at 45% 40%,#ec5a26,#c23b14 80%)', SALSABBCCREAM: 'conic-gradient(#6d2a12 0 25%,#f2e4c2 0 50%,#6d2a12 0 75%,#f2e4c2 0)' };
  const SPRITE = {
    PEPP: [10, 'width:9%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 40% 40%,#d64a32,#9b2318)'],
    CHAMP: [10, 'width:8%;aspect-ratio:1.25;border-radius:50% 50% 38% 38%;background:#e9dbc0;box-shadow:inset 0 -.35em 0 #b99b72'],
    CEBO: [10, 'width:8%;aspect-ratio:1;border-radius:50%;border:.28em solid #f2dde9'],
    CEBOLLACARA: [12, 'width:7%;aspect-ratio:2.4;border-radius:40%;background:#8a4b1f'],
    PIMVER: [10, 'width:9%;aspect-ratio:3;border-radius:40%;background:#3f7d2a'],
    '476809': [10, 'width:9%;aspect-ratio:3;border-radius:40%;background:#c62f1f'],
    ACEIN: [12, 'width:5%;aspect-ratio:1;border-radius:50%;border:.3em solid #241f1d'],
    AUTUN: [10, 'width:6%;aspect-ratio:1.4;border-radius:45% 30% 50% 35%;background:#d9b9a0'],
    BACO: [9, 'width:11%;aspect-ratio:3;border-radius:6px;background:linear-gradient(90deg,#b9473b,#eaa395 50%,#b9473b)'],
    BACONKRISPI: [16, 'width:3.8%;aspect-ratio:1;border-radius:3px;background:#8e2c1d'],
    CATE: [16, 'width:4.5%;aspect-ratio:1;border-radius:40%;background:#6b3b22'],
    JAYO: [10, 'width:7%;aspect-ratio:1;border-radius:14%;background:#f0a69d'],
    PINA: [10, 'width:6%;aspect-ratio:1.5;border-radius:20%;background:#f6cf43'],
    POLLOBRASEAD: [10, 'width:6.5%;aspect-ratio:1.3;border-radius:35%;background:#d79a5e'],
    POLLOVEGA: [10, 'width:6.5%;aspect-ratio:1.3;border-radius:35%;background:#e4be8c'],
    QUESOCABRA: [8, 'width:7%;aspect-ratio:1;border-radius:50%;background:#fbf7ef;box-shadow:inset 0 0 0 .15em #e8dcc8'],
    MEZQUESUA: [14, 'width:6%;aspect-ratio:3.5;border-radius:40%;background:#ffe38f'],
    TOMATECHERRY: [9, 'width:6.5%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,#ff8c6e 0 35%,#d8321f 40%)'],
    EXTMOZZ: [9, 'width:9%;aspect-ratio:1.2;border-radius:50%;background:#fffaf0;opacity:.92'],
    EXTRAQUEVEGA: [9, 'width:9%;aspect-ratio:1.2;border-radius:50%;background:#fbf2dc;opacity:.92'],
  };
  const DRIZZLE = { CESARSAUCE: '#f3ecd5', EXSBBCB: '#6d2a12', EXTRABBC: '#6d2a12', EXTRACARBO: '#f6edd5', EXTRASBRA: '#e15a28', EXTRATOMATE: '#c9311f', SALSAMIELBOTE: '#e9b53b' };
  const byGroup = (g) => T.filter((t) => t.group === g);
  let cfg;
  const resetCfg = () => { cfg = { size: 'M', masa: 'MANO', salsa: 'SALSTOM', queso: 'QMOZZ', tops: [] }; };
  resetCfg();
  function builderPrice(c) {
    const S = B.sizes[c.size];
    let p = S[mode];
    if (c.masa === 'MMADRE' && S.toppings.MMADRE) p += S.toppings.MMADRE[mode];
    for (const t of c.tops) p += (S.toppings[t] || { [mode]: 0 })[mode];
    return Math.round(p * 100) / 100;
  }
  function tPrice(id) { const x = B.sizes[cfg.size].toppings[id]; return x ? x[mode] : 0; }
  function renderBuilderForm() {
    const g = $('#crea-groups');
    const madreOK = !!B.sizes[cfg.size].toppings.MMADRE;
    if (cfg.masa === 'MMADRE' && !madreOK) cfg.masa = 'MANO';
    const pill = (name, id, label, type, checked, extra = '', dis = false, swatch = '') => `<label class="pill"><input type="${type}" name="${name}" value="${id}"${checked ? ' checked' : ''}${dis ? ' disabled' : ''}><span>${swatch}${esc(label)}${extra ? ` <em>${extra}</em>` : ''}</span></label>`;
    const sw = (c) => `<i style="background:${c}"></i>`;
    const sauceSw = { SALSTOM: '#c9311f', SALSAMER: '#6d2a12', '476668': '#f1e4c4', SALSABRAVAV: '#e15a28', SALSABBCCREAM: 'linear-gradient(90deg,#6d2a12 50%,#f1e4c4 50%)' };
    const topSw = (id) => { const s = SPRITE[id]; if (s) { const m = s[1].match(/(#[0-9a-f]{6})/i); return m ? m[1] : '#ccc'; } return DRIZZLE[id] || '#ccc'; };
    g.innerHTML = `
      <div class="cg"><h3>Tamaño</h3><div class="pills">${['S', 'M', 'L'].map((s) => pill('c-size', s, SIZE[s], 'radio', cfg.size === s, eur(B.sizes[s][mode]))).join('')}</div></div>
      <div class="cg"><h3>Masa</h3><div class="pills">${byGroup('masa').map((t) => pill('c-masa', t.id, t.name, 'radio', cfg.masa === t.id, t.id === 'MMADRE' ? (madreOK ? '+' + eur(tPrice('MMADRE')) : 'solo mediana') : '', t.id === 'MMADRE' && !madreOK)).join('')}</div></div>
      <div class="cg"><h3>Salsa</h3><div class="pills">${byGroup('salsa').map((t) => pill('c-salsa', t.id, t.name.replace('Salsa ', ''), 'radio', cfg.salsa === t.id, '', false, sw(sauceSw[t.id] || '#ccc'))).join('')}</div></div>
      <div class="cg"><h3>Queso</h3><div class="pills">${byGroup('queso').map((t) => pill('c-queso', t.id, t.name, 'radio', cfg.queso === t.id)).join('')}</div></div>
      <div class="cg"><h3>Ingredientes <small id="c-count">${cfg.tops.length} de ${MAXTOPS}</small></h3><div class="pills">${byGroup('ingrediente').map((t) => pill('c-top', t.id, t.name, 'checkbox', cfg.tops.includes(t.id), '+' + eur(tPrice(t.id)), !cfg.tops.includes(t.id) && cfg.tops.length >= MAXTOPS, sw(topSw(t.id)))).join('')}</div></div>
      <div class="cg"><h3>Extras de queso y salseo</h3><div class="pills">${byGroup('extra').map((t) => pill('c-top', t.id, t.name.replace('Salseo extra ', 'Extra de salsa '), 'checkbox', cfg.tops.includes(t.id), '+' + eur(tPrice(t.id)), !cfg.tops.includes(t.id) && cfg.tops.length >= MAXTOPS, sw(topSw(t.id)))).join('')}</div></div>`;
  }
  // posiciones pseudoaleatorias estables por ingrediente
  function rnd(seed) { let s = 0; for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function drawPizza(newId) {
    const cpz = $('#cpz'), tops = $('#cpz-tops');
    cpz.classList.toggle('fina', cfg.masa === 'MAPEQ'); cpz.classList.toggle('madre', cfg.masa === 'MMADRE');
    $('#cpz-sauce').style.background = SAUCE[cfg.salsa] || SAUCE.SALSTOM;
    const ch = $('#cpz-cheese'); ch.classList.toggle('off', cfg.queso === 'FKSINQSO'); ch.classList.toggle('vegano', cfg.queso === 'QUESOVEGA');
    const existing = new Set($$('[data-t]', tops).map((e) => e.dataset.t));
    // quitar los desmarcados
    $$('[data-t]', tops).forEach((e) => { if (!cfg.tops.includes(e.dataset.t)) { if (G) G.to(e, { scale: 0, opacity: 0, duration: 0.3, onComplete: () => e.remove() }); else e.remove(); } });
    // añadir los nuevos
    for (const id of cfg.tops) {
      if (existing.has(id)) continue;
      const r = rnd(id);
      const els = [];
      if (SPRITE[id]) {
        const [n, style] = SPRITE[id];
        for (let k = 0; k < n; k++) {
          const ang = r() * Math.PI * 2, rad = Math.sqrt(r()) * 33;
          const el = document.createElement('i'); el.dataset.t = id;
          el.setAttribute('style', `${style};left:${50 + Math.cos(ang) * rad}%;top:${50 + Math.sin(ang) * rad}%;translate:-50% -50%;rotate:${Math.round(r() * 180)}deg;font-size:${cpz.clientWidth / 60}px`);
          tops.appendChild(el); els.push(el);
        }
      } else if (DRIZZLE[id]) {
        for (let k = 0; k < 5; k++) {
          const el = document.createElement('i'); el.dataset.t = id;
          el.setAttribute('style', `left:16%;top:${22 + k * 14}%;width:68%;height:1.4%;border-radius:4px;background:${DRIZZLE[id]};rotate:${-18 + r() * 36}deg;opacity:.9`);
          tops.appendChild(el); els.push(el);
        }
      }
      if (G && newId === id) G.from(els, { y: -260, scale: 1.8, opacity: 0, duration: 0.7, ease: 'back.out(1.6)', stagger: 0.035 });
    }
  }
  function updateBuilder() {
    if (!$('#crea-total')) return;
    $('#crea-total').textContent = eur(builderPrice(cfg));
    $('#crea-mode').textContent = modeTxt();
    renderBuilderForm();
  }
  $('#crea-groups').addEventListener('change', (e) => {
    const t = e.target; let newId = null;
    if (t.name === 'c-size') cfg.size = t.value;
    if (t.name === 'c-masa') cfg.masa = t.value;
    if (t.name === 'c-salsa') { cfg.salsa = t.value; if (G) G.fromTo('#cpz-sauce', { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(50% at 50% 50%)', duration: 0.8, ease: 'expo.out' }); }
    if (t.name === 'c-queso') cfg.queso = t.value;
    if (t.name === 'c-top') {
      if (t.checked) { if (cfg.tops.length >= MAXTOPS) { t.checked = false; toast(`Máximo ${MAXTOPS} ingredientes`); return; } cfg.tops.push(t.value); newId = t.value; }
      else cfg.tops = cfg.tops.filter((x) => x !== t.value);
    }
    if (t.name === 'c-size' && G) G.fromTo('#cpz', { scale: 0.9 }, { scale: t.value === 'S' ? 0.86 : t.value === 'M' ? 0.94 : 1, duration: 0.7, ease: 'back.out(2)' });
    const focusSel = `input[name="${t.name}"][value="${t.value}"]`;
    updateBuilder(); drawPizza(newId);
    $(focusSel, $('#crea-groups'))?.focus();
  });
  $('#crea-add').addEventListener('click', () => addLine({ custom: { ...cfg, tops: [...cfg.tops] }, qty: 1 }, $('#cpz'), 'Tu pizza'));
  $('#crea-reset').addEventListener('click', () => { resetCfg(); updateBuilder(); drawPizza(); if (G) G.fromTo('#cpz', { rotation: -90, scale: 0.8 }, { rotation: 0, scale: 0.94, duration: 0.9, ease: 'expo.out' }); });

  /* =========================================================
     Promociones, provincias, formulario del hero
     ========================================================= */
  $('#promo-track').innerHTML = D.promos.map((p) => `<li class="promo"><div class="promo__img"><img src="${p.img}" alt="" loading="lazy"><span class="promo__price">${p.price > 0 ? eur(p.price) : '2x1'}</span></div><div class="promo__body"><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p><a class="btn btn--sm" href="https://www.pizzeriascarlos.es/" target="_blank" rel="noopener">Pedir esta promo</a></div></li>`).join('') +
    `<li class="promo promo--end"><h3>¿Prefieres crearla tú?</h3><p>Monta tu pizza ingrediente a ingrediente.</p><a class="btn btn--light" href="#crea" style="justify-self:center">Crea tu pizza</a></li>`;
  const PROV = ['A Coruña', 'Alacant', 'Araba', 'Badajoz', 'Barcelona', 'Burgos', 'Cáceres', 'Cádiz', 'Cantabria', 'Ciudad Real', 'Córdoba', 'Guadalajara', 'Huelva', 'La Rioja', 'León', 'Madrid', 'Málaga', 'Ourense', 'Palencia', 'Pontevedra', 'Salamanca', 'Sevilla', 'Tarragona', 'Toledo', 'València', 'Valladolid', 'Zamora'];
  $('#provs').innerHTML = PROV.map((p) => `<a href="https://www.pizzeriascarlos.es/pizzerias/" target="_blank" rel="noopener"${p === 'Zamora' ? ' class="here"' : ''}>${p}</a>`).join('');
  const HINT = { domicilio: 'Te llevamos la pizza con nuestro propio equipo de reparto.', recoger: 'Pide ahora y recógela en tu pizzería sin esperas.', clickcar: 'Aparca, avísanos y te la llevamos al coche.', local: 'Reserva mesa y disfrútala recién salida del horno.' };
  $('.order').addEventListener('change', (e) => {
    if (e.target.name !== 'tipo') return;
    const h = $('#order-hint'); h.textContent = HINT[e.target.value];
    if (e.target.value === 'domicilio' || e.target.value === 'recoger') setMode(e.target.value);
    if (G) G.fromTo(h, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 });
  });
  $('#year').textContent = new Date().getFullYear();

  /* =========================================================
     Navegación: menú móvil, scroll suave, cabecera
     ========================================================= */
  let lenis = null;
  let locks = 0;
  function lock(on) {
    locks = Math.max(0, locks + (on ? 1 : -1));
    document.documentElement.style.overflow = locks ? 'hidden' : '';
    if (lenis) locks ? lenis.stop() : lenis.start();
  }
  const burger = $('.burger'), menu = $('#menu-movil');
  function toggleMenu(open) {
    menu.hidden = !open; burger.setAttribute('aria-expanded', open); burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    lock(open);
    if (open && G) G.from($$('nav a', menu), { y: 40, opacity: 0, stagger: 0.05, duration: 0.6, ease: 'expo.out' });
  }
  burger.addEventListener('click', () => toggleMenu(menu.hidden));
  document.addEventListener('click', (e) => {
    const s = e.target.closest('[data-set]'); if (s) setMode(s.dataset.set);
    if (e.target.closest('[data-open-cart]')) { e.preventDefault(); openCart(); }
    if (e.target.closest('[data-close-cart]') || e.target === scrim) closeCart();
    const qb = e.target.closest('[data-q]');
    if (qb) { const l = cart[Number(qb.dataset.i)]; if (l) { l.qty += Number(qb.dataset.q); if (l.qty <= 0) cart.splice(Number(qb.dataset.i), 1); save(); renderCart(); } }
    const a = e.target.closest('a[href^="#"]');
    if (a && a.getAttribute('href').length > 1) {
      const t = $(a.getAttribute('href')); if (!t) return;
      e.preventDefault();
      if (!menu.hidden) toggleMenu(false);
      if (lenis) lenis.scrollTo(t, { offset: -($('#hdr').offsetHeight - 2), duration: 1.4 }); else t.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeCart(); if (!menu.hidden) toggleMenu(false); } });

  const hdr = $('#hdr'), bar = $('#bar'), hero = $('.hero');
  let lastY = 0;
  function onScroll(y) {
    const pastHero = y > hero.offsetHeight - hdr.offsetHeight;
    hdr.classList.toggle('is-solid', pastHero);
    hdr.classList.toggle('is-hidden', y > lastY + 4 && y > 500 && menu.hidden);
    if (y < lastY - 4 || y < 500) hdr.classList.remove('is-hidden');
    lastY = y;
    bar.classList.toggle('show', y > innerHeight * 0.8);
  }

  /* =========================================================
     Animaciones
     ========================================================= */
  function splitTitles() {
    $$('[data-split]').forEach((el) => {
      el.innerHTML = el.textContent.trim().split(/\s+/).map((w) => `<span class="word"><span>${esc(w)}</span></span>`).join(' ');
    });
  }

  function animations() {
    // Scroll suave
    if (window.Lenis) {
      lenis = new window.Lenis({ lerp: 0.1, wheelMultiplier: 1 });
      lenis.on('scroll', (e) => { ST.update(); onScroll(e.scroll); });
      G.ticker.add((t) => lenis.raf(t * 1000));
      G.ticker.lagSmoothing(0);
    } else addEventListener('scroll', () => onScroll(scrollY), { passive: true });

    // HERO: entrada orquestada
    const tl = G.timeline({ defaults: { ease: 'expo.out' } });
    tl.from('.hero__title .ln > span', { yPercent: 115, duration: 1.3, stagger: 0.12 })
      .from('.hero__plate', { scale: 0.4, rotation: -220, opacity: 0, duration: 1.6 }, 0.1)
      .from('[data-hero-fade]', { y: 30, opacity: 0, duration: 1, stagger: 0.1 }, 0.4)
      .from('.float, .leaf, .tomato', { scale: 0, opacity: 0, duration: 1.2, stagger: 0.08, ease: 'back.out(1.8)' }, 0.6)
      .from('.hero__badge', { scale: 0, rotation: -120, duration: 1.1, ease: 'back.out(1.6)' }, 0.9)
      .from('.hdr__in > *', { y: -30, opacity: 0, duration: 1, stagger: 0.08, clearProps: 'all' }, 0.2)
      .to('.hero__badge', { rotation: 10, yoyo: true, repeat: -1, duration: 3, ease: 'sine.inOut' });
    G.to('.hero__pizza', { rotation: 360, duration: 50, repeat: -1, ease: 'none' });
    G.to('.f1', { y: -18, yoyo: true, repeat: -1, duration: 3.2, ease: 'sine.inOut' });
    G.to('.f2', { y: 14, rotation: 30, yoyo: true, repeat: -1, duration: 2.7, ease: 'sine.inOut' });

    // HERO: cambio de pizza cada pocos segundos
    const heroPizzas = ['carlo-peperoni-pmcarpe', 'especial-carlos-pmsc', 'la-bbqona-pmahobbq', 'chicken-vegetal-hera-pmchve', 'tutto-carne-pmtc'].map((n) => `img/pizzas/${n}.webp`);
    heroPizzas.forEach((s) => { const i = new Image(); i.src = s; });
    let hp = 0;
    setInterval(() => {
      if (document.hidden || scrollY > innerHeight) return;
      hp = (hp + 1) % heroPizzas.length;
      G.timeline().to('.hero__plate', { scale: 0.6, rotation: '+=160', opacity: 0, duration: 0.55, ease: 'power3.in', onComplete: () => { $('#hero-pizza').src = heroPizzas[hp]; } })
        .to('.hero__plate', { scale: 1, rotation: '+=200', opacity: 1, duration: 1, ease: 'expo.out' });
    }, 5200);

    // HERO: parallax con el ratón y con el scroll
    const stage = $('.hero__stage');
    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
      G.to('.hero__plate', { x: x * 30, y: y * 30, duration: 1.2, ease: 'power3.out' });
      G.to('.f1', { x: x * -60, duration: 1.4, ease: 'power3.out' });
      G.to('.f2', { x: x * 70, duration: 1.4, ease: 'power3.out' });
      G.to('.leaf, .tomato', { x: x * 90, y: y * 60, duration: 1.6, ease: 'power3.out' });
      G.to('.hero__title', { x: x * -14, duration: 1.4, ease: 'power3.out' });
    });
    G.to(stage, { yPercent: 18, scale: 0.86, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
    G.to('.hero__copy', { yPercent: -14, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });

    // CINTA: se acelera con la velocidad del scroll
    const ribbon = G.to('#ribbon', { xPercent: -50, duration: 28, ease: 'none', repeat: -1 });
    let boost = G.to({}, {});
    ST.create({
      onUpdate: (self) => {
        const v = self.getVelocity();
        boost.kill();
        ribbon.timeScale(Math.sign(v || 1) * Math.min(6, 1 + Math.abs(v) / 250));
        boost = G.to(ribbon, { timeScale: 1, duration: 1.2, ease: 'power2.out', delay: 0.1 });
      },
    });

    // TÍTULOS: palabras que suben
    $$('[data-split]').forEach((el) => G.from($$('.word > span', el), { yPercent: 115, rotation: 6, duration: 1.1, ease: 'expo.out', stagger: 0.06, scrollTrigger: { trigger: el, start: 'top 85%' } }));
    $$('.sec-lead').forEach((el) => G.from(el, { y: 24, opacity: 0, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 88%' } }));

    // HISTORIA: la pizza se monta al hacer scroll
    const tops = $('#build-tops');
    const TOPS = [['#c8321f', 9, 1], ['#3f7d2a', 9, 0.33], ['#e9dbc0', 8, 0.8], ['#6b3b22', 5, 1], ['#f0a69d', 7, 1]];
    let html = '';
    const rr = rnd('historia');
    TOPS.forEach(([c, w, ar]) => { for (let k = 0; k < 7; k++) { const ang = rr() * Math.PI * 2, rad = 6 + Math.sqrt(rr()) * 28; html += `<i style="left:${50 + Math.cos(ang) * rad}%;top:${50 + Math.sin(ang) * rad}%;width:${w * 0.7}%;aspect-ratio:${1 / ar};background:${c};translate:-50% -50%;border-radius:${ar < 1 ? '40%' : '50%'};rotate:${Math.round(rr() * 180)}deg"></i>`; } });
    tops.innerHTML = html;
    const steps = $$('.step');
    const setStep = (i) => steps.forEach((s, k) => s.classList.toggle('is-on', k === i));
    const story = G.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: '.story', pin: '.story__pin', start: 'top top', end: '+=320%', scrub: 0.8, anticipatePin: 1,
      },
      // El paso activo sigue a la animación (incluida la inercia del scrub), no solo al scroll
      onUpdate() {
        const t = this.time();
        setStep(t < 1 ? 0 : t < 2 ? 1 : t < 3 ? 2 : t < 4.1 ? 3 : 4);
        $('#story-bar').style.width = this.progress() * 100 + '%';
      },
    });
    story.to('.build__dough', { scale: 1, opacity: 1, rotation: 25, duration: 1, ease: 'back.out(1.4)' })
      .to('.build__sauce', { clipPath: 'circle(50% at 50% 50%)', duration: 1 })
      .to('.build__cheese', { opacity: 1, scale: 1, duration: 1 })
      .fromTo('.build__tops i', { y: -300, opacity: 0, scale: 1.8 }, { y: 0, opacity: 1, scale: 1, duration: 0.6, stagger: 0.012, ease: 'back.out(1.6)' })
      .to('.build__dough, .build__sauce, .build__cheese, .build__tops', { opacity: 0, duration: 0.5 }, '+=0.2')
      .fromTo('.build__final', { opacity: 0, rotation: -120, scale: 0.7 }, { opacity: 1, rotation: 0, scale: 1, duration: 0.9, ease: 'expo.out' }, '<')
      .to('.build__steam', { opacity: 1, duration: 0.4 }, '<0.4')
      .to('.build__final', { rotation: 60, duration: 0.6 });

    // PROMOCIONES: avanzan en horizontal (escritorio)
    const mm = G.matchMedia();
    mm.add('(min-width: 901px)', () => {
      const track = $('#promo-track');
      const dist = () => track.scrollWidth - innerWidth + 40;
      G.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: '.promos', pin: '.promos__pin', start: 'top top', end: () => '+=' + dist(), scrub: 1, invalidateOnRefresh: true } });
    });
    G.from('.promo', { y: 80, opacity: 0, rotation: 3, duration: 1, ease: 'expo.out', stagger: 0.06, scrollTrigger: { trigger: '.promos', start: 'top 70%' } });

    // CARTA: entrada de tarjetas cuando llegas
    ST.create({ trigger: grid, start: 'top 85%', once: true, onEnter: () => { gridSeen = true; animateCards($$('.card', grid)); } });
    G.set($$('.card', grid), { opacity: 0 });
    G.from('.cat', { y: 30, opacity: 0, stagger: 0.04, duration: 0.8, ease: 'expo.out', scrollTrigger: { trigger: catsEl, start: 'top 90%' } });

    // CREA TU PIZZA: la base entra girando
    G.from('#cpz', { rotation: -200, scale: 0.5, opacity: 0, duration: 1.6, ease: 'expo.out', scrollTrigger: { trigger: '.crea', start: 'top 70%' } });
    G.from('.cg', { y: 40, opacity: 0, stagger: 0.08, duration: 0.9, ease: 'expo.out', scrollTrigger: { trigger: '.crea__groups', start: 'top 85%' } });

    // SERVICIOS: iconos que se dibujan
    $$('.serv svg').forEach((svg) => $$('path, circle', svg).forEach((p) => { const L = p.getTotalLength ? p.getTotalLength() : 200; p.style.strokeDasharray = L; p.style.strokeDashoffset = L; }));
    G.from('.serv li', { y: 70, opacity: 0, stagger: 0.08, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: '.serv', start: 'top 80%' } });
    G.to('.serv svg path, .serv svg circle', { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut', stagger: 0.03, delay: 0.3, scrollTrigger: { trigger: '.serv', start: 'top 80%' } });

    // PIZZERÍAS: contador 0 → 27
    const cnt = { v: 0 };
    G.to(cnt, { v: 27, duration: 1.8, ease: 'power3.out', scrollTrigger: { trigger: '#pizzerias', start: 'top 70%' }, onUpdate: () => { $('#count27').textContent = Math.round(cnt.v); } });
    G.from('.provs a', { scale: 0, opacity: 0, stagger: 0.025, duration: 0.6, ease: 'back.out(2)', scrollTrigger: { trigger: '.provs', start: 'top 85%' } });
    G.from('.mapcard', { y: 80, rotation: 2, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.mapcard', start: 'top 85%' } });

    // APP / FRANQUICIA / EMPLEO
    G.from('.tile', { y: 90, opacity: 0, stagger: 0.12, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: '.trio', start: 'top 80%' } });
    G.fromTo('.tile__pizza', { rotation: -40 }, { rotation: 140, ease: 'none', scrollTrigger: { trigger: '.trio', start: 'top bottom', end: 'bottom top', scrub: true } });
    G.from('.ftr__claim', { yPercent: 60, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.ftr', start: 'top 85%' } });

    // Menú activo según la sección
    ['carta', 'promos', 'crea', 'servicios', 'pizzerias'].forEach((id) => ST.create({ trigger: '#' + id, start: 'top center', end: 'bottom center', onToggle: (s) => $$(`.hdr__nav a[href="#${id}"]`).forEach((a) => a.classList.toggle('is-active', s.isActive)) }));

    addEventListener('load', () => ST.refresh());
  }

  /* =========================================================
     Arranque
     ========================================================= */
  splitTitles();
  paintModes();
  renderGrid(false);
  updateBuilder();
  drawPizza();
  renderCart();
  if (G && ST) animations();
  else {
    // Sin animaciones: todo visible y estático
    gridSeen = true;
    $$('.step').forEach((s) => s.classList.add('is-on'));
    const fin = $('.build__final'); if (fin) fin.style.opacity = 1;
    addEventListener('scroll', () => onScroll(scrollY), { passive: true });
  }
  onScroll(scrollY);
})();
