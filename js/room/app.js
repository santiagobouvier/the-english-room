// =============================================================
// The English Room — recorrido espacial
// Las páginas (index, sobre-mi, cursos, recursos-gratuitos,
// contacto) siguen siendo archivos HTML reales: se puede entrar
// directo, recargar y usar atrás/adelante. Al navegar dentro del
// sitio, la cámara "entra" en una pantalla y aparece la próxima
// escena; el contenido nuevo se monta sin recargar.
// =============================================================
import { PAGE_HERO, BADGE_LABEL, font } from './scenes.js';
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
  const count = $('#loaderCount');
  const fill = loader?.querySelector('.fill');
  if (!loader) return;
  let target = 0, shown = 0;
  const THREE = world ? await import('three') : null;
  let done = !world;
  if (THREE) {
    const m = THREE.DefaultLoadingManager;
    m.onProgress = (_, loaded, total) => { target = Math.max(target, loaded / total); };
    m.onLoad = () => { target = 1; done = true; };
    font().then(() => { target = Math.max(target, 0.4); });
  }
  const t0 = performance.now();
  await new Promise((resolve) => {
    const step = () => {
      const elapsed = performance.now() - t0;
      // si algo tarda demasiado, igual entramos
      if (elapsed > 6000) { target = 1; done = true; }
      const goal = done ? 1 : Math.min(target, 0.92);
      shown += (goal - shown) * (reduced ? 1 : 0.08);
      if (goal === 1 && 1 - shown < 0.004) shown = 1;
      const n = Math.round(shown * 100);
      count.textContent = String(n).padStart(3, '0');
      if (fill) fill.style.clipPath = `inset(0 ${100 - n}% 0 0)`;
      if (shown >= 1 && elapsed > (reduced ? 0 : 1100)) resolve();
      else requestAnimationFrame(step);
    };
    step();
  });
  loader.classList.add('done');
  // el hero arranca a pantalla completa y se acomoda en su marco
  world?.heroIntro();
  revealHero();
  setTimeout(() => loader.remove(), 1200);
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
    navigate(url);
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

async function navigate(url, { push = true, viaPortal = false } = {}) {
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

  const htmlP = fetch(url.pathname.split('/').pop() || 'index.html').then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); });
  const [dest, destVariant] = PAGE_HERO[fileOf(url)] || PAGE_HERO['index.html'];

  try {
    if (world && !reduced) {
      if (viaPortal) world.takeOver(dest, destVariant);
      else await world.dive(dest, destVariant);
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
    main.replaceWith(newMain);
    main = newMain;
    document.title = next.title;
    if (push) history.pushState({ page: key }, '', url.href);
    lenis?.scrollTo(0, { immediate: true, force: true });
    window.scrollTo(0, 0);
    setupPage();
    world?.mount(main, { heroIntro: true });
    world?.endDive();
    $('#veil').classList.remove('on');
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
    const frame = stage.querySelector('[data-gl="globe"]');
    frame.dataset.sp = sp.toFixed(4);
    let focus = 'uruguay';
    stage.querySelectorAll('.story-step').forEach((s) => {
      const sr = s.getBoundingClientRect();
      if (sr.top < vh * 0.62) focus = s.dataset.focus;
    });
    frame.dataset.focus = focus;
  });

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
  const onCancel = (e) => { e.preventDefault(); closeCourse(); };
  const onClick = (e) => { if (e.target === dialog) closeCourse(); };
  const closeBtn = dialog.querySelector('.cd-close');
  const onClose = () => closeCourse();
  dialog.addEventListener('cancel', onCancel);
  dialog.addEventListener('click', onClick);
  closeBtn.addEventListener('click', onClose);
  pageCleanup.push(() => {
    dialog.removeEventListener('cancel', onCancel);
    dialog.removeEventListener('click', onClick);
    closeBtn.removeEventListener('click', onClose);
  });
}

function canonicalURL(slug) {
  const url = new URL(location.href);
  url.hash = '';
  if (slug) url.searchParams.set('curso', slug); else url.searchParams.delete('curso');
  return url.href;
}

function openCourse(slug, { push = true, fromLoad = false } = {}) {
  const dialog = main.querySelector('#courseDialog');
  const art = main.querySelector(`.course-detail[data-slug="${slug}"]`);
  const card = main.querySelector(`.course-link[data-curso="${slug}"]`);
  if (!dialog || !art) return;
  if (course?.slug === slug && dialog.open) return;

  const body = dialog.querySelector('.cd-body');
  const parts = art.cloneNode(true);
  const title = parts.querySelector('h3');
  const titleText = title?.textContent || '';
  title?.remove();
  body.innerHTML = '';
  const eyebrow = document.createElement('span');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'Curso · The English Room';
  const h = document.createElement('h2');
  h.id = 'cdTitle';
  h.textContent = titleText;
  body.append(eyebrow, h, ...parts.childNodes);
  dialog.querySelector('.cd-label').textContent = BADGE_LABEL[slug] || '';

  if (fromLoad && card) {
    // como en la web original: la tarjeta queda a la vista antes de abrir
    const y = card.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2 + card.offsetHeight / 2;
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y);
  }
  const frame = card?.querySelector('.frame');
  if (frame) world?.expand(frame);
  const lastFocus = document.activeElement;
  lenis?.stop();
  document.body.classList.add('course-open');
  dialog.showModal();
  requestAnimationFrame(() => dialog.classList.add('open'));
  dialog.querySelector('.cd-close').focus({ preventScroll: true });

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
  const back = main.querySelector(`.course-link[data-curso="${c.slug}"]`) || c.lastFocus;
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
