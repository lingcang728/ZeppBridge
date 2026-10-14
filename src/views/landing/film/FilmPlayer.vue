<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { PlaybackClock } from '../playback';
import { useShowcase } from '../useShowcase';
import { Director, playShot, type ShotTiming } from './director';
import { FILM_SCORE, SHORT_FILM, pickFilm } from './chapters';
import { filmCaption, filmLocale, filmScript, type CaptionKey } from './copy';
import type { Camera, Pose, WatchState } from './types';
import type { LandingLocale } from '../../../composables/useLandingLocale';
import watchImage from '../../../assets/devices/amazfit-balance-2.webp';

/**
 * 网站开场即宣传片（计划第三、四节）。真应用跑在 iframe 里（演示模式、合成数据），导演层照时间线操作它；
 * 外面这层只做舞台：光晕底、窗口姿态、镜头、字幕、指针、手表道具。录对外视频时用的是同一个组件（?film=record）。
 * 字幕和 iframe 里的界面用同一种语言（filmLocale：没有字幕文件的语言整片看英文版），切语言时 iframe 跟着重载。
 */
const props = defineProps<{ locale: LandingLocale; record?: boolean }>();
const emit = defineEmits<{ done: []; skip: [] }>();

const FILM = pickFilm(location.search);
/** 短片有配乐：每镜在音乐里的计划起点（秒）。 */
const scored = FILM === SHORT_FILM && !props.record;
const SHOT_AT = new Map<string, { start: number; length: number }>();
{ let at = 0; for (const chapter of FILM) for (const shot of chapter.shots) { SHOT_AT.set(shot.id, { start: at, length: shot.ms / 1000 }); at += shot.ms / 1000; } }
const lang = computed(() => filmLocale(props.locale));
const root = ref<HTMLElement | null>(null);
const stageEl = ref<HTMLElement | null>(null);
const frame = ref<HTMLIFrameElement | null>(null);
const propEl = ref<HTMLElement | null>(null);
const windowEl = ref<HTMLElement | null>(null);
const cameraEl = ref<HTMLElement | null>(null);
const veilEl = ref<HTMLElement | null>(null);
const flyerEl = ref<HTMLElement | null>(null);
const scale = ref(1);
const src = ref('');
const ready = ref(false), failed = ref(false), finished = ref(false);
const caption = ref<CaptionKey | null>(null);
const pose = ref<Pose>('title');
const zoom = ref(1);
const watchState = ref<WatchState>('hidden');
const soundOn = ref(false);
const cursor = ref({ x: 640, y: 400, pressed: false, visible: false, hold: 0, holdKey: 0 });
const active = ref({ chapter: FILM[0]!.id, shot: '' });
const show = useShowcase(root);
const text = computed(() => (caption.value ? filmCaption(lang.value, caption.value) : null));
const script = computed(() => filmScript(lang.value));
/** 标题逐字（中文）/ 逐词（西文）模糊入焦，像样片里的大字。 */
const glyphs = computed(() => {
  const title = text.value?.title ?? '';
  return lang.value === 'zh' ? [...title] : title.split(/(\s+)/).filter(Boolean);
});

let controller: AbortController | undefined, clock: PlaybackClock | undefined, resize: ResizeObserver | undefined;
let audio: HTMLAudioElement | null = null, shotStarted = 0, syncTimer = 0;
/**
 * 配乐跟片子对拍：音乐该在的位置 = 当前镜的计划起点 + 这一镜已经放了多久。
 * 偏得少就微调播放速度慢慢追（不跳），偏得多（观众暂停、片子卡了一下）才直接跳过去。默认静音，点了才响。
 */
const syncScore = () => {
  if (!audio) return;
  if (!soundOn.value || !show.running.value || !clock || failed.value) { audio.pause(); return; }
  if (finished.value) { audio.playbackRate = 1; return; }
  const slot = SHOT_AT.get(active.value.shot);
  if (!slot) return;
  const into = Math.max(0, (clock.elapsed() - shotStarted) / 1000);
  // 这一镜超时：超得少，音乐照常往下放，下一镜开始后再微调速度追回来；超得多才停在镜尾等下一镜。
  // 不能把目标钉在镜尾——那样每半秒就拉回镜尾一次，听起来是卡带。
  if (into > slot.length + 1.2) { audio.pause(); return; }
  const target = slot.start + into;
  const drift = audio.currentTime - target;
  if (audio.paused || Math.abs(drift) > 0.6) { audio.currentTime = target; audio.playbackRate = 1; }
  else audio.playbackRate = Math.abs(drift) < 0.03 ? 1 : Math.min(1.1, Math.max(0.9, 1 - drift * 0.25));
  if (audio.paused) void audio.play().catch(() => { soundOn.value = false; });
};
const toggleSound = () => {
  if (!audio) { audio = new Audio(FILM_SCORE); audio.preload = 'auto'; audio.addEventListener('ended', () => { if (!finished.value) audio!.pause(); }); }
  soundOn.value = !soundOn.value;
  window.clearInterval(syncTimer);
  if (soundOn.value) syncTimer = window.setInterval(syncScore, 500);
  syncScore();
};
let generation = 0;
const EASE = 'cubic-bezier(.22,1,.36,1)';
/* 1920×1080 舞台上窗口（1280×800 的应用）的落点；`b` 是这个姿态下的模糊（退场成大字时边糊边淡）。
   10-14 用户：不要左右侧转的卡片，一律正面。 */
const POSES: Record<Pose, { x: number; y: number; s: number; o: number; b?: number }> = {
  full: { x: 256, y: 44, s: 1.1, o: 1 },
  right: { x: 610, y: 150, s: 0.94, o: 1 },
  left: { x: 106, y: 150, s: 0.94, o: 1 },
  // 不透明度留一丝（不是 0）：完全透明时浏览器不栅格化窗口，第一次显形要补一整窗的栅格，画面停 0.7 秒。
  // 和 full 同位置同缩放：退场 / 浮现只变透明度和模糊，不改缩放——改缩放就得整窗重新栅格化，画面停 0.25 秒。
  title: { x: 256, y: 44, s: 1.1, o: 0.004, b: 12 },
  watch: { x: 96, y: 150, s: 0.84, o: 1 },
};
const poseTransform = (p: Pose) => `translate(${POSES[p].x}px, ${POSES[p].y}px) scale(${POSES[p].s})`;
const blur = (px?: number) => (px ? `blur(${px}px)` : 'none');
const animateTo = (el: HTMLElement | null, keyframe: Keyframe, ms: number, from?: Keyframe) => {
  if (!el) return;
  if (ms <= 0 || (!props.record && show.reduced.value)) { el.getAnimations().forEach((animation) => animation.cancel()); Object.assign(el.style, keyframe); return; }
  const start: Keyframe = from ?? {};
  if (!from) {
    const style = getComputedStyle(el);
    for (const key of Object.keys(keyframe)) (start as Record<string, string>)[key] = style.getPropertyValue(key);
  }
  el.getAnimations().forEach((animation) => animation.cancel());
  Object.assign(el.style, keyframe);
  el.animate([start, keyframe], { duration: ms, easing: EASE });
};
/** 应用坐标（iframe 里的 CSS 像素）→ 舞台坐标：iframe 的外框已经带上了窗口姿态和镜头。 */
const toStage = (point: { x: number; y: number }) => {
  const box = frame.value?.getBoundingClientRect(), stage = stageEl.value?.getBoundingClientRect();
  if (!box || !stage) return { x: 0, y: 0 };
  return { x: (box.left + point.x * (box.width / 1280) - stage.left) / scale.value, y: (box.top + point.y * (box.height / 800) - stage.top) / scale.value };
};
/** 表盘中心在舞台上的位置（和 film.css 里 .film-watch 的摆放对应）。 */
const FACE = { x: 1590, y: 548 };

const stage = {
  camera(next: Camera, ms: number) {
    zoom.value = next.zoom;
    animateTo(cameraEl.value, { transform: `translate(${next.x}px, ${next.y}px) scale(${next.zoom})` }, ms);
  },
  pose(next: Pose, ms: number) {
    pose.value = next;
    animateTo(windowEl.value, { transform: poseTransform(next), opacity: String(POSES[next].o), filter: blur(POSES[next].b) }, ms);
  },
  caption(key: CaptionKey | null) { caption.value = key; },
  pointer(state: { x: number; y: number; pressed: boolean; visible: boolean; hold?: number }) {
    const hold = state.hold ?? 0;
    cursor.value = { ...state, hold, holdKey: hold ? cursor.value.holdKey + 1 : cursor.value.holdKey };
  },
  shot(chapter: string, shot: string) {
    active.value = { chapter, shot };
    // 录片脚本按这条对齐片头（屏幕录像的时间戳也是墙钟）。
    if (props.record) console.info(`[film:shot] ${chapter}/${shot} ${Date.now()}`);
    shotStarted = clock?.elapsed() ?? 0;
    syncScore();
  },
  veil(on: boolean, ms: number) { animateTo(veilEl.value, { opacity: on ? '1' : '0' }, ms); },
  /* 换场的模糊溶解：只在这几百毫秒里有滤镜，落定后是 none（不常驻合成层上的模糊）。 */
  dissolve(on: boolean, ms: number) {
    if (on) animateTo(propEl.value, { opacity: '0', transform: 'scale(.965)', filter: blur(12) }, ms);
    else animateTo(propEl.value, { opacity: '1', transform: 'scale(1)', filter: 'none' }, ms, { opacity: '0', transform: 'scale(1.03)', filter: blur(12) });
  },
  watch(state: WatchState, fly?: { from: { x: number; y: number }; ms: number }) {
    if (!fly || state !== 'lit') { watchState.value = state; return; }
    const from = toStage(fly.from), el = flyerEl.value;
    if (!el || (!props.record && show.reduced.value)) { watchState.value = 'lit'; return; }
    // 一张训练卡从窗口里那一天飞到表盘上，边飞边缩小；落定那一刻表盘亮起。
    el.getAnimations().forEach((animation) => animation.cancel());
    const lift = Math.min(160, Math.hypot(FACE.x - from.x, FACE.y - from.y) * 0.18);
    const at = (x: number, y: number, s: number) => `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s})`;
    const flight = el.animate([
      { transform: at(from.x, from.y, 1), opacity: 0 },
      { transform: at(from.x, from.y, 1.06), opacity: 1, offset: 0.12 },
      { transform: at((from.x + FACE.x) / 2, Math.min(from.y, FACE.y) - lift, 0.86), opacity: 1, offset: 0.55 },
      { transform: at(FACE.x, FACE.y, 0.42), opacity: 0 },
    ], { duration: fly.ms, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' });
    flight.finished.then(() => { watchState.value = 'lit'; }, () => {});
  },
};

const timings: ShotTiming[] = [];
/* 录片 / 调试：?from=<章>:<镜> 从那一镜开始放（只在录片模式认）。 */
const fromParam = props.record ? new URLSearchParams(location.search).get('from')?.split(':') ?? null : null;
const startChapter = fromParam ? Math.max(0, FILM.findIndex((chapter) => chapter.id === fromParam[0])) : 0;
const startShot = fromParam?.[1] ?? null;
const stop = () => { generation++; controller?.abort(); clock?.dispose(); audio?.pause(); };
const run = async (from = 0, fromShot: string | null = from === startChapter ? startShot : null) => {
  stop();
  if (!ready.value || !frame.value?.contentWindow) return;
  const token = generation;
  controller = new AbortController();
  clock = new PlaybackClock(controller.signal);
  clock.setPaused(!show.running.value);
  finished.value = false; timings.length = 0;
  watchState.value = 'hidden';
  const director = new Director(frame.value.contentWindow, clock, stage, lang.value);
  try {
    director.api.pause(false);
    director.rate();
    const note = (timing: ShotTiming) => {
      timings.push(timing);
      if (timing.actual > timing.planned) console.info(`[film] ${timing.chapter}/${timing.shot} ran ${timing.actual}ms > ${timing.planned}ms`);
    };
    let skipTo = fromShot;
    for (const chapter of FILM.slice(from)) {
      for (const shot of chapter.shots) {
        if (skipTo && shot.id !== skipTo) continue;
        skipTo = null;
        try {
          await playShot(chapter.id, shot, director, note);
        } catch (error) {
          // 一镜失败不拖垮整片：记下来、揭开遮挡、复位镜头，接着放下一镜（录片脚本会看到这条日志）。
          if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error;
          console.error(`[film] ${chapter.id}/${shot.id} failed:`, error);
          stage.veil(false, 0); stage.dissolve(false, 0); stage.camera({ x: 0, y: 0, zoom: 1 }, 0); director.hidePointer();
        }
      }
    }
    if (token !== generation) return;
    finished.value = true;
    (window as Window & { __ZB_FILM_DONE__?: ShotTiming[] }).__ZB_FILM_DONE__ = [...timings];
    emit('done');
  } catch (error) {
    if (token !== generation || controller.signal.aborted) return;
    failed.value = true;
    root.value?.setAttribute('data-error', error instanceof Error ? error.message : String(error));
    console.error('[film]', error);
  }
};
const toggle = () => { if (finished.value || failed.value) { failed.value = false; show.play(); void run(0, null); } else show.toggle(); };

/** 载入（或换语言后重新载入）演示 iframe：界面语言跟字幕走。 */
const load = () => {
  stop();
  ready.value = false; finished.value = false;
  stage.pose('title', 0); stage.dissolve(false, 0); stage.camera({ x: 0, y: 0, zoom: 1 }, 0);
  // 片头的标语留给第一镜去上：等 iframe 就绪再逐字入焦，录像里才拍得到。
  caption.value = null; watchState.value = 'hidden';
  src.value = '/?' + new URLSearchParams({ demo: '1', showcase: '1', film: '1', route: '/', theme: 'dark', lang: lang.value }).toString();
};
const message = (event: MessageEvent) => {
  if (event.origin !== location.origin || event.source !== frame.value?.contentWindow) return;
  if (event.data?.source !== 'zeppbridge-demo' || event.data.type !== 'ready') return;
  // iframe 中途重载（开发服务器整页刷新、浏览器回收内存）会再报一次就绪：从正在放的这一镜接着放，不从头来。
  const resume = ready.value && !finished.value ? FILM.findIndex((chapter) => chapter.id === active.value.chapter) : -1;
  ready.value = true;
  if (resume >= 0) void run(resume, active.value.shot || null);
  else void run(startChapter);
};
watch(show.running, (running) => {
  clock?.setPaused(!running);
  frame.value?.contentWindow?.__ZB_PRESENTATION__?.pause(!running);
  syncScore();
});
// 落地页的语言在挂载之后才定下来（LandingPage 的 onMounted 晚于这里）：以前 iframe 停在第一次的语言，英文访客看到中文界面。
watch(lang, load);

onMounted(() => {
  window.addEventListener('message', message);
  resize = new ResizeObserver(([entry]) => {
    const box = entry?.contentRect;
    if (box) scale.value = Math.min(box.width / 1920, box.height / 1080);
  });
  if (root.value) resize.observe(root.value);
  load();
});
onBeforeUnmount(() => { stop(); window.clearInterval(syncTimer); audio = null; resize?.disconnect(); window.removeEventListener('message', message); });
</script>

<template>
  <section ref="root" class="film" :class="{ recording: record }" :data-chapter="active.chapter" :data-shot="active.shot" :data-pose="pose" :data-lang="lang" aria-roledescription="film">
    <div class="film-aurora" aria-hidden="true"><i class="a1"></i><i class="a2"></i><i class="a3"></i></div>
    <div ref="stageEl" class="film-stage" :style="{ transform: `translate(-50%, -50%) scale(${scale})` }">
      <div ref="propEl" class="film-prop">
        <div ref="windowEl" class="film-window">
          <div ref="cameraEl" class="film-camera" :style="{ '--zoom': zoom }">
            <iframe v-if="src" :key="src" ref="frame" :src="src" title="ZeppBridge" :class="{ shown: ready }" tabindex="-1" inert />
            <i v-if="cursor.visible" class="film-pointer" :class="{ pressed: cursor.pressed }" :style="{ transform: `translate(${cursor.x}px, ${cursor.y}px) scale(calc(1 / var(--zoom)))` }" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26"><path d="M5 3.2v15.6l4.3-4.1 2.7 6.1 2.6-1.1-2.7-6h5.9z" /></svg>
              <b v-if="cursor.hold" :key="cursor.holdKey" class="film-hold" :style="{ animationDuration: `${cursor.hold}ms` }"></b>
            </i>
          </div>
        </div>
      </div>
      <div class="film-watch" :class="watchState" aria-hidden="true">
        <img :src="watchImage" alt="" width="381" height="515" />
        <div class="film-face"><small>{{ script.watchMeta }}</small><strong>{{ script.watchName }}</strong><em>▶</em></div>
      </div>
      <div ref="flyerEl" class="film-flyer" aria-hidden="true"><strong>{{ script.watchName }}</strong><small>{{ script.watchMeta }}</small></div>
      <Transition name="film-caption" mode="out-in">
        <div v-if="text" :key="caption ?? ''" class="film-caption" :class="[`at-${pose}`, { url: caption === 'tryIt' }]" aria-live="polite">
          <h2 :aria-label="text.title"><span v-for="(glyph, index) in glyphs" :key="index" class="k" :style="{ '--i': index }" aria-hidden="true">{{ glyph }}</span></h2>
          <p v-if="text.sub">{{ text.sub }}</p>
        </div>
      </Transition>
      <div ref="veilEl" class="film-veil" aria-hidden="true"></div>
    </div>
    <div v-if="!record" class="film-buttons">
      <button type="button" class="film-toggle" :aria-label="finished || failed ? 'Replay' : show.running.value ? 'Pause' : 'Play'" @click="toggle">{{ finished || failed ? '↺' : show.running.value ? '❚❚' : '▶' }}</button>
      <button v-if="scored" type="button" class="film-sound" :class="{ on: soundOn }" :aria-pressed="soundOn" :aria-label="soundOn ? 'Mute' : 'Sound on'" @click="toggleSound">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" /><path v-if="soundOn" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /><path v-else d="M16.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
      </button>
      <button type="button" class="film-skip" aria-label="Skip" @click="emit('skip')">↓</button>
    </div>
  </section>
</template>

<style scoped src="./film.css"></style>
