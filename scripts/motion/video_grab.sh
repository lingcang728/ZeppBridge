#!/bin/sh
# video_grab.sh <video> <outdir> <start> <end> <step> [width]
# 录屏逐帧抽：一次只解一帧、CPU 软解、2 线程（这台机器全帧解码 / 硬解会被 EC 断电，见 ~/.grok/rules/09-video-decode.md）。
# 只许这样抽：-ss 放在 -i 前、-frames:v 1、-threads 2，不要 -hwaccel、fps= 滤镜。一次只处理一条视频。
VID="$1"; OUT="$2"; S="$3"; E="$4"; STEP="$5"; W="${6:-960}"
mkdir -p "$OUT"
for t in $(python -c "import sys;s,e,st=map(float,sys.argv[1:]);n=int(round((e-s)/st));print(' '.join('%.3f'%(s+i*st) for i in range(n+1)))" "$S" "$E" "$STEP"); do
  ffmpeg -nostdin -loglevel error -threads 2 -ss "$t" -i "$VID" -frames:v 1 -threads 2 -vf "scale=$W:-1" -y "$OUT/$t.jpg"
done
ls "$OUT" | wc -l
