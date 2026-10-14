/**
 * 「交给 AI」长按蓄力 → 发射的声音彩蛋（10-13）。全部用 WebAudio 现合成，不带音频文件（CSP 不放外部资源，也省体积）：
 * - 蓄力：一股低沉的引擎声，随蓄力越来越响、越来越尖（锯齿波过一道越开越大的低通）；
 * - 发射：一声闷响（正弦从 120Hz 掉到 40Hz）+ 一股往上扫的喷气噪声（带通从 300Hz 扫到 2.6kHz 再收掉）。
 * 音量刻意压低；系统静音时什么都听不到也没关系——蓄力和发射的感觉都在动效里，声音只是锦上添花。
 * 浏览器 / WebView 不给建 AudioContext 时整个静默跳过。
 */
let ctx: AudioContext | null = null;

const audio = (): AudioContext | null => {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
};

export interface ChargeHum {
  /** 蓄力到哪了（0–1，已经按加速度换算过）。 */
  set: (level: number) => void;
  /** 松手 / 发射：很快收掉。 */
  stop: () => void;
}

const SILENT: ChargeHum = { set: () => undefined, stop: () => undefined };

export const chargeHum = (): ChargeHum => {
  const ac = audio();
  if (!ac) return SILENT;
  const osc = ac.createOscillator();
  const sub = ac.createOscillator();
  const filter = ac.createBiquadFilter();
  const gain = ac.createGain();
  osc.type = 'sawtooth';
  sub.type = 'sine';
  osc.frequency.value = 55;
  sub.frequency.value = 38;
  filter.type = 'lowpass';
  filter.frequency.value = 180;
  filter.Q.value = 6;
  gain.gain.value = 0;
  osc.connect(filter);
  sub.connect(filter);
  filter.connect(gain).connect(ac.destination);
  osc.start();
  sub.start();
  let stopped = false;
  return {
    set: (level) => {
      if (stopped) return;
      const t = ac.currentTime;
      const k = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
      osc.frequency.setTargetAtTime(55 + k * 130, t, 0.03);
      sub.frequency.setTargetAtTime(38 + k * 40, t, 0.03);
      filter.frequency.setTargetAtTime(180 + k * 1400, t, 0.03);
      gain.gain.setTargetAtTime(0.012 + k * 0.05, t, 0.04);
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      const t = ac.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setTargetAtTime(0, t, 0.04);
      osc.stop(t + 0.3);
      sub.stop(t + 0.3);
    },
  };
};

export const launchBoom = (): void => {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  // 闷响：点火那一下。
  const thump = ac.createOscillator();
  const thumpGain = ac.createGain();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(120, t);
  thump.frequency.exponentialRampToValueAtTime(40, t + 0.28);
  thumpGain.gain.setValueAtTime(0.0001, t);
  thumpGain.gain.exponentialRampToValueAtTime(0.32, t + 0.015);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  thump.connect(thumpGain).connect(ac.destination);
  thump.start(t);
  thump.stop(t + 0.4);
  // 喷气：一段白噪声过一道往上扫的带通。
  const seconds = 1.3;
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const noise = ac.createBufferSource();
  noise.buffer = buffer;
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 0.9;
  band.frequency.setValueAtTime(300, t);
  band.frequency.exponentialRampToValueAtTime(2600, t + 0.55);
  band.frequency.exponentialRampToValueAtTime(900, t + seconds);
  const hiss = ac.createGain();
  hiss.gain.setValueAtTime(0.0001, t);
  hiss.gain.exponentialRampToValueAtTime(0.16, t + 0.06);
  hiss.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  noise.connect(band).connect(hiss).connect(ac.destination);
  noise.start(t);
  noise.stop(t + seconds);
};
