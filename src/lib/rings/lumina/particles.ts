import * as THREE from 'three';
import type { PC } from './shapes';

/* 形变的节奏照 Lumina：普通换场是 ease-in-out（起步、收尾都缓）；年份换年份是它倒数里那一下「收—弹」：
   前四成旧数字往中心缩、新数字还没动，后六成新数字带一点过冲弹出来、缩放回到 1。着色器里同一套公式。 */
const PUNCH_BEAT = .4, PUNCH_CONTRACT = .55;
const inOutCubic = (t: number) => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const outBack = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
/** 进度 → [起点到终点的插值, 整体缩放]。 */
export function morphAt(progress: number, punch: boolean): [number, number] {
  if (!punch) return [inOutCubic(progress), 1];
  if (progress < PUNCH_BEAT) { const c = progress / PUNCH_BEAT; return [0, 1 - PUNCH_CONTRACT * c * c]; }
  const r = (progress - PUNCH_BEAT) / (1 - PUNCH_BEAT);
  return [outBack(r), 1 - PUNCH_CONTRACT + PUNCH_CONTRACT * (1 - (1 - r) ** 3)];
}

/** Position/color buffers change only when a scene changes. All continuous effects run on the GPU. */
export function particlePool(data: PC, size: number, background = false) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.pos.slice(), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(data.col.slice(), 3));
  geometry.setAttribute('destination', new THREE.BufferAttribute(data.pos.slice(), 3));
  geometry.setAttribute('destinationColor', new THREE.BufferAttribute(data.col.slice(), 3));
  geometry.setAttribute('band', new THREE.BufferAttribute(new Float32Array(data.pos.length), 3));
  geometry.setAttribute('particleIndex', new THREE.BufferAttribute(Float32Array.from({ length: data.pos.length / 3 }, (_, i) => i), 1));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      progress: { value: 1 }, time: { value: 0 }, size: { value: size }, dpr: { value: 1 },
      phase: { value: 0 }, focalCount: { value: 0 }, hoverRange: { value: new THREE.Vector2(-1, -1) },
      waveTime: { value: 10 }, waveAmp: { value: 0 }, bandStart: { value: 1e9 }, phi: { value: 0 },
      brightness: { value: 1 }, background: { value: background ? 1 : 0 }, density: { value: 1 }, reduced: { value: 0 }, punch: { value: 0 },
    },
    vertexShader: `
      attribute vec3 destination;
      attribute vec3 destinationColor;
      attribute vec3 color;
      attribute vec3 band;
      attribute float particleIndex;
      uniform float progress, time, size, dpr, phase, focalCount, waveTime, waveAmp, bandStart, phi, brightness, background, density, reduced, punch;
      uniform vec2 hoverRange;
      varying vec3 tint;
      void main() {
        vec3 goal = destination;
        if (phase > 2.5 && particleIndex >= bandStart) {
          float a = band.x + phi;
          vec3 p = vec3(band.z * sin(a), band.y, band.z * cos(a));
          goal = vec3(p.x, p.y * cos(.26) - p.z * sin(.26), p.y * sin(.26) + p.z * cos(.26));
        }
        float e, s = 1.0;
        if (punch > .5) {
          if (progress < .4) { float c = progress / .4; e = 0.0; s = 1.0 - .55 * c * c; }
          else { float r = (progress - .4) / .6; float q = r - 1.0; e = 1.0 + 2.70158 * q * q * q + 1.70158 * q * q; s = .45 + .55 * (1.0 - pow(1.0 - r, 3.0)); }
        } else {
          e = progress < .5 ? 4.0 * progress * progress * progress : 1.0 - pow(-2.0 * progress + 2.0, 3.0) / 2.0;
        }
        vec3 p = mix(position, goal, e) * s;
        tint = mix(color, destinationColor, clamp(e, 0.0, 1.0)) * brightness;
        float radius = length(p) + .001;
        if (reduced < .5 && background < .5) {
          if (waveTime < 1.1 && phase > 1.5) {
            float bump = max(0.0, 1.0 - pow((radius - waveTime * 42.0) / 8.0, 2.0));
            p += normalize(p) * bump * waveAmp * (1.0 - waveTime / 1.1);
            tint *= 1.0 + bump * .18;
          }
          if (phase > .5 && phase < 1.5) {
            float sound = sin(time * 4.0 - radius * .42);
            if (focalCount < 0.0) p += normalize(p) * sound * .3;
          }
          if (particleIndex < focalCount && phase > 1.5 && phase < 2.5) {
            float pulse = .85 + .3 * sin(time * 3.0 + particleIndex * .61);
            if (particleIndex >= hoverRange.x && particleIndex < hoverRange.y) pulse *= 1.6;
            tint *= pulse;
          }
          if (phase > 2.5 && waveTime < .62) tint += vec3(.8, .72, .56) * pow(1.0 - waveTime / .62, 2.0);
        }
        if (phase > 2.5 && particleIndex >= bandStart) tint *= .18;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float pixels = background > .5 ? size : size * 300.0 / max(1.0, -mv.z);
        gl_PointSize = clamp(pixels, 1.0, 7.0) * dpr;
        if (fract(particleIndex * .618033989) > density) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 tint;
      void main() {
        float r = length(gl_PointCoord - .5) * 2.0;
        if (r > 1.0) discard;
        float alpha = (1.0 - smoothstep(.12, 1.0, r)) * .9;
        gl_FragColor = vec4(tint, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

export type ParticlePool = ReturnType<typeof particlePool>;

/** Freeze the interrupted interpolation once, then upload the next target once. */
export function retarget(pool: ParticlePool, target: PC) {
  const g = pool.geometry, u = pool.material.uniforms;
  const [e, scale] = morphAt(u.progress.value, u.punch.value > .5);
  for (const [start, end, values] of [['position', 'destination', target.pos], ['color', 'destinationColor', target.col]] as const) {
    const a = g.getAttribute(start) as THREE.BufferAttribute;
    const b = g.getAttribute(end) as THREE.BufferAttribute;
    const k = start === 'position' ? scale : 1, mix = start === 'position' ? e : Math.min(1, Math.max(0, e));
    for (let i = 0; i < a.array.length; i++) a.array[i] = (a.array[i] + (b.array[i] - a.array[i]) * mix) * k;
    b.array.set(values); a.needsUpdate = true; b.needsUpdate = true;
  }
  u.progress.value = 0;
}
