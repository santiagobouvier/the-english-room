// =============================================================
// Fondo animado (canvas propio, detrás del contenido)
// Oscuro, con brillo de aurora en los colores de Carla, una
// cuadrícula de cuaderno que se desplaza con el scroll y se
// revela alrededor del cursor, y grano fino.
// =============================================================

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uScroll; uniform vec2 uMouse;
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform float uCalm;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < OCT; i++){ v += a*noise(p); p *= 2.02; a *= 0.5; } return v; }

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 q = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;
  float t = uTime * 0.05 * uCalm;
  float sc = uScroll * 0.00012;

  // base casi negra, levemente teal
  vec3 col = vec3(0.022, 0.066, 0.08);

  // aurora: tres masas de color que respiran y derivan con el scroll
  float n1 = fbm(q*1.3 + vec2(t, -t*0.7) + vec2(0.0, sc));
  float n2 = fbm(q*1.1 - vec2(t*0.8, t*0.3) + vec2(3.1, sc*1.4));
  float n3 = fbm(q*1.7 + vec2(-t*0.5, t) + vec2(7.3, -sc));
  float m1 = smoothstep(0.45, 0.95, n1) * smoothstep(1.3, 0.0, length(q - vec2(-0.7, 0.45)));
  float m2 = smoothstep(0.5, 1.0, n2) * smoothstep(1.4, 0.0, length(q - vec2(0.8, -0.35)));
  float m3 = smoothstep(0.55, 1.0, n3) * smoothstep(1.2, 0.0, length(q - vec2(0.1, 0.9)));
  col += uA * m1 * 0.42 + uB * m2 * 0.36 + uC * m3 * 0.22;

  // cuadrícula de cuaderno, con perspectiva suave hacia el horizonte
  vec2 g = gl_FragCoord.xy + vec2(0.0, uScroll * 0.35);
  float cell = 56.0;
  vec2 gv = abs(fract(g / cell) - 0.5) * cell;
  float line = 1.0 - smoothstep(0.0, 1.1, min(gv.x, gv.y));
  vec2 gv5 = abs(fract(g / (cell*5.0)) - 0.5) * cell*5.0;
  float major = 1.0 - smoothstep(0.0, 1.3, min(gv5.x, gv5.y));
  float md = length((gl_FragCoord.xy - uMouse) / uRes.y);
  float spot = smoothstep(0.42, 0.0, md);
  float gridA = (line * 0.035 + major * 0.05) + (line * 0.11 + major * 0.1) * spot;
  col += mix(vec3(0.6, 0.85, 0.85), uA, 0.5) * gridA;
  // halo del cursor
  col += uA * spot * spot * 0.06;

  // viñeta y grano
  col *= 1.0 - 0.45 * pow(length(uv - 0.5) * 1.25, 2.2);
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) * 0.025;
  gl_FragColor = vec4(col, 1.0);
}`;

const PALETTES = {
  inicio: [[0.15, 0.8, 0.78], [0.16, 0.44, 0.55], [0.96, 0.65, 0.71]],
  'sobre-mi': [[0.16, 0.44, 0.55], [0.15, 0.8, 0.78], [0.96, 0.65, 0.71]],
  cursos: [[0.15, 0.8, 0.78], [0.96, 0.65, 0.71], [0.16, 0.44, 0.55]],
  recursos: [[0.96, 0.65, 0.71], [0.15, 0.8, 0.78], [0.16, 0.44, 0.55]],
  contacto: [[0.16, 0.44, 0.55], [0.96, 0.65, 0.71], [0.15, 0.8, 0.78]],
};

const LITE = matchMedia('(max-width: 900px), (pointer: coarse)').matches;

export function startBackdrop(canvas, { reduced = false } = {}) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, type === gl.FRAGMENT_SHADER ? src.replace(/^(precision[^\n]*\n)/m, `$1#define OCT ${LITE ? 3 : 5}\n`) : src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(prog, n);
  const u = { res: U('uRes'), time: U('uTime'), scroll: U('uScroll'), mouse: U('uMouse'), a: U('uA'), b: U('uB'), c: U('uC'), calm: U('uCalm') };

  const dpr = LITE ? 0.5 : Math.min(window.devicePixelRatio || 1, 1.25);
  let W = 0, H = 0;
  const resize = () => {
    W = Math.round(innerWidth * dpr); H = Math.round(innerHeight * dpr);
    canvas.width = W; canvas.height = H;
    gl.viewport(0, 0, W, H);
  };
  resize();
  addEventListener('resize', resize);

  const mouse = { x: W * 0.5, y: H * 0.6, tx: W * 0.5, ty: H * 0.6 };
  addEventListener('pointermove', (e) => { mouse.tx = e.clientX * dpr; mouse.ty = (innerHeight - e.clientY) * dpr; }, { passive: true });

  const cur = PALETTES.inicio.map((c) => c.slice());
  const t0 = performance.now();
  let tick = 0;
  return {
    frame() {
      if (LITE && (tick++ & 1)) return;
      const key = document.body.dataset.page || 'inicio';
      const target = PALETTES[key] || PALETTES.inicio;
      cur.forEach((c, i) => c.forEach((v, k) => { c[k] = v + (target[i][k] - v) * 0.03; }));
      mouse.x += (mouse.tx - mouse.x) * 0.08;
      mouse.y += (mouse.ty - mouse.y) * 0.08;
      gl.uniform2f(u.res, W, H);
      gl.uniform1f(u.time, (performance.now() - t0) / 1000);
      gl.uniform1f(u.scroll, window.scrollY * dpr);
      gl.uniform2f(u.mouse, mouse.x, mouse.y);
      gl.uniform3fv(u.a, cur[0]); gl.uniform3fv(u.b, cur[1]); gl.uniform3fv(u.c, cur[2]);
      gl.uniform1f(u.calm, reduced ? 0 : 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
