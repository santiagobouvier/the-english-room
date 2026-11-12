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
  initSpine();
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
    const frame = stage.querySelector('[data-hero-frame]');
    frame.dataset.sp = sp.toFixed(4);
    let focus = 'intro';
    stage.querySelectorAll('.story-step').forEach((s) => {
      const sr = s.getBoundingClientRect();
      if (sr.top < vh * 0.62) focus = s.dataset.focus;
    });
    frame.dataset.focus = focus;
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
