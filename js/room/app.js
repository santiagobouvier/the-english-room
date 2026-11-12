// =============================================================
// The English Room — recorrido espacial
// Las páginas (index, sobre-mi, cursos, recursos-gratuitos,
// contacto) siguen siendo archivos HTML reales: se puede entrar
// directo, recargar y usar atrás/adelante. Al navegar dentro del
// sitio, la cámara "entra" en una pantalla y aparece la próxima
// escena; el contenido nuevo se monta sin recargar.
// =============================================================
import { PAGE_HERO, BADGE_LABEL } from './scenes.js';
import { startBackdrop } from './backdrop.js';

const doc = document.documentElement;
// ?reducido fuerza el modo sin movimiento (útil para revisarlo sin tocar el sistema)
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('reducido');
const mobile = matchMedia('(max-width: 900px), (pointer: coarse)').matches;
if (reduced) doc.classList.add('reduced');

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = { '': 'inicio', 'index.html': 'inicio', 'sobre-mi.html': 'sobre-mi', 'cursos.html': 'cursos', 'recursos-gratuitos.html': 'recursos', 'contacto.html': 'contacto' };
const fileOf = (url) => url.pathname.split('/').pop();
const isPage = (url) => url.origin === location.origin && fileOf(url) in PAGES;

// ---------- cursos: mismos slugs y alias que la web original ----------
const CURSOS = {
  'a1': 'curso-principiante', 'a2': 'curso-intermedio', 'a2-plus': 'curso-preintermedio', 'b1': 'curso-intermedio-b1',
  'b2': 'curso-intermedio-b2', 'c1': 'curso-avanzado-cae', 'c2': 'curso-avanzado-prof', 'pronunciation': 'pronunciation-course',
  'conversational': 'conversational-english-sessions', 'legal': 'legal-english-course',
};
const ALIAS = {
  'fce': 'b2', 'cae': 'c1', 'cpe': 'c2', 'a2+': 'a2-plus', 'b1+': 'b1', 'beginner': 'a1', 'elementary': 'a2',
  'pre-intermediate': 'a2-plus', 'intermediate': 'b1', 'upper-intermediate': 'b2', 'advanced': 'c1', 'proficient': 'c2',
  'pronunciacion': 'pronunciation', 'conversacional': 'conversational', 'legal-english': 'legal', 'ingles-legal': 'legal',
};
const SLUG_DE = Object.fromEntries(Object.entries(CURSOS).map(([s, id]) => [id, s]));
/** Acepta el slug, un alias o directamente el id del modal original. Devuelve el slug. */
function resolveCurso(value) {
  if (!value) return null;
  let v = String(value).trim().toLowerCase();
  if (ALIAS[v]) v = ALIAS[v];
  if (CURSOS[v]) return v;
  if (SLUG_DE[v]) return SLUG_DE[v];
  return null;
}

// ---------- estado ----------
let main = $('#main');
let world = null;
let lenis = null;
let busy = false;
let pageCleanup = [];
let course = null;          // { slug, pushed }
let lastScrollY = 0;
let backdrop = null;
const announcer = $('#announcer');

// =============================================================
// Arranque
// =============================================================
async function boot() {
  initLenis();
  initMenu();
  initLinks();
  initPrefetch();
  initTilt();
  try { backdrop = startBackdrop($('#bg'), { reduced }); } catch (err) { console.warn('[room] sin fondo animado', err); }

  try {
    const { World } = await import('./world.js');
    world = new World($('#gl'), { reduced, mobile });
    window.__room = { world, get lenis() { return lenis; } };
  } catch (err) {
    console.warn('[room] WebGL no disponible, se muestra la versión sin 3D', err);
    doc.classList.add('no-gl');
  }

  setupPage({ first: true });
  // montar ya: así las texturas y la tipografía empiezan a cargar detrás del loader
  world?.mount(main);
  if (world) world.start(onFrame);
  else requestAnimationFrame(function tick() { onFrame(); requestAnimationFrame(tick); });
  await runLoader();

  // entrada directa a un curso o a un ancla
  const url = new URL(location.href);
  if (main.dataset.page === 'cursos') syncCourseFromURL({ fromLoad: true });
  else if (url.hash) scrollToHash(url.hash, true);
  history.replaceState({ page: main.dataset.page }, '', location.href);
}

// ---------- loader estilo "000 → 100" ----------
async function runLoader() {
  const loader = $('#loader');
  if (!loader) return;
  // Rápido: no se esperan las texturas (cargan de fondo mientras entra la portada).
  // Se espera la tipografía, con un mínimo para que la animación del logo se vea
  // entera y un tope duro para que nunca demore. performance.now() cuenta desde
  // que empezó a cargar la página, así que el tiempo de descarga ya está incluido.
  const returning = doc.classList.contains('returning');
  const minAt = reduced ? 0 : returning ? 150 : 950;
  const maxAt = reduced ? 300 : returning ? 600 : 1600;
  const until = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms - performance.now())));
  const fontsOk = (document.fonts ? document.fonts.ready : Promise.resolve()).catch(() => {});
  await Promise.race([Promise.all([fontsOk, until(minAt)]), until(maxAt)]);
  loader.classList.add('ready');
  await until(performance.now() + (returning || reduced ? 0 : 140));
  try { sessionStorage.setItem('ter-visto', '1'); } catch (e) { /* sin almacenamiento */ }
  loader.classList.add('done');
  try { performance.mark('ter-loader-done'); } catch (e) { /* navegadores viejos */ }
  // el hero arranca a pantalla completa y se acomoda en su marco
  world?.heroIntro();
  revealHero();
  setTimeout(() => loader.remove(), 900);
}

// =============================================================
// Scroll suave (Lenis) — conserva el scroll nativo y el teclado
// =============================================================
function initLenis() {
  if (reduced || !window.Lenis) return;
  lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.9 });
}

function onFrame() {
  if (lenis) lenis.raf(performance.now());
  const y = window.scrollY;
  lastScrollY = y;
  $('#hd')?.classList.toggle('scrolled', y > 60);
  updateStages();
  backdrop?.frame();
}

// Retrato con inclinación 3D y reflejo que sigue al cursor
function initTilt() {
  if (reduced) return;
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest?.('[data-tilt]');
    document.querySelectorAll('[data-tilt]').forEach((t) => {
      if (t !== el) { t.style.transform = ''; return; }
      const r = t.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      t.style.transform = `perspective(1100px) rotateY(${(x - 0.5) * 9}deg) rotateX(${(0.5 - y) * 9}deg)`;
      t.style.setProperty('--gx', `${x * 100}%`);
      t.style.setProperty('--gy', `${y * 100}%`);
    });
  }, { passive: true });
}

// =============================================================
// Menú en tarjetas
// =============================================================
function initMenu() {
  const btn = $('#menuBtn');
  const menu = $('#menu');
  if (!btn || !menu) return;
  const open = () => {
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => menu.classList.add('open'));
    menu.querySelector('a')?.focus({ preventScroll: true });
  };
  const close = (focusBtn = false) => {
    if (menu.hidden) return;
    menu.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    setTimeout(() => { if (!menu.classList.contains('open')) menu.hidden = true; }, reduced ? 0 : 450);
    if (focusBtn) btn.focus();
  };
  btn.addEventListener('click', () => (menu.hidden ? open() : close()));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) close(true); });
  document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) close(); });
  menu.addEventListener('focusout', (e) => { if (!menu.contains(e.relatedTarget) && e.relatedTarget !== btn) close(); });
  window.__closeMenu = close;
}

function setActiveNav(key) {
  $$('#menu [data-nav]').forEach((a) => {
    if (a.dataset.nav === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

// =============================================================
// Enlaces internos → viaje espacial
// =============================================================
function initLinks() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (href.startsWith('#')) {
      e.preventDefault();
      scrollToHash(href);
      history.replaceState(history.state, '', href);
      return;
    }
    const url = new URL(a.href, location.href);
    if (!isPage(url)) return;
    e.preventDefault();
    navigate(url, { from: a.closest('[data-next-card]') });
  });

  window.addEventListener('popstate', () => {
    const url = new URL(location.href);
    const key = PAGES[fileOf(url)];
    if (key && key !== main.dataset.page) navigate(url, { push: false });
    else if (key === 'cursos') syncCourseFromURL();
  });
}

function scrollToHash(hash, instant = false) {
  const el = hash.length > 1 && main.querySelector(hash);
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: -20, immediate: instant, duration: 1.6 });
  else el.scrollIntoView({ behavior: instant || reduced ? 'auto' : 'smooth' });
}

async function navigate(url, { push = true, from = null } = {}) {
  url = new URL(url, location.href);
  const key = PAGES[fileOf(url)];
  if (!key) { location.href = url.href; return; }
  window.__closeMenu?.();

  // misma página: solo curso o ancla
  if (key === main.dataset.page) {
    if (key === 'cursos' && url.searchParams.get('curso')) {
      const slug = resolveCurso(url.searchParams.get('curso'));
      if (slug) { openCourse(slug, { push }); return; }
    }
    if (push) history.pushState({ page: key }, '', url.href);
    if (url.hash) scrollToHash(url.hash);
    else if (lenis) lenis.scrollTo(0, { duration: 1.4 }); else window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    return;
  }
  if (busy) return;
  busy = true;
  if (course) closeCourse({ silent: true });

  const htmlP = getPage(fileOf(url) || 'index.html');

  try {
    // 1) la página actual se va: la tarjeta "Siguiente" se expande a pantalla
    //    completa, o (desde el menú/footer/atrás) sube una cortina con filo turquesa
    document.body.classList.add('leaving');
    if (!reduced) {
      await transitionIn(from, key);
    } else {
      $('#veil').classList.add('on');
      await sleep(reduced ? 200 : 450);
    }
    const html = await htmlP;
    const next = new DOMParser().parseFromString(html, 'text/html');
    const newMain = next.getElementById('main');
    if (!newMain) throw new Error('sin <main>');

    teardownPage();
    world?.unmount();
    // 2) la página nueva entra con un fundido mientras la portada se acomoda
    document.body.classList.add('entering');
    main.replaceWith(newMain);
    main = newMain;
    document.body.classList.remove('leaving');
    requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('entering')));
    document.title = next.title;
    if (push) history.pushState({ page: key }, '', url.href);
    lenis?.scrollTo(0, { immediate: true, force: true });
    window.scrollTo(0, 0);
    setupPage();
    world?.mount(main, { heroIntro: true });
    $('#veil').classList.remove('on');
    if (!reduced) transitionOut();
    revealHero();
    main.focus({ preventScroll: true });
    announcer.textContent = (main.querySelector('h1')?.textContent || document.title).trim();
    if (key === 'cursos') syncCourseFromURL({ fromLoad: true });
    else if (url.hash) setTimeout(() => scrollToHash(url.hash), 300);
  } catch (err) {
    console.warn('[room] navegación con recarga completa', err);
    location.href = url.href;
    return;
  } finally {
    busy = false;
  }
}

// =============================================================
// Cambio de página v3 (sin 3D): una sola capa fija fuera de <main>.
//  · desde una tarjeta "Siguiente": la tarjeta crece hasta llenar la
//    pantalla, el círculo de la foto se abre y el título va al centro.
//  · desde cualquier otro enlace: sube una cortina con filo turquesa
//    y aparece el nombre de la página.
// Al montar la página nueva, la capa se retira hacia arriba.
// =============================================================
// Sobre mí: la estampilla de cada párrafo (hechos de la historia de Carla)
const DEVICE_TAG = {
  australia: ['01', 'Australia', 'Inglés desde los 4 años', '25.27° S · 133.78° E'],
  uruguay: ['02', 'Uruguay', 'Profesora de inglés desde 2011', '34.90° S · 56.16° O'],
  ushuaia: ['03', 'Ushuaia', 'Un año sabático en el fin del mundo', '54.80° S · 68.30° O'],
  world: ['04', 'Tu lugar favorito', 'Clases online, desde donde estés', 'Online · en vivo'],
};
const PAGE_NAME = { inicio: 'Inicio', 'sobre-mi': 'Sobre mí', cursos: 'Cursos', recursos: 'Recursos gratuitos', contacto: 'Contacto' };
const EASE_IO = 'cubic-bezier(.76, 0, .24, 1)';
const EASE_OUT = 'cubic-bezier(.22, 1, .36, 1)';
const noHover = matchMedia('(hover: none), (pointer: coarse)').matches;
let pt = null;
function ptLayer() {
  if (pt) return pt;
  const el = document.createElement('div');
  el.className = 'pt';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="pt-panel"><span class="pt-media"></span><i class="pt-edge"></i></div><p class="pt-title"></p>';
  document.body.appendChild(el);
  pt = { el, panel: el.querySelector('.pt-panel'), media: el.querySelector('.pt-media'), edge: el.querySelector('.pt-edge'), title: el.querySelector('.pt-title') };
  return pt;
}
function ptReset() {
  const p = ptLayer();
  p.el.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  p.media.removeAttribute('style');
  p.title.removeAttribute('style');
  p.title.textContent = '';
}

async function transitionIn(card, key) {
  const p = ptLayer();
  ptReset();
  const vw = window.innerWidth, vh = window.innerHeight;
  const anims = [];
  p.el.classList.add('on');

  if (card) {
    const r = card.getBoundingClientRect();
    const np = parseFloat(card.style.getPropertyValue('--np')) || 1;
    const iy = r.height * (1 - np) * 0.07, ix = r.width * (1 - np) * 0.09;
    const rad = parseFloat(getComputedStyle(card).borderTopLeftRadius) || 20;
    const from = `inset(${r.top + iy}px ${vw - r.right + ix}px ${vh - r.bottom + iy}px ${r.left + ix}px round ${rad}px)`;
    const to = 'inset(0px 0px 0px 0px round 0px)';
    anims.push(p.panel.animate([{ clipPath: from }, { clipPath: to }], { duration: 950, easing: EASE_IO, fill: 'forwards' }));

    // la foto: el círculo del hover se abre hasta cubrir todo y queda como textura tenue
    p.media.style.setProperty('--img', card.style.getPropertyValue('--img'));
    if (noHover) {
      anims.push(p.media.animate([{ opacity: 0.3 }, { opacity: 0.16 }], { duration: 950, easing: EASE_IO, fill: 'forwards' }));
    } else {
      const st = ncState.get(card);
      const cx = r.left + (st ? st.x : 0.7) * r.width, cy = r.top + (st ? st.y : 0.5) * r.height;
      const r0 = parseFloat(getComputedStyle(card).getPropertyValue('--r')) || 0;
      const mask = `radial-gradient(circle at ${cx}px ${cy}px, #000 calc(var(--r) - 1px), transparent var(--r))`;
      p.media.style.webkitMaskImage = mask;
      p.media.style.maskImage = mask;
      const far = Math.hypot(Math.max(cx, vw - cx), Math.max(cy, vh - cy)) + 2;
      anims.push(p.media.animate([{ '--r': `${r0}px`, opacity: 1 }, { '--r': `${far}px`, opacity: 0.22 }], { duration: 950, easing: EASE_IO, fill: 'forwards' }));
    }

    // el título sale del mismo lugar y tamaño, y viaja al centro
    const src = card.querySelector('.nc-title');
    const tr = src.getBoundingClientRect();
    p.title.textContent = src.textContent.replace(/\s+/g, ' ').trim();
    p.title.style.fontSize = getComputedStyle(src).fontSize;
    p.title.style.whiteSpace = 'normal';
    p.title.style.maxWidth = `${Math.ceil(tr.width) + 2}px`;
    const own = p.title.getBoundingClientRect();
    p.title.style.left = `${tr.left}px`;
    p.title.style.top = `${tr.top}px`;
    const s = Math.min(1.12, (vw * 0.88) / own.width);
    const dx = vw / 2 - (tr.left + (own.width * s) / 2), dy = vh / 2 - (tr.top + (own.height * s) / 2);
    anims.push(p.title.animate([{ transform: 'translate(0, 0) scale(1)' }, { transform: `translate(${dx}px, ${dy}px) scale(${s})` }], { duration: 950, easing: EASE_IO, fill: 'forwards' }));
    card.classList.add('is-leaving');
  } else {
    anims.push(p.panel.animate([{ clipPath: 'inset(100% 0px 0px 0px round 0px)' }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }], { duration: 800, easing: EASE_IO, fill: 'forwards' }));
    anims.push(p.edge.animate([{ transform: `translateY(${vh}px)`, opacity: 1 }, { transform: 'translateY(0px)', opacity: 1, offset: 0.92 }, { transform: 'translateY(0px)', opacity: 0 }], { duration: 800, easing: EASE_IO, fill: 'forwards' }));
    p.title.textContent = PAGE_NAME[key] || '';
    p.title.style.fontSize = `${Math.round(Math.min(Math.max(vw * 0.12, 60), 210))}px`;
    p.title.style.whiteSpace = 'normal';
    p.title.style.textAlign = 'center';
    p.title.style.maxWidth = `${vw - 32}px`;
    const own = p.title.getBoundingClientRect();
    p.title.style.left = `${(vw - own.width) / 2}px`;
    p.title.style.top = `${(vh - own.height) / 2}px`;
    anims.push(p.title.animate([{ transform: 'translateY(60px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 650, delay: 200, easing: EASE_OUT, fill: 'both' }));
  }
  await Promise.all(anims.map((a) => a.finished.catch(() => {})));
}

function transitionOut() {
  const p = ptLayer();
  if (!p.el.classList.contains('on')) return;
  const vh = window.innerHeight;
  const dur = 1000;
  const keep = (a) => { const k = a.effect.getKeyframes(); return k[k.length - 1]; };
  // la capa se retira hacia arriba; el filo turquesa marca el borde que sube
  const panelNow = p.panel.getAnimations()[0];
  const fromClip = panelNow ? keep(panelNow).clipPath : 'inset(0px 0px 0px 0px round 0px)';
  const out = [
    p.panel.animate([{ clipPath: fromClip }, { clipPath: 'inset(0px 0px 100% 0px round 0px)' }], { duration: dur, easing: EASE_IO, fill: 'forwards' }),
    p.edge.animate([{ transform: `translateY(${vh - 1}px)`, opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.9 }, { transform: 'translateY(-1px)', opacity: 0 }], { duration: dur, easing: EASE_IO, fill: 'forwards' }),
  ];
  const titleNow = p.title.getAnimations();
  const tFrom = titleNow.length ? keep(titleNow[titleNow.length - 1]).transform : 'none';
  out.push(p.title.animate([{ transform: tFrom, opacity: 1 }, { transform: `${tFrom === 'none' ? '' : tFrom} translateY(${-vh * 0.18}px)`, opacity: 0 }], { duration: dur * 0.8, easing: EASE_IO, fill: 'forwards', composite: 'replace' }));
  Promise.all(out.map((a) => a.finished)).then(() => { p.el.classList.remove('on'); ptReset(); }).catch(() => {});
}

// ---------- tarjetas "Siguiente": título letra por letra + foto bajo el cursor ----------
const ncState = new Map();
function initNextCards() {
  main.querySelectorAll('[data-next-card]').forEach((card) => {
    const t = card.querySelector('[data-chars]');
    if (t && !t.dataset.charsDone) {
      t.dataset.charsDone = '1';
      const text = t.textContent.trim();
      card.setAttribute('aria-label', `Siguiente: ${text}`);
      let i = 0;
      t.textContent = '';
      text.split(/\s+/).forEach((word, w) => {
        if (w) t.append(' ');
        const wd = document.createElement('span');
        wd.className = 'wd';
        [...word].forEach((c) => {
          const ch = document.createElement('span');
          ch.className = 'ch';
          ch.textContent = c;
          ch.style.setProperty('--i', i++);
          wd.append(ch);
        });
        t.append(wd);
      });
    }
    const st = { x: 0.7, y: 0.5, tx: 0.7, ty: 0.5, inside: false };
    ncState.set(card, st);
    const move = (e) => {
      const r = card.getBoundingClientRect();
      st.tx = (e.clientX - r.left) / r.width; st.ty = (e.clientY - r.top) / r.height;
      if (!st.inside) { st.x = st.tx; st.y = st.ty; st.inside = true; }
    };
    const leave = () => { st.inside = false; };
    card.addEventListener('pointerenter', move);
    card.addEventListener('pointermove', move);
    card.addEventListener('pointerleave', leave);
    let io = null;
    if (t) {
      if (reduced || !('IntersectionObserver' in window)) t.classList.add('in');
      else {
        io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { t.classList.add('in'); io.disconnect(); } }), { rootMargin: '0px 0px -18% 0px' });
        io.observe(t);
      }
    }
    pageCleanup.push(() => {
      card.removeEventListener('pointerenter', move);
      card.removeEventListener('pointermove', move);
      card.removeEventListener('pointerleave', leave);
      io?.disconnect();
      ncState.delete(card);
    });
  });
}
function updateNextCards(vh) {
  ncState.forEach((st, card) => {
    const r = card.getBoundingClientRect();
    if (r.bottom < -50 || r.top > vh + 50) return;
    const k = reduced ? 1 : clamp((vh - r.top) / (vh * 0.72));
    card.style.setProperty('--np', (k * k * (3 - 2 * k)).toFixed(4));
    st.x += (st.tx - st.x) * 0.12; st.y += (st.ty - st.y) * 0.12;
    card.style.setProperty('--mx', `${(st.x * 100).toFixed(2)}%`);
    card.style.setProperty('--my', `${(st.y * 100).toFixed(2)}%`);
  });
}

// ---------- precarga: el HTML de cada página se baja antes del clic ----------
const pageCache = new Map();
function getPage(file) {
  if (!pageCache.has(file)) {
    pageCache.set(file, fetch(file).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
      .catch((e) => { pageCache.delete(file); throw e; }));
  }
  return pageCache.get(file);
}
function warm(a) {
  try {
    const url = new URL(a.href, location.href);
    if (!isPage(url)) return;
    const file = fileOf(url) || 'index.html';
    if (PAGES[file] === main.dataset.page) return;
    getPage(file).catch(() => {});
    // también se prepara la escena 3D de destino, para que el viaje no se trabe
    const [dest, variant] = PAGE_HERO[file] || PAGE_HERO['index.html'];
    world?.getModule(dest, null, variant);
  } catch (e) { /* link raro: se ignora */ }
}
function initPrefetch() {
  const onIntent = (e) => { const a = e.target.closest?.('a[href]'); if (a && a.target !== '_blank') warm(a); };
  document.addEventListener('pointerover', onIntent, { passive: true });
  document.addEventListener('focusin', onIntent);
  document.addEventListener('touchstart', onIntent, { passive: true });
  // un rato después de entrar, se bajan las otras páginas en segundo plano
  setTimeout(() => Object.keys(PAGES).filter((f) => f && PAGES[f] !== main.dataset.page).forEach((f) => getPage(f).catch(() => {})), 2500);
}

// =============================================================
// Montaje de cada página
// =============================================================
function setupPage({ first = false } = {}) {
  const key = main.dataset.page;
  document.body.dataset.page = key;
  document.body.dataset.theme = main.dataset.theme || 'light';
  setActiveNav(key);
  splitWords(main);
  initReveal();
  initRotate();
  initCourses();
  initSpine();
  initNextCards();
  if (first && !world) revealHero();
}

function teardownPage() {
  pageCleanup.forEach((fn) => fn());
  pageCleanup = [];
}

function revealHero() {
  main.querySelectorAll('.hero [data-split], .cover [data-split], .about-sticky [data-split]').forEach((el, i) => setTimeout(() => el.classList.add('in'), reduced ? 0 : 500 + i * 120));
}

function splitWords(root) {
  root.querySelectorAll('[data-split]').forEach((el) => {
    if (el.dataset.splitDone) return;
    el.dataset.splitDone = '1';
    let i = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span');
            w.className = 'w';
            const inner = document.createElement('span');
            inner.textContent = part;
            inner.style.setProperty('--i', i++);
            w.appendChild(inner);
            frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    walk(el);
  });
}

function initReveal() {
  const els = $$('[data-split], [data-reveal]', main).filter((el) => !el.closest('.hero') && !el.closest('.cover') && !el.closest('.about-sticky'));
  if (reduced || !('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -12% 0px' });
  els.forEach((el) => io.observe(el));
  pageCleanup.push(() => io.disconnect());
}

function initRotate() {
  const box = main.querySelector('[data-rotate]');
  if (!box) return;
  const spans = [...box.children];
  let i = 0;
  const id = setInterval(() => {
    spans[i].classList.remove('on');
    i = (i + 1) % spans.length;
    spans[i].classList.add('on');
  }, reduced ? 9000 : 5200);
  pageCleanup.push(() => clearInterval(id));
}

// =============================================================
// Escenas atadas al scroll: la clase, la historia, el portal
// =============================================================
function updateStages() {
  const vh = window.innerHeight;
  updateNextCards(vh);

  // Clase en vivo: el marco crece hasta llenar la pantalla y el chat
  // de testimonios pasa; quien "habla" en la llamada es quien escribió.
  main.querySelectorAll('[data-room]').forEach((stage) => {
    const r = stage.getBoundingClientRect();
    const p = clamp(-r.top / Math.max(1, r.height - vh));
    const frame = stage.querySelector('.frame-call');
    const grow = reduced ? 1 : clamp((vh - r.top) / (vh * 1.1));
    frame.style.setProperty('--grow', grow.toFixed(4));
    const chat = frame.querySelector('.chat');
    const ol = chat?.querySelector('ol');
    if (!chat || !ol) return;
    if (!reduced) {
      const dist = ol.scrollHeight - chat.clientHeight;
      const k = clamp((p - 0.1) / 0.86);
      ol.style.setProperty('--chat-y', `${(-k * dist).toFixed(1)}px`);
    }
    const cr = chat.getBoundingClientRect();
    const center = cr.top + cr.height / 2;
    let best = null, bestD = Infinity;
    ol.querySelectorAll('.msg').forEach((m) => {
      const mr = m.getBoundingClientRect();
      const d = Math.abs(mr.top + mr.height / 2 - center);
      if (d < bestD) { bestD = d; best = m; }
    });
    const active = (reduced || p > 0.06) && bestD < cr.height * 0.6 ? best : null;
    ol.querySelectorAll('.msg').forEach((m) => m.classList.toggle('on', m === active));
    frame.dataset.speaker = active ? active.dataset.speaker : '0';
  });

  // Sobre mí: cada párrafo gira el globo hacia el lugar del que habla
  main.querySelectorAll('[data-about]').forEach((stage) => {
    const r = stage.getBoundingClientRect();
    const sp = clamp(-r.top / Math.max(1, r.height - vh));
    stage.style.setProperty('--sp', sp.toFixed(4));
    const frame = stage.querySelector('[data-hero-frame]');
    frame.dataset.sp = sp.toFixed(4);
    let focus = 'intro';
    stage.querySelectorAll('.story-step').forEach((s) => {
      const sr = s.getBoundingClientRect();
      if (sr.top < vh * 0.62) focus = s.dataset.focus;
    });
    frame.dataset.focus = focus;
    // dispositivo: laptop con el panel de Carla; en Ushuaia (las clases online) se vuelve celular
    const dev = stage.querySelector('[data-device]');
    const key = sp < 0.06 || !DEVICE_TAG[focus] ? 'intro' : focus;
    if (dev && dev.dataset.key !== key) {
      dev.dataset.key = key;
      dev.dataset.mode = key === 'ushuaia' || key === 'world' ? 'phone' : 'laptop';
      dev.dataset.pos = key === 'intro' ? 'intro' : 'story';
      dev.querySelectorAll('[data-shot]').forEach((img) => img.classList.toggle('on', img.dataset.shot === key));
      const t = DEVICE_TAG[key];
      if (t) {
        const tag = dev.querySelector('.dev-tag');
        tag.querySelector('.dev-tag-n').textContent = t[0];
        tag.querySelector('.dev-tag-place').textContent = t[1];
        tag.querySelector('.dev-tag-line').textContent = t[2];
        tag.querySelector('.dev-tag-coord').textContent = t[3];
        tag.classList.remove('swap'); void tag.offsetWidth; tag.classList.add('swap');
      }
    }
  });

  // Espina de cursos: el paso (con decimales) mueve la cámara; el entero elige la ficha
  const sp = main.querySelector('[data-spine]') && spineOf();
  if (sp) {
    const f = sp.float();
    sp.frame.dataset.s = f.toFixed(4);
    sp.sec.style.setProperty('--sp', (f / Math.max(1, sp.n - 1)).toFixed(4));
    const tail = sp.tail();
    const ease = tail * tail * (3 - 2 * tail);
    sp.sec.style.setProperty('--tail', ease.toFixed(4));
    sp.frame.dataset.tail = ease.toFixed(4);
    sp.frame.dataset.fade = (1 - ease).toFixed(4);
    const i = Math.round(f);
    if (sp.sec.dataset.active !== String(i)) {
      sp.sec.dataset.active = String(i);
      sp.items.forEach((li, k) => li.classList.toggle('on', k === i));
      sp.sec.querySelectorAll('.spine-index a').forEach((a) => {
        if (+a.dataset.step === i) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
      });
      const hit = sp.sec.querySelector('.spine-hit');
      if (hit) { hit.href = `cursos.html?curso=${sp.steps[i]}`; hit.dataset.curso = sp.steps[i]; }
    }
  }

  // Portada de Inicio: un tramo corto de scroll en el que la cámara
  // entra en la pantalla de Carla; después sigue la página normal.
  main.querySelectorAll('[data-cover]').forEach((sec) => {
    const r = sec.getBoundingClientRect();
    const cp = reduced ? 0 : clamp(-r.top / Math.max(1, r.height - vh));
    sec.style.setProperty('--cp', cp.toFixed(4));
    const frame = sec.querySelector('[data-gl]');
    if (frame) frame.dataset.p = cp.toFixed(4);
  });
}

// =============================================================
// Cursos: tarjetas → detalle a pantalla completa, con ?curso=
// =============================================================
function initCourses() {
  const dialog = main.querySelector('#courseDialog');
  if (!dialog) return;
  // salir es fácil: botón grande, X, Esc, atrás del navegador o tocar fuera del contenido
  const onCancel = (e) => { e.preventDefault(); closeCourse(); };
  const onClick = (e) => {
    const t = e.target;
    if (t.closest('.cd-back, .cd-close')) { closeCourse(); return; }
    const nav = t.closest('.cd-prev, .cd-next');
    if (nav) { switchCourse(nav.dataset.slug); return; }
    if (t === dialog || t.classList.contains('cd-shell')) closeCourse();
  };
  const onKey = (e) => {
    if (!dialog.open || e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight') switchCourse(dialog.querySelector('.cd-next').dataset.slug);
    if (e.key === 'ArrowLeft') switchCourse(dialog.querySelector('.cd-prev').dataset.slug);
  };
  dialog.addEventListener('cancel', onCancel);
  dialog.addEventListener('click', onClick);
  dialog.addEventListener('keydown', onKey);
  pageCleanup.push(() => {
    dialog.removeEventListener('cancel', onCancel);
    dialog.removeEventListener('click', onClick);
    dialog.removeEventListener('keydown', onKey);
  });
}

// =============================================================
// Espina de cursos: un curso por paso
// =============================================================
function spineOf() {
  const sec = main.querySelector('[data-spine]');
  if (!sec) return null;
  const items = [...sec.querySelectorAll('.course')];
  // el último tramo (tail) es la salida: la escena se desvanece y entra la sección siguiente
  const tailH = () => window.innerHeight * 0.7;
  const span = () => Math.max(1, sec.offsetHeight - window.innerHeight - tailH());
  const top = () => sec.getBoundingClientRect().top + window.scrollY;
  return {
    sec, items,
    frame: sec.querySelector('[data-gl="spine"]'),
    steps: items.map((li) => li.dataset.slug),
    n: items.length,
    stepY: (i) => top() + (span() * i) / Math.max(1, items.length - 1),
    float: () => clamp(-sec.getBoundingClientRect().top / span()) * (items.length - 1),
    tail: () => clamp((-sec.getBoundingClientRect().top - span()) / tailH()),
    inside: () => { const r = sec.getBoundingClientRect(); return r.top <= 2 && r.bottom >= window.innerHeight - 2; },
  };
}

function initSpine() {
  const sp = spineOf();
  if (!sp) return;
  // El scroll es continuo, como en el resto del sitio: bajar la página es bajar por la espina.
  // Las flechas y la escala lateral deslizan hasta un curso (sin bloquear el scroll).
  const go = (i) => {
    i = Math.max(0, Math.min(sp.n - 1, i));
    const y = sp.stepY(i);
    if (lenis) lenis.scrollTo(y, { duration: 1.2, force: true });
    else window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
  };
  const current = () => Math.round(sp.float());

  // flechas / avance de página
  const onKey = (e) => {
    if (course || !sp.inside() || e.target.closest('input, textarea, select')) return;
    const i = current();
    const next = ['ArrowDown', 'PageDown', 'ArrowRight'].includes(e.key) || (e.key === ' ' && !e.shiftKey);
    const prev = ['ArrowUp', 'PageUp', 'ArrowLeft'].includes(e.key) || (e.key === ' ' && e.shiftKey);
    if (next && i < sp.n - 1) { e.preventDefault(); go(i + 1); }
    else if (prev && i > 0) { e.preventDefault(); go(i - 1); }
  };
  document.addEventListener('keydown', onKey);

  // escala lateral: salta al curso
  const onIndex = (e) => {
    const a = e.target.closest('.spine-index a[data-step]');
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    go(+a.dataset.step);
  };
  sp.sec.addEventListener('click', onIndex, true);

  pageCleanup.push(() => {
    document.removeEventListener('keydown', onKey);
    sp.sec.removeEventListener('click', onIndex, true);
  });
}

function canonicalURL(slug) {
  const url = new URL(location.href);
  url.hash = '';
  if (slug) url.searchParams.set('curso', slug); else url.searchParams.delete('curso');
  return url.href;
}

/**
 * Arma el detalle del curso con estructura, usando el texto original del curso tal cual:
 * nivel, título, docente, descripción, datos en fichas (lo que tiene "Etiqueta: valor"),
 * grupos (B2), notas y contacto.
 */
function renderCourse(dialog, slug) {
  const art = main.querySelector(`.course-detail[data-slug="${slug}"]`);
  if (!art) return;
  const li = main.querySelector(`.spine-sec .course[data-slug="${slug}"]`);
  const all = [...main.querySelectorAll('.course-detail')].map((a) => a.dataset.slug);
  const idx = all.indexOf(slug);
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };

  const title = art.querySelector('h3')?.textContent.trim() || '';
  const img = art.querySelector('img')?.getAttribute('src');
  const cta = art.querySelector('a[href*="wa.me"]');
  const kids = [...art.children];
  const ul = art.querySelector('ul');
  const before = kids.filter((k) => k.tagName === 'P' && ul && (k.compareDocumentPosition(ul) & Node.DOCUMENT_POSITION_FOLLOWING));
  const after = kids.filter((k) => k.tagName === 'P' && ul && (k.compareDocumentPosition(ul) & Node.DOCUMENT_POSITION_PRECEDING));
  // párrafos destacados en negrita (IMPORTANTE, ¿PARA QUIÉN ES?, CUPOS LIMITADOS) van como notas
  const isNote = (p) => p.innerHTML.trim().toLowerCase().startsWith('<b>');
  const desc = before.filter((p) => !isNote(p));
  const notes = [...before.filter(isNote), ...after];

  const facts = el('dl', 'cd-facts');
  const extra = el('ul', 'cd-extra');
  const groups = el('ul', 'cd-groups');
  [...(ul?.querySelectorAll('li') || [])].forEach((item) => {
    const t = item.textContent.trim();
    if (t.startsWith('•')) { groups.append(el('li', '', t.replace(/^•\s*/, '').split(' — ').map((x, i) => (i ? `<span>${x}</span>` : `<b>${x}</b>`)).join(''))); return; }
    if (t === 'Grupos:') return;
    const c = t.indexOf(':');
    if (c > 0 && c < 40) {
      const box = el('div');
      box.append(el('dt', '', t.slice(0, c)), el('dd', '', t.slice(c + 1).trim()));
      facts.append(box);
    } else extra.append(el('li', '', t));
  });

  const body = dialog.querySelector('.cd-body');
  body.innerHTML = '';
  const grid = el('div', 'cd-grid');
  const col = el('div', 'cd-main');
  col.append(el('span', 'cd-level', li?.querySelector('.course-level')?.textContent.trim() || BADGE_LABEL[slug] || ''));
  const h = el('h2', '', title); h.id = 'cdTitle'; col.append(h);
  const chip = li?.querySelector('.teacher')?.cloneNode(true);
  if (chip) { chip.classList.add('cd-teacher'); col.append(chip); }
  desc.forEach((p) => col.append(el('p', 'cd-desc', p.innerHTML)));
  if (facts.children.length) col.append(facts);
  if (groups.children.length) { col.append(el('h3', 'cd-sub', 'Grupos')); col.append(groups); }
  if (notes.length || extra.children.length) {
    const nb = el('div', 'cd-notes');
    notes.forEach((p) => nb.append(el('p', '', p.innerHTML)));
    if (extra.children.length) nb.append(extra);
    col.append(nb);
  }
  const ready = el('div', 'cd-cta');
  ready.append(el('p', 'ready-title', 'Are you ready?'));
  if (cta) { const a = cta.cloneNode(true); a.className = 'pill pill-turq pill-arrow'; a.textContent = 'Contactarme'; ready.append(a); }
  col.append(ready);
  const fig = el('figure', 'cd-photo');
  if (img) { const im = el('img'); im.src = img; im.alt = ''; fig.append(im); }
  grid.append(col, fig);
  body.append(grid);
  body.scrollTop = 0;

  dialog.querySelector('.cd-count').textContent = `${String(idx + 1).padStart(2, '0')} / ${all.length}`;
  dialog.querySelector('.cd-prev').dataset.slug = all[(idx - 1 + all.length) % all.length];
  dialog.querySelector('.cd-next').dataset.slug = all[(idx + 1) % all.length];
}

/** Pasar al curso anterior/siguiente sin cerrar el detalle. */
function switchCourse(slug) {
  const dialog = main.querySelector('#courseDialog');
  if (!dialog || !course) return;
  renderCourse(dialog, slug);
  const spine = spineOf();
  const step = spine ? spine.steps.indexOf(slug) : -1;
  if (spine && step >= 0) spine.frame.dataset.force = String(step);
  history.replaceState({ page: 'cursos', curso: slug }, '', canonicalURL(slug));
  course.slug = slug;
}

function openCourse(slug, { push = true, fromLoad = false } = {}) {
  const dialog = main.querySelector('#courseDialog');
  const art = main.querySelector(`.course-detail[data-slug="${slug}"]`);
  const card = main.querySelector(`.course-link[data-curso="${slug}"]`);
  if (!dialog || !art) return;
  if (course?.slug === slug && dialog.open) return;

  renderCourse(dialog, slug);

  const spine = spineOf();
  const step = spine ? spine.steps.indexOf(slug) : -1;
  if (fromLoad && spine && step >= 0) {
    // entrada directa: la espina queda en ese curso antes de entrar en su tarjeta
    const y = spine.stepY(step);
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y);
  }
  if (spine && step >= 0) {
    // la cámara va a la tarjeta de ese curso (aunque estés en otra parte de la página) y entra
    spine.frame.dataset.force = String(step);
    world?.expand(spine.frame);
  }
  const lastFocus = document.activeElement;
  lenis?.stop();
  document.body.classList.add('course-open');
  dialog.showModal();
  requestAnimationFrame(() => dialog.classList.add('open'));
  dialog.querySelector('.cd-back').focus({ preventScroll: true });

  const pushed = push && !fromLoad;
  if (pushed) history.pushState({ page: 'cursos', curso: slug }, '', canonicalURL(slug));
  else history.replaceState({ page: 'cursos', curso: slug }, '', canonicalURL(slug));
  course = { slug, pushed, lastFocus };
}

function closeCourse({ fromPop = false, silent = false } = {}) {
  if (!course) return;
  const c = course;
  // si lo abrimos con pushState, "cerrar" es volver atrás en el historial
  if (!fromPop && !silent && c.pushed && history.state?.curso === c.slug) { history.back(); return; }
  course = null;
  const dialog = main.querySelector('#courseDialog');
  dialog?.classList.remove('open');
  world?.collapse();
  const spine = spineOf();
  if (spine) setTimeout(() => { if (!course) delete spine.frame.dataset.force; }, reduced ? 0 : 700);
  // el foco vuelve a donde estaba (si sigue visible) o a la escala de la espina
  const visible = (el) => el && el !== document.body && el.isConnected && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const fromList = main.querySelector(`.course.on .course-link[data-curso="${c.slug}"]`);
  const fromIndex = spine ? main.querySelector(`.spine-index a[data-step="${spine.steps.indexOf(c.slug)}"]`) : null;
  const back = [c.lastFocus, fromList, fromIndex].find(visible);
  setTimeout(() => {
    if (dialog?.open) dialog.close();
    back?.focus?.({ preventScroll: true });   // después de close(), que devuelve el foco por su cuenta
  }, reduced ? 0 : 280);
  // el canvas vuelve debajo del contenido cuando la escena terminó de achicarse
  setTimeout(() => { if (!course) document.body.classList.remove('course-open'); }, reduced ? 0 : 900);
  lenis?.start();
  if (!fromPop && !silent) history.replaceState({ page: 'cursos' }, '', canonicalURL(null));
}

function syncCourseFromURL({ fromLoad = false } = {}) {
  const slug = resolveCurso(new URL(location.href).searchParams.get('curso'));
  if (slug && slug !== course?.slug) {
    if (fromLoad) setTimeout(() => openCourse(slug, { push: false, fromLoad: true }), reduced ? 0 : 500);
    else openCourse(slug, { push: false });
  } else if (!slug && course) {
    closeCourse({ fromPop: true });
  }
}

boot();
