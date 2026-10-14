"""一分钟短片的配乐：纯 numpy 合成（原创，不含任何采样），按短片的切点编排。

    python scripts/site/compose-score.py            # → output/film/score.wav + .site-cache/media/film-score.m4a

120 BPM（一拍 0.5 秒），A 大调，A – F#m – D – E 每小节一个和弦。段落对着 film/chapters/short.ts 的镜头（时刻见 SHOTS）：
  0–3      片头：先一拍半光晕长音，标语入焦时钟片动机，噪声上扬进第一镜
  3–37.5   视觉动效：四拍底鼓、反拍镲、拨弦琶音（附点八分延迟）、贝斯、长音；卡牌段起加拍手，叠牌段起加主旋律
  37.5–39  「训练计划，交给 AI」：鼓全停，一记冲击 + 钟片和弦
  39–48.5  写身体状况 / AI 排计划：半拍律动，渐亮，最后两秒军鼓滚奏推进
  48.5–55  电脑上定稿、手表上开练：全编制回来，表盘亮起那一下一串闪光琶音
  55–59.3  片尾：鼓退场，网址出现时一记终止和弦，混响收尾
每次换场有一声很轻的风声（对应画面的模糊溶解）。改了短片的镜头时长，就改 SHOTS。
"""
from __future__ import annotations

import subprocess
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SR = 48000
BPM = 120
BEAT = 60 / BPM
LENGTH = 59.3
N = int(LENGTH * SR)
rng = np.random.default_rng(20261014)

# 短片每镜的计划时长（秒），和 film/chapters/short.ts 逐镜一致；改了那边就改这里。
SHOTS = [('tagline', 3.0), ('glass', 4.0), ('morph', 4.0), ('deckwall', 3.0), ('layers', 6.5), ('pile', 7.5), ('lines', 5.0),
         ('deck', 4.5), ('planIntro', 1.5), ('tell', 3.0), ('chat', 7.0), ('toWatch', 6.0), ('free', 1.5), ('try', 2.5)]
AT: dict[str, float] = {}
_t = 0.0
for _name, _ms in SHOTS:
    AT[_name] = _t
    _t += _ms
CUTS = list(AT.values())
TAGLINE_AT = 1.5              # 片头先放一拍半光晕，标语这时入焦（short.ts 的 opening）
CAPTION_IN = 0.26             # 大字卡：旧字幕先淡出 0.26 秒，新字才入焦（film.css 的 film-caption-leave），冲击音跟字
WATCH_LIT = AT['toWatch'] + 2.9  # 训练卡飞到手表、表盘亮起

BUSES: dict[str, np.ndarray] = {}  # 分轨（双声道），混音时各自给电平
SEND_L = np.zeros(N)  # 混响发送
SEND_R = np.zeros(N)
BUS = ['fx']  # 当前写入的分轨（乐器函数放之前先设）
DUCK_KEYS: list[float] = []  # 底鼓时刻，长音 / 贝斯 / 琶音据此让位


def midi(note: str) -> float:
    names = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
    name, octave = note[:-1], int(note[-1])
    return 440.0 * 2 ** ((names[name] + 12 * (octave + 1) - 69) / 12)


def place(sig: np.ndarray, at: float, pan: float = 0.0, gain: float = 1.0, send: float = 0.0, bus: str | None = None):
    """把单声道 / 双声道片段放到时间轴上；pan -1 左 … 1 右（等功率）。"""
    start = int(at * SR)
    if start >= N:
        return
    if sig.ndim == 1:
        a = np.cos((pan + 1) * np.pi / 4)
        b = np.sin((pan + 1) * np.pi / 4)
        left, right = sig * a, sig * b
    else:
        left, right = sig[0], sig[1]
    end = min(N, start + len(left))
    span = end - start
    track = BUSES.setdefault(bus or BUS[0], np.zeros((2, N)))
    track[0, start:end] += left[:span] * gain
    track[1, start:end] += right[:span] * gain
    if send:
        SEND_L[start:end] += left[:span] * gain * send
        SEND_R[start:end] += right[:span] * gain * send


def env(n: int, attack: float, decay: float, sustain: float = 0.0, release: float = 0.05) -> np.ndarray:
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    d = sustain + (1 - sustain) * np.exp(-np.maximum(t - attack, 0) / max(decay, 1e-4))
    out = a * d
    rel = int(release * SR)
    if rel and rel < n:
        out[-rel:] *= np.linspace(1, 0, rel) ** 2
    return out


def additive(freq: float, dur: float, amps, phase_jitter: bool = True) -> np.ndarray:
    """按谐波相加：amps(k, t) 给出第 k 次谐波随时间的振幅（等于一个随时间变化的低通）。"""
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    k_max = max(1, int(16000 / freq))
    for k in range(1, min(k_max, 40) + 1):
        a = amps(k, t)
        if np.max(np.abs(a)) < 1e-4:
            continue
        ph = rng.uniform(0, 2 * np.pi) if phase_jitter else 0
        out += a * np.sin(2 * np.pi * k * freq * t + ph)
    return out


def shaped_noise(n: int, lo: float, hi: float) -> np.ndarray:
    """频域带通的白噪声（不需要 scipy）。"""
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    mask = np.clip((f - lo * 0.7) / (lo * 0.3 + 1), 0, 1) * np.clip((hi * 1.3 - f) / (hi * 0.3 + 1), 0, 1)
    out = np.fft.irfft(spec * mask, n)
    return out / (np.max(np.abs(out)) + 1e-9)


# ── 乐器 ────────────────────────────────────────────────────────────

def kick(gain=1.0):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 46 + 95 * np.exp(-t / 0.035)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.26)
    click = shaped_noise(n, 1500, 6000) * np.exp(-t / 0.004) * 0.25
    return np.tanh((body + click) * 1.6) * 0.9 * gain


def hat(open_=False):
    n = int((0.22 if open_ else 0.07) * SR)
    t = np.arange(n) / SR
    return shaped_noise(n, 7000, 15000) * np.exp(-t / (0.06 if open_ else 0.018)) * 0.32


def clap():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    burst = np.zeros(n)
    for offset in (0, 0.011, 0.022):
        s = int(offset * SR)
        burst[s:] += np.exp(-(t[: n - s]) / 0.006)
    tail = np.exp(-t / 0.11)
    return shaped_noise(n, 900, 5000) * np.maximum(burst * 0.7, tail * 0.55) * 0.55


def pluck(freq, dur=0.55, bright=1.0):
    return additive(freq, dur, lambda k, t: (1 / k) * np.exp(-t * (5 + k * 7 / bright)) * (1 - np.exp(-t / 0.002))) * 0.5


def bell(freq, dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    index = 2.2 * np.exp(-t / 0.35)
    sig = np.sin(2 * np.pi * freq * t + index * np.sin(2 * np.pi * freq * 3.5 * t))
    sig += 0.35 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t / 0.5)
    return sig * env(n, 0.002, 0.9, 0.0, 0.2) * 0.32


def pad_chord(freqs, dur, attack=0.5, cutoff=2600.0):
    n = int(dur * SR)
    left = np.zeros(n)
    right = np.zeros(n)
    for f0 in freqs:
        for i, detune in enumerate((-0.12, -0.05, 0.0, 0.05, 0.12)):
            f = f0 * 2 ** (detune / 12)
            voice = additive(f, dur, lambda k, t, f=f: (1 / k) * (1 / (1 + (k * f / cutoff) ** 4)) * np.ones_like(t))
            pan = (i - 2) / 2.2
            left += voice * np.cos((pan + 1) * np.pi / 4)
            right += voice * np.sin((pan + 1) * np.pi / 4)
    e = env(n, attack, 10, 1.0, min(0.6, dur / 3))
    scale = 0.05 / max(1, len(freqs) / 4)
    return np.stack([left * e * scale, right * e * scale])


def bass(freq, dur):
    return additive(freq, dur, lambda k, t: (1 / k ** 1.6) * (1 / (1 + (k * freq / 700) ** 4)) * np.ones_like(t)) * env(int(dur * SR), 0.004, 0.18, 0.55, 0.03) * 0.42


def whoosh(at, strength=1.0):
    """换场的风声：峰值落在切点上。"""
    pre, post = 0.42, 0.38
    n = int((pre + post) * SR)
    t = np.arange(n) / SR
    shape = np.where(t < pre, (t / pre) ** 2.2, np.exp(-(t - pre) / 0.12))
    noise = shaped_noise(n, 600, 7000) * 0.6 + shaped_noise(n, 2500, 11000) * 0.4
    sig = noise * shape * 0.11 * strength
    stereo = np.stack([sig * np.linspace(0.4, 1, n), sig * np.linspace(1, 0.4, n)])
    place(stereo, at - pre, send=0.5)


def riser(start, end, gain=1.0):
    n = int((end - start) * SR)
    t = np.arange(n) / SR
    progress = t / t[-1]
    # 噪声逐段提高带通，加一根滑上去的正弦
    chunk = 4096
    out = np.zeros(n)
    for i in range(0, n, chunk // 2):
        seg = min(chunk, n - i)
        p = progress[i]
        piece = shaped_noise(seg, 300 + 4000 * p, 1500 + 9000 * p) * np.hanning(seg)
        out[i:i + seg] += piece
    glide = np.sin(2 * np.pi * np.cumsum(220 * 2 ** (progress * 2)) / SR) * 0.25
    sig = (out * 0.5 + glide) * progress ** 2.4 * 0.16 * gain
    place(sig, start, send=0.6)


def impact(at, gain=1.0):
    n = int(2.5 * SR)
    t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-t / 0.08)) / SR) * np.exp(-t / 0.7)
    crash = shaped_noise(n, 2500, 14000) * np.exp(-t / 0.5) * 0.35
    place(np.tanh(boom * 1.4) * 0.55 * gain, at)
    place(crash * gain, at, send=0.9, pan=0.0)


# ── 和声与段落 ─────────────────────────────────────────────────────

CHORDS = [
    ('A', ['A3', 'C#4', 'E4', 'B4'], 'A1'),
    ('F#m', ['F#3', 'A3', 'C#4', 'E4'], 'F#1'),
    ('D', ['D3', 'F#3', 'A3', 'C#4'], 'D2'),
    ('E', ['E3', 'G#3', 'B3', 'F#4'], 'E2'),
]
ARP = {
    'A': ['A4', 'E5', 'C#5', 'B5', 'E5', 'C#6', 'B5', 'E5'],
    'F#m': ['F#4', 'C#5', 'A4', 'E5', 'C#5', 'A5', 'E5', 'C#5'],
    'D': ['D4', 'A4', 'F#4', 'C#5', 'A4', 'F#5', 'E5', 'A4'],
    'E': ['E4', 'B4', 'G#4', 'F#5', 'B4', 'G#5', 'F#5', 'B4'],
}
# 主旋律：每小节 8 个八分音符（None 是休止）
LEAD = {
    'A': ['E5', None, 'C#5', 'E5', None, 'F#5', 'E5', None],
    'F#m': ['C#5', None, 'A4', 'C#5', None, 'E5', 'C#5', 'B4'],
    'D': ['A4', None, 'F#4', 'A4', None, 'B4', 'C#5', None],
    'E': ['B4', None, 'G#4', 'B4', 'C#5', None, 'B4', None],
}


def chord_at(bar: int):
    return CHORDS[bar % 4]


def groove(start, end, *, drums=True, half=False, claps=False, lead=False, arp_bright=1.0, arp_density=16, pad=True, bassline=True, brighten=None):
    """从 start 起每 2 秒一小节铺满到 end。brighten=(a, b)：琶音亮度从 a 渐到 b。"""
    bar_len = 4 * BEAT
    bars = int(np.ceil((end - start) / bar_len - 1e-6))
    for bar in range(bars):
        t0 = start + bar * bar_len
        name, tones, root = chord_at(bar)
        span = min(bar_len, end - t0)
        if span <= 0.05:
            break
        if pad:
            place(pad_chord([midi(n) for n in tones], span + 0.3, attack=0.25), t0, send=0.35, bus='pad')
        if bassline:
            for i in range(int(span / (BEAT / 2) + 1e-6)):
                f = midi(root) * (2 if i % 2 else 1)
                place(bass(f, BEAT / 2 * 0.92), t0 + i * BEAT / 2, bus='bass')
        step = BEAT / (arp_density / 4)
        for i in range(int(span / step + 1e-6)):
            at = t0 + i * step
            p = (at - start) / max(end - start, 1e-6)
            b = arp_bright if not brighten else brighten[0] + (brighten[1] - brighten[0]) * p
            note = ARP[name][i % 8]
            place(pluck(midi(note), 0.5, b), at, pan=0.45 if i % 2 else -0.45, gain=0.55, send=0.25, bus='arp')
            # 附点八分乒乓延迟
            for echo, (delay, g, pan) in enumerate(((0.375, 0.32, 0.8), (0.75, 0.16, -0.8))):
                place(pluck(midi(note), 0.5, b * 0.7), at + delay, pan=pan, gain=0.55 * g, send=0.3, bus='arp')
        if lead:
            for i, note in enumerate(LEAD[name]):
                at = t0 + i * BEAT / 2
                if note and at < end:
                    place(bell(midi(note), 1.4), at, pan=0.1, gain=0.42, send=0.45, bus='lead')
        if drums:
            for beat in range(int(span / BEAT + 1e-6)):
                at = t0 + beat * BEAT
                if not half or beat % 2 == 0:
                    place(kick(), at, gain=0.85, bus='drums')
                    DUCK_KEYS.append(at)
                place(hat(open_=beat % 2 == 1), at + BEAT / 2, pan=0.25, gain=0.9 if not half else 0.6, bus='drums')
                place(hat(), at + BEAT / 4, pan=-0.2, gain=0.35, bus='drums')
                if claps and beat % 2 == 1:
                    place(clap(), at, gain=0.8, send=0.35, bus='drums')


def roll(start, end):
    """军鼓滚奏：十六分 → 三十二分，越来越响。"""
    t = start
    while t < end - 0.01:
        p = (t - start) / (end - start)
        place(clap(), t, gain=0.25 + 0.6 * p, send=0.3, pan=rng.uniform(-0.2, 0.2), bus='drums')
        t += BEAT / 4 if p < 0.5 else BEAT / 8


def compose():
    t = AT
    # 片头：长音从无到有，标语入焦时钟片动机，噪声上扬进第一镜
    place(pad_chord([midi(n) for n in ('A3', 'E4', 'B4', 'C#5')], t['glass'] + 0.4, attack=1.4, cutoff=1800), 0.0, send=0.6)
    for i, note in enumerate(('E5', 'A5', 'B5', 'C#6')):
        at = TAGLINE_AT + i * BEAT
        place(bell(midi(note), 2.4), at, pan=0.3 * np.sin(at * 3), gain=0.5, send=0.7)
    riser(TAGLINE_AT + 0.8, t['glass'], gain=0.8)

    # 视觉动效：先轻后满
    groove(t['glass'], t['deckwall'], claps=False, lead=False, arp_bright=0.9)
    groove(t['deckwall'], t['pile'], claps=True, lead=False, arp_bright=1.1)
    groove(t['pile'], t['planIntro'], claps=True, lead=True, arp_bright=1.25)
    roll(t['planIntro'] - 1.5, t['planIntro'])
    riser(t['planIntro'] - 2.5, t['planIntro'], gain=0.8)

    # 章节卡：鼓停、冲击、钟片和弦
    hit = t['planIntro'] + CAPTION_IN
    impact(hit, gain=0.9)
    place(pad_chord([midi(n) for n in ('D3', 'A3', 'C#4', 'E4', 'F#4')], t['tell'] - hit + 0.4, attack=0.05, cutoff=2200), hit, send=0.7)
    for i, note in enumerate(('A4', 'C#5', 'E5', 'F#5')):
        place(bell(midi(note), 2.0), hit + i * 0.09, pan=-0.3 + i * 0.2, gain=0.4, send=0.8)

    # 写身体状况、AI 排计划：半拍，慢慢变亮，最后推进
    groove(t['tell'], t['toWatch'], half=True, claps=False, arp_density=8, brighten=(0.5, 1.4))
    riser(t['toWatch'] - 3.5, t['toWatch'], gain=1.0)
    roll(t['toWatch'] - 2.0, t['toWatch'])

    # 落地：全编制；表盘亮起那一下一串向上的闪光
    impact(t['toWatch'], gain=1.0)
    groove(t['toWatch'], t['free'], claps=True, lead=True, arp_bright=1.35)
    for i, note in enumerate(('E5', 'A5', 'C#6', 'E6', 'A6')):
        place(bell(midi(note), 1.6), WATCH_LIT + i * 0.06, pan=-0.5 + i * 0.25, gain=0.32, send=0.8)

    # 片尾：鼓退场，网址出现时终止和弦
    groove(t['free'], t['try'], drums=False, arp_bright=0.9, lead=False)
    place(kick(), t['free'], gain=0.5)
    end_hit = t['try'] + CAPTION_IN
    impact(end_hit, gain=0.7)
    place(pad_chord([midi(n) for n in ('A2', 'E3', 'A3', 'C#4', 'E4', 'B4')], LENGTH - end_hit, attack=0.02, cutoff=2400), end_hit, send=0.8)
    place(bass(midi('A1'), 2.4), end_hit, gain=1.0)
    for i, note in enumerate(('E5', 'A5', 'B5', 'C#6')):
        at = end_hit + i * BEAT / 2
        place(bell(midi(note), 2.4), at, pan=0.3 * np.sin(at * 3), gain=0.45, send=0.8)

    for name, at in t.items():
        if at > 0:
            whoosh(at, strength=1.1 if name in ('planIntro', 'toWatch', 'try') else 0.7)


def reverb(left, right, seconds=2.4):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = []
    for seed in (1, 2):
        noise = np.random.default_rng(seed).standard_normal(n) * np.exp(-t / (seconds / 6.9 * 1.0))
        spec = np.fft.rfft(noise)
        f = np.fft.rfftfreq(n, 1 / SR)
        noise = np.fft.irfft(spec / (1 + (f / 5500) ** 2), n)
        noise[: int(0.012 * SR)] = 0  # 预延迟
        out.append(noise / np.sqrt(np.sum(noise ** 2)))
    size = 1 << int(np.ceil(np.log2(len(left) + n)))
    wet_l = np.fft.irfft(np.fft.rfft(left, size) * np.fft.rfft(out[0], size), size)[: len(left)]
    wet_r = np.fft.irfft(np.fft.rfft(right, size) * np.fft.rfft(out[1], size), size)[: len(right)]
    return wet_l, wet_r


def duck(signal_len):
    gain = np.ones(signal_len)
    t = np.arange(int(0.3 * SR)) / SR
    curve = 1 - 0.5 * np.exp(-t / 0.09) * np.clip(t / 0.004, 0, 1)
    for at in DUCK_KEYS:
        s = int(at * SR)
        e = min(signal_len, s + len(curve))
        gain[s:e] = np.minimum(gain[s:e], curve[: e - s])
    return gain


# 各分轨电平（线性）。
LEVELS = {'drums': 0.55, 'bass': 0.7, 'pad': 0.95, 'arp': 1.6, 'lead': 2.0, 'fx': 1.0}
# 段落起伏：（时刻, 增益），之间线性过渡。前奏、章节卡、片尾轻，卡牌段和手表那段最满。
def _shape():
    t = AT
    return [(0, 0.5), (t['glass'] - 0.1, 0.62), (t['glass'], 0.72), (t['deckwall'] - 0.1, 0.76), (t['deckwall'], 0.86),
            (t['pile'] - 0.1, 0.88), (t['pile'], 1.0), (t['planIntro'] - 0.1, 1.0), (t['planIntro'], 0.9), (t['tell'] - 0.1, 0.7),
            (t['tell'], 0.6), (t['chat'] + 1.5, 0.66), (t['toWatch'] - 0.1, 0.84), (t['toWatch'], 1.0), (t['free'] - 0.1, 1.0),
            (t['free'], 0.62), (t['try'] + CAPTION_IN - 0.05, 0.62), (t['try'] + CAPTION_IN, 0.92), (LENGTH, 0.9)]


SHAPE = _shape()


def master():
    mix = np.zeros((2, N))
    wet_l, wet_r = reverb(SEND_L, SEND_R)
    g = duck(N)
    for name, track in BUSES.items():
        level = LEVELS.get(name, 1.0)
        if name in ('pad', 'bass', 'arp'):
            track = track * (0.35 + 0.65 * g)  # 底鼓来时让位（侧链）
        mix += track * level
        rms = np.sqrt(np.mean((track * level) ** 2))
        print(f"  bus {name:5s} rms {20 * np.log10(rms + 1e-12):6.1f} dB")
    mix[0] += wet_l * 0.8
    mix[1] += wet_r * 0.8
    times = np.array([t for t, _ in SHAPE]) * SR
    shape = np.interp(np.arange(N), times, [v for _, v in SHAPE])
    mix *= shape
    peak = np.max(np.abs(mix))
    mix = np.tanh(mix / peak * 1.6) / np.tanh(1.6)  # 软削波：压掉偶发尖峰，不压整体起伏
    fade = int(0.6 * SR)
    mix[:, -fade:] *= np.linspace(1, 0, fade) ** 1.5
    mix[:, :64] *= np.linspace(0, 1, 64)
    return mix


def write_wav(path: Path, mix: np.ndarray):
    data = mix.T * 0.89
    pcm = (np.clip(data, -1, 1) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    compose()
    mix = master()
    out = ROOT / 'output' / 'film'
    out.mkdir(parents=True, exist_ok=True)
    wav = out / 'score.wav'
    write_wav(wav, mix)
    print('wrote', wav)
    # 网站用的压缩版：响度对齐到 -16 LUFS（网页里别比视频平台还响）。
    # 网站媒体都在 .site-cache/media（不进 git），开发服务器和网站构建都从那里取（scripts/site/assets.mjs）。
    web = ROOT / '.site-cache' / 'media' / 'film-score.m4a'
    web.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-threads', '2', '-i', str(wav), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=9',
                    '-ar', '48000', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', str(web)], check=True,
                   creationflags=0x00004000 if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0)
    print('wrote', web)


if __name__ == '__main__':
    main()
