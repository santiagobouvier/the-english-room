// =============================================================
// The English Room — mundo WebGL
// Un solo canvas fijo. Cada elemento [data-gl] del HTML es un
// "marco": su escena 3D se dibuja en un render target y se
// compone exactamente sobre el rectángulo del elemento, con sus
// esquinas redondeadas. Así el 3D y el contenido se mueven juntos.
// =============================================================
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createModule } from './scenes.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 4);

const COMP_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const COMP_FRAG = /* glsl */`
uniform sampler2D map;
uniform vec2 uSize;
uniform float uRadius;
uniform float uOpacity;
uniform float uReveal;
varying vec2 vUv;
float sdRoundBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float d = sdRoundBox(p, uSize * 0.5, uRadius);
  float m = 1.0 - smoothstep(-1.0, 0.75, d);
  // revelado desde abajo, con borde suave
  float rv = smoothstep(0.0, 0.06, uReveal * 1.06 - (1.0 - vUv.y));
  vec4 c = texture2D(map, vUv);
  float a = m * uOpacity * rv;
  if (a * c.a < 0.003) discard;
  gl_FragColor = vec4(c.rgb * a, c.a * a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

class View {
  constructor(world, el, opts = {}) {
    this.world = world;
    this.el = el;
    this.name = opts.name || el.dataset.gl;
    this.variant = opts.variant ?? el?.dataset.variant;
    this.module = world.getModule(this.name, el, this.variant);
    this.state = {};
    this.rect = { x: 0, y: 0, w: 1, h: 1 };
    this.local = new THREE.Vector2(0, 0);   // puntero en -1..1 dentro del marco
    this.hover = 0;
    this.expandT = 0; this.expandTarget = 0;
    this.opacity = opts.opacity ?? 0;
    this.revealEl = el?.closest('[data-reveal]') || null;
    this.isHero = !!el?.hasAttribute('data-hero-frame');
    this.intro = null;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { samples: world.mobile ? 2 : 4, type: THREE.HalfFloatType });
    this.mat = new THREE.ShaderMaterial({
      vertexShader: COMP_VERT, fragmentShader: COMP_FRAG, transparent: true, premultipliedAlpha: true,
      depthWrite: true, depthTest: true,
      uniforms: { map: { value: this.rt.texture }, uSize: { value: new THREE.Vector2(1, 1) }, uRadius: { value: 0 }, uOpacity: { value: 0 }, uReveal: { value: 1 } },
    });
    this.mesh = new THREE.Mesh(world.unitPlane, this.mat);
    this.mesh.frustumCulled = false;
    world.comp.add(this.mesh);
    this.cssRadius = 0;
    this.readRadius();
  }

  readRadius() {
    if (!this.el) { this.cssRadius = 0; this.radiusPct = 0; return; }
    const r = getComputedStyle(this.el).borderTopLeftRadius;
    this.radiusPct = r.endsWith('%') ? parseFloat(r) / 100 : 0;
    this.cssRadius = r.endsWith('%') ? 0 : parseFloat(r) || 0;
  }

  measure(W, H) {
    let r;
    if (this.el) {
      const b = this.el.getBoundingClientRect();
      r = { x: b.left, y: b.top, w: b.width, h: b.height };
    } else {
      r = { x: 0, y: 0, w: W, h: H };
    }
    let radius = this.radiusPct ? Math.min(r.w, r.h) * this.radiusPct : this.cssRadius;
    // intro del hero: arranca a pantalla completa y se acomoda en su marco
    if (this.intro) {
      const t = easeInOut(clamp(this.intro.t));
      r = { x: lerp(0, r.x, t), y: lerp(0, r.y, t), w: lerp(W, r.w, t), h: lerp(H, r.h, t) };
      radius *= t;
    }
    // expansión (detalle de curso): del marco a la pantalla
    if (this.expandT > 0.0001) {
      const t = easeInOut(this.expandT);
      r = { x: lerp(r.x, 0, t), y: lerp(r.y, 0, t), w: lerp(r.w, W, t), h: lerp(r.h, H, t) };
      radius = lerp(radius, 0, t);
    }
    this.rect = r;
    this.radius = radius;
    return r;
  }

  dispose() {
    this.world.comp.remove(this.mesh);
    this.mat.dispose();
    this.rt.dispose();
  }
}

class Ribbon {
  constructor(world, el) {
    this.world = world;
    this.el = el;
    this.preset = RIBBONS[el.dataset.ribbon] || RIBBONS.intro;
    this.mat = new THREE.MeshPhysicalMaterial({
      color: this.preset.color, roughness: 0.22, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.12,
      emissive: this.preset.color, emissiveIntensity: 0.12,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    world.comp.add(this.mesh);
    this.progress = 0;
    this.build();
  }

  build() {
    const W = this.world.W;
    const h = this.el.offsetHeight || 1;
    const pts = this.preset.pts.map(([x, y, z]) => new THREE.Vector3(x * W, -y * h, z * Math.min(1, W / 1400)));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    this.segments = 420;
    this.radial = 14;
    const radius = clamp(W * 0.012, 9, 22);
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.TubeGeometry(curve, this.segments, radius, this.radial, false);
    this.total = this.mesh.geometry.index.count;
  }

  update(H) {
    const r = this.el.getBoundingClientRect();
    this.mesh.position.set(0, -r.top, 0);
    // la cinta "se dibuja" a medida que la sección entra
    const target = this.world.reduced ? 1 : clamp((H * 0.95 - r.top) / (r.height * 0.85 + H * 0.2));
    this.progress = lerp(this.progress, target, 0.08);
    const segs = Math.floor(this.progress * this.segments);
    this.mesh.geometry.setDrawRange(0, segs * this.radial * 6);
    this.mesh.visible = segs > 0 && r.bottom > -200 && r.top < H + 200;
  }

  dispose() {
    this.world.comp.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

// Trazos de la cinta: x en anchos de pantalla, y en alto de la sección, z en px
const RIBBONS = {
  intro: { color: 0x26ccc8, pts: [[-0.12, 0.02, 0], [0.18, 0.1, 260], [0.36, 0.0, -240], [0.2, 0.2, 0], [0.5, 0.3, 280], [0.74, 0.17, -200], [0.94, 0.36, 160], [0.78, 0.6, -260], [0.52, 0.52, 200], [0.66, 0.82, 0], [1.14, 0.95, 0]] },
  cursos: { color: 0x296f8d, pts: [[1.12, 0.04, 0], [0.82, 0.14, -220], [0.58, 0.04, 240], [0.66, 0.34, 0], [0.3, 0.42, -260], [0.08, 0.62, 200], [0.3, 0.86, -180], [-0.14, 1.0, 0]] },
  about: { color: 0xF5A7B5, pts: [[-0.12, 0.1, 0], [0.22, 0.02, 220], [0.44, 0.22, -260], [0.26, 0.48, 200], [0.6, 0.62, -200], [0.9, 0.44, 260], [1.14, 0.8, 0]] },
  courses: { color: 0x26ccc8, pts: [[-0.14, 0.0, 0], [0.24, 0.03, 260], [0.5, -0.01, -220], [0.72, 0.035, 220], [0.88, 0.0, -160], [1.14, 0.05, 0]] },
  resources: { color: 0xF5A7B5, pts: [[1.14, 0.02, 0], [0.7, 0.1, 240], [0.42, 0.2, -240], [0.62, 0.38, 220], [0.3, 0.55, -220], [0.55, 0.72, 240], [0.2, 0.9, -200], [-0.14, 0.98, 0]] },
  contact: { color: 0x296f8d, pts: [[-0.14, 0.05, 0], [0.2, 0.0, 240], [0.4, 0.3, -220], [0.16, 0.6, 200], [0.5, 0.9, -200], [0.9, 0.6, 240], [1.14, 0.9, 0]] },
};

export class World {
  constructor(canvas, { reduced = false, mobile = false } = {}) {
    this.canvas = canvas;
    this.reduced = reduced;
    this.mobile = mobile;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // sin tone mapping: las fotos de Carla y de los alumnos conservan su color real
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75);
    this.renderer.setPixelRatio(this.dpr);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(this.renderer), 0.04).texture;

    this.unitPlane = new THREE.PlaneGeometry(1, 1);
    this.comp = new THREE.Scene();
    this.comp.environment = this.env;
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(-0.4, 1, 0.8);
    this.comp.add(key, new THREE.AmbientLight(0xffffff, 0.35));
    this.compCam = new THREE.OrthographicCamera(0, 1, 0, -1, -4000, 4000);
    this.compCam.position.z = 2000;

    this.modules = new Map();
    this.views = [];
    this.ribbons = [];
    this.pointer = { x: -9999, y: -9999, active: false };
    this.clock = new THREE.Clock();
    this.time = 0;
    this.transition = null;   // vista de pantalla completa para el "viaje" entre páginas
    this.destRT = new THREE.WebGLRenderTarget(4, 4, { samples: 2, type: THREE.HalfFloatType });
    this.destPreview = {};

    window.addEventListener('pointermove', (e) => { this.pointer.x = e.clientX; this.pointer.y = e.clientY; this.pointer.active = true; }, { passive: true });
    window.addEventListener('pointerleave', () => { this.pointer.active = false; });
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.renderer.setSize(this.W, this.H, false);
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.compCam.left = 0; this.compCam.right = this.W; this.compCam.top = 0; this.compCam.bottom = -this.H;
    this.compCam.updateProjectionMatrix();
    for (const r of this.ribbons) r.build();
    for (const v of this.views) v.readRadius();
  }

  getModule(name, el, variant) {
    // módulos con contenido propio por elemento (foto) no se comparten
    const key = name === 'photo' ? `${name}:${el?.dataset.src}` : name;
    if (!this.modules.has(key)) this.modules.set(key, createModule(name, this, el, variant));
    return this.modules.get(key);
  }

  /** Registra los marcos y cintas de la página actual. */
  mount(root, { heroIntro = false } = {}) {
    this.unmount();
    root.querySelectorAll('[data-gl]').forEach((el) => {
      try { this.views.push(new View(this, el)); }
      catch (err) { console.warn('[world] marco sin escena', el, err); }
    });
    root.querySelectorAll('[data-ribbon]').forEach((el) => this.ribbons.push(new Ribbon(this, el)));
    if (heroIntro) this.heroIntro();
  }

  heroIntro() {
    if (this.reduced) return;
    const hero = this.views.find((v) => v.isHero);
    if (hero && hero.el.getBoundingClientRect().top < this.H) { hero.intro = { t: 0 }; hero.opacity = 1; }
  }

  unmount() {
    this.views.forEach((v) => v.dispose());
    this.ribbons.forEach((r) => r.dispose());
    this.views = [];
    this.ribbons = [];
  }

  viewFor(el) { return this.views.find((v) => v.el === el); }

  expand(el) { const v = this.viewFor(el); if (v) { v.expandTarget = 1; v.mesh.renderOrder = 20; } return v; }
  collapse() { this.views.forEach((v) => { v.expandTarget = 0; }); }

  /** Vista previa del hero de otra página (lo que se ve "dentro" de la pantalla del portal). */
  renderDestination(name, variant, w, h) {
    const module = this.getModule(name, null, variant);
    const key = name + ':' + variant;
    const fake = this.destPreview[key] || (this.destPreview[key] = { el: null, variant, state: {}, local: new THREE.Vector2(), hover: 0, expandT: 0, rect: { x: 0, y: 0, w, h }, preview: true });
    fake.rect.w = w; fake.rect.h = h;
    const pw = Math.max(4, Math.round(w * this.dpr * 0.8));
    const ph = Math.max(4, Math.round(h * this.dpr * 0.8));
    if (this.destRT.width !== pw || this.destRT.height !== ph) this.destRT.setSize(pw, ph);
    module.frame !== this.frameId && module.update?.(this.time, this.dt, fake);
    module.frame = this.frameId;
    module.setSize(w, h);
    module.beforeRender?.(fake, this.time);
    this.renderer.setRenderTarget(this.destRT);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(module.scene, module.camera);
    return this.destRT.texture;
  }

  /** Viaje entre páginas: la cámara entra en la pantalla y aparece la próxima escena. */
  dive(destName, destVariant) {
    return new Promise((resolve) => {
      const v = this.transition || (this.transition = new View(this, null, { name: 'portal' }));
      v.mesh.renderOrder = 50;
      v.state.dest = destName; v.state.destVariant = destVariant;
      v.state.p = 0; v.opacity = 0; v.state.mode = 'dive';
      v.anim = { t: 0, dur: this.reduced ? 0.01 : 1.6, resolve };
    });
  }

  /** El portal del final de la página ya llenó la pantalla: tomar la posta sin corte. */
  takeOver(destName, destVariant) {
    const v = this.transition || (this.transition = new View(this, null, { name: 'portal' }));
    v.mesh.renderOrder = 50;
    v.state.dest = destName; v.state.destVariant = destVariant;
    v.state.p = 1; v.opacity = 1; v.anim = null; v.state.mode = 'hold';
  }

  /** Termina el viaje: la vista de transición se desvanece mientras el hero nuevo se acomoda. */
  endDive() {
    const v = this.transition;
    if (!v) return;
    v.state.mode = 'out';
    v.fade = { t: 0 };
  }

  start(onFrame) {
    this.onFrame = onFrame;
    this.frameId = 0;
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.render();
    };
    loop();
  }

  render() {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.dt = dt;
    this.time += this.reduced ? dt * 0.15 : dt;
    this.frameId++;
    const { W, H, renderer } = this;
    this.onFrame?.(dt);

    // ---- vistas de la página
    const drawList = [];
    for (const v of this.views) {
      const r = v.measure(W, H);
      if (v.intro) { v.intro.t += dt / 1.5; if (v.intro.t >= 1) v.intro = null; }
      v.expandT = lerp(v.expandT, v.expandTarget, this.reduced ? 1 : 0.075);
      if (v.expandT < 0.001 && v.expandTarget === 0) v.mesh.renderOrder = 0;
      const visible = r.w > 2 && r.h > 2 && r.y + r.h > -40 && r.y < H + 40;
      // opacidad: sigue al revelado del DOM
      const shown = !v.revealEl || v.revealEl.classList.contains('in');
      v.opacity = lerp(v.opacity, shown ? 1 : 0, this.reduced ? 1 : 0.06);
      v.mesh.visible = visible && v.opacity > 0.01;
      if (!v.mesh.visible) continue;
      // puntero local
      const px = this.pointer.active ? ((this.pointer.x - r.x) / r.w) * 2 - 1 : 0;
      const py = this.pointer.active ? -(((this.pointer.y - r.y) / r.h) * 2 - 1) : 0;
      const inside = Math.abs(px) <= 1.15 && Math.abs(py) <= 1.15;
      v.local.x = lerp(v.local.x, inside ? px : 0, 0.08);
      v.local.y = lerp(v.local.y, inside ? py : 0, 0.08);
      v.hover = lerp(v.hover, inside && this.pointer.active ? 1 : 0, 0.08);
      drawList.push(v);
    }

    // ---- actualizar módulos (una vez por cuadro) y pintar cada marco
    for (const v of drawList) {
      const m = v.module;
      if (m.frame !== this.frameId) { m.update?.(this.time, dt, v); m.frame = this.frameId; }
      const pw = Math.max(4, Math.min(2048, Math.round(v.rect.w * this.dpr)));
      const ph = Math.max(4, Math.min(2048, Math.round(v.rect.h * this.dpr)));
      // reasignar el render target solo cuando cambia bastante
      if (Math.abs(v.rt.width - pw) / pw > 0.12 || Math.abs(v.rt.height - ph) / ph > 0.12) v.rt.setSize(pw, ph);
      m.setSize(v.rect.w, v.rect.h);
      m.beforeRender?.(v, this.time);
      renderer.setRenderTarget(v.rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(m.scene, m.camera);
      this.place(v);
    }

    // ---- viaje entre páginas (vista a pantalla completa)
    const tv = this.transition;
    if (tv) {
      if (tv.anim) {
        tv.anim.t += dt / tv.anim.dur;
        const t = clamp(tv.anim.t);
        tv.opacity = clamp(t * 5);
        tv.state.p = easeInOut(t);
        if (t >= 1) { const res = tv.anim.resolve; tv.anim = null; tv.state.mode = 'hold'; res(); }
      }
      if (tv.fade) {
        tv.fade.t += dt / (this.reduced ? 0.01 : 0.7);
        tv.opacity = 1 - easeOut(clamp(tv.fade.t));
        if (tv.fade.t >= 1) { tv.fade = null; tv.state.mode = 'idle'; tv.opacity = 0; }
      }
      tv.mesh.visible = tv.opacity > 0.005;
      if (tv.mesh.visible) {
        tv.measure(W, H);
        const m = tv.module;
        if (m.frame !== this.frameId) { m.update?.(this.time, dt, tv); m.frame = this.frameId; }
        const pw = Math.round(W * this.dpr), ph = Math.round(H * this.dpr);
        if (tv.rt.width !== pw || tv.rt.height !== ph) tv.rt.setSize(pw, ph);
        m.setSize(W, H);
        m.beforeRender?.(tv, this.time);
        renderer.setRenderTarget(tv.rt);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.render(m.scene, m.camera);
        this.place(tv);
      }
    }

    for (const rb of this.ribbons) rb.update(H);

    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(this.comp, this.compCam);
  }

  place(v) {
    const r = v.rect;
    v.mesh.position.set(r.x + r.w / 2, -(r.y + r.h / 2), v.mesh.renderOrder * 0.5);
    v.mesh.scale.set(r.w, r.h, 1);
    const u = v.mat.uniforms;
    u.uSize.value.set(r.w, r.h);
    u.uRadius.value = Math.min(v.radius || 0, Math.min(r.w, r.h) / 2);
    u.uOpacity.value = v.opacity;
    u.uReveal.value = 1;
    // los marcos normales se entrelazan con la cinta; los expandidos van siempre arriba
    v.mat.depthTest = v.mesh.renderOrder < 20;
  }
}
