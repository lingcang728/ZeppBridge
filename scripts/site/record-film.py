"""把网站开场的宣传片录成 mp4（计划 P6）。

用法（先起一个指向构建产物的预览服务器，例如 `npx vite preview --port 4180`）：
    python scripts/site/record-film.py --lang zh --url http://127.0.0.1:4180
    python scripts/site/record-film.py --lang en --cut full

做法：全局 Python Playwright + 系统 Chrome（channel="chrome"）无头打开 `/?film=record`，
用 CDP 屏幕录像（Page.startScreencast）实时收 1920×1080 的帧，帧带墙钟时间戳；
片头按第一镜的 `[film:shot]` 日志对齐，片尾等 `__ZB_FILM_DONE__`；再按时间戳重采样成 60fps，
ffmpeg 双线程、低优先级编码（这台电脑全核满载会断电，别并行录两条）。

界面语言和字幕同为 `--lang`（只有 zh / en 两版）。帧先落在 `--work` 目录，录完删掉。
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
BROWSER_LOCALE = {"zh": "zh-CN", "en": "en-US"}


def low_priority() -> dict:
    if os.name == "nt":
        return {"creationflags": 0x00004000}  # BELOW_NORMAL_PRIORITY_CLASS
    return {"preexec_fn": lambda: os.nice(10)}


def record(url: str, lang: str, cut: str, work: Path, limit_s: float) -> tuple[list[tuple[float, Path]], float, float]:
    frames: list[tuple[float, Path]] = []
    marks: list[tuple[str, float]] = []
    work.mkdir(parents=True, exist_ok=True)
    query = "?film=record" + ("&cut=full" if cut == "full" else "")
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        ctx = browser.new_context(viewport={"width": 1920, "height": 1080}, locale=BROWSER_LOCALE[lang], color_scheme="dark")
        # 落地页优先认存下来的语言（访客选过的那种）；录片时直接写好，不靠浏览器猜。
        ctx.add_init_script(f"try {{ localStorage.setItem('zeppbridge-landing-locale', '{lang}'); }} catch {{}}")
        page = ctx.new_page()
        errors: list[str] = []

        def on_console(msg):
            text = msg.text
            if text.startswith("[film:shot]"):
                _, shot, stamp = text.split(" ")
                marks.append((shot, int(stamp) / 1000))
            elif text.startswith("[film]") or msg.type == "error":
                errors.append(text[:300])

        page.on("console", on_console)
        cdp = ctx.new_cdp_session(page)

        def on_frame(event):
            stamp = event["metadata"]["timestamp"]
            path = work / f"{len(frames):06d}.jpg"
            path.write_bytes(base64.b64decode(event["data"]))
            frames.append((stamp, path))
            cdp.send("Page.screencastFrameAck", {"sessionId": event["sessionId"]})

        cdp.on("Page.screencastFrame", on_frame)
        page.goto(url.rstrip("/") + "/" + query)
        cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 92, "maxWidth": 1920, "maxHeight": 1080, "everyNthFrame": 1})
        started = time.time()
        done = None
        while time.time() - started < limit_s:
            page.wait_for_timeout(250)
            done = page.evaluate("window.__ZB_FILM_DONE__ || null")
            if done:
                break
        end = time.time() + 0.6
        while time.time() < end:
            page.wait_for_timeout(100)
        cdp.send("Page.stopScreencast")
        browser.close()
    for line in errors:
        print("  page:", line)
    if not done:
        raise SystemExit("film did not finish in time")
    if any("failed:" in line for line in errors):
        raise ShotFailed("a shot failed (see page lines above)")
    if not marks:
        raise SystemExit("no [film:shot] marks: is the build older than the recorder?")
    print("  shots:", ", ".join(f"{t['shot']} {t['used']}/{t['planned']}" for t in done))
    late = [t["shot"] for t in done if t["used"] > t["planned"]]
    if late:
        print("  WARNING: these shots ran past their planned length, so cuts drift off the score:", ", ".join(late))
    if cut == "short" and any(t["used"] > t["planned"] + 150 for t in done):
        raise ShotFailed("a shot overran by more than 150ms; the score would be off the beat")
    total = sum(t["actual"] for t in done) / 1000
    return frames, marks[0][1], marks[0][1] + total + 0.3


class ShotFailed(RuntimeError):
    pass


def resample(frames: list[tuple[float, Path]], start: float, end: float, fps: int, out: Path) -> int:
    """每个输出时刻取那一刻之前最后一帧（录像只在画面变化时出帧）。写成 ffmpeg concat 清单。"""
    frames.sort(key=lambda item: item[0])
    lines, index, count = [], 0, 0
    t = start
    while t < end:
        while index + 1 < len(frames) and frames[index + 1][0] <= t:
            index += 1
        lines.append(f"file '{frames[index][1].as_posix()}'\nduration {1 / fps:.6f}\n")
        count += 1
        t += 1 / fps
    lines.append(f"file '{frames[index][1].as_posix()}'\n")
    out.write_text("".join(lines), encoding="utf-8")
    # 卡顿参考：片内相邻两帧录像的间隔（画面静止时本来就不出帧，所以大间隔不一定是卡）。
    inside = [stamp for stamp, _ in frames if start <= stamp <= end]
    gaps = sorted(b - a for a, b in zip(inside, inside[1:]))
    if gaps:
        print(f"  screencast gaps: p50 {gaps[len(gaps) // 2] * 1000:.0f}ms, p95 {gaps[int(len(gaps) * .95)] * 1000:.0f}ms, max {gaps[-1] * 1000:.0f}ms")
    return count


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:4180")
    parser.add_argument("--lang", choices=["zh", "en"], required=True)
    parser.add_argument("--cut", choices=["short", "full"], default="short")
    parser.add_argument("--fps", type=int, default=60)
    parser.add_argument("--out", default=str(ROOT / "output" / "film"))
    parser.add_argument("--work", default=None)
    parser.add_argument("--score", default=str(ROOT / "output" / "film" / "score.wav"), help="配乐 wav（只配短片；不存在就出无声版）")
    args = parser.parse_args()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    work = Path(args.work) if args.work else out_dir / f".frames-{args.cut}-{args.lang}"
    if work.exists():
        shutil.rmtree(work)
    print(f"recording {args.cut} / {args.lang} …")
    # 应用动画偶尔没落定就点了下一下，那一镜会被跳过：整条重录（最多三次），不交出缺镜的片子。
    for attempt in range(3):
        try:
            frames, start, end = record(args.url, args.lang, args.cut, work, 300 if args.cut == "full" else 120)
            break
        except ShotFailed as error:
            print(f"  attempt {attempt + 1}: {error}; recording again")
            shutil.rmtree(work, ignore_errors=True)
    else:
        raise SystemExit("three takes in a row had a failed shot")
    concat = work / "frames.txt"
    count = resample(frames, start, end, args.fps, concat)
    print(f"  {len(frames)} screencast frames → {count} output frames ({count / args.fps:.1f}s)")
    target = out_dir / f"ZeppBridge-{args.cut}-{args.lang}.mp4"
    cmd = ["ffmpeg", "-v", "error", "-y", "-threads", "2", "-f", "concat", "-safe", "0", "-i", str(concat),
           "-fps_mode", "cfr", "-r", str(args.fps), "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p",
           "-threads", "2", "-x264-params", "threads=2", "-movflags", "+faststart", str(target)]
    subprocess.run(cmd, check=True, **low_priority())
    shutil.rmtree(work)
    score = Path(args.score)
    if args.cut == "short" and score.exists():
        mux(target, score)
    print("  wrote", target)


def mux(video: Path, score: Path) -> None:
    """配乐（compose-score.py）混进视频：两遍 loudnorm 线性对齐到 -14 LUFS（各视频平台的常用响度），画面不重编码。"""
    probe = subprocess.run(["ffmpeg", "-hide_banner", "-threads", "2", "-i", str(score), "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json",
                            "-f", "null", "-"], capture_output=True, text=True, check=True, **low_priority())
    m = json.loads(probe.stderr[probe.stderr.rindex("{"):probe.stderr.rindex("}") + 1])
    norm = (f"loudnorm=I=-14:TP=-1:LRA=11:linear=true:measured_I={m['input_i']}:measured_TP={m['input_tp']}"
            f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}")
    scored = video.with_suffix(".scored.mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-threads", "2", "-i", str(video), "-i", str(score), "-map", "0:v", "-map", "1:a",
                    "-c:v", "copy", "-af", norm, "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
                    str(scored)], check=True, **low_priority())
    scored.replace(video)
    print("  scored with", score.name)


if __name__ == "__main__":
    sys.exit(main())
