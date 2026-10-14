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
  // 10-12 下午试过缓入缓出（smoothstep）+ 提前淡出，用户看了说「太快了」，要回这一版的节奏：保留的只有颜色和颗粒大小那两处修正。
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
  // 颗粒细一点：以前最大到 1.7 倍字形像素，几粒叠起来比原来的字还粗还亮（录屏里的「白光」「白痕」）。
  gl_PointSize = max(1.0, mix(u_size * (0.75 + 0.45 * a_seed.x), 0.6, age));
  // 从字色褪成灰：浅字褪成中灰、深字褪成浅灰，不再往白里走（10-12「白光」）。淡出照 10-06 那版：前四分之一不淡。
  float grey = dot(a_color.rgb, vec3(0.3, 0.59, 0.11));
  vec3 ash = mix(a_color.rgb, vec3(grey * 0.62 + 0.14), smoothstep(0.05, 0.6, age));
  v_color = vec4(ash, a_color.a * 0.9 * (1.0 - smoothstep(0.25, 1.0, age)));
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

/**
 * 只提交编译和链接，不问结果（性能审计 11）。一问 COMPILE / LINK_STATUS 主线程就得停下来等它编完（实测约 16ms）。
 * 开了 KHR_parallel_shader_compile 时 Chromium 在后台编：灰要等换场的快照拍好、帧节奏平稳才开始画，第一次画之前
 * （`setup`）问一下 COMPLETION_STATUS 就够了——实测（1× / 4× 降速各连拨 3 次）开画时一次都没有还在编。
 * 没有这个扩展时要问才编，推迟到第一帧只会卡在动画里（试过：那一帧卡 45ms），所以照旧在建画布时就问。
 */
const compile = (gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram | null => {
  const program = gl.createProgram();
  if (!program) return null;
  for (const [type, source] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  return program;
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
  // 有这个扩展才真在后台编；没有的话第一次问状态时才同步编（那还不如在这里就编完）。
  const parallel = gl.getExtension('KHR_parallel_shader_compile') as { COMPLETION_STATUS_KHR: number } | null;
  const program = compile(gl, GRAIN_VS, GRAIN_FS);
  if (!program) return null;
  if (!parallel && !gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  const sizes = [2, 4, 2, 2];
  const offsets = [0, 2, 6, 8];
  let attrs: number[] = [];
  let uNow: WebGLUniformLocation | null = null;
  let uSize: WebGLUniformLocation | null = null;
  let uOrigin: WebGLUniformLocation | null = null;
  /** 第一次画之前：确认编过了，再取属性和 uniform 的位置（这些调用也会等编译）。编不过返回 false。 */
  let linked: boolean | null = null;
  /** 还在编：这一帧先不画（返回 null）。 */
  const setup = (): boolean | null => {
    if (linked !== null) return linked;
    if (parallel && !gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) return null;
    linked = !!gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!linked) return false;
    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.viewport(0, 0, width, height);
    attrs = (['a_pos', 'a_color', 'a_seed', 'a_time'] as const).map((name) => gl.getAttribLocation(program, name));
    attrs.forEach((loc) => { if (loc >= 0) gl.enableVertexAttribArray(loc); });
    uNow = gl.getUniformLocation(program, 'u_now');
    uSize = gl.getUniformLocation(program, 'u_size');
    uOrigin = gl.getUniformLocation(program, 'u_origin');
    gl.uniform2f(gl.getUniformLocation(program, 'u_view'), width, height);
    return true;
  };

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
    const ready = setup();
    if (ready === false) {
      layer.dispose();
      return;
    }
    if (ready === null) {
      raf = requestAnimationFrame(tick);
      return;
    }
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
