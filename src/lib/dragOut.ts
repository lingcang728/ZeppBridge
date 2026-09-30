/**
 * 从应用里把一个本机文件直接拖出去（批次 ⑦）：拖进浏览器里 AI 的对话框，
 * 就和从资源管理器拖进去一样。靠 `tauri-plugin-drag`（Windows 上是系统的 DoDragDrop）。
 *
 * 必须在鼠标按下的那一刻调用：系统拖拽要「正按着键」才会开始。网页预览里没有这条路，
 * 调用方应当只在桌面运行时显示可拖的样子。
 */
import { Channel, invoke } from '@tauri-apps/api/core';

/** 拖动时跟着指针的那张小图：一张画出来的文件卡（系统要一张 PNG）。 */
const dragPreview = (label: string): string => {
  const canvas = document.createElement('canvas');
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = 220 * ratio;
  canvas.height = 56 * ratio;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/png');
  ctx.scale(ratio, ratio);
  ctx.fillStyle = 'rgba(30, 35, 43, 0.92)';
  ctx.beginPath();
  ctx.roundRect(0, 0, 220, 56, 14);
  ctx.fill();
  ctx.fillStyle = '#A2C765';
  ctx.fillRect(14, 14, 20, 28);
  ctx.fillStyle = '#F2F4EE';
  ctx.font = '600 13px system-ui, sans-serif';
  const text = label.length > 22 ? `${label.slice(0, 21)}…` : label;
  ctx.fillText(text, 44, 33);
  return canvas.toDataURL('image/png');
};

export const startFileDrag = async (path: string, label: string): Promise<void> => {
  await invoke('plugin:drag|start_drag', {
    item: [path],
    image: dragPreview(label),
    onEvent: new Channel(),
  });
};
