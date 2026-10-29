<script setup lang="ts">
/**
 * 那年今天：一张明信片（2026-10-29 用户定的信件形式）。
 * 正面是一幅画（默认邮票那座海拔山，铺满、留白边像冲印的照片），右下角像老相机一样印着那天的日期；
 * 点一下原地翻到背面，再点翻回来。
 *
 * 背面（2026-10-29 第二轮，用户：字挤在一起、没有重点、没有颜色区分）：左边一行一个数——小字的名字在前，
 * 数字大、按指标上色（墨水版的类别色：步数绿、睡眠靛蓝、心率红），单位小；运动单独一行，前面一个琥珀色的点，
 * 放不下就截断、不折行。右边贴邮票、邮戳盖在邮票下面（不压邮票），底下三道写地址的线。
 * 整张在 3D 翻转的合成层里：不用混合模式和滤镜（纸纹是自带透明度的颗粒图），只动 transform。
 */
import { computed, ref } from 'vue';
import StampArt from './StampArt.vue';
import PostageStamp from './PostageStamp.vue';
import { lessMotion } from '../../lib/motion/lessMotion';

const props = withDefaults(defineProps<{
  /** YYYY-MM-DD */
  date: string;
  label: string;
  stats: Array<{ metric: string; label: string; value: string }>;
  workouts: string[];
  tilt?: number;
}>(), { tilt: 0 });

const flipped = ref(false);
const [year = '', month = '', day = ''] = props.date.split('-');
/* 相机日期戳：'25 10 29。 */
const printed = computed(() => `'${year.slice(2)} ${month} ${day}`);
const still = lessMotion();

/* 纸上的墨色：和概览里同一指标的类别色同一色相（lib/metricTone.ts），压暗到印在米白纸上读得清。 */
const INK: Record<string, string> = { steps: '#3d7a3a', sleep_duration: '#4a4f9e', resting_hr: '#b0362c', hrv: '#9a5a12', stress: '#a1541a' };
const ink = (metric: string) => INK[metric] ?? 'var(--paper-ink)';
/* 数字大、单位小：把「6 小时 46 分」切成数字段和文字段。 */
const parts = (value: string) => value.split(/([\d.,:±]+)/).filter(Boolean).map((text) => ({ text, number: /\d/.test(text) }));
</script>

<template>
  <button type="button" :class="['postcard', { flipped, still }]" :style="{ '--tilt': `${tilt}deg` }" :aria-label="label" :aria-pressed="flipped" @click="flipped = !flipped">
    <span class="turn">
      <span class="face front" aria-hidden="true">
        <svg class="art" viewBox="0 0 108 84" preserveAspectRatio="xMidYMid slice"><StampArt /></svg>
        <span class="photo-date">{{ printed }}</span>
      </span>
      <span class="face back paper-stock" :inert="!flipped || undefined">
        <span class="written">
          <span v-for="stat in stats" :key="stat.metric" class="stat">
            <span class="stat-label">{{ stat.label }}</span>
            <span class="stat-value" :style="{ color: ink(stat.metric) }">
              <span v-for="(part, i) in parts(stat.value)" :key="i" :class="part.number ? 'num' : 'unit'">{{ part.text }}</span>
            </span>
          </span>
          <span v-for="workout in workouts" :key="workout" class="workout" :title="workout">
            <i class="workout-dot" aria-hidden="true"></i><span class="workout-text">{{ workout }}</span>
          </span>
        </span>
        <span class="divider" aria-hidden="true"></span>
        <span class="post" aria-hidden="true">
          <PostageStamp version="" :label="year" :width="62" :tilt="2" />
          <span class="postmark"><span>{{ month }}.{{ day }}</span><span>{{ year }}</span></span>
          <span class="address"><i></i><i></i><i></i></span>
        </span>
      </span>
    </span>
  </button>
</template>

<style scoped>
.postcard {
  position: relative; display: block; width: 400px; aspect-ratio: 1.5; padding: 0; border: 0; background: none; cursor: pointer;
  transform: rotate(var(--tilt)); transition: transform 320ms cubic-bezier(.3, .7, .3, 1);
}
.postcard:hover { transform: rotate(0deg) translateY(-6px); }
.postcard:focus-visible { outline: 2px solid var(--focus); outline-offset: 6px; border-radius: 4px; }
.turn {
  position: absolute; inset: 0; display: block; transform-style: preserve-3d; will-change: transform;
  transform: perspective(1400px) rotateY(0deg); transition: transform 680ms cubic-bezier(.2, .8, .2, 1);
}
.flipped .turn { transform: perspective(1400px) rotateY(180deg); }
.still .turn { transition: none; }
.face {
  position: absolute; inset: 0; display: block; overflow: hidden; border-radius: 4px; backface-visibility: hidden; -webkit-backface-visibility: hidden;
  box-shadow: 0 1.5px 1.5px rgb(40 30 15 / .22), 0 6px 12px -2px rgb(30 20 8 / .2), 0 30px 46px -18px rgb(20 15 5 / .5);
}
/* 正面：白边冲印照片。 */
.front { padding: 10px; background: #f6f1e5; }
.art { display: block; width: 100%; height: 100%; border-radius: 1px; }
.front::after { content: ''; position: absolute; inset: 0; background: url('../../assets/letters/paper-speck.png') 0 0 / 128px repeat; opacity: .55; pointer-events: none; }
.photo-date {
  position: absolute; right: 20px; bottom: 17px; color: #ff8a3d; font: 700 14px/1 'Consolas', 'Courier New', monospace; letter-spacing: .12em;
  text-shadow: 0 0 3px rgb(255 120 40 / .55);
}
/* 背面：纸，左边写数，右边邮票和邮戳。 */
.back {
  display: grid; grid-template-columns: minmax(0, 1fr) 1px 104px; gap: 18px; padding: 22px 20px 20px 24px; transform: rotateY(180deg);
  background: linear-gradient(170deg, var(--paper) 0%, var(--paper) 55%, var(--paper-tint) 100%); color: var(--paper-ink); text-align: left;
}
.back::before { content: ''; position: absolute; inset: 0; background: url('../../assets/letters/paper-speck.png') 0 0 / 128px repeat; opacity: .8; pointer-events: none; }
.written { position: relative; display: flex; flex-direction: column; justify-content: center; gap: 12px; min-width: 0; }
/* 一行一个数：名字小而淡，数字大而上色，单位跟着数字但小一号。 */
.stat { display: grid; gap: 1px; }
.stat-label { color: var(--paper-muted); font: 500 11px/1.3 var(--font-sans); letter-spacing: .08em; }
.stat-value { white-space: nowrap; font-family: var(--paper-font); }
.stat-value .num { font-size: 24px; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
.stat-value .unit { margin: 0 .2em; font-size: 13px; font-weight: 400; opacity: .85; }
.stat-value .unit:last-child { margin-right: 0; }
.workout { display: flex; align-items: center; gap: 8px; min-width: 0; padding-top: 10px; border-top: 1px dashed rgb(110 90 60 / .3); }
.workout-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #c06a14; }
.workout-text { overflow: hidden; color: var(--paper-ink); font: 500 13px/1.3 var(--font-sans); white-space: nowrap; text-overflow: ellipsis; }
.divider { position: relative; background: rgb(110 90 60 / .28); }
.post { position: relative; display: grid; justify-items: end; align-content: start; }
/* 邮戳盖在邮票左下、不压邮票：双圈，里面两行日期。 */
.postmark {
  display: grid; place-content: center; justify-items: center; gap: 2px; width: 60px; height: 60px; margin: 12px 30px 0 0;
  border: 1.5px solid rgb(60 50 40 / .5); border-radius: 50%; color: rgb(60 50 40 / .65); font: 700 10px/1 var(--font-mono); rotate: -12deg;
  box-shadow: inset 0 0 0 4px transparent, inset 0 0 0 5.5px rgb(60 50 40 / .3);
}
.address { display: grid; gap: 22px; width: 100%; margin-top: 22px; }
.address i { display: block; height: 1px; background: rgb(110 90 60 / .3); }
@media (prefers-reduced-motion: reduce) { .postcard { transition: none; } }
</style>
