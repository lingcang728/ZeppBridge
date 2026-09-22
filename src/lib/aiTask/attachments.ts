/**
 * 原件附件的引用管理：挑选、stat、状态判定。
 *
 * 边界（B4）：只引用原文件——不 OCR、不抽取、不复制进数据目录。
 * `path` 只在本地流转（stat、重新选择），进导出 JSON 的只有
 * `display_name/kind/byte_len`。
 *
 * `open` 对话框本身是逐次确认：用户每点一次「添加」就主动选一回文件。
 */
import type {
  AiTaskAttachmentRef,
  AiTaskAttachmentState,
  AiTaskAttachmentStat,
} from '../bridge/types';
import { backend } from '../bridge';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']);

export const attachmentKindFromPath = (path: string): 'pdf' | 'image' | null => {
  const match = /\.([a-z0-9]+)$/i.exec(path.trim());
  if (!match) return null;
  const ext = match[1].toLowerCase();
  if (ext === 'pdf') return 'pdf';
  return IMAGE_EXTENSIONS.has(ext) ? 'image' : null;
};

/**
 * 两种分隔符都认：对话框在 Windows 上给 `\`，测试/移植库给 `/`。
 * basename 为空（路径以分隔符收尾）时回退固定占位名——`display_name`
 * 会进出仓 JSON，把完整路径兜底塞回去等于漏本机路径。
 */
export const attachmentDisplayName = (path: string): string => {
  const name = path.split(/[\\/]/).pop() ?? path;
  return name.trim() || 'attachment';
};

/** 新建一条引用。`byte_len` 存当前大小当基线，`changed` 靠它判定。 */
export const attachmentRefFromPath = (
  path: string,
  stat?: AiTaskAttachmentStat,
): AiTaskAttachmentRef | null => {
  const kind = attachmentKindFromPath(path);
  if (!kind) return null;
  return {
    id: newAttachmentId(),
    path,
    display_name: attachmentDisplayName(path),
    kind,
    byte_len: stat?.byte_len ?? null,
    added_at: new Date().toISOString(),
  };
};

const newAttachmentId = (): string => {
  // Tauri webview 是安全上下文，randomUUID 在；测试环境退回普通随机串。
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * 状态判定（A7 定稿）：missing = 文件没了；changed = 字节数和添加时的
 * 基线不同（基线 null 时无从判定，不报 changed）；其余 ok。
 */
export const attachmentStateFromStat = (
  ref: Pick<AiTaskAttachmentRef, 'byte_len'>,
  stat: Pick<AiTaskAttachmentStat, 'exists' | 'byte_len'> | undefined,
): AiTaskAttachmentState => {
  if (!stat || !stat.exists) return 'missing';
  if (ref.byte_len !== null && stat.byte_len !== null && stat.byte_len !== ref.byte_len) {
    return 'changed';
  }
  return 'ok';
};

export const statToStatus = (
  refs: AiTaskAttachmentRef[],
  stats: AiTaskAttachmentStat[],
): Array<{ id: string; status: AiTaskAttachmentState; byte_len: number | null }> => {
  const byPath = new Map(stats.map((stat) => [stat.path, stat]));
  return refs.map((ref) => ({
    id: ref.id,
    status: attachmentStateFromStat(ref, byPath.get(ref.path)),
    byte_len: byPath.get(ref.path)?.byte_len ?? null,
  }));
};

/** 打开文件对话框挑原件。取消返回空表，不区分「取消」和「没选到」。 */
export const pickAttachmentPaths = async (
  title: string,
  filterName: string,
  multiple = true,
): Promise<string[]> => {
  // 动态 import：这个模块的纯函数部分要能在 vitest(node) 里跑，
  // 顶层静态引入会把 Tauri 插件拖进测试。
  const { open } = await import('@tauri-apps/plugin-dialog');
  const picked = await open({
    title,
    multiple,
    filters: [{ name: filterName, extensions: ['pdf', ...IMAGE_EXTENSIONS] }],
  });
  if (!picked) return [];
  return (Array.isArray(picked) ? picked : [picked]).map(String);
};

/**
 * 挑选 → stat → 建成引用的一条龙。返回 `{ added, skipped }`：
 * 扩展名不认识的文件不进列表，也不该假装加进去了。
 */
export const pickAttachments = async (
  title: string,
  filterName: string,
  multiple = true,
): Promise<{ added: AiTaskAttachmentRef[]; skipped: string[] }> => {
  const paths = await pickAttachmentPaths(title, filterName, multiple);
  if (!paths.length) return { added: [], skipped: [] };
  let stats: AiTaskAttachmentStat[] = [];
  try {
    stats = await backend.aiTaskAttachmentStat(paths);
  } catch {
    // stat 失败不挡住添加：byte_len 基线置空，changed 判定让位给交付前复查。
    stats = [];
  }
  const byPath = new Map(stats.map((stat) => [stat.path, stat]));
  const added: AiTaskAttachmentRef[] = [];
  const skipped: string[] = [];
  for (const path of paths) {
    const ref = attachmentRefFromPath(path, byPath.get(path));
    if (ref) added.push(ref);
    else skipped.push(path);
  }
  return { added, skipped };
};
