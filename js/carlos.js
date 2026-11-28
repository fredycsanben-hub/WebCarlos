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
  document.documentElement.classList.add(G ? 'g' : 'no-g');
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
    ['pizzas', 'Pizzas'], ['carlogangas', 'CarloGANGAS'], ['calzones', 'Calzones'], ['sinGluten', 'Sin gluten'],
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
  // Suplemento de masa madre (solo en mediana), con el precio real del configurador
  const madreExtra = (size) => { const x = D.builder.sizes[size]?.toppings?.MMADRE; return x ? x[mode] : null; };
  function linePrice(l) {
    if (l.custom) return builderPrice(l.custom);
    const it = catalog.get(l.key);
    let p = priceOf(it, l.size);
    if (l.half) { const h = catalog.get(l.half); if (h) p = Math.max(p, priceOf(h, l.size)); }
    if (l.masa === 'MMADRE' && madreExtra(l.size) != null) p += madreExtra(l.size);
    return Math.round(p * 100) / 100;
  }
  /* Promoción "tu segunda mediana al 50 %" (pedidos a domicilio).
     Todas las pizzas medianas del pedido (carta, mitades y "Crea tu pizza") se ordenan de más cara a más barata
     y se agrupan de dos en dos: en cada pareja, la más barata va al 50 %. Sirve para 2, 4, 6... medianas. */
  const isMediana = (l) => (l.custom ? l.custom.size === 'M' : catalog.get(l.key)?.type === 'pizza' && l.size === 'M');
  function promo2a() {
    const units = [];
    for (const l of cart) if (isMediana(l)) for (let k = 0; k < l.qty; k++) units.push(linePrice(l));
    units.sort((a, b) => b - a);
    let off = 0; for (let k = 1; k < units.length; k += 2) off += units[k] / 2;
    off = Math.round(off * 100) / 100;
    return { count: units.length, pairs: Math.floor(units.length / 2), off: mode === 'domicilio' ? off : 0, wouldBe: off };
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
    const before = promo2a().off;
    const k = JSON.stringify({ ...line, qty: undefined });
    const ex = cart.find((l) => l.k === k);
    if (ex) ex.qty += line.qty; else cart.push({ ...line, k });
    save(); renderCart();
    fly(fromEl, line.custom ? 'img/pizzas/crea-tu-pizza-pmba.webp' : pic(catalog.get(line.key)));
    const p = promo2a();
    if (p.off > before) setTimeout(() => toast(`¡2ª mediana al 50 %! Ahorras ${eur(p.off)}`), 950);
    else if (mode === 'domicilio' && isMediana(line) && p.count % 2) toast(`${label} añadida. Añade otra mediana y te sale al 50 %`);
    else toast(`${label} añadida al pedido`);
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
    const sub = cart.reduce((a, l) => a + linePrice(l) * l.qty, 0);
    const pr = promo2a();
    const total = Math.round((sub - pr.off) * 100) / 100;
    let promoHtml = '';
    if (n && mode === 'domicilio' && pr.count % 2 === 1) promoHtml = `<div class="promo-hint"><b>2ª mediana al 50 %</b><span>Añade otra pizza mediana y ${pr.count > 1 ? 'esa también ' : ''}te sale a mitad de precio.</span></div>`;
    else if (n && mode === 'recoger' && pr.pairs) promoHtml = `<div class="promo-hint promo-hint--off"><b>2ª mediana al 50 %</b><span>Es para pedidos a domicilio: ahorrarías ${eur(pr.wouldBe)}.</span><button type="button" class="btn btn--sm btn--light" data-set="domicilio">Cambiar a domicilio</button></div>`;
    $$('[data-count]').forEach((e) => { e.textContent = n; e.classList.toggle('on', n > 0); });
    $$('[data-bar-title]').forEach((e) => { e.textContent = n ? `${n} ${n === 1 ? 'producto' : 'productos'}` : 'Tu pedido'; });
    $$('[data-bar-sub]').forEach((e) => { e.textContent = n ? `${eur(total)} ${modeTxt()}` : 'Aún está vacío'; });
    drawer.innerHTML = `<div class="drawer__head"><h2>Tu pedido</h2><button class="drawer__close" type="button" data-close-cart aria-label="Cerrar pedido">${ICON.close}</button></div>
      ${n ? `<ul class="drawer__list">${cart.map((l, i) => { const inf = lineInfo(l); return `<li class="line"><img src="${inf.img}" alt=""><div><h3>${esc(inf.name)}</h3><small>${esc(inf.sub)}</small><div class="qty"><button type="button" data-q="-1" data-i="${i}" aria-label="Quitar uno">−</button><output>${l.qty}</output><button type="button" data-q="1" data-i="${i}" aria-label="Añadir otro">+</button></div></div><span class="price">${eur(linePrice(l) * l.qty)}</span></li>`; }).join('')}</ul>`
        : `<div class="drawer__empty"><img src="img/pizzas/carlo-peperoni-pmcarpe.webp" alt=""><strong>Tu pedido está vacío</strong><p>Elige algo de la carta o crea tu propia pizza.</p><a class="btn btn--sm" href="#carta" data-close-cart>Ver la carta</a></div>`}
      <div class="drawer__foot">${promoHtml}<div class="mode mode--light" data-mode></div>
      ${pr.off ? `<div class="sum"><span>Subtotal</span><span>${eur(sub)}</span></div><div class="sum sum--promo"><span>2ª mediana al 50 % <small>${pr.pairs} ${pr.pairs === 1 ? 'pareja' : 'parejas'} de medianas</small></span><span>−${eur(pr.off)}</span></div>` : ''}
      <div class="total"><span>Total ${modeTxt()}</span><span class="price">${eur(total)}</span></div>
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
  const madreTxt = (size) => (madreExtra(size) != null ? `30 h · +${eur(madreExtra(size))}` : 'Solo en mediana');
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
          <fieldset class="fs"><legend>Masa</legend><div class="opts opts--3"><label class="opt"><input type="radio" name="masa" value="MANO" checked><span>Clásica<small>Esponjosa</small></span></label><label class="opt"><input type="radio" name="masa" value="MAPEQ"><span>Fina<small>Crujiente</small></span></label><label class="opt opt--madre"><input type="radio" name="masa" value="MMADRE"${defSize(it) === 'M' ? '' : ' disabled'}><span>Masa madre<small id="madre-txt">${madreTxt(defSize(it))}</small></span></label></div></fieldset>
          <fieldset class="fs"><legend>¿Por mitades?</legend><div class="half-row"><label class="sr-only" for="half">Segunda mitad</label><select id="half"><option value="">Pizza entera</option>${others.map((p) => `<option value="${p.key}">Mitad ${esc(p.name)}</option>`).join('')}</select></div><p class="note" id="half-note" hidden>En las pizzas por mitades se aplica el precio de la mitad más cara. Se confirma al hacer el pedido.</p></fieldset>` : ''}
          <div class="sheet__actions">
            <div class="qty"><button type="button" data-sq="-1" aria-label="Uno menos">−</button><output id="sq">1</output><button type="button" data-sq="1" aria-label="Uno más">+</button></div>
            <button class="btn" type="button" id="sheet-add">Añadir</button>
          </div>
          ${isPz ? '<p class="promo-tag"><b>50 %</b>A domicilio, tu segunda pizza mediana sale a mitad de precio.</p>' : ''}
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
    if (e.target.name === 'sz') {
      const m = $('input[value="MMADRE"]', sheet); const ok = madreExtra(e.target.value) != null;
      m.disabled = !ok; $('#madre-txt', sheet).textContent = madreTxt(e.target.value);
      if (!ok && m.checked) { m.checked = false; $('input[value="MANO"]', sheet).checked = true; toast('La masa madre es solo para pizza mediana'); }
    }
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
  /* Ingredientes reales: recortes de las fotos de las pizzas de Carlos (img/ingredientes).
     [nº de recortes, prefijo de archivo, tamaño de cada recorte en % del diámetro del queso] */
  const ING = {"476809":[5,"476809",[6.12,6.12,6.12,7.35,6.12]],"PEPP":[6,"pepp",[16.33,16.33,15.1,15.1,15.1,14.69]],"ACEIN":[8,"acein",[7.35,7.35,7.35,7.35,7.35,7.35,7.35,7.35]],"CHAMP":[6,"champ",[13.47,13.47,11.84,11.84,11.84,11.84]],"QUESOCABRA":[7,"quesocabra",[15.1,15.1,15.1,14.69,15.1,14.69,13.06]],"TOMATECHERRY":[6,"tomatecherry",[13.47,11.84,13.47,13.47,13.06,11.84]],"POLLOVEGA":[5,"pollovega",[14.29,15.1,14.29,14.29,13.47]],"POLLOBRASEAD":[4,"pollobrasead",[14.29,15.1,14.29,14.29]],"PIMVER":[6,"pimver",[16.94,11.22,10.61,11.63,10.2,13.27]],"CEBOLLACARA":[5,"cebollacara",[13.47,14.29,13.47,11.43,13.47]],"JAYO":[7,"jayo",[15.51,15.51,14.29,13.47,14.29,14.29,15.1]],"PINA":[5,"pina",[7.76,7.76,7.76,7.76,7.76]],"AUTUN":[6,"autun",[12.24,11.43,11.43,11.43,11.43,11.43]],"BACO":[7,"baco",[13.06,13.06,12.24,12.24,13.06,12.24,13.06]],"BACONKRISPI":[5,"baconkrispi",[9.39,9.39,9.39,9.39,8.57]],"CATE":[4,"cate",[10.61,10.61,10.61,10.61]],"CEBO":[4,"cebo",[18.37,18.37,18.37,18.37]]};
  // cuántas piezas se reparten y ajuste de tamaño por ingrediente
  const ING_N = { PEPP: 9, ACEIN: 11, CHAMP: 9, QUESOCABRA: 7, TOMATECHERRY: 8, POLLOVEGA: 8, POLLOBRASEAD: 8, PIMVER: 8, CEBOLLACARA: 8, JAYO: 8, PINA: 11, AUTUN: 9, BACO: 9, BACONKRISPI: 11, CATE: 11, CEBO: 6, '476809': 11 };
  const ING_K = { PINA: 1.55, '476809': 1.2, ACEIN: 1.1, CEBO: 1, CHAMP: 1.3, BACO: 1.3, JAYO: 1.15, AUTUN: 1.2, CATE: 1.15, BACONKRISPI: 1.2, CEBOLLACARA: 1.15 };
  const ingSrc = (id, k) => `img/ingredientes/${ING[id][1]}-${k % ING[id][0]}.webp`;
  // Salseo extra: hilos de salsa con brillo [color, sombra]
  const DRIZZLE = { CESARSAUCE: ['#efe6c8', '#cdbf96'], EXSBBCB: ['#5a2410', '#3a1608'], EXTRABBC: ['#5a2410', '#3a1608'], EXTRACARBO: ['#f4ead0', '#d8c9a2'], EXTRASBRA: ['#e0571f', '#a33a12'], EXTRATOMATE: ['#c0281a', '#851a10'], SALSAMIELBOTE: ['#e7ad2c', '#b57a12'] };
  // Tinte de la salsa bajo el queso y, si no hay queso, color de la salsa a la vista
  const SAUCE_TINT = { SALSTOM: '', SALSAMER: 'rgba(95,38,14,.42)', '476668': 'rgba(255,246,222,.5)', SALSABRAVAV: 'rgba(225,95,35,.32)', SALSABBCCREAM: 'linear-gradient(115deg,rgba(95,38,14,.42) 50%,rgba(255,246,222,.5) 50%)' };
  const SAUCE_FX = { SALSTOM: 'sepia(.25) saturate(1.1)', SALSAMER: 'sepia(.6) saturate(1.2) brightness(.5) hue-rotate(-8deg)', '476668': 'grayscale(1) sepia(.35) brightness(2.1)', SALSABRAVAV: 'hue-rotate(14deg) saturate(1.3)', SALSABBCCREAM: 'sepia(.6) brightness(.62)' };
  const CX = 50.46, CY = 49.85, RQ = 34; // centro y radio del queso en la foto (en %)
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
    const topSw = (id) => (ING[id] ? `<img src="${ingSrc(id, 0)}" alt="">` : `<i style="background:${DRIZZLE[id] ? DRIZZLE[id][0] : id === 'MEZQUESUA' ? '#f3c24f' : '#f6efdf'}"></i>`);
    g.innerHTML = `
      <div class="cg"><h3>Tamaño</h3><div class="pills">${['S', 'M', 'L'].map((s) => pill('c-size', s, SIZE[s], 'radio', cfg.size === s, eur(B.sizes[s][mode]))).join('')}</div></div>
      <div class="cg"><h3>Masa</h3><div class="pills">${byGroup('masa').map((t) => pill('c-masa', t.id, t.name, 'radio', cfg.masa === t.id, t.id === 'MMADRE' ? (madreOK ? '+' + eur(tPrice('MMADRE')) : 'solo mediana') : '', t.id === 'MMADRE' && !madreOK)).join('')}</div></div>
      <div class="cg"><h3>Salsa</h3><div class="pills">${byGroup('salsa').map((t) => pill('c-salsa', t.id, t.name.replace('Salsa ', ''), 'radio', cfg.salsa === t.id, '', false, sw(sauceSw[t.id] || '#ccc'))).join('')}</div></div>
      <div class="cg"><h3>Queso</h3><div class="pills">${byGroup('queso').map((t) => pill('c-queso', t.id, t.name, 'radio', cfg.queso === t.id)).join('')}</div></div>
      <div class="cg"><h3>Ingredientes <small id="c-count">${cfg.tops.length} de ${MAXTOPS}</small></h3><div class="pills">${byGroup('ingrediente').map((t) => pill('c-top', t.id, t.name, 'checkbox', cfg.tops.includes(t.id), '+' + eur(tPrice(t.id)), !cfg.tops.includes(t.id) && cfg.tops.length >= MAXTOPS, topSw(t.id))).join('')}</div></div>
      <div class="cg"><h3>Extras de queso y salseo</h3><div class="pills">${byGroup('extra').map((t) => pill('c-top', t.id, t.name.replace('Salseo extra ', 'Extra de salsa '), 'checkbox', cfg.tops.includes(t.id), '+' + eur(tPrice(t.id)), !cfg.tops.includes(t.id) && cfg.tops.length >= MAXTOPS, topSw(t.id))).join('')}</div></div>`;
  }
  // posiciones pseudoaleatorias estables por ingrediente
  function rnd(seed) { let s = 0; for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function drawPizza(newId) {
    const cpz = $('#cpz'), tops = $('#cpz-tops');
    const sinQueso = cfg.queso === 'FKSINQSO';
    cpz.dataset.masa = cfg.masa;
    const salsaNm = ((T.find((x) => x.id === cfg.salsa) || {}).name || '').toLowerCase();
    $('#cpz-caption').textContent = `${SIZE[cfg.size]} · ${MASA[cfg.masa].toLowerCase()} · ${salsaNm}`;
    // salsa: tinte bajo el queso, o la salsa a la vista si no hay queso
    const tint = $('#cpz-tint');
    tint.style.background = SAUCE_TINT[cfg.salsa] || 'transparent';
    tint.style.mixBlendMode = cfg.salsa === '476668' ? 'screen' : 'multiply';
    cpz.classList.toggle('sin-queso', sinQueso);
    $('#cpz-salsa').style.filter = SAUCE_FX[cfg.salsa] || '';
    // queso: vegano, extra de mozzarella o mezcla de quesos
    const extra = cfg.tops.includes('EXTMOZZ') || cfg.tops.includes('EXTRAQUEVEGA');
    const fx = [];
    if (cfg.queso === 'QUESOVEGA') fx.push('saturate(.55) brightness(1.07)');
    if (extra) fx.push('brightness(1.06) saturate(.85) contrast(1.04)');
    if (cfg.tops.includes('MEZQUESUA')) fx.push('saturate(1.25) sepia(.12)');
    $('#cpz-cheese').style.filter = fx.join(' ') || 'none';
    $('#cpz-melt').classList.toggle('on', !sinQueso && extra);
    const existing = new Set($$('[data-t]', tops).map((e) => e.dataset.t));
    // quitar los desmarcados
    $$('[data-t]', tops).forEach((e) => {
      if (cfg.tops.includes(e.dataset.t)) return;
      if (G) G.to(e, { scale: 0.4, opacity: 0, y: -20, duration: 0.35, ease: 'power2.in', onComplete: () => e.remove() });
      else e.remove();
    });
    // añadir los nuevos, repartidos de forma estable y sin salirse del queso
    for (const id of cfg.tops) {
      if (existing.has(id)) continue;
      const r = rnd(id + 'x');
      const els = [];
      if (ING[id]) {
        const n = ING_N[id] || 9;
        for (let k = 0; k < n; k++) {
          const size = ING[id][2][k % ING[id][0]] * (ING_K[id] || 1) * (RQ * 2) / 100;
          const ang = (k / n) * Math.PI * 2 + r() * 1.2, rad = (0.18 + 0.82 * Math.sqrt(r())) * (RQ - size / 2 - 1.5);
          const el = document.createElement('img');
          el.dataset.t = id; el.alt = ''; el.className = 'tp' + (id === 'CEBO' ? ' tp--flat' : '');
          el.src = ingSrc(id, k);
          el.style.cssText = `left:${CX + Math.cos(ang) * rad}%;top:${CY + Math.sin(ang) * rad}%;width:${size}%;rotate:${Math.round(r() * 360)}deg`;
          tops.appendChild(el); els.push(el);
        }
        if (G && newId === id) G.from(els, { y: -180, scale: 1.5, opacity: 0, duration: 0.75, ease: 'back.out(1.5)', stagger: 0.04 });
      } else if (DRIZZLE[id]) {
        const [c1, c2] = DRIZZLE[id];
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('aria-hidden', 'true');
        svg.dataset.t = id; svg.classList.add('tp-drizzle');
        let paths = '';
        for (let k = 0; k < 6; k++) {
          // hilos finos en diagonal, con ondas suaves como un chorro de salsa
          const off = -25 + k * 10 + (r() - 0.5) * 3, ph = r() * 6, amp = 0.8 + r() * 0.9;
          const pts = [];
          for (let s = -RQ; s <= RQ; s += 1.2) {
            const x = CX + s * 0.9 + off * 0.42, y = CY + off + s * -0.42 + Math.sin(s * 0.2 + ph) * amp;
            if (Math.hypot(x - CX, y - CY) < RQ - 3.5) pts.push(x.toFixed(1) + ' ' + y.toFixed(1));
          }
          if (pts.length < 3) continue;
          const d = 'M ' + pts.join(' L ');
          paths += `<path d="${d}" stroke="${c2}" stroke-width=".95" opacity=".85"/><path d="${d}" stroke="${c1}" stroke-width=".62"/><path d="${d}" stroke="#fff" stroke-width=".16" opacity=".6" transform="translate(-.12 -.15)"/>`;
        }
        svg.innerHTML = `<g fill="none" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`;
        tops.appendChild(svg);
        if (G && newId === id) {
          const ps = $$('path', svg);
          ps.forEach((p) => { const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; });
          G.to(ps, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut', stagger: 0.05 });
        }
      }
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
    if (t.name === 'c-salsa') { cfg.salsa = t.value; if (G) G.fromTo('#cpz-tint, #cpz-salsa', { opacity: 0 }, { opacity: 1, duration: 0.8, clearProps: 'opacity' }); }
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
  $('#promo-track').innerHTML = D.promos.map((p) => {
    const desde = /desde/i.test(p.desc);
    return `<li class="promo"><div class="promo__img"><img src="${p.img}" alt="${esc(p.name)}" loading="lazy" width="648" height="648"></div><div class="promo__body"><div class="promo__top"><h3>${esc(p.name)}</h3><span class="promo__price">${desde ? '<small>desde</small>' : ''}${eur(p.price)}</span></div><p>${esc(p.desc)}</p><a class="btn btn--sm promo__cta" href="https://www.pizzeriascarlos.es/" target="_blank" rel="noopener">Pedir esta promo</a></div></li>`;
  }).join('');
  const PROV = ['A Coruña', 'Alacant', 'Araba', 'Badajoz', 'Barcelona', 'Burgos', 'Cáceres', 'Cádiz', 'Cantabria', 'Ciudad Real', 'Córdoba', 'Guadalajara', 'Huelva', 'La Rioja', 'León', 'Madrid', 'Málaga', 'Ourense', 'Palencia', 'Pontevedra', 'Salamanca', 'Sevilla', 'Tarragona', 'Toledo', 'València', 'Valladolid', 'Zamora'];
  $('#provs').innerHTML = PROV.map((p) => `<a href="https://www.pizzeriascarlos.es/pizzerias/" target="_blank" rel="noopener"${p === 'Zamora' ? ' class="here"' : ''}>${p}</a>`).join('');
  const HINT = { domicilio: 'Te llevamos la pizza con nuestro propio equipo de reparto.', recoger: 'Pide ahora y recógela en tu pizzería sin esperas.', local: 'Reserva mesa y disfrútala recién salida del horno.' };
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
    hdr.classList.toggle('is-solid', y > 10);
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

    // ENTRADA: cabecera (el logo cae en su pestaña) y escaparate
    G.timeline({ defaults: { ease: 'expo.out' } })
      .from('.hdr__logo', { yPercent: -110, duration: 1.2, ease: 'back.out(1.4)', clearProps: 'transform' }, 0.05)
      .from('.hdr__in > :not(.hdr__logo)', { y: -24, opacity: 0, duration: 1, stagger: 0.08, clearProps: 'all' }, 0.2)
      .fromTo('.slider__frame', { clipPath: 'inset(10% 6% 10% 6% round 40px)', opacity: 0, scale: 0.97 }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', opacity: 1, scale: 1, duration: 1.5, clearProps: 'clipPath,opacity,scale' }, 0.1)
      .from('.slider__tabs li, .slider__pause', { y: 24, opacity: 0, duration: 1, stagger: 0.07, clearProps: 'all' }, 0.6);

    // HERO de marca: entrada orquestada al llegar
    const tl = G.timeline({ defaults: { ease: 'expo.out' }, scrollTrigger: { trigger: hero, start: 'top 78%' } });
    tl.from('.hero__title .ln > span', { yPercent: 115, duration: 1.3, stagger: 0.12 })
      .from('.hero__plate', { scale: 0.4, rotation: -220, opacity: 0, duration: 1.6 }, 0.1)
      .from('.hero__ring', { scale: 0.6, opacity: 0, rotation: -90, duration: 1.8 }, 0.1)
      .from('[data-hero-fade]', { y: 30, opacity: 0, duration: 1, stagger: 0.1 }, 0.4)
      .from('.float, .leaf, .tomato', { scale: 0, opacity: 0, duration: 1.2, stagger: 0.08, ease: 'back.out(1.8)' }, 0.6)
      .from('.hero__badge', { scale: 0, rotation: -120, duration: 1.1, ease: 'back.out(1.6)' }, 0.9)
      .to('.hero__badge', { rotation: 10, yoyo: true, repeat: -1, duration: 3, ease: 'sine.inOut' });
    G.to('.hero__pizza', { rotation: 360, duration: 50, repeat: -1, ease: 'none' });
    G.to('.hero__ring', { rotation: -360, duration: 80, repeat: -1, ease: 'none' });
    G.to('.f1', { y: -18, yoyo: true, repeat: -1, duration: 3.2, ease: 'sine.inOut' });
    G.to('.f2', { y: 14, rotation: 30, yoyo: true, repeat: -1, duration: 2.7, ease: 'sine.inOut' });

    // HERO: cambio de pizza cada pocos segundos
    const heroPizzas = ['carlo-peperoni-pmcarpe', 'especial-carlos-pmsc', 'la-bbqona-pmahobbq', 'chicken-vegetal-hera-pmchve', 'tutto-carne-pmtc'].map((n) => `img/pizzas/${n}.webp`);
    heroPizzas.forEach((s) => { const i = new Image(); i.src = s; });
    let hp = 0;
    setInterval(() => {
      const hr = hero.getBoundingClientRect();
      if (document.hidden || hr.bottom < 0 || hr.top > innerHeight) return;
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

    // HISTORIA: la pizza se monta con fotografía real al hacer scroll
    const sTops = $('#stage-tops');
    const rr = rnd('historia');
    let html = '';
    for (const [id, n] of [['PEPP', 7], ['CHAMP', 7], ['BACO', 6], ['476809', 9], ['CATE', 8]]) {
      for (let k = 0; k < n; k++) {
        const size = ING[id][2][k % ING[id][0]] * (ING_K[id] || 1) * 0.64;
        const ang = rr() * Math.PI * 2, rad = (0.15 + 0.85 * Math.sqrt(rr())) * (30 - size / 2);
        html += `<img class="tp" src="${ingSrc(id, k)}" alt="" style="left:${CX + Math.cos(ang) * rad}%;top:${CY + Math.sin(ang) * rad}%;width:${size}%;rotate:${Math.round(rr() * 360)}deg">`;
      }
    }
    sTops.innerHTML = html;
    const steps = $$('.step');
    const LABELS = ['La masa', 'La salsa', 'El queso', 'Los ingredientes', 'Recién horneada'];
    let curStep = -1;
    const setStep = (i) => {
      if (i === curStep) return; curStep = i;
      steps.forEach((s, k) => s.classList.toggle('is-on', k === i));
      const lb = $('#stage-label'); lb.textContent = LABELS[i];
      G.fromTo(lb, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, overwrite: true });
    };
    const story = G.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: '.story', pin: '.story__pin', start: 'top top', end: '+=320%', scrub: 0.8, anticipatePin: 1 },
      // El paso activo sigue a la animación (incluida la inercia del scrub), no solo al scroll
      onUpdate() {
        const t = this.time();
        setStep(t < 1 ? 0 : t < 2 ? 1 : t < 3 ? 2 : t < 4.2 ? 3 : 4);
        $('#story-bar').style.width = this.progress() * 100 + '%';
      },
    });
    story.fromTo('.stage__masa', { scale: 0.32, rotation: -160, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: 1, ease: 'power2.out' })
      .fromTo('.stage__salsa', { clipPath: 'circle(0% at 50.46% 49.85%)', rotation: -120 }, { clipPath: 'circle(36% at 50.46% 49.85%)', rotation: 0, duration: 1, ease: 'power1.inOut' })
      .fromTo('.stage__queso', { opacity: 0, scale: 1.1, filter: 'blur(8px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 1, ease: 'power2.out' })
      .fromTo('#stage-tops .tp', { y: -240, opacity: 0, scale: 1.7 }, { y: 0, opacity: 1, scale: 1, duration: 0.55, stagger: 0.016, ease: 'back.out(1.4)' })
      .to('.stage__fuego', { opacity: 1, duration: 0.35 }, '+=0.1')
      .fromTo('.stage__final', { opacity: 0, scale: 1.05 }, { opacity: 1, scale: 1, duration: 0.6, ease: 'power2.out' }, '<0.15')
      .to('.stage__fuego', { opacity: 0, duration: 0.45 })
      .to('.stage__steam', { opacity: 1, duration: 0.3 }, '<')
      .to('.stage', { scale: 1.03, duration: 0.5 }, '<');

    // PROMOCIONES: la destacada y las tarjetas entran al llegar
    G.from('.promo-star', { y: 70, opacity: 0, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: '.promo-star', start: 'top 85%' } });
    G.from('.promo-star__img img', { scale: 1.25, duration: 1.8, ease: 'expo.out', scrollTrigger: { trigger: '.promo-star', start: 'top 85%' } });
    ST.batch('.promo', { start: 'top 90%', once: true, onEnter: (b) => G.fromTo(b, { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: 'expo.out', stagger: 0.08, clearProps: 'transform,opacity' }) });
    G.set('.promo', { opacity: 0 });

    // CARTA: entrada de tarjetas cuando llegas (las pestañas de categoría quedan fijas)
    ST.create({ trigger: grid, start: 'top 85%', once: true, onEnter: () => { gridSeen = true; animateCards($$('.card', grid)); } });
    G.set($$('.card', grid), { opacity: 0 });

    // CREA TU PIZZA: la pizza entra girando
    G.from('#cpz', { rotation: -120, scale: 0.6, opacity: 0, duration: 1.6, ease: 'expo.out', scrollTrigger: { trigger: '.crea', start: 'top 70%' } });
    G.from('.cg', { y: 40, opacity: 0, stagger: 0.08, duration: 0.9, ease: 'expo.out', scrollTrigger: { trigger: '.crea__groups', start: 'top 85%' } });

    // SERVICIOS: lista y escenario
    G.from('.svc__tab', { x: -40, opacity: 0, stagger: 0.07, duration: 0.9, ease: 'expo.out', scrollTrigger: { trigger: '.svc', start: 'top 80%' } });
    G.from('.svc__stage', { clipPath: 'inset(12% 12% 12% 12% round 40px)', opacity: 0, duration: 1.3, ease: 'expo.out', clearProps: 'clipPath', scrollTrigger: { trigger: '.svc', start: 'top 80%' } });

    // PIZZERÍAS: contador 0 → 27
    const cnt = { v: 0 };
    G.to(cnt, { v: 27, duration: 1.8, ease: 'power3.out', scrollTrigger: { trigger: '#pizzerias', start: 'top 70%' }, onUpdate: () => { $('#count27').textContent = Math.round(cnt.v); } });
    G.from('.provs a', { scale: 0, opacity: 0, stagger: 0.025, duration: 0.6, ease: 'back.out(2)', scrollTrigger: { trigger: '.provs', start: 'top 85%' } });
    G.from('.mapcard', { y: 80, rotation: 2, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.mapcard', start: 'top 85%' } });

    // APP / FRANQUICIA / EMPLEO
    G.from('.tile', { y: 90, opacity: 0, stagger: 0.12, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: '.trio', start: 'top 80%' } });
    G.from('.ftr__claim', { yPercent: 60, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.ftr', start: 'top 85%' } });

    // Menú activo según la sección
    ['carta', 'promos', 'crea', 'servicios', 'pizzerias'].forEach((id) => ST.create({ trigger: '#' + id, start: 'top center', end: 'bottom center', onToggle: (s) => $$(`.hdr__nav a[href="#${id}"]`).forEach((a) => a.classList.toggle('is-active', s.isActive)) }));

    addEventListener('load', () => ST.refresh());
  }

  /* =========================================================
     Formas de pedir: pestañas con escenario que cambia solo
     ========================================================= */
  function services() {
    const root = $('#svc'); if (!root) return;
    const tabs = $$('.svc__tab', root), panels = $$('.svc__panel', root);
    const DUR = 5200;
    let i = 0, elapsed = 0, hover = false, inView = false, trackT = null;
    function track(p) {
      clearInterval(trackT);
      const lis = $$('.track li', p); let k = 0;
      lis.forEach((l) => l.classList.remove('done', 'now'));
      const stepIt = () => { lis.forEach((l, j) => { l.classList.toggle('done', j < k); l.classList.toggle('now', j === k); }); k = (k + 1) % (lis.length + 1); };
      stepIt(); trackT = setInterval(stepIt, 900);
    }
    function show(n) {
      if (n === i) return;
      const prev = panels[i], next = panels[n]; i = n; elapsed = 0;
      tabs.forEach((b, k) => { b.setAttribute('aria-selected', String(k === i)); b.tabIndex = k === i ? 0 : -1; b.style.setProperty('--p', 0); });
      next.hidden = false; next.classList.add('is-on'); prev.classList.add('is-prev'); prev.classList.remove('is-on');
      const done = () => { prev.classList.remove('is-prev'); prev.hidden = true; };
      if (G) {
        G.fromTo(next, { clipPath: 'inset(0% 0% 0% 100% round 0px)' }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', duration: 1, ease: 'expo.inOut', clearProps: 'clipPath', onComplete: done });
        G.fromTo($('img', next), { scale: 1.2 }, { scale: 1, duration: 1.6, ease: 'expo.out' });
        G.fromTo($('.svc__card', next), { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: 'expo.out', delay: 0.3 });
      } else done();
      if (next.classList.contains('svc__panel--track')) track(next); else clearInterval(trackT);
    }
    tabs.forEach((b, k) => {
      b.addEventListener('click', () => show(k));
      b.addEventListener('keydown', (e) => {
        if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return;
        e.preventDefault(); const n = (k + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[n].focus(); show(n);
      });
    });
    root.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hover = true; });
    root.addEventListener('pointerleave', () => { hover = false; });
    if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { inView = e.isIntersecting; }).observe(root); else inView = true;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(100, now - last); last = now;
      if (!reduced && !hover && inView && !document.hidden) { elapsed += dt; if (elapsed >= DUR) show((i + 1) % tabs.length); }
      tabs[i].style.setProperty('--p', Math.min(1, elapsed / DUR));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // "Pedir a domicilio / para recoger": marca la opción en el formulario de pedido
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]'); if (!b) return;
      const r = $(`.order input[value="${b.dataset.pick}"]`); if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
      setTimeout(() => $('#cp')?.focus({ preventScroll: true }), 1400);
    });
  }

  /* =========================================================
     Escaparate de promociones (carrusel)
     ========================================================= */
  function slider() {
    const root = $('#slider'); if (!root) return;
    const frame = $('#slider-frame', root), slides = $$('.slide', root), tabs = $$('[data-go]', root);
    const blade = $('.slider__blade', root), pauseBtn = $('.slider__pause', root);
    const amb = $$('.vitrina__amb img');
    const DUR = 6500;
    let i = 0, elapsed = 0, busy = false, hover = false, inView = true, paused = reduced, ambI = 0, kb = null;

    function mark() {
      slides.forEach((s, k) => { const on = k === i; s.classList.toggle('is-on', on); s.setAttribute('aria-hidden', String(!on)); s.tabIndex = on ? 0 : -1; });
      tabs.forEach((b, k) => { b.setAttribute('aria-current', String(k === i)); b.style.setProperty('--p', k < i ? 1 : 0); });
      $('#cap-t').textContent = slides[i].dataset.t; $('#cap-s').textContent = slides[i].dataset.s;
      // luz ambiental: fundido entre dos copias desenfocadas del banner
      const next = amb[1 - ambI]; next.src = $('img', slides[i]).currentSrc || $('img', slides[i]).src;
      next.classList.add('on'); amb[ambI].classList.remove('on'); ambI = 1 - ambI;
    }
    // zoom lento muy suave: los banners llevan texto cerca de los bordes
    function kenBurns(s, first) { if (!G) return; kb?.kill(); kb = G.fromTo($('img', s), { scale: first ? 1.15 : 1.025 }, { scale: 1, duration: first ? 2.6 : 2.2, ease: 'expo.out' }); }
    function go(n, dir) {
      n = (n + slides.length) % slides.length;
      if (n === i || busy) return;
      dir = dir || (n > i ? 1 : -1);
      const from = slides[i], to = slides[n];
      i = n; elapsed = 0;
      if (!G) { mark(); return; }
      busy = true; kb?.kill();
      from.classList.add('is-prev');
      mark();
      const w = frame.clientWidth;
      G.timeline({ onComplete: () => { from.classList.remove('is-prev'); G.set($('img', from), { clearProps: 'all' }); G.set(to, { clearProps: 'clipPath' }); busy = false; kenBurns(to); } })
        .fromTo(to, { clipPath: dir > 0 ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.15, ease: 'expo.inOut' }, 0)
        .fromTo($('img', to), { scale: 1.25, xPercent: dir * 7 }, { scale: 1.025, xPercent: 0, duration: 1.6, ease: 'expo.out' }, 0.1)
        .to($('img', from), { scale: 0.92, xPercent: -dir * 9, filter: 'brightness(0.3)', duration: 1.15, ease: 'expo.inOut' }, 0)
        .fromTo(blade, { x: dir > 0 ? w : 0, opacity: 1 }, { x: dir > 0 ? 0 : w, duration: 1.15, ease: 'expo.inOut' }, 0)
        .to(blade, { opacity: 0, duration: 0.25 }, 0.95);
    }
    // temporizador con barras de progreso tipo "historias"
    let last = performance.now();
    function tick(now) {
      const dt = Math.min(100, now - last); last = now;
      if (!paused && !hover && inView && !document.hidden && !busy) {
        elapsed += dt;
        if (elapsed >= DUR) go(i + 1, 1);
      }
      tabs[i].style.setProperty('--p', Math.min(1, elapsed / DUR));
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { inView = e.isIntersecting; }).observe(root);

    function setPaused(p) {
      paused = p; pauseBtn.setAttribute('aria-pressed', String(p));
      pauseBtn.setAttribute('aria-label', p ? 'Reanudar el pase de promociones' : 'Pausar el pase de promociones');
    }
    setPaused(paused);
    pauseBtn.addEventListener('click', () => setPaused(!paused));
    tabs.forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.go))));
    $$('[data-step]', root).forEach((b) => b.addEventListener('click', () => go(i + Number(b.dataset.step), Number(b.dataset.step))));
    root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1, 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1, -1); }
    });
    frame.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hover = true; });
    frame.addEventListener('pointerleave', () => {
      hover = false;
      if (G) G.to(frame, { rotationX: 0, rotationY: 0, duration: 1, ease: 'expo.out' });
    });
    // con teclado se pausa mientras el foco está dentro; con un clic, no
    root.addEventListener('focusin', (e) => { try { if (e.target.matches(':focus-visible')) hover = true; } catch { hover = true; } });
    root.addEventListener('focusout', (e) => { if (!root.contains(e.relatedTarget)) hover = false; });
    // inclinación 3D y reflejo que sigue al ratón
    frame.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = frame.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      frame.style.setProperty('--gx', x * 100 + '%'); frame.style.setProperty('--gy', y * 100 + '%');
      if (G) G.to(frame, { rotationY: (x - 0.5) * 5, rotationX: -(y - 0.5) * 5, duration: 0.8, ease: 'power3.out' });
    });
    // deslizar con el dedo
    let sx = null, swiped = false;
    frame.addEventListener('pointerdown', (e) => { sx = e.clientX; swiped = false; });
    frame.addEventListener('pointerup', (e) => {
      if (sx === null) return;
      const dx = e.clientX - sx; sx = null;
      if (Math.abs(dx) > 50) { swiped = true; go(i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1); }
    });
    frame.addEventListener('click', (e) => { if (swiped) { e.preventDefault(); e.stopPropagation(); swiped = false; } }, true);
    kenBurns(slides[0], true);
  }

  /* =========================================================
     Aviso de la app: envío gratis (una vez por sesión)
     ========================================================= */
  function appPromo() {
    const dlg = $('#appm'), chip = $('#appchip'); if (!dlg || !dlg.showModal) return;
    const KEY = 'carlos-app-promo';
    const panel = $('.appm__in', dlg), media = $('.appm__media', dlg);
    let closing = false;
    const seen = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };
    const markSeen = () => { try { sessionStorage.setItem(KEY, '1'); } catch { /* sin almacenamiento */ } };
    let miniT;
    function showChip() {
      chip.hidden = false; chip.classList.remove('is-mini');
      clearTimeout(miniT); miniT = setTimeout(() => chip.classList.add('is-mini'), 5000);
      if (G) G.fromTo(chip, { scale: 0, rotation: -30, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: 0.9, ease: 'back.out(1.8)', clearProps: 'transform,opacity' });
    }
    function open() {
      if (dlg.open) return;
      if ($('dialog[open]')) { setTimeout(open, 3000); return; }
      chip.hidden = true;
      dlg.showModal(); lock(true); locked = true;
      if (G) {
        G.timeline({ defaults: { ease: 'expo.out' } })
          .fromTo(panel, { y: 90, scale: 0.9, rotationX: 14, opacity: 0, transformPerspective: 1400, transformOrigin: '50% 100%' }, { y: 0, scale: 1, rotationX: 0, opacity: 1, duration: 1.1 })
          .fromTo('.appm__media img', { scale: 1.3 }, { scale: 1, duration: 1.6 }, 0)
          .fromTo('.appm__shine', { xPercent: -130 }, { xPercent: 130, duration: 1.3, ease: 'power2.inOut' }, 0.45)
          .fromTo('.appm__body > *', { y: 26, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.06, duration: 0.9 }, 0.25)
          .fromTo('.appm__perks li', { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, stagger: 0.07, duration: 0.7, ease: 'back.out(2)' }, 0.6);
      }
      panel.tabIndex = -1;
      setTimeout(() => panel.focus({ preventScroll: true }), 30);
    }
    function close() {
      if (!dlg.open || closing) return;
      closing = true; markSeen();
      const fin = () => { dlg.close(); if (G) G.set(panel, { clearProps: 'all' }); afterClose(); };
      if (!G) { fin(); return; }
      chip.hidden = false; chip.style.opacity = '0';
      const c = chip.getBoundingClientRect(), p = panel.getBoundingClientRect();
      chip.hidden = true; chip.style.opacity = '';
      const toChip = c.width > 0;
      G.to(panel, toChip
        ? { x: c.left + c.width / 2 - (p.left + p.width / 2), y: c.top + c.height / 2 - (p.top + p.height / 2), scale: 0.06, opacity: 0, duration: 0.7, ease: 'power3.in', onComplete: fin }
        : { y: 70, scale: 0.94, opacity: 0, duration: 0.4, ease: 'power2.in', onComplete: fin });
    }
    let locked = false;
    function afterClose() { if (!locked) return; locked = false; lock(false); closing = false; markSeen(); showChip(); }
    dlg.addEventListener('close', afterClose);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close-app]')) close(); });
    $('.appm__cta', dlg).addEventListener('click', () => markSeen());
    chip.addEventListener('click', open);
    // la imagen se inclina con el ratón
    media.addEventListener('pointermove', (e) => {
      if (!G || e.pointerType !== 'mouse') return;
      const r = media.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      G.to('.appm__media img', { x: x * -16, y: y * -16, scale: 1.06, duration: 0.8, ease: 'power3.out' });
    });
    media.addEventListener('pointerleave', () => { if (G) G.to('.appm__media img', { x: 0, y: 0, scale: 1, duration: 1, ease: 'expo.out' }); });
    if (seen()) showChip(); else setTimeout(open, 1800);
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
    $('.stage__masa, .stage__final').forEach((e) => { e.style.opacity = 1; });
    addEventListener('scroll', () => onScroll(scrollY), { passive: true });
  }
  slider();
  appPromo();
  services();
  onScroll(scrollY);
})();
