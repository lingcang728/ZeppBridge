/** GPU particle stage. Buffers upload on scene changes; frames update uniforms only. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BloomEffect, EffectComposer, EffectPass, RenderPass } from 'postprocessing';
import { fillAmbient, fillScreenDigit, fillFinale, fillIdle, fillRings, fillStarfield, generateBackgroundStars, newPC, NO_FOCAL, type PC, type FocalInfo, type BandInfo } from './shapes';
import { particlePool, retarget, type ParticlePool } from './particles';
import { BandLayout, bandPoint } from './bandLayout';
import { motionTier, down, saveTier, tierFromFrames, type MotionTier } from '../../motion/tier';
import type { RingYear } from '../../../types/rings';

export type RingPhase = 'idle' | 'year' | 'shape' | 'finale';
export interface EngineOptions { reducedMotion?: boolean; onIntroDone?: () => void; onLand?: (phase: RingPhase) => void }
const BUDGET = { high: [9000, 6000, 2600, 2.5], mid: [6000, 4000, 1800, 1.75], low: [3500, 2500, 1000, 1.25] } as const;
/* 节奏照 Lumina（用户 2026-10-27：太快、要参照 Lumina）：飞入 3.4 秒、换场 1.4–1.6 秒、运镜 1.6–2.2 秒，
   都是 ease-in-out——以前飞入 1.5 秒、换场 0.6–0.9 秒、全用 ease-out，一下就冲到位。 */
const DURATION = { idle: 1.5, year: 1.6, shape: 1.6, finale: 1.4 };
const INTRO = { from: 110, to: 34, seconds: 3.4, cue: 2.5 };
const inOutQuart = (t: number) => (t < .5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);
const inOutCubic = (t: number) => (t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

export class RingsLuminaEngine {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloomPass: EffectPass;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, .1, 500);
  private controls: OrbitControls;
  private resizeObserver: ResizeObserver;
  private text: ParticlePool;
  private galaxy: ParticlePool;
  private background: ParticlePool;
  private tier: MotionTier = motionTier.value;
  private baseBudget = BUDGET[this.tier];
  private cache = new Map<string, { pc: PC; focal?: FocalInfo; band?: BandInfo }>();
  private glyphCache = new Map<string, THREE.CanvasTexture>();
  private glyphs = new THREE.Group();
  private glyphText = '';
  private bandLayout = new BandLayout();
  private glyphView = new THREE.Vector3();
  private focal = NO_FOCAL;
  private phase: RingPhase = 'idle';
  private selected: number | null = null;
  private years: RingYear[] = [];
  private finaleText = '';
  private intro = true;
  private introTime = 0;
  private introNotified = false;
  private elapsed = 0;
  private morph = 1;
  private duration = 1;
  private phaseTime = 0;
  private landed = true;
  private punch = false;
  private compiled = false;
  private idleBuild = 0;
  private shake = 0;
  private running = false;
  private frame = 0;
  private last = 0;
  private samples: number[] = [];
  private measured = false;
  private hover: number | null = null;
  private focused: number | null = null;
  private focusStart = 0;
  private focusFrom = new THREE.Vector3();
  private focusTo = new THREE.Vector3();
  private focusCameraFrom = new THREE.Vector3();
  private focusCameraTo = new THREE.Vector3();
  private cameraRest = new THREE.Vector3();
  private targetRest = new THREE.Vector3();
  private focusing = false;
  private cameraTween: { from: THREE.Vector3; to: THREE.Vector3; elapsed: number; duration: number } | null = null;
  private vector = new THREE.Vector3();

  constructor(private host: HTMLElement, private options: EngineOptions = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, stencil: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.baseBudget[3]));
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;outline:none';
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#050510');
    this.camera.position.set(0, 0, options.reducedMotion ? INTRO.to : INTRO.from);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = !options.reducedMotion;
    this.controls.dampingFactor = .14;
    this.controls.rotateSpeed = .8;
    this.controls.minDistance = 24;
    this.controls.maxDistance = 90;
    const idle = (count: number) => { const pc = newPC(count); fillIdle(pc, count); return pc; };
    this.text = particlePool(idle(this.baseBudget[0]), .22);
    this.galaxy = particlePool(idle(this.baseBudget[1]), .16);
    this.background = particlePool(generateBackgroundStars(this.baseBudget[2]), 1.7, true);
    this.scene.add(this.text, this.galaxy, this.background, this.glyphs);
    this.composer = new EffectComposer(this.renderer, { multisampling: 0, frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new EffectPass(this.camera, new BloomEffect({ intensity: .65, luminanceThreshold: .6, luminanceSmoothing: .25, mipmapBlur: true, resolutionScale: .5 }));
    this.composer.addPass(this.bloomPass);
    this.intro = !options.reducedMotion;
    this.applyTier();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }

  private target(phase: RingPhase) {
    const key = `${phase}:${this.selected}:${phase === 'finale' ? this.finaleText : ''}`;
    let cached = this.cache.get(key);
    if (!cached) {
      const pc = newPC(this.baseBudget[0]);
      if (phase === 'year') {
        const worldHeight = 2 * 34 * Math.tan(Math.PI / 6);
        const worldWidth = worldHeight / Math.max(1, this.host.clientHeight) * Math.min(this.host.clientWidth * .88, 640);
        fillScreenDigit(String(this.selected ?? ''), pc, this.baseBudget[0], getComputedStyle(this.host).getPropertyValue('--font-mono').trim() || 'monospace', worldWidth);
      }
      else if (phase === 'shape') cached = { pc, focal: fillRings(pc, this.baseBudget[0], this.years, this.selected) };
      else if (phase === 'finale') cached = { pc, ...fillFinale(this.finaleText, pc, this.baseBudget[0], this.years, this.selected) };
      else fillIdle(pc, this.baseBudget[0]);
      cached ??= { pc };
      this.cache.set(key, cached);
    }
    return cached;
  }

  setData(years: RingYear[], selected: number | null, finaleText: string) {
    if (years !== this.years) this.cache.clear();
    this.years = years; this.selected = selected; this.finaleText = finaleText;
    // 换年份时只同步生成马上要用的年份数字；年轮和终幕放到空闲时再算（Lumina 的 prebuildRest）——
    // 三样一起算要占主线程上百毫秒，切年份那一下卡住就是它。真等不及要用时 target() 会当场补算。
    this.target('year');
    this.makeGlyphs();
    if (!this.compiled) { this.compiled = true; this.renderer.compile(this.scene, this.camera); }
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 120));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    cancel(this.idleBuild);
    this.idleBuild = idle(() => { this.target('shape'); this.idleBuild = idle(() => { this.target('finale'); }); });
  }

  get introActive() { return this.intro; }
  private preparation = 1;
  /** Respond before the year label's short exit has finished. */
  prepare() { this.preparation = 0; }
  skipIntro() { if (this.intro) this.introTime = INTRO.seconds; }
  setPhase(phase: RingPhase) {
    if (this.focused !== null) this.focusStar(null);
    const previous = this.phase;
    this.phase = phase;
    const target = this.target(phase);
    // A moving band needs its current positions baked only on interruption.
    if (previous === 'finale') {
      const attr = this.text.geometry.getAttribute('destination') as THREE.BufferAttribute;
      const b = this.text.geometry.getAttribute('band');
      const start = this.text.material.uniforms.bandStart.value;
      for (let i = start; i < attr.count; i++) {
        const a = b.getX(i) + this.phaseTime * .16, r = b.getZ(i), y = b.getY(i), z = r * Math.cos(a);
        attr.setXYZ(i, r * Math.sin(a), y * Math.cos(.26) - z * Math.sin(.26), y * Math.sin(.26) + z * Math.cos(.26));
      }
    }
    retarget(this.text, target.pc);
    this.focal = target.focal ?? NO_FOCAL;
    const band = this.text.geometry.getAttribute('band') as THREE.BufferAttribute;
    if (target.band) {
      for (let i = 0; i < target.band.theta.length; i++) band.setXYZ(i + target.band.start, target.band.theta[i], target.band.h[i], target.band.r[i]);
      band.needsUpdate = true;
    }
    this.text.material.uniforms.bandStart.value = target.band?.start ?? 1e9;
    const galaxy = newPC(this.baseBudget[1]);
    if (phase === 'finale') fillStarfield(galaxy, this.baseBudget[1]);
    else if (phase === 'idle') fillIdle(galaxy, this.baseBudget[1]);
    else fillAmbient(galaxy, this.baseBudget[1]);
    retarget(this.galaxy, galaxy);
    this.hover = null; this.morph = 0; this.phaseTime = 0; this.landed = false;
    this.punch = phase === 'year' && previous === 'year' && !this.options.reducedMotion;
    this.text.material.uniforms.punch.value = this.punch ? 1 : 0;
    this.duration = phase === 'year' && this.intro ? 1.4 : this.punch ? 1.5 : DURATION[phase];
    this.shake = phase === 'finale' ? 1.02 : this.punch ? .3 : 0;
    if (!this.intro) {
      const from = this.camera.position.clone();
      const to = phase === 'year' ? new THREE.Vector3(0, 0, 34) : from.clone().sub(this.controls.target).normalize().multiplyScalar(phase === 'finale' ? 40 : 34).add(this.controls.target);
      if (phase === 'year') this.controls.target.set(0, 0, 0);
      this.cameraTween = { from, to, elapsed: 0, duration: phase === 'finale' ? 2.2 : 1.6 };
    }
    if (this.options.reducedMotion) {
      this.morph = 1; this.phaseTime = 10; this.shake = 0;
      if (this.cameraTween) this.camera.position.copy(this.cameraTween.to);
      this.cameraTween = null; this.landed = true; this.options.onLand?.(phase);
      this.update(0);
    }
  }

  replay() {
    this.focusStar(null); this.setPhase('idle'); this.intro = !this.options.reducedMotion;
    this.introTime = 0; this.introNotified = false;
    this.cameraTween = null; this.controls.target.set(0, 0, 0);
    this.camera.position.set(0, 0, this.intro ? INTRO.from : INTRO.to);
  }

  private makeGlyphs() {
    if (this.glyphText === this.finaleText) return;
    this.glyphText = this.finaleText;
    for (const child of [...this.glyphs.children]) { (child as THREE.Sprite).material.dispose(); this.glyphs.remove(child); }
    const chars = Array.from(`${this.finaleText}  ·  ${this.finaleText}  ·  `);
    chars.forEach((char, index) => {
      if (!char.trim()) return;
      let texture = this.glyphCache.get(char);
      if (!texture) {
        const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 192;
        const ctx = canvas.getContext('2d')!;
        ctx.font = '600 128px "MiSans", "Microsoft YaHei", sans-serif';
        ctx.fillStyle = '#ffe6ac'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(char, 96, 98);
        texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
        this.glyphCache.set(char, texture);
      }
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
      sprite.userData.turn = index / chars.length;
      this.glyphs.add(sprite);
    });
  }

  private update(d: number) {
    this.elapsed += d;
    if (this.intro) {
      this.introTime += d;
      this.camera.position.set(0, 0, INTRO.from + (INTRO.to - INTRO.from) * inOutQuart(Math.min(1, this.introTime / INTRO.seconds)));
      if (this.introTime >= INTRO.cue && !this.introNotified) { this.introNotified = true; this.options.onIntroDone?.(); }
      if (this.introTime >= INTRO.seconds) this.intro = false;
    }
    if (this.focused === null) this.phaseTime += d;
    this.preparation += d;
    this.morph = Math.min(1, this.morph + d / this.duration);
    // 落定：形状基本成形才算（ease-in-out 到 0.7 时已走了九成；收—弹要等弹出来以后）。
    if (!this.landed && this.morph >= (this.punch ? .86 : .7)) { this.landed = true; this.options.onLand?.(this.phase); }
    const phase = ['idle', 'year', 'shape', 'finale'].indexOf(this.phase);
    for (const pool of [this.text, this.galaxy, this.background]) {
      const u = pool.material.uniforms;
      u.time.value = this.elapsed; u.progress.value = pool === this.background ? 1 : this.morph;
      u.phase.value = pool === this.background ? 0 : phase;
      u.waveTime.value = this.phaseTime - (this.phase === 'shape' ? this.duration * .45 : 0);
      if (u.waveTime.value < 0) u.waveTime.value = 10;
      u.waveAmp.value = this.phase === 'shape' ? .7 : 1.1;
      u.phi.value = this.options.reducedMotion ? 0 : this.phaseTime * .16;
      // 年份就是这团粒子本身（用户 2026-10-27：不要实体字），不再压暗给一层清晰字垫底。
      u.brightness.value = 1;
      u.reduced.value = this.options.reducedMotion ? 1 : 0;
    }
    const u = this.text.material.uniforms;
    u.focalCount.value = this.focal.count;
    this.galaxy.material.uniforms.focalCount.value = -1;
    u.hoverRange.value.set(this.hover === null ? -1 : this.hover * this.focal.per, this.hover === null ? -1 : Math.min(this.focal.count, (this.hover + 1) * this.focal.per));
    const reduced = this.options.reducedMotion;
    const prep = this.preparation < .08 ? .03 * (1 - this.preparation / .08) : 0;
    const hitTime = this.phaseTime - this.duration * (this.punch ? .86 : .7);
    const squash = hitTime >= 0 && hitTime < .24 ? .05 * Math.sin(Math.PI * hitTime / .24) : 0;
    this.text.scale.setScalar(reduced ? 1 : 1 - prep - squash);
    if (this.phase === 'year') this.text.quaternion.copy(this.camera.quaternion);
    else this.text.quaternion.identity();
    if (!reduced && this.focused === null) { this.galaxy.rotation.y += d * .025; this.background.rotation.y += d * .008; }
    const tw = this.cameraTween;
    if (tw && !this.intro && this.focused === null) {
      tw.elapsed += d; this.camera.position.lerpVectors(tw.from, tw.to, inOutCubic(Math.min(1, tw.elapsed / tw.duration)));
      if (tw.elapsed >= tw.duration) this.cameraTween = null;
    }
    if (this.focusing) {
      this.focusStart += d;
      const p = reduced ? 1 : inOutCubic(Math.min(1, this.focusStart / .8));
      this.controls.target.lerpVectors(this.focusFrom, this.focusTo, p);
      this.camera.position.lerpVectors(this.focusCameraFrom, this.focusCameraTo, p);
      if (p >= 1) this.focusing = false;
    }
    this.controls.enabled = this.phase !== 'year' && !this.intro && !this.cameraTween && this.focused === null && !this.focusing;
    this.controls.update();
    if (!reduced && this.shake && this.phaseTime < .4 && this.focused === null) {
      this.camera.position.x += Math.sin(this.phaseTime * 93) * this.shake * .1 * (1 - this.phaseTime / .4);
    }
    this.camera.lookAt(this.controls.target);
    this.glyphs.visible = this.phase === 'finale';
    if (this.glyphs.visible) {
      this.camera.updateMatrixWorld();
      this.bandLayout.update(this.camera);
      const facing = this.vector.copy(this.camera.position).normalize();
      const pixels = this.host.clientHeight / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
      this.glyphs.children.forEach(child => {
        const sprite = child as THREE.Sprite;
        const angle = this.bandLayout.angle(sprite.userData.turn + (reduced ? 0 : this.phaseTime * .16 / (Math.PI * 2)));
        bandPoint(angle, sprite.position);
        const front = sprite.position.dot(facing) / sprite.position.length();
        // At the tangent, adjacent billboards project onto each other. Ease them
        // into the dim back half instead of making both edge stacks fully bright.
        const near = THREE.MathUtils.smoothstep(front, .08, .65);
        sprite.material.opacity = (.2 + .8 * near) * Math.min(1, this.morph * 2);
        // 128px glyph in a 192px texture: keep the effective font at 16–24 CSS
        // pixels even at the far side of the orbit, without magnifying near text.
        const depth = -this.glyphView.copy(sprite.position).applyMatrix4(this.camera.matrixWorldInverse).z;
        sprite.scale.setScalar((24 + 12 * near) * depth / Math.max(1, pixels));
      });
    }
  }

  focusStar(index: number | null) {
    if (index === this.focused) return;
    if (index !== null) {
      this.cameraRest.copy(this.camera.position); this.targetRest.copy(this.controls.target);
      this.focusTo.set(this.focal.centers[index * 3], this.focal.centers[index * 3 + 1], this.focal.centers[index * 3 + 2]).multiplyScalar(.08);
      this.focusCameraTo.copy(this.camera.position).sub(this.controls.target).multiplyScalar(.92).add(this.focusTo);
    } else {
      this.focusTo.copy(this.targetRest); this.focusCameraTo.copy(this.cameraRest);
    }
    this.focusFrom.copy(this.controls.target); this.focusCameraFrom.copy(this.camera.position);
    this.focused = index; this.hover = index; this.focusStart = 0; this.focusing = true; this.cameraTween = null;
  }
  setHover(index: number | null) { this.hover = index; }
  starPoint(index: number): { x: number; y: number } | null {
    if (index < 0 || index >= this.focal.stars) return null;
    const box = this.renderer.domElement.getBoundingClientRect();
    this.text.updateMatrixWorld();
    this.vector.set(this.focal.centers[index * 3], this.focal.centers[index * 3 + 1], this.focal.centers[index * 3 + 2]).applyMatrix4(this.text.matrixWorld).project(this.camera);
    return { x: box.left + (this.vector.x + 1) * box.width / 2, y: box.top + (1 - this.vector.y) * box.height / 2 };
  }
  pickStar(x: number, y: number): number | null {
    if (this.phase !== 'shape' || this.morph < .9 || this.focused !== null) return null;
    let best: number | null = null, distance = 196;
    for (let i = 0; i < this.focal.stars; i++) {
      const p = this.starPoint(i)!;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < distance) { distance = d; best = i; }
    }
    return best;
  }

  private applyTier() {
    const budget = BUDGET[this.tier];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, budget[3]));
    this.bloomPass.enabled = this.tier !== 'low';
    [this.text, this.galaxy, this.background].forEach((pool, i) => {
      pool.material.uniforms.dpr.value = this.renderer.getPixelRatio();
      pool.material.uniforms.density.value = budget[i] / this.baseBudget[i];
    });
    this.host.dataset.ringsTier = this.tier;
  }
  private render(d: number) { if (this.tier === 'low') this.renderer.render(this.scene, this.camera); else this.composer.render(d); }
  private loop = (now: number) => {
    if (!this.running) return;
    const ms = this.last ? now - this.last : 16.67; this.last = now;
    const d = Math.min(ms / 1000, .1);
    this.update(d); this.render(d);
    if (!this.measured) {
      this.samples.push(ms);
      if (this.samples.reduce((sum, value) => sum + value, 0) >= 2000) {
        this.measured = true;
        if (tierFromFrames(this.samples, this.tier) !== this.tier) {
          this.tier = down(this.tier); motionTier.value = this.tier; saveTier(this.tier); this.applyTier(); this.resize();
        }
      }
    }
    this.frame = requestAnimationFrame(this.loop);
  };
  start() { if (!this.running) { this.running = true; this.last = 0; this.frame = requestAnimationFrame(this.loop); } }
  stop() { this.running = false; cancelAnimationFrame(this.frame); }
  private resize() {
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false); this.composer.setSize(width, height, false);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    for (const key of this.cache.keys()) if (key.startsWith('year:')) this.cache.delete(key);
    if (this.phase === 'year' && this.morph === 1) {
      retarget(this.text, this.target('year').pc);
      this.text.material.uniforms.progress.value = 1;
    }
  }
  capture(width: number, height: number) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ratio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1); this.renderer.setSize(width, height, false); this.composer.setSize(width, height, false);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.render(0);
    canvas.getContext('2d')?.drawImage(this.renderer.domElement, 0, 0, width, height);
    this.renderer.setPixelRatio(ratio); this.resize(); return canvas;
  }
  dispose() {
    this.stop(); this.resizeObserver.disconnect(); this.controls.dispose();
    (window.cancelIdleCallback ?? window.clearTimeout)(this.idleBuild);
    [this.text, this.galaxy, this.background].forEach(pool => { pool.geometry.dispose(); pool.material.dispose(); });
    this.glyphs.children.forEach(sprite => (sprite as THREE.Sprite).material.dispose());
    this.glyphCache.forEach(texture => texture.dispose());
    this.composer.dispose(); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
