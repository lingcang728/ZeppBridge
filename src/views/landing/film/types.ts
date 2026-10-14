import type { Director } from './director';
import type { CaptionKey } from './copy';

/**
 * 宣传片的时间线（网站开场与对外视频是同一份）：章 → 镜。
 * 每一镜有计划时长 `ms`：动作先做完，不够就停在最后一帧补足——整片长度固定，切点能对上音乐节拍。
 * 动作超时不截断（真应用慢了宁可晚切，不切在半个动画上），超出的量由时间线日志报出来调。
 */
export type FilmTheme = 'dark' | 'light';

/**
 * 应用窗口在 16:9 舞台上的姿态：
 * - `full`：窗口居中放大，字幕压在底部渐隐里；
 * - `left` / `right`：窗口偏到一侧让出字幕栏；
 * - `title`：窗口模糊着退场，只留大字（章节卡、标语，也用来遮住换页与重置）；
 * - `watch`：窗口缩到左边，右边让给手表（训练计划发到手表那一镜）。
 */
export type Pose = 'full' | 'left' | 'right' | 'title' | 'watch';
/** 手表道具：`shown` 出现在右边，`lit` 表盘亮起刚收到的那节训练。 */
export type WatchState = 'hidden' | 'shown' | 'lit';

export interface Shot {
  id: string;
  ms: number;
  pose?: Pose;
  caption?: CaptionKey | null;
  run(director: Director): Promise<void>;
}

export interface Chapter {
  id: string;
  /** 章节条上的名字（文案键）。 */
  label: CaptionKey;
  shots: Shot[];
}

export interface Camera { x: number; y: number; zoom: number }

/** 导演层要舞台做的事：FilmPlayer 实现，录片脚本用同一套。 */
export interface Stage {
  camera(next: Camera, ms: number): void;
  pose(next: Pose, ms: number): void;
  caption(key: CaptionKey | null): void;
  pointer(state: { x: number; y: number; pressed: boolean; visible: boolean; hold?: number }): void;
  shot(chapter: string, shot: string): void;
  /** 全黑遮罩：`ms` 是淡入淡出时长（现在只在出错复位时用）。 */
  veil(on: boolean, ms: number): void;
  /** 模糊溶解：窗口边模糊边淡出、微缩进光晕里（`on`），换好页再从模糊里清晰浮回来。不黑场。 */
  dissolve(on: boolean, ms: number): void;
  /** 手表道具（训练计划发到手表）。`fly` 时先从窗口飞一张训练卡过去再亮表盘。 */
  watch(state: WatchState, fly?: { from: { x: number; y: number }; ms: number }): void;
}
