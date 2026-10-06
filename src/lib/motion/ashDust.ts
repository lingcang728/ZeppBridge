import { LIFE_MIN, LIFE_SPAN, type AshOrigin, type Grains } from './ashGlyphs';
import { LOCALE_REVEAL_MS } from './timing';

/** 换语言「响指」的灰：一张整屏 WebGL 画布，连拨时几圈的灰都画在它上面（lib/motion/ashSwitch.ts）。 */

const GRAIN_VS = `
attribute vec2 a_pos; attribute vec4 a_color; attribute vec2 a_seed; attribute vec2 a_time;
uniform vec2 u_view; uniform float u_now; uniform float u_size; uniform vec2 u_origin;
varying vec4 v_color;
void main() {
  float age = (u_now - a_time.x) / a_time.y;
  if (age < 0.0 || age > 1.0) { gl_Position = vec4(2.0, 2.0, 0.0, 1.0); gl_PointSize = 0.0; v_color = vec4(0.0); return; }
  // 三次方缓出：起飞快、越飘越慢，收尾几乎停住（2026-10-06：「漂得更慢、更远，收尾减速」）。
  float rest = 1.0 - age;
  float out_ = 1.0 - rest * rest * rest;
  // 顺着涟漪往外吹（离开语言轮的方向），两侧散开一点；灰轻，往上飘一点；再叠一点打旋。
  vec2 dir = a_pos - u_origin;
  float len = length(dir);
  dir = len > 1.0 ? dir / len : vec2(-0.7, 0.7);
  vec2 side = vec2(-dir.y, dir.x);
  vec2 drift = dir * (120.0 + 260.0 * a_seed.x) * out_ + side * (a_seed.y - 0.5) * 130.0 * out_;
  drift.y -= (20.0 + 60.0 * a_seed.y) * out_ * age;
  vec2 swirl = vec2(sin(age * 5.0 + a_seed.y * 31.0), cos(age * 4.5 + a_seed.x * 29.0)) * (3.0 + 10.0 * a_seed.y) * out_;
  vec2 p = a_pos + drift + swirl;
  gl_Position = vec4(p.x / u_view.x * 2.0 - 1.0, 1.0 - p.y / u_view.y * 2.0, 0.0, 1.0);
  gl_PointSize = max(1.0, mix(u_size * (0.9 + 0.8 * a_seed.x), 0.5, age));
  float grey = dot(a_color.rgb, vec3(0.3, 0.59, 0.11));
  vec3 ash = mix(a_color.rgb, vec3(grey * 0.85 + 0.08), smoothstep(0.05, 0.6, age));
  v_color = vec4(ash, a_color.a * (1.0 - smoothstep(0.25, 1.0, age)));
}`;
const GRAIN_FS = `
precision mediump float;
varying vec4 v_color;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d);
  if (r > 0.25) discard;
  float a = v_color.a * (1.0 - smoothstep(0.1, 0.25, r));
  gl_FragColor = vec4(v_color.rgb * a, a);
}`;

const compile = (gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram | null => {
  const program = gl.createProgram();
  if (!program) return null;
  for (const [type, source] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
};

/** 一圈涟漪的灰：起点时刻等涟漪真正开跑（`anim.startTime`）才定，和圆的边严丝合缝。 */
export type Batch = { buffer: WebGLBuffer; count: number; size: number; origin: AshOrigin; anim: Animation | null; base: number | null };
export type DustLayer = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  add: (grains: Grains, origin: AshOrigin) => Batch | null;
  start: (batch: Batch, anim: Animation) => void;
  drop: (batch: Batch) => void;
  mount: () => void;
  dispose: () => void;
};

const BATCH_MS = LOCALE_REVEAL_MS + 60 + LIFE_MIN + LIFE_SPAN;

let dust: DustLayer | null = null;

/** 灰的画布：整屏一张，按 CSS 像素画（灰粒本来就是虚的，用不着设备像素比的清晰度）。 */
const createDustLayer = (width: number, height: number): DustLayer | null => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: `${width}px`, height: `${height}px`, zIndex: '2147483000', pointerEvents: 'none',
    viewTransitionName: 'ash-dust',
  });
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;
  const program = compile(gl, GRAIN_VS, GRAIN_FS);
  if (!program) return null;
  gl.useProgram(program);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.viewport(0, 0, width, height);
  const attrs = (['a_pos', 'a_color', 'a_seed', 'a_time'] as const).map((name) => gl.getAttribLocation(program, name));
  const sizes = [2, 4, 2, 2];
  const offsets = [0, 2, 6, 8];
  attrs.forEach((loc) => { if (loc >= 0) gl.enableVertexAttribArray(loc); });
  const uNow = gl.getUniformLocation(program, 'u_now');
  const uSize = gl.getUniformLocation(program, 'u_size');
  const uOrigin = gl.getUniformLocation(program, 'u_origin');
  gl.uniform2f(gl.getUniformLocation(program, 'u_view'), width, height);

  const batches: Batch[] = [];
  let raf = 0;
  let disposed = false;
  const release = (batch: Batch) => {
    const index = batches.indexOf(batch);
    if (index >= 0) batches.splice(index, 1);
    gl.deleteBuffer(batch.buffer);
  };
  const tick = (ts: number) => {
    raf = 0;
    if (disposed) return;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (const batch of [...batches]) {
      if (batch.base === null && batch.anim?.startTime != null) batch.base = Number(batch.anim.startTime);
      if (batch.base === null) continue;
      const now = ts - batch.base;
      if (now > BATCH_MS) {
        release(batch);
        continue;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffer);
      attrs.forEach((loc, i) => {
        if (loc >= 0) gl.vertexAttribPointer(loc, sizes[i]!, gl.FLOAT, false, 40, offsets[i]! * 4);
      });
      gl.uniform1f(uNow, now);
      gl.uniform1f(uSize, batch.size);
      gl.uniform2f(uOrigin, batch.origin.x, batch.origin.y);
      gl.drawArrays(gl.POINTS, 0, batch.count);
    }
    // 灰都飘完了（也没有等着开跑的）就收掉画布。
    if (!batches.length) {
      layer.dispose();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  const wake = () => {
    if (!raf && !disposed) raf = requestAnimationFrame(tick);
  };

  const layer: DustLayer = {
    canvas,
    width,
    height,
    add: (grains, origin) => {
      const buffer = gl.createBuffer();
      if (!buffer) return null;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, grains.data, gl.STATIC_DRAW);
      const batch: Batch = { buffer, count: grains.count, size: grains.size, origin, anim: null, base: null };
      batches.push(batch);
      return batch;
    },
    start: (batch, anim) => {
      batch.anim = anim;
      wake();
    },
    drop: (batch) => {
      release(batch);
      wake();
    },
    mount: () => {
      if (!canvas.isConnected) document.body.appendChild(canvas);
      wake();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
      if (dust === layer) dust = null;
    },
  };
  return layer;
};

/** 拿灰的画布：窗口尺寸没变就接着用（上一圈没飘完的灰继续飘），变了换一张。 */
export const dustLayer = (width: number, height: number): DustLayer | null => {
  if (dust && dust.width === width && dust.height === height) return dust;
  dust?.dispose();
  dust = createDustLayer(width, height);
  return dust;
};
