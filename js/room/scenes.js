// =============================================================
// The English Room — escenas 3D
// Todas giran alrededor de una clase online: globos de diálogo
// (el logo de Carla es uno), pantallas de videollamada, el
// recorrido Uruguay–Australia–Ushuaia y la escalera de niveles.
// =============================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';

export const C = { blue: 0x296f8d, turq: 0x26ccc8, pink: 0xF5A7B5, cream: 0xFFF5F3, dark: 0x103741, deep: 0x0b2229 };

/** Escena principal de cada página: lo que se ve dentro de la pantalla al viajar. */
export const PAGE_HERO = {
  'index.html': ['classroom'], '': ['classroom'], 'sobre-mi.html': ['globe'], 'cursos.html': ['levels'],
  'recursos-gratuitos.html': ['docs', 'stack'], 'contacto.html': ['lobby'],
};

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Aleatorio determinista: la composición es siempre la misma
function rng(seed = 7) { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }

// ---------- recursos compartidos ----------
const texLoader = new THREE.TextureLoader();
const imgLoader = new THREE.ImageLoader();
const texCache = new Map();
export function tex(src) {
  if (!texCache.has(src)) {
    const t = texLoader.load(src);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 12;
    texCache.set(src, t);
  }
  return texCache.get(src);
}
const imgCache = new Map();
function img(src) {
  if (!imgCache.has(src)) imgCache.set(src, new Promise((res) => imgLoader.load(src, res, undefined, () => res(null))));
  return imgCache.get(src);
}
let fontP;
export function font() {
  return fontP || (fontP = new Promise((res) => new FontLoader().load('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json', res, undefined, () => res(null))));
}
const fontsReady = () => (document.fonts ? document.fonts.ready : Promise.resolve());

const matCache = new Map();
function glossy(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshPhysicalMaterial({ color, roughness: 0.34, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.2, envMapIntensity: 0.55, ...opts }));
  }
  return matCache.get(key);
}

function textGeo(f, str, size, depth = size * 0.32) {
  const g = new TextGeometry(str, { font: f, size, height: depth, curveSegments: 6, bevelEnabled: true, bevelThickness: size * 0.05, bevelSize: size * 0.035, bevelSegments: 3 });
  g.center();
  return g;
}

/** Polígono con esquinas redondeadas (radio por vértice). */
function roundedShape(points, radii) {
  const s = new THREE.Shape();
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n];
    const v1 = new THREE.Vector2(p0[0] - p1[0], p0[1] - p1[1]);
    const v2 = new THREE.Vector2(p2[0] - p1[0], p2[1] - p1[1]);
    const r = Math.min(Array.isArray(radii) ? radii[i] : radii, v1.length() * 0.45, v2.length() * 0.45);
    v1.normalize(); v2.normalize();
    const a = [p1[0] + v1.x * r, p1[1] + v1.y * r];
    const b = [p1[0] + v2.x * r, p1[1] + v2.y * r];
    if (i === 0) s.moveTo(a[0], a[1]); else s.lineTo(a[0], a[1]);
    s.quadraticCurveTo(p1[0], p1[1], b[0], b[1]);
  }
  s.closePath();
  return s;
}

const bubbleGeos = [];
/** Globo de diálogo: 0 = el del logo de Carla, 1 = redondeado. */
export function bubbleGeo(kind = 0) {
  if (bubbleGeos[kind]) return bubbleGeos[kind];
  const shape = kind === 0
    ? roundedShape([[-1.05, 0.6], [1.06, 0.78], [0.98, -0.55], [0.02, -0.55], [-0.24, -1.02], [-0.26, -0.55], [-1.0, -0.5]], [0.16, 0.16, 0.16, 0.05, 0.05, 0.05, 0.16])
    : roundedShape([[-1, 0.62], [1, 0.62], [1, -0.46], [0.5, -0.46], [0.66, -0.98], [0.12, -0.46], [-1, -0.46]], [0.42, 0.42, 0.42, 0.06, 0.05, 0.06, 0.42]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.12, bevelSegments: 6, curveSegments: 10 });
  g.center();
  g.computeVertexNormals();
  bubbleGeos[kind] = g;
  return g;
}
const BUBBLE_FRONT = 0.3 / 2 + 0.14 + 0.006;

function addLights(scene, { key = 1.5, rim = C.turq, fill = C.pink } = {}) {
  const k = new THREE.DirectionalLight(0xffffff, key);
  k.position.set(4, 6, 8);
  const r = new THREE.PointLight(rim, 40, 0, 2);
  r.position.set(-7, -3, 4);
  const f = new THREE.PointLight(fill, 20, 0, 2);
  f.position.set(7, -4, 3);
  scene.add(k, r, f, new THREE.AmbientLight(0xffffff, 0.25));
}

class Base {
  constructor(world, fov = 30) {
    this.world = world;
    this.scene = new THREE.Scene();
    this.scene.environment = world.env;
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 200);
    this.aspect = 1;
  }
  setSize(w, h) {
    const a = w / h;
    if (Math.abs(a - this.aspect) > 1e-4) { this.aspect = a; this.camera.aspect = a; this.camera.updateProjectionMatrix(); }
  }
  /** distancia para que una caja bw×bh entre en cuadro */
  fit(bw, bh) {
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return Math.max(bh / 2 / t, bw / 2 / (t * this.aspect));
  }
}

// =============================================================
// INICIO · hero: un enjambre de globos de diálogo que conversan
// =============================================================
const WORDS = ['Hi!', 'Hello', 'Yes!', 'Why?', 'OK!', 'Wow', 'Cheers', "Let's talk", 'Ready?', 'Sure!', 'Great!', 'Hey!'];

class Bubbles extends Base {
  constructor(world) {
    super(world, 30);
    this.scene.background = new THREE.Color(C.dark);
    this.scene.fog = new THREE.Fog(C.dark, 16, 34);
    addLights(this.scene);
    const rand = rng(11);
    const n = world.mobile ? 18 : 30;
    const palette = [C.blue, C.turq, C.pink, C.cream, 0x1f5866, C.turq, C.blue, C.pink];
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.bodies = [];
    for (let i = 0; i < n; i++) {
      const s = 0.5 + rand() * 0.7;
      const color = palette[Math.floor(rand() * palette.length)];
      const mesh = new THREE.Mesh(bubbleGeo(i % 3 === 0 ? 1 : 0), glossy(color));
      mesh.scale.setScalar(s);
      if (rand() > 0.5) mesh.scale.x *= -1; // la cola a un lado o al otro
      this.group.add(mesh);
      this.bodies.push({
        mesh, s, color, r: s * 1.02,
        p: new THREE.Vector3((rand() - 0.5) * 10, (rand() - 0.5) * 5, (rand() - 0.5) * 4),
        v: new THREE.Vector3(), phase: rand() * 6.28,
      });
    }
    // palabras en inglés sobre los globos más grandes
    font().then((f) => {
      if (!f) return;
      const big = [...this.bodies].sort((a, b) => b.s - a.s).slice(0, WORDS.length);
      big.forEach((b, i) => {
        const g = textGeo(f, WORDS[i], 0.36, 0.06);
        g.computeBoundingBox();
        const w = g.boundingBox.max.x - g.boundingBox.min.x;
        const dark = b.color === C.cream || b.color === C.turq || b.color === C.pink;
        const m = new THREE.Mesh(g, glossy(dark ? C.dark : C.cream, { clearcoat: 0.4 }));
        const k = Math.min(1, 1.55 / w);
        m.scale.set(k * Math.sign(b.mesh.scale.x), k, 1);
        m.position.set(0, 0.12, BUBBLE_FRONT + 0.03);
        b.mesh.add(m);
      });
    });
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.hit = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
  }

  update(t, dt, view) {
    const sub = 2, h = dt / sub;
    const hasPointer = view.hover > 0.05;
    if (hasPointer) {
      this.ray.setFromCamera(view.local, this.camera);
      this.ray.ray.intersectPlane(this.plane, this.hit);
      this.hit.applyMatrix4(new THREE.Matrix4().copy(this.group.matrixWorld).invert());
    }
    // al salir del hero los globos se abren hacia la cámara
    const spread = view.el ? smooth(0, 1, -view.rect.y / Math.max(1, view.rect.h)) : 0;
    const B = this.bodies;
    for (let s = 0; s < sub; s++) {
      for (const b of B) {
        b.v.x += -b.p.x * 0.55 * h * 2;
        b.v.y += -b.p.y * 1.3 * h * 2;
        b.v.z += -b.p.z * 1.6 * h * 2;
        if (hasPointer) {
          this.tmp.subVectors(b.p, this.hit);
          const d = this.tmp.length();
          if (d < 3.2) b.v.addScaledVector(this.tmp.normalize(), (3.2 - d) * 22 * h * view.hover);
        }
      }
      for (let i = 0; i < B.length; i++) {
        for (let j = i + 1; j < B.length; j++) {
          const a = B[i], c = B[j];
          this.tmp.subVectors(c.p, a.p);
          const d = this.tmp.length(), min = a.r + c.r;
          if (d < min && d > 1e-4) {
            this.tmp.multiplyScalar(((min - d) / d) * 0.5);
            a.p.sub(this.tmp); c.p.add(this.tmp);
            a.v.addScaledVector(this.tmp, -2); c.v.addScaledVector(this.tmp, 2);
          }
        }
      }
      const damp = Math.exp(-2.6 * h);
      for (const b of B) { b.v.multiplyScalar(damp); b.p.addScaledVector(b.v, h); }
    }
    for (const b of B) {
      b.mesh.position.copy(b.p);
      if (spread > 0) {
        this.tmp.copy(b.p).normalize();
        b.mesh.position.addScaledVector(this.tmp, spread * 7);
        b.mesh.position.z += spread * 9;
      }
      b.mesh.rotation.set(
        Math.sin(t * 0.6 + b.phase) * 0.22 + b.v.y * 0.06,
        Math.sin(t * 0.5 + b.phase * 1.3) * 0.32 + b.v.x * 0.08,
        Math.sin(t * 0.4 + b.phase) * 0.1,
      );
    }
    this.group.rotation.y = lerp(this.group.rotation.y, view.local.x * 0.14, 0.05);
    this.group.rotation.x = lerp(this.group.rotation.x, -view.local.y * 0.1, 0.05);
  }

  beforeRender(view) {
    // en pantallas anchas el enjambre se corre a la derecha y deja respirar el título
    const off = view.preview || this.aspect < 1.2 ? 0 : -3.2;
    const offY = this.aspect < 1.2 && !view.preview ? -1.4 : 0;
    const d = this.fit(off ? 16 : this.aspect < 1 ? 8.5 : 12.5, 7);
    this.camera.position.set(off, offY, d);
    this.camera.lookAt(off, offY, 0);
    // la niebla acompaña a la cámara para dar profundidad sin borrar el enjambre
    this.scene.fog.near = d - 4;
    this.scene.fog.far = d + 16;
  }
}

// =============================================================
// Clase en vivo: grilla de videollamada con Carla y los roommates
// =============================================================
const PEOPLE = [
  ['img/room/foto-30.jpg', 'Carla Migliarini', 'Teacher'],
  ['img/student-1.png', 'Mica', null, true],
  ['img/student-2.png', 'Seba', null, true],
  ['img/student-3.png', 'Bruna', null, true],
  ['img/room/caro.jpg', 'Caro', null, true],
  ['img/room/mika.jpg', 'Mika', null, true],
];

/**
 * Dibuja una "cámara" de videollamada.
 * Fotos grandes: encuadre cover, apuntando a la cara.
 * Fotos chicas (avatar): fondo desenfocado de la misma foto + retrato circular nítido.
 */
export function drawPerson(canvas, image, { name, role, avatar = false, speaking = false } = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#0f3039';
  ctx.fillRect(0, 0, w, h);
  if (image) {
    const s = Math.max(w / image.width, h / image.height);
    const iw = image.width * s, ih = image.height * s;
    if (avatar) {
      ctx.save();
      ctx.filter = 'blur(28px) saturate(1.25) brightness(.62)';
      ctx.drawImage(image, (w - iw * 1.3) / 2, (h - ih * 1.3) / 2, iw * 1.3, ih * 1.3);
      ctx.restore();
      ctx.fillStyle = 'rgba(6,19,23,.18)';
      ctx.fillRect(0, 0, w, h);
      const r = h * 0.29, cx = w / 2, cy = h * 0.46;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
      const k = Math.max((2 * r) / image.width, (2 * r) / image.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, cx - (image.width * k) / 2, cy - (image.height * k) / 2, image.width * k, image.height * k);
      ctx.restore();
      ctx.lineWidth = 7;
      ctx.strokeStyle = speaking ? '#26ccc8' : 'rgba(255,255,255,.22)';
      ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, (w - iw) / 2, (h - ih) * 0.32, iw, ih);
    }
  }
  const g = ctx.createLinearGradient(0, h * 0.62, 0, h);
  g.addColorStop(0, 'rgba(6,19,23,0)'); g.addColorStop(1, 'rgba(6,19,23,.62)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // micrófono
  ctx.fillStyle = speaking ? '#26ccc8' : 'rgba(6,19,23,.6)';
  ctx.beginPath(); ctx.arc(w - 46, h - 44, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = speaking ? '#06201f' : '#fff';
  ctx.beginPath(); ctx.roundRect(w - 52, h - 58, 12, 20, 6); ctx.fill();
  ctx.fillRect(w - 47, h - 36, 2, 6);
  if (name) {
    const label = role ? name + ' · ' + role : name;
    ctx.font = '600 25px "Inter Tight", sans-serif';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(6,19,23,.72)';
    ctx.beginPath(); ctx.roundRect(20, h - 66, tw + 64, 46, 23); ctx.fill();
    ctx.fillStyle = speaking ? '#26ccc8' : '#F5A7B5';
    ctx.beginPath(); ctx.arc(43, h - 43, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, 60, h - 34);
  }
}

class Call extends Base {
  constructor(world) {
    super(world, 28);
    this.scene.background = new THREE.Color(0x071a1f);
    addLights(this.scene, { key: 1.6 });
    this.group = new THREE.Group();
    this.scene.add(this.group);
    const tileGeo = new RoundedBoxGeometry(3.2, 2.0, 0.08, 4, 0.12);
    const ringGeo = new RoundedBoxGeometry(3.38, 2.18, 0.04, 4, 0.2);
    const barGeo = new THREE.BoxGeometry(0.07, 0.34, 0.04);
    this.tiles = PEOPLE.map(([src, name, role, avatar], i) => {
      const canvas = document.createElement('canvas');
      canvas.width = 800; canvas.height = 500;
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 12;
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(tileGeo, new THREE.MeshBasicMaterial({ map }));
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: C.turq, transparent: true, opacity: 0, toneMapped: false }));
      ring.position.z = -0.04;
      const bars = [0, 1, 2].map((k) => {
        const b = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: C.turq, toneMapped: false }));
        b.position.set(1.22 + k * 0.12, 0.72, 0.07);
        g.add(b);
        return b;
      });
      g.add(ring, mesh);
      this.group.add(g);
      const tile = { g, mesh, ring, bars, map, canvas, name, role, avatar, image: null, speaking: false, pos: new THREE.Vector3(), scale: 1 };
      Promise.all([img(src), fontsReady()]).then(([image]) => { tile.image = image; this.redraw(tile); });
      tile.pos.set(((i % 3) - 1) * 3.42, i < 3 ? 1.11 : -1.11, 0);
      return tile;
    });
    // globitos que suben desde quien está hablando
    this.puffs = Array.from({ length: 14 }, (_, i) => {
      const m = new THREE.Mesh(bubbleGeo(i % 2), glossy([C.turq, C.pink, C.cream][i % 3]));
      m.visible = false;
      this.group.add(m);
      return { m, life: 0 };
    });
    this.nextPuff = 0;
  }

  redraw(tile) { drawPerson(tile.canvas, tile.image, { name: tile.name, role: tile.role, avatar: tile.avatar, speaking: tile.speaking }); tile.map.needsUpdate = true; }

  layout(variant, speaker, side) {
    const out = [];
    if (variant === 'speaker') {
      let k = 0;
      const others = this.tiles.length - 1;
      this.tiles.forEach((_, i) => {
        if (i === speaker) out.push({ x: side ? -1.6 : 0, y: 0.7, z: 0.3, s: 1.9 });
        else { const x = (k - (others - 1) / 2) * 2.0 + (side ? -1.6 : 0); out.push({ x, y: -2.15, z: 0, s: 0.56 }); k++; }
      });
    } else if (this.aspect < 0.9) {
      // móvil: 2 columnas × 3 filas, arriba; el chat ocupa la mitad de abajo
      this.tiles.forEach((_, i) => {
        out.push({ x: ((i % 2) - 0.5) * 3.42, y: (1 - Math.floor(i / 2)) * 2.2, z: i === speaker ? 0.35 : 0, s: i === speaker ? 1.06 : 1 });
      });
    } else {
      this.tiles.forEach((_, i) => {
        out.push({ x: ((i % 3) - 1) * 3.42 + (side ? -2.35 : 0), y: i < 3 ? 1.11 : -1.11, z: i === speaker ? 0.35 : 0, s: i === speaker ? 1.06 : 1 });
      });
    }
    return out;
  }

  update(t, dt, view) {
    const el = view.el;
    const speaker = el ? +el.dataset.speaker || 0 : 0;
    const grow = el ? parseFloat(el.style.getPropertyValue('--grow')) : 1;
    const side = (isNaN(grow) ? 1 : grow) > 0.8 && this.aspect > 1.25;
    this.side = side;
    const L = this.layout(view.variant || 'grid', speaker, side);
    this.tiles.forEach((tile, i) => {
      const target = L[i];
      const speaking = i === speaker;
      if (speaking !== tile.speaking) { tile.speaking = speaking; if (tile.image) this.redraw(tile); }
      tile.pos.x = lerp(tile.pos.x, target.x, 0.07);
      tile.pos.y = lerp(tile.pos.y, target.y, 0.07);
      tile.pos.z = lerp(tile.pos.z, target.z, 0.07);
      tile.scale = lerp(tile.scale, target.s, 0.07);
      tile.g.position.set(tile.pos.x, tile.pos.y + Math.sin(t * 0.9 + i) * 0.04, tile.pos.z);
      tile.g.scale.setScalar(tile.scale);
      tile.g.rotation.y = Math.sin(t * 0.5 + i * 0.7) * 0.03;
      tile.ring.material.opacity = lerp(tile.ring.material.opacity, speaking ? 0.95 : 0, 0.1);
      tile.bars.forEach((b, k) => {
        const amp = speaking ? 0.35 + Math.abs(Math.sin(t * (7 + k * 3) + k)) * 1.1 : 0.18;
        b.scale.y = lerp(b.scale.y, amp, 0.3);
        b.material.color.setHex(speaking ? C.turq : 0x5b7d86);
      });
    });
    // globitos de conversación
    const sp = this.tiles[speaker];
    if (!this.world.reduced && t > this.nextPuff) {
      const p = this.puffs.find((q) => q.life <= 0);
      if (p) {
        p.life = 1;
        p.m.visible = true;
        p.m.position.set(sp.g.position.x + (Math.random() - 0.5) * 1.6 * sp.scale, sp.g.position.y + sp.scale * 0.9, sp.g.position.z + 0.4);
        p.vx = (Math.random() - 0.5) * 0.4;
        p.s = 0.12 + Math.random() * 0.12;
      }
      this.nextPuff = t + 0.55;
    }
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt * 0.45;
      p.m.position.y += dt * 0.9;
      p.m.position.x += p.vx * dt;
      p.m.position.z += dt * 0.4;
      p.m.rotation.z = Math.sin(p.life * 6) * 0.2;
      p.m.scale.setScalar(p.s * Math.sin(Math.PI * clamp(p.life)));
      if (p.life <= 0) p.m.visible = false;
    }
    this.group.rotation.y = lerp(this.group.rotation.y, view.local.x * 0.16 + Math.sin(t * 0.2) * 0.04, 0.05);
    this.group.rotation.x = lerp(this.group.rotation.x, -view.local.y * 0.1, 0.05);
  }

  beforeRender() {
    if (this.aspect < 0.9) {
      this.camera.position.set(0, -3.4, this.fit(7.6, 14.5));
      this.camera.lookAt(0, -3.4, 0);
      return;
    }
    const w = this.side ? 15.5 : 11;
    this.camera.position.set(0, 0, this.fit(w, 6.2));
    this.camera.lookAt(0, 0, 0);
  }
}

// =============================================================
// SOBRE MÍ · globo de puntos: Uruguay, Australia, Ushuaia, el mundo
// =============================================================
const R = 2;
function latLon(lat, lon, r = R) {
  const phi = THREE.MathUtils.degToRad(90 - lat), th = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
}
const PLACES = { uruguay: [-34.9, -56.2], australia: [-25.3, 133.8], ushuaia: [-54.8, -68.3] };

class Globe extends Base {
  constructor(world) {
    super(world, 32);
    this.scene.background = null; // se ve el fondo animado
    this.root = new THREE.Group();
    this.globe = new THREE.Group();
    this.globe.rotation.order = 'XYZ';
    this.root.add(this.globe);
    this.scene.add(this.root);
    const rand = rng(3);

    // esfera de puntos (fibonacci)
    const N = world.mobile ? 2600 : 5200;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const cA = new THREE.Color(C.cream), cB = new THREE.Color(C.turq), cC = new THREE.Color(C.pink);
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963;
      pos.set([Math.cos(th) * r * R, y * R, Math.sin(th) * r * R], i * 3);
      const c = rand() > 0.86 ? cB : rand() > 0.97 ? cC : cA;
      col.set([c.r, c.g, c.b], i * 3);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.points = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.03, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
    this.globe.add(this.points);
    this.globe.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.985, 64, 48), new THREE.MeshBasicMaterial({ color: 0x0e3039 })));

    // halo
    const halo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.18, 64, 48), new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { c: { value: new THREE.Color(C.turq) } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float f=pow(1.-abs(dot(vN,vV)),3.); gl_FragColor=vec4(c*f*.9, f); }',
    }));
    this.root.add(halo);

    // marcadores
    this.markers = Object.entries(PLACES).map(([key, [lat, lon]]) => {
      const p = latLon(lat, lon, R * 1.005);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshBasicMaterial({ color: C.pink, toneMapped: false }));
      dot.position.copy(p);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.095, 40), new THREE.MeshBasicMaterial({ color: C.pink, transparent: true, side: THREE.DoubleSide, toneMapped: false }));
      ring.position.copy(p);
      ring.lookAt(p.clone().multiplyScalar(2));
      this.globe.add(dot, ring);
      return { key, ring, p };
    });
    // nombres de los lugares, apoyados sobre la superficie
    const NAMES = { uruguay: 'Uruguay', australia: 'Australia', ushuaia: 'Ushuaia' };
    font().then((f) => {
      if (!f) return;
      this.markers.forEach((m) => {
        const label = new THREE.Mesh(textGeo(f, NAMES[m.key], 0.13, 0.01), new THREE.MeshBasicMaterial({ color: C.cream, toneMapped: false, transparent: true }));
        label.geometry.translate(label.geometry.boundingBox ? 0 : 0, 0, 0);
        const holder = new THREE.Object3D();
        holder.position.copy(m.p.clone().multiplyScalar(1.03));
        holder.lookAt(m.p.clone().multiplyScalar(3));
        label.position.set(0.32, 0.1, 0);
        holder.add(label);
        this.globe.add(holder);
        m.label = label;
      });
    });

    // arcos
    const arc = (a, b, color, lift = 0.6) => {
      const A = latLon(...a), Bv = latLon(...b);
      const pts = [];
      for (let i = 0; i <= 80; i++) {
        const s = i / 80;
        const v = A.clone().lerp(Bv, s).normalize();
        pts.push(v.multiplyScalar(R + Math.sin(Math.PI * s) * lift));
      }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.014, 8, false);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, toneMapped: false }));
      this.globe.add(mesh);
      return { mesh, total: geo.index.count, prog: 0 };
    };
    this.arcs = {
      australia: arc(PLACES.uruguay, PLACES.australia, C.turq, 1.1),
      ushuaia: arc(PLACES.uruguay, PLACES.ushuaia, C.pink, 0.3),
      world: Array.from({ length: 9 }, () => arc(PLACES.uruguay, [(rand() - 0.35) * 140, (rand() - 0.5) * 340], [C.turq, C.cream, C.blue][Math.floor(rand() * 3)], 0.35 + rand() * 0.6)),
    };

    // polvo de estrellas
    const S = 1400, sp = new Float32Array(S * 3);
    for (let i = 0; i < S; i++) {
      const v = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(4 + rand() * 10);
      sp.set([v.x, v.y, v.z], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.dust = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.025, color: C.cream, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }));
    this.scene.add(this.dust);
    this.rx = 0.3; this.ry = 0;
  }

  update(t, dt, view) {
    const focus = view.el?.dataset.focus || (view.preview ? 'world' : 'uruguay');
    const sp = view.el ? parseFloat(view.el.dataset.sp || 0) : 0;
    let tx, ty;
    if (focus === 'world' || focus === 'intro') {
      tx = 0.35; ty = t * 0.18;
      // acercar ty a la vuelta más cercana para no girar de golpe
      this.ry = this.ry + (((ty - this.ry + Math.PI) % (Math.PI * 2)) - Math.PI) * 0.02;
    } else {
      const v = latLon(...PLACES[focus]);
      tx = Math.asin(v.y / R);
      ty = -Math.atan2(v.x, v.z);
      let d = ty - this.ry;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.ry += d * 0.045;
    }
    this.rx = lerp(this.rx, tx, 0.045);
    this.globe.rotation.set(this.rx - view.local.y * 0.15, this.ry + view.local.x * 0.35, 0);

    const on = {
      australia: ['australia', 'uruguay', 'ushuaia', 'world'].includes(focus),
      ushuaia: ['ushuaia', 'world'].includes(focus),
      world: focus === 'world',
    };
    const grow = (a, target) => { a.prog = lerp(a.prog, target ? 1 : 0, 0.035); a.mesh.geometry.setDrawRange(0, Math.floor(a.prog * a.total / 3) * 3); };
    grow(this.arcs.australia, on.australia);
    grow(this.arcs.ushuaia, on.ushuaia);
    this.arcs.world.forEach((a, i) => grow(a, on.world && t % 9 > i * 0.12));
    this.markers.forEach((m, i) => {
      const k = (t * 0.8 + i * 0.33) % 1;
      m.ring.scale.setScalar(1 + k * 2.2);
      m.ring.material.opacity = (1 - k) * (focus === m.key ? 1 : 0.45);
      if (m.label) {
        // solo se ven los nombres del lado que mira a cámara
        const front = m.p.clone().applyQuaternion(this.globe.quaternion).z > 0.35;
        m.label.visible = front;
        m.label.material.opacity = lerp(m.label.material.opacity, focus === m.key || focus === 'world' ? 1 : 0.35, 0.06);
      }
    });

    // hero: globo grande y bajo (bajo el título gigante); historia: a un costado
    const s = smooth(0.02, 0.16, sp);
    const wide = this.aspect > 1.15;
    this.root.position.set(lerp(0, wide ? -1.75 : 0, s), lerp(-0.9, wide ? 0 : 1.05, s), 0);
    this.root.scale.setScalar(lerp(1.35, wide ? 1.1 : 0.82, s));
    this.dust.rotation.y = t * 0.02;
  }

  beforeRender() {
    this.camera.position.set(0, 0, this.fit(6.2, 6.2));
    this.camera.lookAt(0, 0, 0);
  }
}

// =============================================================
// CURSOS · escalera de niveles A1 → C2, un globito que sube
// =============================================================
const LEVELS = [
  ['A1', C.cream, C.dark], ['A2', C.pink, C.dark], ['A2+', C.cream, C.blue], ['B1', C.blue, C.cream],
  ['B2', C.turq, C.dark], ['C1', C.blue, C.pink], ['C2', C.pink, C.dark],
];

class Levels extends Base {
  constructor(world) {
    super(world, 30);
    this.scene.background = null; // se ve el fondo animado
    addLights(this.scene, { key: 2.6, rim: C.turq, fill: C.pink });
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x103741, 1.1));
    this.group = new THREE.Group();
    this.scene.add(this.group);
    const stepGeo = new RoundedBoxGeometry(1.8, 0.44, 1.3, 4, 0.14);
    this.steps = LEVELS.map(([label, color], i) => {
      const a = -1.25 + i * 0.6;
      const g = new THREE.Group();
      g.position.set(Math.sin(a) * 3.0, -2.0 + i * 0.62, Math.cos(a) * 3.0);
      g.rotation.y = a;
      g.add(new THREE.Mesh(stepGeo, glossy(color)));
      this.group.add(g);
      return { g, a, label };
    });
    font().then((f) => {
      if (!f) return;
      this.steps.forEach((s, i) => {
        const m = new THREE.Mesh(textGeo(f, s.label, 0.5, 0.14), glossy(LEVELS[i][2]));
        m.position.set(0, 0.62, 0.1);
        s.g.add(m);
        s.text = m;
      });
    });
    // el "alumno": un globo del logo que sube escalón por escalón
    this.hopper = new THREE.Mesh(bubbleGeo(0), glossy(C.pink));
    this.hopper.scale.setScalar(0.32);
    this.group.add(this.hopper);
    // globos sueltos alrededor
    const rand = rng(5);
    this.floaters = Array.from({ length: 7 }, (_, i) => {
      const m = new THREE.Mesh(bubbleGeo(i % 2), glossy([C.cream, C.blue, C.pink, C.dark][i % 4]));
      m.scale.setScalar(0.18 + rand() * 0.22);
      this.group.add(m);
      return { m, r: 4.2 + rand() * 1.5, y: -1.5 + rand() * 4, sp: 0.1 + rand() * 0.2, ph: rand() * 6.28 };
    });
    this.tmpA = new THREE.Vector3(); this.tmpB = new THREE.Vector3();
  }

  top(i, out) { const s = this.steps[i]; return out.set(s.g.position.x, s.g.position.y + 0.55, s.g.position.z); }

  update(t, dt, view) {
    const n = this.steps.length;
    const cycle = (t * 0.75) % (n + 1.2);
    const i = Math.min(n - 1, Math.floor(cycle));
    const f = cycle - Math.floor(cycle);
    if (cycle < n - 1) {
      this.top(i, this.tmpA); this.top(i + 1, this.tmpB);
      const e = ease(clamp(f * 1.6));
      this.hopper.position.lerpVectors(this.tmpA, this.tmpB, e);
      this.hopper.position.y += Math.sin(Math.PI * e) * 0.8;
      this.hopper.rotation.set(0, this.steps[i].a + Math.PI * 0, Math.sin(Math.PI * e) * 0.3);
      this.hopper.scale.setScalar(0.32);
    } else {
      // llegó al C2: festeja girando y vuelve a empezar
      this.top(n - 1, this.hopper.position);
      this.hopper.position.y += 0.15 + Math.abs(Math.sin(t * 6)) * 0.25;
      this.hopper.rotation.y += dt * 6;
      const k = clamp((n + 1.2 - cycle) / 0.4);
      this.hopper.scale.setScalar(0.32 * k);
    }
    this.floaters.forEach((o) => {
      const a = t * o.sp + o.ph;
      o.m.position.set(Math.sin(a) * o.r, o.y + Math.sin(t + o.ph) * 0.2, Math.cos(a) * o.r);
      o.m.rotation.y = -a;
    });
    this.group.rotation.y = lerp(this.group.rotation.y, Math.sin(t * 0.22) * 0.45 - 0.55 + view.local.x * 0.6, 0.05);
    // las etiquetas de nivel siempre miran a cámara, para que se lean
    this.steps.forEach((s) => { if (s.text) s.text.rotation.y = -(s.a + this.group.rotation.y) * 0.85; });
    this.camY = lerp(this.camY ?? 1, 1.2 + view.local.y * 1.2, 0.05);
  }

  beforeRender(view) {
    const mini = view.variant === 'mini';
    // en el hero ancho la escalera queda a la derecha del título
    const off = !mini && !view.preview && this.aspect > 1.2 ? -4.6 : 0;
    const offY = !mini && !view.preview && this.aspect <= 1.2 ? -2.2 : 0;
    const d = this.fit(mini ? 9.5 : off ? 20 : 10.5, mini ? 8.4 : 8.2);
    this.camera.position.set(off, this.camY + offY, d);
    this.camera.lookAt(off, 0.05 + offY, 0);
  }
}

// =============================================================
// Tarjeta de curso: nivel en 3D + "pantalla" con la foto del curso
// =============================================================
const BADGE = {
  a1: ['A1', C.turq, C.dark, C.pink],
  a2: ['A2', C.pink, C.dark, C.blue],
  'a2-plus': ['A2+', 0xbfe9e6, C.blue, C.pink],
  b1: ['B1', C.blue, C.cream, C.turq],
  b2: ['B2', C.dark, C.turq, C.pink],
  c1: ['C1', 0x1d5a72, C.pink, C.cream],
  c2: ['C2', C.deep, C.pink, C.turq],
  pronunciation: ['Pron', C.pink, C.dark, C.turq],
  conversational: ['Talk', C.turq, C.dark, C.blue],
  legal: ['Legal', C.blue, C.cream, C.pink],
};
export const BADGE_LABEL = Object.fromEntries(Object.entries(BADGE).map(([k, v]) => [k, v[0]]));

class Badge extends Base {
  constructor(world) {
    super(world, 30);
    this.scene.background = new THREE.Color(C.turq);
    addLights(this.scene, { rim: C.cream });
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.tile = new THREE.Mesh(new RoundedBoxGeometry(3.4, 2.2, 0.1, 4, 0.14), new THREE.MeshBasicMaterial());
    this.bezel = new THREE.Mesh(new RoundedBoxGeometry(3.6, 2.4, 0.08, 4, 0.2), glossy(C.cream));
    this.bezel.position.z = -0.06;
    this.screen = new THREE.Group();
    this.screen.add(this.bezel, this.tile);
    this.root.add(this.screen);
    this.labels = {};
    this.font = null;
    font().then((f) => { this.font = f; });
    this.orbit = [0, 1, 2].map((i) => {
      const m = new THREE.Mesh(bubbleGeo(i % 2), glossy(C.cream));
      this.root.add(m);
      return m;
    });
  }

  label(key) {
    if (!this.font) return null;
    if (!this.labels[key]) {
      const [txt, , fg] = BADGE[key];
      const m = new THREE.Mesh(textGeo(this.font, txt, txt.length > 3 ? 0.9 : 1.25, 0.36), glossy(fg));
      m.visible = false;
      this.root.add(m);
      this.labels[key] = m;
    }
    return this.labels[key];
  }

  update() {}

  beforeRender(view, t) {
    const key = BADGE[view.variant] ? view.variant : 'a1';
    const [, bg, , accent] = BADGE[key];
    this.scene.background.setHex(bg);
    const src = view.el?.dataset.img;
    if (src) { const m = tex(src); if (this.tile.material.map !== m) { this.tile.material.map = m; this.tile.material.needsUpdate = true; } }
    Object.values(this.labels).forEach((m) => { m.visible = false; });
    const lab = this.label(key);
    const st = view.state;
    st.seed ??= Math.random() * 10;
    const h = view.hover, e = ease(view.expandT || 0);
    const wide = this.aspect > 1;
    // tarjeta: nivel a la izquierda, pantalla a la derecha; abierto: escena de clase
    this.screen.position.set(lerp(1.35 - h * 0.15, wide ? -1.2 : 0, e), lerp(0.05, wide ? 0.1 : 1.0, e), lerp(-0.2 + h * 0.3, 0, e));
    this.screen.rotation.set(lerp(-0.06, 0, e), lerp(-0.42 + h * 0.22, wide ? 0.32 : 0, e), 0);
    this.screen.scale.setScalar(lerp(1, wide ? 1.35 : 1.1, e));
    if (lab) {
      lab.visible = true;
      lab.position.set(lerp(-1.85, wide ? -3.1 : -0.6, e), lerp(-0.1, wide ? -1.7 : -0.6, e) + Math.sin(t * 1.2 + st.seed) * 0.06, lerp(1.0 + h * 0.4, 1.6, e));
      lab.rotation.set(Math.sin(t * 0.8 + st.seed) * 0.05, lerp(0.38 - h * 0.38, 0.3, e) + Math.sin(t * 0.6 + st.seed) * 0.06, 0);
      lab.scale.setScalar(lerp(1, wide ? (BADGE[key][0].length > 3 ? 0.95 : 1.25) : 0.8, e));
    }
    this.orbit.forEach((m, i) => {
      m.material = glossy(i === 1 ? accent : C.cream);
      const a = t * (0.6 + i * 0.15) + i * 2.1 + st.seed;
      const rr = 2.3 + i * 0.3 + e;
      m.position.set(Math.cos(a) * rr * 0.9 + lerp(-0.4, 0, e), Math.sin(a * 1.3) * 1.0, Math.sin(a) * 1.2 + 0.6);
      m.rotation.set(0, -a, Math.sin(a) * 0.2);
      m.scale.setScalar(0.16 + i * 0.03);
    });
    this.root.rotation.y = view.local.x * 0.12;
    this.root.rotation.x = -view.local.y * 0.08;
    const d = this.fit(lerp(7.2, 9, e), lerp(4.6, 6, e));
    this.camera.position.set(0, 0, d);
    this.camera.lookAt(0, 0, 0);
  }
}

// =============================================================
// RECURSOS · hojas de PDF que se curvan con el cursor
// =============================================================
const PDF_COVERS = ['img/foto-13.png', 'img/foto-15.png', 'img/foto-cursos.png'];
const DOC_BG = { stack: C.dark, 0: C.pink, 1: C.blue, 2: C.turq };

class Sheet {
  constructor(src, size = 2.6) {
    this.geo = new THREE.PlaneGeometry(size, size, 22, 22);
    this.base = this.geo.attributes.position.array.slice();
    this.size = size;
    const map = tex(src);
    this.group = new THREE.Group();
    this.front = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ map, side: THREE.FrontSide }));
    this.back = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ color: C.cream, roughness: 0.7, side: THREE.BackSide }));
    this.group.add(this.front, this.back);
  }
  bend(t, curl, px, py, ph = 0) {
    const p = this.geo.attributes.position.array, b = this.base, half = this.size / 2;
    for (let i = 0; i < p.length; i += 3) {
      const x = b[i], y = b[i + 1];
      const u = (x + half) / this.size;  // 0 izquierda → 1 derecha
      let z = Math.sin(x * 1.3 + t * 1.1 + ph) * 0.05 + Math.sin(y * 1.1 + t * 0.9 + ph) * 0.04;
      z += curl * Math.pow(u, 2.2) * 0.9;           // esquina que se levanta
      z += (px * x + py * y) * 0.08;
      p[i + 2] = z;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

class Docs extends Base {
  constructor(world) {
    super(world, 30);
    this.bgColor = new THREE.Color(C.dark);
    this.scene.background = null;
    addLights(this.scene, { rim: C.turq, fill: C.pink });
    this.groups = {};
    this.font = null;
    font().then((f) => { this.font = f; });
  }

  group(variant) {
    if (this.groups[variant]) return this.groups[variant];
    const g = new THREE.Group();
    const entry = { g, sheets: [], word: null };
    if (variant === 'stack') {
      PDF_COVERS.forEach((src, i) => { const s = new Sheet(src, 2.4); g.add(s.group); entry.sheets.push(s); });
    } else {
      const s = new Sheet(PDF_COVERS[+variant] || PDF_COVERS[0], 2.7);
      g.add(s.group); entry.sheets.push(s);
    }
    this.scene.add(g);
    this.groups[variant] = entry;
    return entry;
  }

  word(entry, variant) {
    if (entry.word || !this.font || variant === 'stack') return;
    const w = new THREE.Group();
    if (variant === '0') {
      // "knight": la k y la gh no suenan → letras fantasma
      const letters = [['k', true], ['n'], ['i'], ['g', true], ['h', true], ['t']];
      let x = 0;
      const parts = letters.map(([ch, silent]) => {
        const geo = textGeo(this.font, ch, 0.62, 0.2);
        geo.computeBoundingBox();
        const wdt = geo.boundingBox.max.x - geo.boundingBox.min.x;
        const m = new THREE.Mesh(geo, silent ? new THREE.MeshPhysicalMaterial({ color: C.cream, transparent: true, opacity: 0.28, roughness: 0.1, transmission: 0.2 }) : glossy(C.dark));
        m.position.x = x + wdt / 2; x += wdt + 0.08;
        m.userData.silent = !!silent;
        w.add(m);
        return m;
      });
      parts.forEach((m) => { m.position.x -= x / 2; });
    } else {
      const txt = variant === '1' ? '30' : 'idioms';
      w.add(new THREE.Mesh(textGeo(this.font, txt, variant === '1' ? 1.3 : 0.62, 0.24), glossy(variant === '1' ? C.pink : C.dark)));
    }
    entry.g.add(w);
    entry.word = w;
  }

  update() {}

  beforeRender(view, t) {
    const variant = String(view.variant ?? 'stack');
    this.scene.background = variant === 'stack' ? null : this.bgColor.setHex(DOC_BG[variant] ?? C.dark);
    const entry = this.group(variant);
    this.word(entry, variant);
    Object.values(this.groups).forEach((e) => { e.g.visible = e === entry; });
    const lx = view.local.x, ly = view.local.y;
    if (variant === 'stack') {
      entry.sheets.forEach((s, i) => {
        const k = i - 1;
        s.group.position.set(k * 1.25, Math.sin(t * 0.7 + i) * 0.12 - Math.abs(k) * 0.15, -Math.abs(k) * 0.4 + (i === 1 ? 0.3 : 0));
        s.group.rotation.set(-0.1 + ly * 0.15, k * 0.38 + lx * 0.3, k * -0.12);
        s.bend(t, 0.35 + view.hover * 0.4 + Math.sin(t * 0.8 + i) * 0.15, lx, ly, i);
      });
      const off = !view.preview && this.aspect > 1.2 ? -2.6 : 0;
      this.camera.position.set(off, 0, this.fit(off ? 11 : 6.8, 4.6));
      this.camera.lookAt(off, 0, 0);
      return;
    } else {
      const s = entry.sheets[0];
      s.group.position.set(-0.35, 0.1 + Math.sin(t * 0.8) * 0.08, 0);
      s.group.rotation.set(-0.12 + ly * 0.2, 0.32 + lx * 0.4, -0.05);
      s.bend(t, 0.3 + view.hover * 0.5, lx, ly);
      if (entry.word) {
        entry.word.position.set(0.25, -1.35 + Math.sin(t * 1.1) * 0.06, 1.2);
        entry.word.rotation.set(0.05, -0.2 + lx * 0.25, 0);
        entry.word.children.forEach((m, i) => {
          if (m.userData.silent) m.material.opacity = 0.18 + (Math.sin(t * 2 + i) * 0.5 + 0.5) * 0.25;
          m.position.y = Math.sin(t * 2 + i * 0.6) * 0.05;
        });
      }
      this.camera.position.set(0, 0, this.fit(4.6, 4.6));
    }
    this.camera.lookAt(0, 0, 0);
  }
}

// =============================================================
// CONTACTO · sala de espera de la clase: tablet con Carla
// =============================================================
function drawLobby(canvas, image) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#0d2e37'; ctx.fillRect(0, 0, w, h);
  if (image) {
    const s = Math.max(w / image.width, h / image.height);
    ctx.drawImage(image, (w - image.width * s) / 2, (h - image.height * s) / 2, image.width * s, image.height * s);
  }
  const g = ctx.createLinearGradient(0, h * 0.55, 0, h);
  g.addColorStop(0, 'rgba(11,34,41,0)'); g.addColorStop(1, 'rgba(11,34,41,.85)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.font = '600 30px "Inter Tight", sans-serif';
  ctx.fillStyle = 'rgba(16,55,65,.85)';
  ctx.beginPath(); ctx.roundRect(28, 28, 270, 52, 26); ctx.fill();
  ctx.fillStyle = '#F5A7B5'; ctx.beginPath(); ctx.arc(56, 54, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText('Carla · Teacher', 76, 64);
  // barra de controles
  const cy = h - 70;
  [[w / 2 - 150, '#ffffff33'], [w / 2 - 70, '#ffffff33'], [w / 2 + 10, '#ffffff33']].forEach(([x, c]) => {
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 30, cy, 30, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = '#26ccc8';
  ctx.beginPath(); ctx.roundRect(w / 2 + 70, cy - 30, 150, 60, 30); ctx.fill();
  ctx.fillStyle = '#103741'; ctx.font = '600 26px "Inter Tight", sans-serif';
  ctx.fillText('Entrar', w / 2 + 108, cy + 9);
  ctx.fillStyle = '#fff'; ctx.font = '600 24px "Inter Tight", sans-serif';
  ctx.fillText('🎙', w / 2 - 133, cy + 9); ctx.fillText('▣', w / 2 - 52, cy + 8); ctx.fillText('☺', w / 2 + 27, cy + 9);
}

class Lobby extends Base {
  constructor(world) {
    super(world, 30);
    this.scene.background = null; // se ve el fondo animado
    addLights(this.scene, { rim: C.turq, fill: C.pink });
    this.device = new THREE.Group();
    this.scene.add(this.device);
    this.device.add(new THREE.Mesh(new RoundedBoxGeometry(4.5, 3.1, 0.24, 6, 0.24), glossy(C.dark, { roughness: 0.25 })));
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 680;
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.8), new THREE.MeshBasicMaterial({ map }));
    this.screen.position.z = 0.125;
    this.device.add(this.screen);
    const cam = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    cam.position.set(0, 1.47, 0.125);
    this.device.add(cam);
    Promise.all([img('img/room/foto-12.jpg'), fontsReady()]).then(([image]) => { drawLobby(canvas, image); map.needsUpdate = true; });
    drawLobby(canvas, null);
    this.bubbles = [['Hi!', C.cream, C.dark], ['Hello!', C.turq, C.dark], ["Let's talk", C.pink, C.dark]].map(([word, color, fg], i) => {
      const m = new THREE.Mesh(bubbleGeo(i % 2), glossy(color));
      m.scale.setScalar(0.5);
      this.scene.add(m);
      font().then((f) => {
        if (!f) return;
        const tm = new THREE.Mesh(textGeo(f, word, 0.36, 0.06), glossy(fg, { clearcoat: 0.3 }));
        tm.geometry.computeBoundingBox();
        const ww = tm.geometry.boundingBox.max.x - tm.geometry.boundingBox.min.x;
        tm.scale.setScalar(Math.min(1, 1.55 / ww));
        tm.position.set(0, 0.12, BUBBLE_FRONT + 0.03);
        m.add(tm);
      });
      return { m, ph: i * 2.1 };
    });
  }

  update(t, dt, view) {
    this.device.rotation.y = lerp(this.device.rotation.y, view.local.x * 0.35 + Math.sin(t * 0.4) * 0.1 - 0.12, 0.06);
    this.device.rotation.x = lerp(this.device.rotation.x, -view.local.y * 0.2 + 0.05, 0.06);
    this.device.position.y = Math.sin(t * 0.8) * 0.06;
    this.bubbles.forEach((b, i) => {
      const a = t * 0.35 + b.ph;
      b.m.position.set(Math.cos(a) * 2.5, Math.sin(a * 1.4) * 1.4 + 0.2, Math.sin(a) * 1.1 + 1.0);
      b.m.rotation.set(Math.sin(t + i) * 0.1, Math.sin(a) * 0.3, Math.sin(t * 0.7 + i) * 0.08);
    });
  }

  beforeRender() {
    const off = this.aspect > 1.2 ? -2.4 : 0;
    const offY = this.aspect < 0.9 ? -1.5 : 0;
    this.camera.position.set(off, offY, this.fit(off ? 11.5 : 7.4, 5.6));
    this.camera.lookAt(off, offY, 0);
  }
}

// =============================================================
// SOBRE MÍ / INICIO · fotos de Carla como monedas 3D (composición original)
// =============================================================
class Teacher extends Base {
  constructor(world) {
    super(world, 30);
    this.scene.background = null;
    addLights(this.scene, { rim: C.turq, fill: C.pink });
    this.group = new THREE.Group();
    this.scene.add(this.group);
    const coins = [['img/foto-30.png', 1.55, 0, 0.55, 0], ['img/logo.jpeg', 0.82, -1.35, -1.25, 0.7], ['img/foto-12.png', 0.82, 1.35, -1.25, 0.7]];
    this.coins = coins.map(([src, r, x, y, z], i) => {
      const map = tex(src);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.16, 96, 1), glossy(C.cream));
      mesh.rotation.x = Math.PI / 2;
      const face = new THREE.Mesh(new THREE.CircleGeometry(r * 0.97, 96), new THREE.MeshBasicMaterial({ map }));
      face.position.z = 0.082;
      const holder = new THREE.Group();
      holder.add(mesh, face);
      // anillo turquesa
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.06, 0.035, 16, 120), glossy(i === 0 ? C.turq : C.pink));
      holder.add(ring);
      holder.position.set(x, y, z);
      this.group.add(holder);
      return { holder, ph: i * 1.7, base: new THREE.Vector3(x, y, z) };
    });
  }

  update(t, dt, view) {
    this.coins.forEach((c, i) => {
      c.holder.position.y = c.base.y + Math.sin(t * 0.9 + c.ph) * 0.08;
      c.holder.rotation.y = view.local.x * (0.35 + i * 0.1) + Math.sin(t * 0.5 + c.ph) * 0.08;
      c.holder.rotation.x = -view.local.y * 0.3;
    });
  }

  beforeRender() {
    this.camera.position.set(0, -0.2, this.fit(5.6, 5.6));
    this.camera.lookAt(0, 0, 0);
  }
}

// =============================================================
// Foto con onda al pasar el cursor
// =============================================================
class Photo {
  constructor(world, el) {
    this.world = world;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 10);
    this.camera.position.z = 1;
    const map = tex(el?.dataset.src || 'img/foto-20.png');
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, uAspect: { value: 1 }, uImg: { value: 1.6 }, uMouse: { value: new THREE.Vector2(0.5, 0.5) }, uHover: { value: 0 }, uTime: { value: 0 }, uZoom: { value: 1.1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `
        uniform sampler2D map; uniform float uAspect, uImg, uHover, uTime, uZoom; uniform vec2 uMouse; varying vec2 vUv;
        void main(){
          vec2 uv = vUv - .5;
          if (uAspect > uImg) uv.y *= uImg / uAspect; else uv.x *= uAspect / uImg;
          uv = uv / uZoom + .5;
          vec2 m = uMouse; float d = distance(vUv, m);
          float w = sin(d * 38. - uTime * 4.) * .006 * uHover * smoothstep(.45, 0., d);
          uv += normalize(vUv - m + 1e-4) * w;
          float r = texture2D(map, uv + vec2(w * .6, 0.)).r;
          vec4 c = texture2D(map, uv);
          gl_FragColor = vec4(r, c.g, c.b, 1.);
        }`,
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat));
    this.map = map;
  }
  setSize(w, h) { this.mat.uniforms.uAspect.value = w / h; }
  update(t, dt, view) {
    const u = this.mat.uniforms;
    if (this.map.image) u.uImg.value = this.map.image.width / this.map.image.height;
    u.uTime.value = t;
    u.uHover.value = view.hover;
    u.uMouse.value.set(view.local.x * 0.5 + 0.5, view.local.y * 0.5 + 0.5);
    const r = view.rect, H = this.world.H;
    const p = clamp((H - r.y) / (H + r.h));
    u.uZoom.value = 1.18 - p * 0.14;
  }
}

// =============================================================
// Portal: una tablet en videollamada; la cámara entra en la
// pantalla y adentro ya está la próxima escena.
// =============================================================
class Portal extends Base {
  constructor(world) {
    super(world, 35);
    this.scene.background = null; // se ve el fondo animado
    addLights(this.scene, { rim: C.turq, fill: C.pink });
    this.device = new THREE.Group();
    this.scene.add(this.device);
    this.body = new THREE.Mesh(new THREE.BufferGeometry(), glossy(0x0a1d22, { roughness: 0.2 }));
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }));
    this.device.add(this.body, this.screen);
    this.controls = [0x2b4d56, 0x2b4d56, 0xe0566b].map((c, i) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(i === 2 ? 0.16 : 0.13, 32), new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
      this.device.add(m);
      return m;
    });
    // cortina final: la próxima escena a pantalla completa
    this.cover = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, toneMapped: false }));
    this.cover.renderOrder = 999;
    this.camera.add(this.cover);
    this.scene.add(this.camera);
    // globitos que pasan volando como en un túnel
    const count = world.mobile ? 70 : 140;
    this.stream = new THREE.InstancedMesh(bubbleGeo(0), glossy(C.turq), count);
    this.streamData = Array.from({ length: count }, (_, i) => ({
      a: Math.random() * Math.PI * 2, r: 2.2 + Math.random() * 6, z: -Math.random() * 40, s: 0.06 + Math.random() * 0.12, c: i % 3,
    }));
    const cols = [new THREE.Color(C.turq), new THREE.Color(C.pink), new THREE.Color(C.cream)];
    this.streamData.forEach((d, i) => this.stream.setColorAt(i, cols[d.c]));
    this.scene.add(this.stream);
    this.dummy = new THREE.Object3D();
    this.aspectBuilt = 0;
  }

  build(aspect) {
    // pantalla con la misma proporción que la ventana (como una tablet girada)
    const sa = clamp(aspect, 0.5, 2.1);
    const sh = 2.4, sw = sh * sa;
    this.sw = sw; this.sh = sh;
    this.body.geometry.dispose();
    this.body.geometry = new RoundedBoxGeometry(sw + 0.34, sh + 0.34, 0.22, 6, 0.24);
    this.screen.scale.set(sw, sh, 1);
    this.screen.position.z = 0.112;
    this.controls.forEach((m, i) => m.position.set((i - 1) * 0.42, -sh / 2 + 0.32, 0.12));
    this.aspectBuilt = aspect;
  }

  update(t, dt, view) {
    const p = view.state.p ?? (view.el ? view.hover * 0.22 : 0);
    this.p = p;
    const speed = 2 + p * 45;
    this.streamData.forEach((d, i) => {
      d.z += dt * speed;
      if (d.z > 6) d.z = -40;
      const a = d.a + t * 0.05;
      this.dummy.position.set(Math.cos(a) * d.r, Math.sin(a) * d.r, d.z);
      this.dummy.rotation.set(0, 0, a);
      this.dummy.scale.set(d.s, d.s, d.s * (1 + p * 6));
      this.dummy.updateMatrix();
      this.stream.setMatrixAt(i, this.dummy.matrix);
    });
    this.stream.instanceMatrix.needsUpdate = true;
  }

  beforeRender(view, t) {
    if (Math.abs(this.aspectBuilt - this.aspect) > 0.02) this.build(this.aspect);
    const p = view.state.p ?? (view.el ? view.hover * 0.22 : 0);
    // la escena de destino
    let dest = view.state.dest, destVariant = view.state.destVariant;
    if (!dest && view.el) {
      const next = view.el.dataset.next || view.el.closest('[data-portal]')?.dataset.next || 'index.html';
      [dest, destVariant] = PAGE_HERO[next] || PAGE_HERO['index.html'];
    }
    const r = view.rect;
    // la escena de destino se dibuja con la proporción de la pantalla de la tablet
    const sa = clamp(this.aspect, 0.5, 2.1);
    const tx = this.world.renderDestination(dest || 'classroom', destVariant, r.h * sa, r.h);
    this.screen.material.map = tx; this.screen.material.needsUpdate = this.lastTx !== tx; this.lastTx = tx;
    this.cover.material.map = tx;

    const e = ease(clamp(p));
    const t2 = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dFill = Math.min(this.sh / 2 / t2, this.sw / 2 / (t2 * this.aspect));
    const d0 = this.fit(this.sw * 2.1, this.sh * 2.1);
    const z = lerp(d0, dFill * 0.98, e) + 0.112;
    const free = 1 - e;
    this.camera.position.set(view.local.x * 0.8 * free, view.local.y * 0.5 * free, z);
    this.camera.lookAt(0, 0, 0.112);
    this.device.rotation.set(lerp(-0.22, 0, smooth(0, 0.8, p)) + Math.sin(t * 0.6) * 0.03 * free, lerp(0.32, 0, smooth(0, 0.8, p)) + Math.sin(t * 0.4) * 0.05 * free, 0);
    this.device.position.y = Math.sin(t * 0.8) * 0.05 * free;
    this.controls.forEach((m) => { m.visible = p < 0.45; });
    // cortina a pantalla completa justo antes del corte
    const near = 0.2;
    const ch = 2 * near * t2;
    this.cover.position.set(0, 0, -near);
    this.cover.scale.set(ch * this.aspect, ch, 1);
    this.cover.material.opacity = smooth(0.82, 0.985, p);
    this.cover.visible = this.cover.material.opacity > 0.001;
  }
}


// =============================================================
// INICIO · portada: la clase en vivo. Una pared de cámaras con
// alumnos reales del sitio, Carla al centro, globos de diálogo
// flotando. Al hacer scroll la cámara entra en la pantalla de Carla.
// =============================================================
const WALL = [
  ['foto-11'], ['foto-2'], ['foto-16'], ['foto-22'], ['foto-7'], ['foto-8'], ['foto1'],
  ['foto-21'], ['foto-3'], ['student-1', 'Mica', true], ['CARLA'], ['student-2', 'Seba', true], ['foto-4'], ['foto-9'],
  ['foto-17'], ['caro', 'Caro', true], ['foto-31'], ['student-3', 'Bruna', true], ['foto-6'], ['mika', 'Mika', true], ['foto2'],
];
const wallSrc = (n) => (n.startsWith('student') ? 'img/' + n + '.png' : 'img/room/' + n + '.jpg');
const CLASS_WORDS = ['Hello!', 'Hi!', 'Why?', 'Great!', "Let's talk", 'Yes!', 'Ready?', 'Cheers', 'Wow', 'OK!'];

class Classroom extends Base {
  constructor(world) {
    super(world, 32);
    this.scene.background = null; // se ve el fondo animado
    addLights(this.scene, { key: 1.4 });
    this.wall = new THREE.Group();
    this.scene.add(this.wall);
    const TW = 3.2, TH = 2.0, GX = 3.44, GY = 2.24;
    const tileGeo = new RoundedBoxGeometry(TW, TH, 0.06, 4, 0.12);
    const ringGeo = new RoundedBoxGeometry(TW + 0.18, TH + 0.18, 0.03, 4, 0.2);
    this.tiles = WALL.map(([name, label, avatar], i) => {
      const c = i % 7, r = Math.floor(i / 7);
      const carla = name === 'CARLA';
      const canvas = document.createElement('canvas');
      canvas.width = carla ? 1280 : 800; canvas.height = carla ? 800 : 500;
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 12;
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(tileGeo, new THREE.MeshBasicMaterial({ map }));
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: C.turq, transparent: true, opacity: 0, toneMapped: false }));
      ring.position.z = -0.03;
      g.add(ring, mesh);
      const x = (c - 3) * GX, y = (1 - r) * GY;
      g.position.set(x, y, -x * x * 0.03);
      g.rotation.y = -x * 0.045;
      this.wall.add(g);
      const t = { g, mesh, ring, map, canvas, carla, label, avatar, image: null, speaking: carla, base: g.position.clone(), ph: i * 0.7 };
      const src = carla ? 'img/room/foto-30.jpg' : wallSrc(name);
      Promise.all([img(src), fontsReady()]).then(([im]) => { t.image = im; this.draw(t); });
      return t;
    });
    this.carla = this.tiles.find((t) => t.carla);
    this.speakerIdx = 0;
    this.nextSwap = 0;

    // globos de diálogo que flotan entre la cámara y la pared
    const rand = rng(21);
    this.bubbles = CLASS_WORDS.map((word, i) => {
      const color = [C.turq, C.pink, C.cream, C.blue][i % 4];
      const m = new THREE.Mesh(bubbleGeo(i % 3 === 0 ? 1 : 0), glossy(color));
      const sc = 0.38 + rand() * 0.32;
      m.scale.setScalar(sc);
      if (rand() > 0.5) m.scale.x *= -1;
      this.scene.add(m);
      font().then((f) => {
        if (!f) return;
        const tg = textGeo(f, word, 0.36, 0.06);
        tg.computeBoundingBox();
        const w = tg.boundingBox.max.x - tg.boundingBox.min.x;
        const tm = new THREE.Mesh(tg, glossy(color === C.blue ? C.cream : C.dark, { clearcoat: 0.3 }));
        const k = Math.min(1, 1.55 / w);
        tm.scale.set(k * Math.sign(m.scale.x), k, 1);
        tm.position.set(0, 0.12, BUBBLE_FRONT + 0.03);
        m.add(tm);
      });
      return { m, x: (rand() - 0.5) * 16, y: (rand() - 0.5) * 6.5, z: 1.2 + rand() * 5.5, ph: rand() * 6.28, sp: 0.15 + rand() * 0.25 };
    });

    // polvo de luz
    const N = 500, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) pos.set([(rand() - 0.5) * 30, (rand() - 0.5) * 16, rand() * 12 - 2], i * 3);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.035, color: C.cream, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }));
    this.scene.add(this.dust);
  }

  draw(t) {
    if (t.carla) drawPerson(t.canvas, t.image, { name: 'Carla Migliarini', role: 'Teacher', speaking: true });
    else drawPerson(t.canvas, t.image, { name: t.label, avatar: t.avatar, speaking: t.speaking });
    t.map.needsUpdate = true;
  }

  update(t, dt, view) {
    // cada tanto habla otro alumno
    if (t > this.nextSwap) {
      const others = this.tiles.filter((x) => !x.carla);
      const prev = others[this.speakerIdx];
      if (prev) { prev.speaking = false; if (prev.image) this.draw(prev); }
      this.speakerIdx = Math.floor(Math.random() * others.length);
      const cur = others[this.speakerIdx];
      cur.speaking = true; if (cur.image) this.draw(cur);
      this.nextSwap = t + 2.6;
    }
    this.tiles.forEach((x) => {
      x.g.position.y = x.base.y + Math.sin(t * 0.7 + x.ph) * 0.05;
      x.ring.material.opacity = lerp(x.ring.material.opacity, x.speaking ? (x.carla ? 1 : 0.85) : 0, 0.08);
    });
    this.bubbles.forEach((b, i) => {
      b.m.position.set(b.x + Math.sin(t * b.sp + b.ph) * 0.6, b.y + Math.sin(t * b.sp * 1.3 + b.ph) * 0.35, b.z);
      b.m.rotation.set(Math.sin(t * 0.5 + b.ph) * 0.15, Math.sin(t * 0.4 + b.ph) * 0.35, Math.sin(t * 0.3 + i) * 0.08);
    });
    this.dust.rotation.z = t * 0.01;
  }

  beforeRender(view) {
    const p = view.el ? parseFloat(view.el.dataset.p || 0) : 0;
    const e = ease(clamp(p));
    const t2 = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const c = this.carla.g.position;
    // distancia para que la pantalla de Carla llene el cuadro
    const dFill = Math.max(1.0 / t2, 1.6 / (t2 * this.aspect)) * 1.02;
    const d0 = this.fit(this.aspect < 1 ? 7.6 : 17.5, 9.2);
    const free = 1 - e;
    const oy = (this.aspect < 1 ? -1.4 : 0.15) * free;
    this.camera.position.set(c.x + view.local.x * 1.1 * free, c.y + oy + view.local.y * 0.6 * free, c.z + lerp(d0, dFill, e) + 0.03);
    this.camera.lookAt(c.x + view.local.x * 0.4 * free, c.y + oy, c.z);
  }
}


// =============================================================
// CURSOS · la espina del idioma
// Una columna de globos de diálogo iridiscentes con un eje de luz;
// las tarjetas de los 10 cursos giran en espiral a su alrededor,
// del A1 (abajo) al Legal English (arriba). El scroll sube por la
// espina curso por curso; al abrir uno, la cámara entra en su tarjeta.
// =============================================================
const SPINE_STEP = 3.1;   // distancia vertical entre cursos (se baja: A1 arriba, Legal abajo)
const SPINE_ANG = 1.05;   // giro de la espiral entre cursos (rad)
const SPINE_R = 3.0;      // radio de la órbita de tarjetas
const CARD_W = 3.6, CARD_H = 2.25;

function wrapText(ctx, text, maxW, maxLines) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

/** Capa de texto transparente sobre la foto (la foto va aparte, nítida y animada). */
function drawCardOverlay(canvas, { level, title, teacher, num }) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  let g = ctx.createLinearGradient(0, h * 0.45, 0, h);
  g.addColorStop(0, 'rgba(6,19,23,0)'); g.addColorStop(1, 'rgba(6,19,23,.78)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  g = ctx.createLinearGradient(0, 0, w * 0.5, 0);
  g.addColorStop(0, 'rgba(6,19,23,.45)'); g.addColorStop(1, 'rgba(6,19,23,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h * 0.55);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.font = '600 30px "Inter Tight", sans-serif';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '5px';
  ctx.fillText(num, 70, 96);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.fillStyle = '#26ccc8';
  ctx.font = '400 ' + (level.length > 3 ? 220 : 300) + 'px "Instrument Serif", Georgia, serif';
  ctx.fillText(level, 58, 370);
  ctx.fillStyle = '#ffffff';
  ctx.font = '400 78px "Instrument Serif", Georgia, serif';
  const lines = wrapText(ctx, title, 1100, 2);
  lines.forEach((ln, i) => ctx.fillText(ln, 70, h - 150 - (lines.length - 1 - i) * 80));
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.font = '600 32px "Inter Tight", sans-serif';
  ctx.fillText(teacher, 72, h - 74);
}


// ---------- objetos del campus para el recorrido de cursos ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const basic = (opts) => new THREE.MeshStandardMaterial({ roughness: 0.55, ...opts });

const CAMPUS = {
  // pizarrón con frase en tiza
  board(text) {
    const g = new THREE.Group();
    const map = canvasTex(1024, 640, (x, w, h) => {
      x.fillStyle = '#163f3a'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { x.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.05) + ')'; x.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
      x.fillStyle = 'rgba(255,255,255,.92)'; x.textAlign = 'center';
      x.font = '700 120px "Lobster Two", Georgia, serif';
      const lines = text.split('\n');
      lines.forEach((l, i) => x.fillText(l, w / 2, h / 2 + 40 + (i - (lines.length - 1) / 2) * 140));
      x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 6; x.beginPath(); x.moveTo(w * 0.2, h - 90); x.lineTo(w * 0.8, h - 90); x.stroke();
    });
    const frame = new THREE.Mesh(new RoundedBoxGeometry(1.75, 1.15, 0.08, 3, 0.04), glossy(0xb07a4a, { clearcoat: 0.3 }));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshStandardMaterial({ map, roughness: 0.9 }));
    face.position.z = 0.045;
    const tray = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.12), glossy(0xb07a4a));
    tray.position.set(0, -0.6, 0.06);
    const chalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8), basic({ color: 0xffffff }));
    chalk.rotation.z = Math.PI / 2; chalk.position.set(0.4, -0.56, 0.08);
    g.add(frame, face, tray, chalk);
    return g;
  },
  // pila de libros
  books() {
    const g = new THREE.Group();
    [[C.turq, 0.9, 0], [C.pink, 0.8, 0.22], [C.blue, 0.86, 0.44]].forEach(([c, w, y], i) => {
      const b = new THREE.Mesh(new RoundedBoxGeometry(w, 0.2, 0.62, 3, 0.03), glossy(c));
      b.position.set((i - 1) * 0.04, y, 0); b.rotation.y = (i - 1) * 0.18;
      const pages = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, 0.15, 0.58), basic({ color: C.cream }));
      pages.position.copy(b.position); pages.position.x += 0.04; pages.rotation.y = b.rotation.y;
      g.add(pages, b);
    });
    return g;
  },
  // lápiz
  pencil() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6), glossy(0xf2c14e));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), basic({ color: 0xf1d6b0 }));
    tip.position.y = -0.66;
    const lead = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 6), basic({ color: 0x222222 }));
    lead.position.y = -0.75;
    const eraser = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.14, 12), glossy(C.pink));
    eraser.position.y = 0.62;
    g.add(body, tip, lead, eraser);
    g.rotation.z = 0.8;
    return g;
  },
  // cuaderno con renglones
  notebook() {
    const map = canvasTex(512, 640, (x, w, h) => {
      x.fillStyle = '#fffaf2'; x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(41,111,141,.35)'; x.lineWidth = 3;
      for (let y = 110; y < h; y += 52) { x.beginPath(); x.moveTo(40, y); x.lineTo(w - 30, y); x.stroke(); }
      x.strokeStyle = 'rgba(245,167,181,.9)'; x.beginPath(); x.moveTo(80, 0); x.lineTo(80, h); x.stroke();
      x.fillStyle = '#103741'; x.font = '700 54px "Lobster Two", Georgia, serif'; x.fillText('Writing', 110, 92);
      x.font = '400 34px "Instrument Serif", Georgia, serif'; x.fillText('I have been learning...', 100, 200); x.fillText('My favourite spot is', 100, 252);
    });
    const g = new THREE.Group();
    const cover = new THREE.Mesh(new RoundedBoxGeometry(0.85, 1.05, 0.06, 3, 0.04), glossy(C.blue));
    const page = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.96), new THREE.MeshStandardMaterial({ map, roughness: 0.8 }));
    page.position.z = 0.035;
    g.add(cover, page);
    for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 6, 16), glossy(0xdddddd, { metalness: 0.8 })); r.position.set(-0.43, 0.4 - i * 0.16, 0.03); r.rotation.y = Math.PI / 2; g.add(r); }
    return g;
  },
  // micrófono (speaking)
  mic() {
    const g = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), glossy(0xcfd8da, { metalness: 0.7, roughness: 0.25 }));
    head.position.y = 0.42;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 32), glossy(C.turq));
    ring.position.y = 0.3; ring.rotation.x = Math.PI / 2;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.6, 16), glossy(C.dark));
    body.position.y = 0.0;
    g.add(head, ring, body);
    return g;
  },
  // auriculares (listening)
  headphones() {
    const g = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 10, 40, Math.PI), glossy(C.dark));
    const cupGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.14, 24);
    [-1, 1].forEach((sx) => { const c = new THREE.Mesh(cupGeo, glossy(C.pink)); c.rotation.z = Math.PI / 2; c.position.set(sx * 0.42, -0.06, 0); g.add(c); });
    g.add(band);
    return g;
  },
  // dado (juegos)
  dice() {
    const faces = [1, 2, 3, 4, 5, 6].map((n) => canvasTex(256, 256, (x, w) => {
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, w);
      const P = { 1: [[.5, .5]], 2: [[.28, .28], [.72, .72]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]], 5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.28, .22], [.72, .22], [.28, .5], [.72, .5], [.28, .78], [.72, .78]] }[n];
      x.fillStyle = n === 1 ? '#F5A7B5' : '#103741';
      P.forEach(([a, b]) => { x.beginPath(); x.arc(a * w, b * w, w * 0.09, 0, Math.PI * 2); x.fill(); });
    }));
    return new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.55, 0.55, 4, 0.09), faces.map((map) => new THREE.MeshPhysicalMaterial({ map, roughness: 0.3, clearcoat: 1 })));
  },
  // pieza de rompecabezas (juegos)
  puzzle(color) {
    const sh = new THREE.Shape();
    const k = 0.5;
    sh.moveTo(-k, -k); sh.lineTo(-0.12, -k); sh.absarc(0, -k, 0.12, Math.PI, 0, true); sh.lineTo(k, -k);
    sh.lineTo(k, -0.12); sh.absarc(k, 0, 0.12, -Math.PI / 2, Math.PI / 2, false); sh.lineTo(k, k);
    sh.lineTo(0.12, k); sh.absarc(0, k, 0.12, 0, Math.PI, false); sh.lineTo(-k, k);
    sh.lineTo(-k, 0.12); sh.absarc(-k, 0, 0.12, Math.PI / 2, -Math.PI / 2, true); sh.lineTo(-k, -k);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3 });
    geo.center();
    return new THREE.Mesh(geo, glossy(color));
  },
  // estrella / trofeo (logros)
  star(color) {
    const sh = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.22 : 0.5; const a = Math.PI / 2 + (i * Math.PI) / 5; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) sh.lineTo(x, y); else sh.moveTo(x, y); }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 3 });
    geo.center();
    return new THREE.Mesh(geo, glossy(color, { metalness: 0.3 }));
  },
  trophy() {
    const g = new THREE.Group();
    const gold = glossy(0xf2c14e, { metalness: 0.8, roughness: 0.25 });
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.14, 0.5, 24, 1, true), gold);
    cup.material.side = THREE.DoubleSide; cup.position.y = 0.3;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 12), gold);
    const base = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.12, 0.3, 3, 0.03), glossy(C.dark));
    base.position.y = -0.18;
    [-1, 1].forEach((sx) => { const h = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 8, 20), gold); h.position.set(sx * 0.33, 0.33, 0); h.rotation.y = Math.PI / 2; g.add(h); });
    g.add(cup, stem, base);
    return g;
  },
  // tilde de actividad completada
  check() {
    const sh = new THREE.Shape();
    sh.moveTo(-0.45, 0.02); sh.lineTo(-0.28, 0.18); sh.lineTo(-0.1, 0.0); sh.lineTo(0.32, 0.42); sh.lineTo(0.48, 0.26); sh.lineTo(-0.1, -0.32); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 3 });
    geo.center();
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 40), glossy(C.turq));
    disc.rotation.x = Math.PI / 2;
    const m = new THREE.Mesh(geo, glossy(C.cream));
    m.position.z = 0.1;
    g.add(disc, m);
    return g;
  },
  // tarjeta de multiple choice (actividad)
  quiz() {
    const map = canvasTex(640, 800, (x, w, h) => {
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#103741'; x.font = '400 64px "Instrument Serif", Georgia, serif'; x.fillText('She ___ English.', 50, 130);
      [['A', 'speak', false], ['B', 'speaks', true], ['C', 'speaking', false]].forEach(([l, t, ok], i) => {
        const y = 250 + i * 160;
        x.fillStyle = ok ? '#26ccc8' : '#eef4f5'; x.beginPath(); x.roundRect(50, y - 70, w - 100, 120, 26); x.fill();
        x.fillStyle = '#103741'; x.font = '600 46px "Inter Tight", sans-serif'; x.fillText(l + '   ' + t, 90, y + 8);
        if (ok) { x.fillText('✓', w - 120, y + 8); }
      });
    });
    const g = new THREE.Group();
    const card = new THREE.Mesh(new RoundedBoxGeometry(0.8, 1.0, 0.04, 3, 0.06), glossy(0xffffff));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.93), new THREE.MeshBasicMaterial({ map }));
    face.position.z = 0.025;
    g.add(card, face);
    return g;
  },
  // cubo con letra
  block(letter, color) {
    const faces = [0, 1, 2, 3, 4, 5].map(() => canvasTex(256, 256, (x, w) => {
      x.fillStyle = color; x.fillRect(0, 0, w, w);
      x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 14; x.strokeRect(16, 16, w - 32, w - 32);
      x.fillStyle = '#ffffff'; x.font = '400 180px "Instrument Serif", Georgia, serif'; x.textAlign = 'center'; x.fillText(letter, w / 2, w * 0.74);
    }));
    return new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.55, 0.55, 3, 0.06), faces.map((map) => new THREE.MeshPhysicalMaterial({ map, roughness: 0.4, clearcoat: 0.6 })));
  },
  // botón de video
  play() {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.62, 0.12, 4, 0.16), glossy(C.pink));
    const tri = new THREE.Shape(); tri.moveTo(-0.11, -0.15); tri.lineTo(0.18, 0); tri.lineTo(-0.11, 0.15); tri.closePath();
    const t = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.06, bevelEnabled: false }), glossy(0xffffff));
    t.position.z = 0.06;
    g.add(bg, t);
    return g;
  },
  // birrete de graduación
  cap() {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.06, 1.1, 2, 0.02), glossy(C.dark));
    top.rotation.y = Math.PI / 4;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.32, 24), glossy(C.dark));
    crown.position.y = -0.18;
    const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6), glossy(0xf2c14e, { metalness: 0.6 }));
    tassel.position.set(0.42, -0.2, 0.1);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), glossy(0xf2c14e, { metalness: 0.6 }));
    knot.position.y = 0.05;
    g.add(top, crown, tassel, knot);
    return g;
  },
};

class Spine extends Base {
  constructor(world) {
    super(world, 34);
    this.scene.background = null; // se ve el fondo animado
    addLights(this.scene, { key: 1.8, rim: C.turq, fill: C.pink });
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.items = [];
    this.s = 0; this.vel = 0; this.e = 0;
  }

  build(el) {
    const sec = el.closest('[data-spine]');
    const courses = sec ? [...sec.querySelectorAll('.course')] : [];
    const N = Math.max(1, courses.length);
    const H = (N - 1) * SPINE_STEP;
    const rand = rng(31);
    this.H = H;

    // el recorrido: un camino de casilleros de juego que baja en espiral
    const TILE_DY = 0.42, PATH_R = 1.05, TURN = 0.95; // ángulo por unidad de altura
    this.PATH_R = PATH_R; this.TURN = TURN;
    const tileCount = Math.ceil((H + 10) / TILE_DY);
    const tileGeo = new RoundedBoxGeometry(0.78, 0.12, 0.62, 3, 0.05);
    const tileMats = [C.turq, C.cream, C.pink, C.blue].map((c) => glossy(c, { clearcoat: 0.8 }));
    this.tiles = [];
    for (let k = 0; k < tileCount; k++) {
      const y = 4.5 - k * TILE_DY;
      const a = y * TURN;
      const m = new THREE.Mesh(tileGeo, tileMats[k % 4]);
      m.position.set(Math.sin(a) * PATH_R, y, Math.cos(a) * PATH_R);
      m.rotation.set(0, a, -0.22);
      this.root.add(m);
      this.tiles.push({ m, y, base: y });
    }
    // baranda de luz que acompaña el camino
    const railPts = [];
    for (let y = 4.5; y > -H - 5.5; y -= 0.1) { const a = y * TURN; railPts.push(new THREE.Vector3(Math.sin(a) * (PATH_R + 0.48), y - 0.04, Math.cos(a) * (PATH_R + 0.48))); }
    this.rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), Math.floor(railPts.length * 1.5), 0.022, 6, false),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uT: { value: 0 }, uC: { value: new THREE.Color(C.turq) } },
        vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: 'uniform float uT; uniform vec3 uC; varying float vY; void main(){ float p = fract(vY*0.12 + uT*0.4); float glow = 0.4 + pow(p, 14.0)*2.4; gl_FragColor = vec4(uC*glow, glow*0.7); }',
      }));
    this.root.add(this.rail);
    this.cord = this.rail;

    // objetos del campus a lo largo del recorrido
    const B = ['Hello!', 'I am\nYou are', "Let's\nplay!", 'A1 → C2', 'Speak\nup!', 'Well\ndone!'];
    const make = [
      () => CAMPUS.board(B[0]), () => CAMPUS.dice(), () => CAMPUS.books(), () => CAMPUS.mic(), () => CAMPUS.puzzle(C.pink),
      () => CAMPUS.quiz(), () => CAMPUS.star(0xf2c14e), () => CAMPUS.pencil(), () => CAMPUS.headphones(), () => CAMPUS.block('A', '#26ccc8'),
      () => CAMPUS.board(B[1]), () => CAMPUS.check(), () => CAMPUS.notebook(), () => CAMPUS.play(), () => CAMPUS.puzzle(C.turq),
      () => CAMPUS.trophy(), () => CAMPUS.block('B', '#F5A7B5'), () => CAMPUS.board(B[2]), () => CAMPUS.dice(), () => CAMPUS.star(C.turq),
      () => CAMPUS.mic(), () => CAMPUS.quiz(), () => CAMPUS.block('C', '#296f8d'), () => CAMPUS.board(B[3]), () => CAMPUS.check(),
      () => CAMPUS.books(), () => CAMPUS.headphones(), () => CAMPUS.puzzle(C.cream), () => CAMPUS.board(B[4]), () => CAMPUS.play(),
      () => CAMPUS.star(C.pink), () => CAMPUS.pencil(), () => CAMPUS.board(B[5]), () => CAMPUS.trophy(),
    ];
    this.props = make.map((fn, k) => {
      const o = fn();
      const y = 3.5 - (k + 0.5) * ((H + 6) / make.length);
      // a los costados de la tarjeta de esa altura: así se ven alrededor del curso
      const side = k % 2 ? 1 : -1;
      const cardA = (-y / SPINE_STEP) * SPINE_ANG;
      const a = cardA + side * (side > 0 ? 0.5 + rand() * 0.14 : 0.62 + rand() * 0.28);
      const r = 3.7 + rand() * 0.9;
      // los del lado derecho van más arriba o más abajo, para no tapar la ficha del curso
      const yOff = side > 0 ? (k % 4 < 2 ? 1.15 : -1.15) : 0;
      o.position.set(Math.sin(a) * r, y + yOff, Math.cos(a) * r);
      o.rotation.y = a + (rand() - 0.5) * 0.8;
      o.scale.setScalar(0.62 + rand() * 0.25);
      this.root.add(o);
      return { o, y: y + yOff, ph: rand() * 6.28, spin: (rand() - 0.5) * 0.5 };
    });
    // birrete: la meta, al final del recorrido
    this.goal = CAMPUS.cap();
    this.goal.position.set(0, -H - 2.4, 0);
    this.goal.scale.setScalar(1.4);
    this.root.add(this.goal);

    // la ficha del juego (vos) que baja por el camino
    this.pawn = new THREE.Group();
    const pm = glossy(C.pink, { clearcoat: 1 });
    const pb = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 24), pm); pb.position.y = 0.2;
    const ph = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 16), pm); ph.position.y = 0.48;
    const pbase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.07, 24), pm);
    this.pawn.add(pb, ph, pbase);
    this.root.add(this.pawn);

    // partículas en espiral que suben despacio (y se aceleran con el scroll)
    const P = this.world.mobile ? 1600 : 3200;
    const pos = new Float32Array(P * 3), col = new Float32Array(P * 3);
    const pal = [new THREE.Color(C.turq), new THREE.Color(C.pink), new THREE.Color(C.cream), new THREE.Color(0x7fd6ff)];
    this.pData = [];
    for (let i = 0; i < P; i++) {
      const y = 4.5 - rand() * (H + 9);
      const band = Math.floor(rand() * 2);
      const r = 1.1 + Math.pow(rand(), 1.6) * 3.8;
      this.pData.push({ y, a: y * 1.4 + band * Math.PI + (rand() - 0.5) * 1.4, r, sp: 0.2 + rand() * 0.5 });
      const c = pal[Math.floor(rand() * pal.length)];
      col.set([c.r, c.g, c.b], i * 3);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.dust = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.root.add(this.dust);

    // tarjetas: foto (nítida, con movimiento lento) + capa de texto + vidrio
    const photoGeo = new RoundedBoxGeometry(CARD_W, CARD_H, 0.05, 4, 0.12);
    const overGeo = new THREE.PlaneGeometry(CARD_W, CARD_H);
    const glassGeo = new RoundedBoxGeometry(CARD_W + 0.2, CARD_H + 0.2, 0.04, 4, 0.2);
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x7fe0dc, transparent: true, opacity: 0.14, roughness: 0.1, metalness: 0.2, iridescence: 1, iridescenceIOR: 1.3, envMapIntensity: 1.6, depthWrite: false });
    const ringGeo = new THREE.TorusGeometry(0.95, 0.018, 8, 96);
    const haloTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const x = c.getContext('2d'); const gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, 'rgba(38,204,200,.28)'); gr.addColorStop(0.45, 'rgba(38,204,200,.06)'); gr.addColorStop(1, 'rgba(38,204,200,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 256, 256); const t = new THREE.CanvasTexture(c); return t;
    })();
    this.items = courses.map((li, i) => {
      const map = texLoader.load(li.dataset.img); // propia: cada tarjeta encuadra su foto
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 12;
      map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
      const photo = new THREE.Mesh(photoGeo, new THREE.MeshBasicMaterial({ map, color: 0xffffff }));
      const canvas = document.createElement('canvas');
      canvas.width = 1600; canvas.height = 1000;
      const omap = new THREE.CanvasTexture(canvas);
      omap.colorSpace = THREE.SRGBColorSpace;
      omap.anisotropy = 12;
      const over = new THREE.Mesh(overGeo, new THREE.MeshBasicMaterial({ map: omap, transparent: true, depthWrite: false }));
      over.position.z = 0.03;
      const glass = new THREE.Mesh(glassGeo, glassMat);
      glass.position.z = -0.05;
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W * 2.2, CARD_H * 2.6), new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false }));
      halo.position.z = -0.3;
      const card = new THREE.Group();
      card.add(halo, glass, photo, over);
      const g = new THREE.Group();
      g.add(card);
      const ang = i * SPINE_ANG;
      g.position.set(Math.sin(ang) * SPINE_R, -i * SPINE_STEP, Math.cos(ang) * SPINE_R);
      g.rotation.y = ang;
      this.root.add(g);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: i % 2 ? C.pink : C.turq, transparent: true, opacity: 0.2, toneMapped: false }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -i * SPINE_STEP;
      this.root.add(ring);
      const info = {
        level: li.querySelector('.course-level')?.textContent.trim() || '',
        title: li.querySelector('h3')?.textContent.trim() || '',
        teacher: li.dataset.teacher || '',
        num: li.querySelector('.course-count')?.textContent.trim() || '',
      };
      const fontP = document.fonts ? Promise.all([document.fonts.load('400 300px "Instrument Serif"'), document.fonts.load('600 32px "Inter Tight"')]) : Promise.resolve();
      fontP.then(() => { drawCardOverlay(canvas, info); omap.needsUpdate = true; });
      drawCardOverlay(canvas, info);
      return { g, card, photo, over, halo, ring, map, ph: rand() * 6.28, on: 0 };
    });
    this.ready = true;
  }

  /** encuadre "cover" de la foto, con un zoom lento tipo Ken Burns */
  fitPhoto(it, t, zoom) {
    const im = it.map.image;
    if (!im || !im.width) return;
    const ca = CARD_W / CARD_H, ia = im.width / im.height;
    let rx = 1, ry = 1;
    if (ia > ca) rx = ca / ia; else ry = ia / ca;
    rx /= zoom; ry /= zoom;
    const dx = Math.sin(t * 0.13 + it.ph) * 0.5 + 0.5, dy = Math.cos(t * 0.11 + it.ph) * 0.5 + 0.5;
    it.map.repeat.set(rx, ry);
    it.map.offset.set((1 - rx) * dx, (1 - ry) * (0.35 + 0.3 * dy));
  }

  update(t, dt, view) {
    if (!this.ready && view.el) this.build(view.el);
    if (!this.ready) return;
    const el = view.el;
    const force = el?.dataset.force;
    const tail = parseFloat(el?.dataset.tail || 0);
    const target = (force != null && force !== '' ? +force : parseFloat(el?.dataset.s || 0)) + tail * 1.1;
    const prev = this.s;
    this.s = this.world.reduced ? target : lerp(this.s, target, 0.09);
    this.vel = lerp(this.vel, (this.s - prev) / Math.max(dt, 1e-3), 0.15);
    this.e = ease(clamp(view.expandT || 0));
    const v = clamp(this.vel, -3, 3);

    // casilleros: una ola de luz recorre el camino hacia abajo
    const camY = -this.s * SPINE_STEP;
    this.tiles.forEach((tl, k) => {
      const near = clamp(1 - Math.abs(tl.y - camY) / 6);
      tl.m.position.y = tl.base + Math.sin(t * 2 - tl.y * 0.9) * 0.03 * near;
      tl.m.scale.setScalar(0.92 + near * 0.12);
    });
    this.rail.material.uniforms.uT.value = t;
    // objetos: flotan, giran y se acercan cuando pasás
    this.props.forEach((p) => {
      const near = clamp(1 - Math.abs(p.y - camY) / 5);
      p.o.position.y = p.y + Math.sin(t * 0.9 + p.ph) * 0.12;
      p.o.rotation.y += dt * (p.spin + v * 0.4);
      p.o.rotation.x = Math.sin(t * 0.6 + p.ph) * 0.15;
      const sc = p.o.userData.base || (p.o.userData.base = p.o.scale.x);
      p.o.scale.setScalar(sc * (0.8 + near * 0.3));
    });
    this.goal.rotation.y = t * 0.5;
    // la ficha baja por el camino siguiendo tu scroll, con saltitos
    const py = camY - 0.35 + Math.abs(Math.sin(t * 3.2)) * 0.18 * (1 - Math.min(1, Math.abs(v)));
    const pawnA = py * this.TURN;
    this.pawn.position.set(Math.sin(pawnA) * this.PATH_R, py + 0.08, Math.cos(pawnA) * this.PATH_R);
    this.pawn.rotation.y = pawnA;
    // partículas: suben en espiral; al bajar rápido se estiran hacia arriba
    const pa = this.dust.geometry.attributes.position.array;
    this.pData.forEach((p, i) => {
      p.y += dt * (p.sp + Math.max(0, v) * 3.5);
      if (p.y > 4.5) p.y -= this.H + 9;
      const ang = p.a + t * 0.12 + p.y * 0.05;
      pa[i * 3] = Math.cos(ang) * p.r; pa[i * 3 + 1] = p.y; pa[i * 3 + 2] = Math.sin(ang) * p.r;
    });
    this.dust.geometry.attributes.position.needsUpdate = true;

    // tarjetas: la activa gira al frente, se ilumina y su foto respira; el resto queda atenuado
    this.items.forEach((it, i) => {
      const dist = Math.abs(i - this.s);
      const on = clamp(1 - dist);
      it.on = lerp(it.on, on, 0.12);
      const c = it.card;
      c.position.y = Math.sin(t * 0.8 + it.ph) * 0.05;
      c.rotation.y = (i - this.s) * -0.35 + Math.sin(t * 0.5 + it.ph) * 0.03 * it.on;
      c.rotation.x = clamp(v * 0.08, -0.25, 0.25) * (1 - it.on * 0.5);
      c.scale.setScalar(0.9 + it.on * 0.14);
      const dim = 0.42 + it.on * 0.58;
      it.photo.material.color.setScalar(dim);
      it.over.material.opacity = 0.35 + it.on * 0.65;
      it.halo.material.opacity = it.on * 0.6;
      it.ring.material.opacity = 0.15 + it.on * 0.75;
      it.ring.scale.setScalar(1 + it.on * (0.08 + Math.sin(t * 2.4) * 0.04));
      this.fitPhoto(it, t, 1.04 + it.on * 0.06);
    });
  }

  beforeRender(view) {
    if (!this.ready) return;
    const s = this.s, e = this.e;
    const ang = s * SPINE_ANG, y = -s * SPINE_STEP;
    const out = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
    const right = new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang));
    const C0 = out.clone().multiplyScalar(SPINE_R).setY(y);
    const wide = this.aspect > 1.15;
    const t2 = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    // centrado: la tarjeta activa ocupa el medio de la pantalla
    const D0 = wide ? this.fit(CARD_W / 0.36, CARD_H / 0.5) : this.fit(CARD_W / 0.9, CARD_H / 0.36);
    // al abrir un curso: la tarjeta llena la pantalla
    const dFill = Math.min((CARD_H / 2) / t2, (CARD_W / 2) / (t2 * this.aspect)) * 0.97;
    const dist = lerp(D0, dFill, e);
    const free = 1 - e;
    const sh = view.local.x * 0.35 * free;
    const shy = (wide ? 0 : -1.25) * free;
    // la cámara mira desde un poco más arriba: se siente que bajás por la espina
    const cam = C0.clone().addScaledVector(out, dist).addScaledVector(right, sh);
    cam.y += (0.9 + clamp(this.vel, -2, 2) * 0.25) * free + shy + view.local.y * 0.25 * free;
    const look = C0.clone().addScaledVector(right, sh * 0.4);
    look.y += shy - 0.05 * free;
    this.camera.position.copy(cam);
    this.camera.lookAt(look);
    // ningún objeto del recorrido tapa la tarjeta activa: si queda delante, se achica y desaparece
    this.camera.updateMatrixWorld();
    const cardDist = cam.distanceTo(C0);
    const hw = (CARD_W / 2) / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.aspect * cardDist) + 0.12;
    const hh = (CARD_H / 2) / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * cardDist) + 0.12;
    const cNdc = C0.clone().project(this.camera);
    const tmp = new THREE.Vector3();
    this.props.forEach((p) => {
      tmp.copy(p.o.position).project(this.camera);
      const blocking = p.o.position.distanceTo(cam) < cardDist && Math.abs(tmp.x - cNdc.x) < hw && Math.abs(tmp.y - cNdc.y) < hh;
      p.hide = lerp(p.hide || 0, blocking ? 1 : 0, 0.2);
      p.o.visible = p.hide < 0.97;
      if (p.hide > 0.01) p.o.scale.multiplyScalar(1 - p.hide);
    });
  }
}

export function createModule(name, world, el, variant) {
  switch (name) {
    case 'bubbles': return new Bubbles(world);
    case 'classroom': return new Classroom(world);
    case 'spine': return new Spine(world);
    case 'call': return new Call(world);
    case 'globe': return new Globe(world);
    case 'levels': return new Levels(world);
    case 'badge': return new Badge(world);
    case 'docs': return new Docs(world);
    case 'lobby': return new Lobby(world);
    case 'teacher': return new Teacher(world);
    case 'photo': return new Photo(world, el);
    case 'portal': return new Portal(world);
    default: throw new Error('escena desconocida: ' + name);
  }
}
