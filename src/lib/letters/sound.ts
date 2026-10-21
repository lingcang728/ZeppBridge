/**
 * 信封的两声（批次 6）：火漆裂开、信纸滑出。默认开、很轻；减少动态效果 / 低特效时不出声；
 * 信封角落有静音开关，选择记在本机。系统静音时浏览器的声音本来就出不来，不用另外判断。
 *
 * 不打包音频文件（CSP 不放 data URL，也省体积）：用 WebAudio 现场合成——一小段滤过的噪声加一个低频的「咔」。
 */
import { ref } from 'vue';
import { lessMotion } from '../motion/lessMotion';

const KEY = 'zeppbridge.letters.sound';
const VOLUME = 0.14;

const read = (): boolean => {
  try { return window.localStorage.getItem(KEY) !== 'off'; } catch { return true; }
};
export const letterSoundOn = ref(typeof window === 'undefined' ? true : read());

export function setLetterSound(on: boolean): void {
  letterSoundOn.value = on;
  try { window.localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* 记不住就只管这一次 */ }
}

let context: AudioContext | null = null;
const audio = (): AudioContext | null => {
  if (!letterSoundOn.value || lessMotion() || typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context ??= new Ctor();
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    return context;
  } catch {
    return null;
  }
};

const noise = (ctx: AudioContext, seconds: number): AudioBufferSourceNode => {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  return source;
};

/** 火漆裂开：一声短而脆的「咔」，底下垫一点低频。 */
export function playSealCrack(): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const crack = noise(ctx, 0.09);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2400;
  band.Q.value = 0.9;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(VOLUME, now);
  gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.08);
  crack.connect(band).connect(gain).connect(ctx.destination);
  crack.start(now);
  const thump = ctx.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(180, now);
  thump.frequency.exponentialRampToValueAtTime(70, now + 0.12);
  const low = ctx.createGain();
  low.gain.setValueAtTime(VOLUME * 0.7, now);
  low.gain.exponentialRampToValueAtTime(0.0008, now + 0.14);
  thump.connect(low).connect(ctx.destination);
  thump.start(now);
  thump.stop(now + 0.16);
}

/** 信纸滑出：一段柔和的沙沙声，先起后落。 */
export function playPaperSlide(): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const rustle = noise(ctx, 0.42);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(900, now);
  filter.frequency.linearRampToValueAtTime(1800, now + 0.38);
  filter.Q.value = 0.6;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0008, now);
  gain.gain.exponentialRampToValueAtTime(VOLUME * 0.5, now + 0.12);
  gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.4);
  rustle.connect(filter).connect(gain).connect(ctx.destination);
  rustle.start(now);
}
