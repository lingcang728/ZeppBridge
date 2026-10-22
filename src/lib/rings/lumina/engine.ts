/**
 * 年轮的粒子引擎——逐行照搬 Lumina（MyProject/Solid/Lumina）的 ParticleSystem.tsx + Scene.tsx（CameraDirector），
 * 从 React Three Fiber 改写成原生 three.js，好放进 Vue。常量、缓动、弹簧、冲击波、拳击式切换、爆闪、扫光、
 * 运镜、镜头抖动、Bloom 参数全部原样。
 *
 * 幕次对应：
 * - `idle`：穿过星海飞入（Lumina 开场）；
 * - `year`：粒子聚成年份数字（第一次 = Lumina 的「3」：一镜到底淡入，聚拢那一刻落一拳；之后换年 = 「2 / 1」：先收缩再弹开 + 冲击波 + 抖动）；
 * - `shape`：年轮切片（= Lumina 的蛋糕 / 灯笼，焦点星 = 蜡烛火焰那一池，逐帧闪烁）；
 * - `finale`：爆开、星海冲回，年轮留在中间，标题化成一条绕着它公转的光带，一道扫光（= Lumina 终幕）。
 *
 * 打击感（用户 2026-10-22：「拳击式切换是最得意的设计，合理地扩大到全局」）：每一幕落定都有一拳——
 * 冲击波 + 镜头一抖 + 整组粒子先缩后弹（`land`）。力度分档：终幕最重，换年其次，进年轮再次，回年轮最轻。
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BloomEffect, EffectComposer, EffectPass, RenderPass } from 'postprocessing';
import {
  GALAXY_COUNT, NO_FOCAL, TEXT_COUNT, fillAmbient, fillDigit, fillFinale, fillIdle, fillRings, fillStarfield,
  generateBackgroundStars, newPC, placeBand, type BandInfo, type FocalInfo, type PC,
} from './shapes';
import type { RingYear } from '../../../types/rings';

export type RingPhase = 'idle' | 'year' | 'shape' | 'finale';
/** 内部按 Lumina 的幕次走：year 第一次是 three，之后是 two（拳击式）。 */
type Phase = 'idle' | 'three' | 'two' | 'shape' | 'finale';

const BURST_TIME = 0.62;

// ===== Shockwave =====
const WAVE_SPEED = 42;
const WAVE_LIFE = 2.0;
const WAVE_WIDTH = 12;
const WAVE_AMP = 6.0;
const WAVE_AMP_DIGIT = 9.0;
const MAX_WAVES = 5;
const MEGA = { speed: 28, life: 2.2, width: 18, amp: 3 } as const;

// Finale spring constants.
const FIN_TEXT_STIFF = 54, FIN_TEXT_DAMP = 15;
const FIN_GAL_STIFF = 8, FIN_GAL_DAMP = 4.5;

// Digit sound-wave ripple (galaxy pool only, during digit phases).
const SND_FREQ = 4.0;
const SND_K = 0.42;
const SND_AMP = 0.8;
const SND_GLOW = 0.55;

const IDLE_SPIN = 0.0026;

const PUNCH_BEAT = 0.4;
const PUNCH_CONTRACT = 0.55;

/** 落定的那一拳（不是换年那种整段拳击，而是到位时补的一下）：先缩一点，再 easeOutBack 弹回，过冲一点点。 */
type Land = { wave: number; shake: number; squash: number };
const LAND: Record<'three' | 'shapeIn' | 'shapeBack', Land> = {
  three: { wave: WAVE_AMP_DIGIT, shake: 0.7, squash: 0.16 },
  shapeIn: { wave: WAVE_AMP, shake: 0.55, squash: 0.12 },
  shapeBack: { wave: WAVE_AMP * 0.6, shake: 0.35, squash: 0.08 },
};
/** 形变走到多少时算「到位」，在那一刻落拳（easeOut 的形变早就看着聚好了，等到 1 会显得慢半拍）。 */
const LAND_AT: Partial<Record<Phase, number>> = { three: 0.62, shape: 0.82 };
const POP_DUR = 0.42;
const POP_CONTRACT = 0.3;
/** 光带公转的角速度（弧度 / 秒）：慢慢转，看得出它在三维里绕着年轮走。 */
const BAND_SPEED = 0.16;

const DURATIONS: Record<Phase, number> = { idle: 1.0, three: 1.5, two: 0.72, shape: 1.1, finale: 1.0 };

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => { const s = 1.70158; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); };
const easeInOutQuart = (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);

// ===== Camera parameters (Scene.tsx) =====
const INTRO_FAR = 120;
const INTRO_NEAR = 5;
const INTRO_DUR = 4.2;
const PHASE_DIST: Record<Phase, number> = { idle: INTRO_NEAR, three: 34, two: 34, shape: 34, finale: 40 };
const FINALE_DIR = new THREE.Vector3(0, 0.22, 1).normalize();
const FINALE_SHAKE = { dur: 0.6, amp: 1.7 } as const;
const DIGIT_SHAKE = { dur: 0.4, amp: 0.7 } as const;
const ORIGIN = new THREE.Vector3(0, 0, 0);
const IDENTITY_Q = new THREE.Quaternion();

export interface EngineOptions {
  /** 少动效：跳过飞入。 */
  reducedMotion?: boolean;
  /** 飞入结束（可以进第一幕了）。 */
  onIntroDone?: () => void;
}

export class RingsLuminaEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private controls: OrbitControls;
  private host: HTMLElement;
  private resizeObserver: ResizeObserver;
  private frame = 0;
  private running = false;
  private clock = new THREE.Clock();
  private options: EngineOptions;

  private phase: Phase = 'idle';
  private bgGroup = new THREE.Group();
  private galaxyGroup = new THREE.Group();
  private textGroup = new THREE.Group();

  private gPos: THREE.BufferAttribute; private gCol: THREE.BufferAttribute;
  private tPos: THREE.BufferAttribute; private tCol: THREE.BufferAttribute;
  private gTargetPos: Float32Array; private gTargetCol: Float32Array;
  private tTargetPos: Float32Array; private tTargetCol: Float32Array;
  private gStartPos: Float32Array; private gStartCol: Float32Array;
  private tStartPos: Float32Array; private tStartCol: Float32Array;
  private gVel = new Float32Array(GALAXY_COUNT * 3);
  private tVel = new Float32Array(TEXT_COUNT * 3);

  private morphT = 1;
  private morphDur = 1;
  private charge = 0;
  private burst = 0;
  private finaleT = 0;
  private waves = Array.from({ length: MAX_WAVES }, () => ({ t: 0, active: false, speed: WAVE_SPEED, amp: WAVE_AMP, width: WAVE_WIDTH, life: WAVE_LIFE }));
  private waveScratch = Array.from({ length: MAX_WAVES }, () => ({ radius: 0, amp: 0, glow: 0, width: WAVE_WIDTH }));

  private intro = { active: true, t: 0 };
  private tween = { active: false, t: 0, dur: 1, from: 0, to: 0, dir: new THREE.Vector3(0, 0, 1) };
  private shake = { t: 0, dur: 0.6, amp: 0 };

  private cache = new Map<string, PC>();
  private focals = new Map<number | null, FocalInfo>();
  private finaleBands = new Map<string, { focal: FocalInfo; band: BandInfo }>();
  private focal: FocalInfo = NO_FOCAL;
  private band: BandInfo | null = null;
  /** 还没落的那一拳（形变走到 LAND_AT 时落）。 */
  private pendingLand: Land | null = null;
  /** 整组字的「先缩后弹」：t 从 0 走到 POP_DUR。 */
  private pop = { t: POP_DUR, squash: 0 };
  /** 指针悬停的那颗星（下标是这一年 stars 里的位置）。 */
  private hover: number | null = null;
  private projected = new THREE.Vector3();
  private years: RingYear[] = [];
  private selected: number | null = null;
  private finaleText = '';

  constructor(host: HTMLElement, options: EngineOptions = {}) {
    this.host = host;
    this.options = options;
    // Canvas: dpr [1, 1.75], high-performance, no AA / stencil (Scene.tsx).
    this.renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance', antialias: false, stencil: false, depth: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    // React Three Fiber 的默认：ACES 色调映射 + sRGB 输出。
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;outline:none;';
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    this.camera.position.set(0, 0, options.reducedMotion ? PHASE_DIST.three : INTRO_FAR);
    this.scene.background = new THREE.Color('#050510');
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // EffectComposer multisampling 0 + Bloom (luminanceThreshold .2, smoothing .85, intensity 1.25, mipmapBlur).
    this.composer = new EffectComposer(this.renderer, { multisampling: 0, frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new EffectPass(this.camera, new BloomEffect({ luminanceThreshold: 0.2, luminanceSmoothing: 0.85, intensity: 1.25, mipmapBlur: true })));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.6;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 130;

    // Pools.
    const gIdle = this.galaxyTarget('idle');
    const tIdle = this.textTarget('idle');
    const bg = generateBackgroundStars();
    this.gPos = new THREE.BufferAttribute(gIdle.pos.slice(), 3);
    this.gCol = new THREE.BufferAttribute(gIdle.col.slice(), 3);
    this.tPos = new THREE.BufferAttribute(tIdle.pos.slice(), 3);
    this.tCol = new THREE.BufferAttribute(tIdle.col.slice(), 3);
    this.gTargetPos = gIdle.pos; this.gTargetCol = gIdle.col;
    this.tTargetPos = tIdle.pos; this.tTargetCol = tIdle.col;
    this.gStartPos = gIdle.pos.slice(); this.gStartCol = gIdle.col.slice();
    this.tStartPos = tIdle.pos.slice(); this.tStartCol = tIdle.col.slice();

    const points = (pos: THREE.BufferAttribute, col: THREE.BufferAttribute, size: number, opacity: number) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', pos);
      geometry.setAttribute('color', col);
      const material = new THREE.PointsMaterial({ size, vertexColors: true, sizeAttenuation: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.Points(geometry, material);
      mesh.frustumCulled = false;
      return mesh;
    };
    this.bgGroup.add(points(new THREE.BufferAttribute(bg.pos, 3), new THREE.BufferAttribute(bg.col, 3), 0.09, 0.9));
    this.galaxyGroup.add(points(this.gPos, this.gCol, 0.16, 0.9));
    this.textGroup.add(points(this.tPos, this.tCol, 0.13, 0.95));
    this.scene.add(this.bgGroup, this.galaxyGroup, this.textGroup);

    if (options.reducedMotion) this.intro.active = false;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }

  // ----- targets (shapes.ts createTargets) -----
  private once(key: string, build: () => PC): PC {
    let v = this.cache.get(key);
    if (!v) { v = build(); this.cache.set(key, v); }
    return v;
  }

  private galaxyTarget(phase: Phase): PC {
    if (phase === 'idle') return this.once('g_idle', () => { const p = newPC(GALAXY_COUNT); fillIdle(p, GALAXY_COUNT); return p; });
    if (phase === 'finale') return this.once('g_fin', () => { const p = newPC(GALAXY_COUNT); fillStarfield(p, GALAXY_COUNT); return p; });
    return this.once('ambient', () => { const p = newPC(GALAXY_COUNT); fillAmbient(p, GALAXY_COUNT); return p; });
  }

  private textTarget(phase: Phase): PC {
    if (phase === 'three' || phase === 'two') {
      const year = String(this.selected ?? '');
      return this.once(`t_year_${year}`, () => { const p = newPC(TEXT_COUNT); fillDigit(year, p, TEXT_COUNT); return p; });
    }
    if (phase === 'shape') {
      return this.once(`t_rings_${this.selected}`, () => {
        const p = newPC(TEXT_COUNT);
        this.focals.set(this.selected, fillRings(p, TEXT_COUNT, this.years, this.selected));
        return p;
      });
    }
    if (phase === 'finale') {
      return this.once(`t_fin_${this.selected}_${this.finaleText}`, () => {
        const p = newPC(TEXT_COUNT);
        const { focal, band } = fillFinale(this.finaleText, p, TEXT_COUNT, this.years, this.selected);
        this.finaleBands.set(`${this.selected}_${this.finaleText}`, { focal, band });
        return p;
      });
    }
    return this.once('t_idle', () => { const p = newPC(TEXT_COUNT); fillIdle(p, TEXT_COUNT); return p; });
  }

  /** 换数据（年份列表、选中的那年、终幕的字）。缓存的年轮造型作废。 */
  setData(years: RingYear[], selected: number | null, finaleText: string) {
    if (years !== this.years) {
      for (const key of [...this.cache.keys()]) if (key.startsWith('t_rings_') || key.startsWith('t_fin_')) this.cache.delete(key);
      this.focals.clear();
      this.finaleBands.clear();
    }
    this.years = years;
    this.selected = selected;
    this.finaleText = finaleText;
  }

  get introActive() { return this.intro.active; }

  /** 飞入途中点了一下：不等了，下一帧就当飞到了（onIntroDone 进第一幕，镜头从近处拉回数字的距离）。 */
  skipIntro() {
    if (this.intro.active) this.intro.t = 1;
  }

  /** 进入一幕。`year` 第一次是 Lumina 的「3」，之后都是拳击式的「2」。 */
  setPhase(next: RingPhase) {
    const from = this.phase;
    const phase: Phase = next === 'year' ? (this.phase === 'idle' ? 'three' : 'two') : next;
    this.phase = phase;
    const g = this.galaxyTarget(phase), t = this.textTarget(phase);
    this.band = null;
    if (phase === 'shape') this.focal = this.focals.get(this.selected) ?? NO_FOCAL;
    else if (phase === 'finale') {
      const fin = this.finaleBands.get(`${this.selected}_${this.finaleText}`);
      this.focal = fin?.focal ?? NO_FOCAL;
      this.band = fin?.band ?? null;
    } else this.focal = NO_FOCAL;
    this.hover = null;
    // 落定的那一拳：数字聚拢、年轮成形时补上（换年的「2」自带整段拳击，终幕自带爆闪和 MEGA 冲击波）。
    this.pendingLand = phase === 'three' ? LAND.three : phase === 'shape' ? (from === 'finale' ? LAND.shapeBack : LAND.shapeIn) : null;
    this.gTargetPos = g.pos; this.gTargetCol = g.col;
    this.tTargetPos = t.pos; this.tTargetCol = t.col;
    this.gStartPos.set(this.gPos.array as Float32Array);
    this.gStartCol.set(this.gCol.array as Float32Array);
    this.tStartPos.set(this.tPos.array as Float32Array);
    this.tStartCol.set(this.tCol.array as Float32Array);
    this.morphT = 0;
    this.morphDur = DURATIONS[phase];

    // Shockwave at the start of the switch for the punch ('two') and the finale; 'three' and 'shape' get theirs when they land.
    if (phase === 'two') this.wave({ speed: WAVE_SPEED, amp: WAVE_AMP_DIGIT, width: WAVE_WIDTH, life: WAVE_LIFE });
    else if (phase === 'finale') this.wave(MEGA);
    if (phase === 'shape') this.charge = 0;
    if (phase === 'finale') {
      this.finaleT = 0;
      this.tVel.fill(0);
      this.burst = BURST_TIME;
      const gp = this.gPos.array as Float32Array;
      const gt = this.gTargetPos;
      for (let i = 0; i < GALAXY_COUNT; i++) {
        const ix = i * 3, iy = ix + 1, iz = ix + 2;
        const tl = Math.sqrt(gt[ix] * gt[ix] + gt[iy] * gt[iy] + gt[iz] * gt[iz]) + 1e-3;
        const far = 58 + Math.random() * 36;
        gp[ix] = (gt[ix] / tl) * far; gp[iy] = (gt[iy] / tl) * far; gp[iz] = (gt[iz] / tl) * far;
      }
      this.gVel.fill(0);
      this.gPos.needsUpdate = true;
    }
    this.directCamera(phase);
  }

  private wave(cfg: { speed: number; amp: number; width: number; life: number }) {
    let slot = this.waves.find(w => !w.active);
    if (!slot) { slot = this.waves[0]; for (const w of this.waves) if (w.t > slot.t) slot = w; }
    slot.t = 0; slot.active = true;
    slot.speed = cfg.speed; slot.amp = cfg.amp; slot.width = cfg.width; slot.life = cfg.life;
  }

  /** 落定的一拳：冲击波 + 镜头一抖 + 整组字先缩后弹。 */
  private land(cfg: Land) {
    this.wave({ speed: WAVE_SPEED, amp: cfg.wave, width: WAVE_WIDTH, life: WAVE_LIFE });
    if (!this.options.reducedMotion) {
      this.shake = { t: DIGIT_SHAKE.dur, dur: DIGIT_SHAKE.dur, amp: cfg.shake };
      this.pop = { t: 0, squash: cfg.squash };
    }
  }

  /** 重播：回到飞入。 */
  replay() {
    this.focal = NO_FOCAL;
    this.band = null;
    this.hover = null;
    this.pendingLand = null;
    this.phase = 'idle';
    this.setPhaseRaw('idle');
    this.intro = { active: !this.options.reducedMotion, t: 0 };
    if (this.intro.active) this.camera.position.set(0, 0, INTRO_FAR);
  }

  private setPhaseRaw(phase: Phase) {
    const g = this.galaxyTarget(phase), t = this.textTarget(phase);
    this.gTargetPos = g.pos; this.gTargetCol = g.col; this.tTargetPos = t.pos; this.tTargetCol = t.col;
    this.gStartPos.set(this.gPos.array as Float32Array); this.gStartCol.set(this.gCol.array as Float32Array);
    this.tStartPos.set(this.tPos.array as Float32Array); this.tStartCol.set(this.tCol.array as Float32Array);
    this.morphT = 0; this.morphDur = DURATIONS[phase];
  }

  // ----- CameraDirector (phase effect) -----
  private directCamera(phase: Phase) {
    if (this.intro.active && phase === 'idle') return;
    this.intro.active = false;
    if (phase === 'finale') this.shake = { t: FINALE_SHAKE.dur, dur: FINALE_SHAKE.dur, amp: FINALE_SHAKE.amp };
    else if (phase === 'two') this.shake = { t: DIGIT_SHAKE.dur, dur: DIGIT_SHAKE.dur, amp: DIGIT_SHAKE.amp };
    const target = this.controls.target;
    const dir = this.camera.position.clone().sub(target);
    const curDist = dir.length() || 1;
    dir.normalize();
    const to = PHASE_DIST[phase];
    if (Math.abs(curDist - to) < 0.5) return;
    const dur = phase === 'three' ? 1.6 : phase === 'finale' ? 2.2 : phase === 'idle' ? 2.6 : 1.5;
    const tw = this.tween;
    tw.dir.copy(phase === 'finale' ? FINALE_DIR : dir);
    tw.from = curDist; tw.to = to; tw.dur = dur; tw.t = 0; tw.active = true;
  }

  private stepCamera(d: number) {
    const controls = this.controls;
    const target = controls.target;
    if (this.intro.active) {
      controls.enabled = false;
      this.intro.t = Math.min(1, this.intro.t + d / INTRO_DUR);
      const dist = THREE.MathUtils.lerp(INTRO_FAR, INTRO_NEAR, easeInOutQuart(this.intro.t));
      this.camera.position.set(0, 0, dist);
      this.camera.lookAt(ORIGIN);
      if (this.intro.t >= 1) {
        this.intro.active = false;
        controls.enabled = true; controls.update();
        this.options.onIntroDone?.();
      }
      return;
    }
    const tw = this.tween;
    if (tw.active) {
      controls.enabled = false;
      tw.t = Math.min(1, tw.t + d / tw.dur);
      const dist = THREE.MathUtils.lerp(tw.from, tw.to, easeInOutCubic(tw.t));
      this.camera.position.copy(target).addScaledVector(tw.dir, dist);
      this.camera.lookAt(target);
      if (tw.t >= 1) { tw.active = false; controls.enabled = true; controls.update(); }
    }
    const sh = this.shake;
    if (sh.t > 0) {
      sh.t = Math.max(0, sh.t - d);
      const k = sh.t / sh.dur;
      const amp = k * k * sh.amp;
      if (tw.active) {
        this.camera.position.x += (Math.random() - 0.5) * amp;
        this.camera.position.y += (Math.random() - 0.5) * amp;
        this.camera.position.z += (Math.random() - 0.5) * amp * 0.5;
      } else if (sh.t > 0) {
        controls.target.set((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp * 0.5);
      } else {
        controls.target.set(0, 0, 0);
      }
    }
    if (controls.enabled) controls.update();
  }

  // ----- ParticleSystem useFrame -----
  private step(d: number, time: number) {
    const phase = this.phase;
    if (phase === 'shape') this.charge = Math.min(1, this.charge + d * 0.6);
    if (phase === 'finale') this.finaleT += d;
    const bursting = this.burst > 0;
    if (bursting) this.burst -= d;

    let morphActive = false;
    if (this.morphT < 1) { this.morphT = Math.min(1, this.morphT + d / this.morphDur); morphActive = true; }
    const landAt = LAND_AT[phase];
    if (this.pendingLand && landAt !== undefined && this.morphT >= landAt) { this.land(this.pendingLand); this.pendingLand = null; }
    // 终幕的光带：每帧把目标转一点，弹簧跟着走，就是在公转；朝镜头那半圈亮、背后那半圈暗。
    if (phase === 'finale' && this.band) placeBand(this.band, this.tTargetPos, this.tTargetCol, this.finaleT * BAND_SPEED);
    const isDigit = phase === 'three' || phase === 'two';
    const e = (phase === 'finale' || phase === 'three') ? easeOutCubic(this.morphT) : easeInOutCubic(this.morphT);

    const mt = this.morphT;
    let punchFire = 1, punchScale = 1;
    if (phase === 'two') {
      if (mt < PUNCH_BEAT) {
        const c = mt / PUNCH_BEAT;
        punchFire = 0;
        punchScale = 1 - PUNCH_CONTRACT * (c * c);
      } else {
        const r = (mt - PUNCH_BEAT) / (1 - PUNCH_BEAT);
        punchFire = easeOutBack(r);
        punchScale = (1 - PUNCH_CONTRACT) + PUNCH_CONTRACT * easeOutCubic(r);
      }
    }

    let waveCount = 0;
    const wl = this.waveScratch;
    for (const w of this.waves) {
      if (!w.active) continue;
      w.t += d;
      if (w.t >= w.life) { w.active = false; continue; }
      const env = 1 - w.t / w.life;
      const s = wl[waveCount++];
      s.radius = w.t * w.speed; s.amp = w.amp * env; s.glow = env; s.width = w.width;
    }
    const waveActive = waveCount > 0;

    const stepPool = (posAttr: THREE.BufferAttribute, colAttr: THREE.BufferAttribute, target: Float32Array, targetCol: Float32Array,
      startPos: Float32Array, startCol: Float32Array, vel: Float32Array, count: number, isText: boolean) => {
      const ambSound = !isText && isDigit;
      const digitPunch = isText && phase === 'two';
      const active = bursting || morphActive || phase === 'finale' || (isText && phase === 'shape') || waveActive || ambSound;
      if (!active) return;
      const pos = posAttr.array as Float32Array;
      const col = colAttr.array as Float32Array;

      for (let i = 0; i < count; i++) {
        const ix = i * 3, iy = ix + 1, iz = ix + 2;
        if (phase === 'finale') {
          const stiff = isText ? FIN_TEXT_STIFF : FIN_GAL_STIFF;
          const damp = isText ? FIN_TEXT_DAMP : FIN_GAL_DAMP;
          const ax = (target[ix] - pos[ix]) * stiff - vel[ix] * damp;
          const ay = (target[iy] - pos[iy]) * stiff - vel[iy] * damp;
          const az = (target[iz] - pos[iz]) * stiff - vel[iz] * damp;
          vel[ix] += ax * d; vel[iy] += ay * d; vel[iz] += az * d;
          pos[ix] += vel[ix] * d; pos[iy] += vel[iy] * d; pos[iz] += vel[iz] * d;
        } else if (digitPunch) {
          const bx = startPos[ix] + (target[ix] - startPos[ix]) * punchFire;
          const by = startPos[iy] + (target[iy] - startPos[iy]) * punchFire;
          const bz = startPos[iz] + (target[iz] - startPos[iz]) * punchFire;
          pos[ix] = bx * punchScale; pos[iy] = by * punchScale; pos[iz] = bz * punchScale;
        } else {
          pos[ix] = startPos[ix] + (target[ix] - startPos[ix]) * e;
          pos[iy] = startPos[iy] + (target[iy] - startPos[iy]) * e;
          pos[iz] = startPos[iz] + (target[iz] - startPos[iz]) * e;
        }

        col[ix] = startCol[ix] + (targetCol[ix] - startCol[ix]) * e;
        col[iy] = startCol[iy] + (targetCol[iy] - startCol[iy]) * e;
        col[iz] = startCol[iz] + (targetCol[iz] - startCol[iz]) * e;

        if (isText && phase === 'three' && morphActive) {
          const emerge = Math.min(1, this.morphT * 2);
          col[ix] *= emerge; col[iy] *= emerge; col[iz] *= emerge;
        }

        if (ambSound) {
          const px = pos[ix], py = pos[iy], pz = pos[iz];
          const dist = Math.sqrt(px * px + py * py + pz * pz) + 1e-3;
          const wave = Math.sin(time * SND_FREQ - dist * SND_K);
          const inv = (SND_AMP * wave) / dist;
          pos[ix] = px + px * inv; pos[iy] = py + py * inv; pos[iz] = pz + pz * inv;
          const g = 1 + SND_GLOW * (0.5 + 0.5 * wave);
          col[ix] *= g; col[iy] *= g; col[iz] *= g;
        }

        if (bursting) {
          const f = this.burst / BURST_TIME;
          const w = f * f * 2.6;
          col[ix] += w; col[iy] += w * 0.9; col[iz] += w * 0.7;
        }

        if (phase === 'finale' && !bursting && isText) {
          const sweep = this.finaleT - BURST_TIME;
          if (sweep > 0 && sweep < 1.8) {
            const sweepX = -22 + (sweep / 1.8) * 44;
            const dx = target[ix] - sweepX;
            const b = Math.exp(-dx * dx * 0.05) * 2.4;
            col[ix] += b; col[iy] += b * 0.96; col[iz] += b * 0.72;
          }
        }

        if (phase === 'finale' && !bursting && !isText) {
          const tw = 0.72 + 0.40 * Math.sin(time * 1.6 + i * 1.7);
          col[ix] *= tw; col[iy] *= tw; col[iz] *= tw;
        }

        if (waveActive && !bursting && !(isText && (phase === 'finale' || isDigit))) {
          const px = pos[ix], py = pos[iy], pz = pos[iz];
          const dist = Math.sqrt(px * px + py * py + pz * pz) + 1e-3;
          let push = 0, glow = 0;
          for (let w = 0; w < waveCount; w++) {
            const s = wl[w];
            const x = (dist - s.radius) / s.width;
            if (x > -1.4 && x < 1.4) {
              const bump = 1 - x * x * 0.51;
              if (bump > 0) { push += s.amp * bump; glow += s.glow * bump; }
            }
          }
          if (push !== 0) {
            const inv = push / dist;
            pos[ix] = px + px * inv; pos[iy] = py + py * inv; pos[iz] = pz + pz * inv;
          }
          if (glow > 0) {
            const g = 1 + glow * 2.0;
            col[ix] *= g; col[iy] *= g; col[iz] *= g;
          }
        }
      }

      // Focal light (Lumina 的蜡烛火焰 → 这一年的每次运动)：充能、闪烁、轻轻摇曳；其余的切片随之微微发亮。
      if (phase === 'shape' && isText) {
        const focal = this.focal;
        const hoverFrom = this.hover === null ? -1 : this.hover * focal.per;
        const hoverTo = this.hover === null ? -1 : this.hover === focal.stars - 1 ? focal.count : hoverFrom + focal.per;
        const sway = (Math.sin(time * 2.6) * 0.35 + Math.sin(time * 5.3) * 0.12) * 0.25;
        for (let i = 0; i < focal.count; i++) {
          // 每颗星自己的节拍（Lumina 一支蜡烛用同一个 7 Hz；这里几百颗，同拍会像频闪）。
          const pulse = 0.55 + 0.45 * Math.sin(time * 7 + (i % 97) * 0.61);
          const lit = hoverFrom <= i && i < hoverTo ? 2.6 : 1;
          const k = (0.6 + 3.2 * this.charge * pulse) * lit;
          pos[i * 3] += sway;
          col[i * 3] = Math.min(2.8 * lit, focal.base[i * 3] * k);
          col[i * 3 + 1] = Math.min(2.4 * lit, focal.base[i * 3 + 1] * k);
          col[i * 3 + 2] = Math.min(1.6 * lit, focal.base[i * 3 + 2] * k);
        }
        const glow = 1 + 0.10 * (0.5 + 0.5 * Math.sin(time * 2.6));
        for (let i = focal.count; i < count; i++) {
          col[i * 3] *= glow; col[i * 3 + 1] *= glow; col[i * 3 + 2] *= glow;
        }
      }

      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    };

    stepPool(this.gPos, this.gCol, this.gTargetPos, this.gTargetCol, this.gStartPos, this.gStartCol, this.gVel, GALAXY_COUNT, false);
    stepPool(this.tPos, this.tCol, this.tTargetPos, this.tTargetCol, this.tStartPos, this.tStartCol, this.tVel, TEXT_COUNT, true);

    // Text group orientation: idle spins with the starfield, digits billboard, rings / finale stay world-space.
    const t = this.textGroup;
    if (phase === 'idle') {
      t.rotation.x = 0; t.rotation.z = 0;
      t.rotation.y += IDLE_SPIN;
    } else {
      t.quaternion.slerp(isDigit ? this.camera.quaternion : IDENTITY_Q, 0.15);
    }

    // 落定的那一拳：整组字先缩一下，再弹回来过冲一点点。
    if (this.pop.t < POP_DUR) {
      this.pop.t = Math.min(POP_DUR, this.pop.t + d);
      const k = this.pop.t / POP_DUR;
      const scale = k < POP_CONTRACT
        ? 1 - this.pop.squash * Math.sin((k / POP_CONTRACT) * Math.PI / 2)
        : 1 - this.pop.squash + this.pop.squash * easeOutBack((k - POP_CONTRACT) / (1 - POP_CONTRACT));
      t.scale.setScalar(scale);
    } else if (t.scale.x !== 1) t.scale.setScalar(1);

    const g = this.galaxyGroup;
    g.rotation.x += (0 - g.rotation.x) * (phase === 'finale' ? 0.04 : 0.05);
    g.rotation.y += phase === 'idle' ? IDLE_SPIN : 0.0009;

    this.bgGroup.rotation.y += 0.0002;
  }

  private loop = () => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.loop);
    const d = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.getElapsedTime();
    this.step(d, time);
    this.stepCamera(d);
    this.composer.render(d);
  };

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    this.frame = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  /** 指针下最近的那颗星（屏幕上 14px 以内），只在年轮这一幕、形变走完以后才认。返回这一年 stars 里的下标。 */
  pickStar(clientX: number, clientY: number): number | null {
    const focal = this.focal;
    if (this.phase !== 'shape' || this.morphT < 0.9 || !focal.stars) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.textGroup.updateMatrixWorld();
    const v = this.projected;
    let best: number | null = null, bestD = 14 * 14;
    for (let j = 0; j < focal.stars; j++) {
      v.set(focal.centers[j * 3], focal.centers[j * 3 + 1], focal.centers[j * 3 + 2]).applyMatrix4(this.textGroup.matrixWorld).project(this.camera);
      if (v.z > 1) continue;
      const x = rect.left + (v.x + 1) / 2 * rect.width, y = rect.top + (1 - v.y) / 2 * rect.height;
      const dd = (x - clientX) ** 2 + (y - clientY) ** 2;
      if (dd < bestD) { bestD = dd; best = j; }
    }
    return best;
  }

  /** 这颗星此刻在屏幕上的位置（卡片从这里长出来）。 */
  starPoint(index: number): { x: number; y: number } | null {
    const focal = this.focal;
    if (index < 0 || index >= focal.stars) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.textGroup.updateMatrixWorld();
    const v = this.projected.set(focal.centers[index * 3], focal.centers[index * 3 + 1], focal.centers[index * 3 + 2])
      .applyMatrix4(this.textGroup.matrixWorld).project(this.camera);
    return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
  }

  /** 悬停的那颗星亮起来（null = 都不亮）。 */
  setHover(index: number | null) { this.hover = index; }

  private resize() {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * 截一帧：临时把画布设成 `width × height`（像素比 1）渲染一帧，同一个任务里拷到一张 2D 画布上，再还原。
   * 原始数据不出本机——拷走的只是像素。
   */
  capture(width: number, height: number): HTMLCanvasElement {
    const out = document.createElement('canvas');
    out.width = width; out.height = height;
    const ratio = this.renderer.getPixelRatio();
    const aspect = this.camera.aspect;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.composer.render(0);
    out.getContext('2d')?.drawImage(this.renderer.domElement, 0, 0, width, height);
    this.renderer.setPixelRatio(ratio);
    this.camera.aspect = aspect;
    this.resize();
    return out;
  }

  dispose() {
    this.stop();
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.scene.traverse(object => {
      if (object instanceof THREE.Points) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); }
    });
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

}
