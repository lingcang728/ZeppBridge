import type { DesignIconName } from '../../components/DesignIcon.vue';
import type { GlyphTone } from '../../lib/glyphs';

/** 设置卡叠里的十一张卡，按总览里从上到下的顺序。id 也是路由 /settings/:card 的那一段。
    「Beta 实验室」顶替过原来的「反馈问题」卡（2026-11-10：反馈改成在信匣里写信）；第二天用户觉得写信入口藏得太深，
    又放回一张「写给作者」卡（feedback）：卡头上的笔一点，信纸直接抽出来。 */
export const SETTINGS_CARD_IDS = ['account', 'sync', 'archive', 'data', 'ai', 'display', 'feedback', 'labs', 'guide', 'privacy', 'advanced'] as const;
export type SettingsCardId = (typeof SETTINGS_CARD_IDS)[number];

export const SETTINGS_CARD_ICONS: Record<SettingsCardId, DesignIconName> = {
  account: 'profile',
  sync: 'auto-sync',
  archive: 'database',
  data: 'structured-data',
  ai: 'handoff',
  display: 'overview',
  feedback: 'manual-entry',
  labs: 'oscillation',
  guide: 'ai-ready',
  privacy: 'secure',
  advanced: 'maintenance',
};

/** 每张卡一个颜色：叠在一起时像钱包里颜色不同的卡，一眼分得开。 */
export const SETTINGS_CARD_TONES: Record<SettingsCardId, GlyphTone> = {
  account: 'pace',
  sync: 'training',
  archive: 'sleep',
  data: 'activity',
  ai: 'accent',
  display: 'altitude',
  feedback: 'pace',
  labs: 'calories',
  guide: 'altitude',
  privacy: 'heart',
  advanced: 'neutral',
};

export const isSettingsCardId = (value: unknown): value is SettingsCardId =>
  typeof value === 'string' && (SETTINGS_CARD_IDS as readonly string[]).includes(value);

/** 旧链接（#connection、?focus=connection）是来重新连接的：连接 / 重新授权的主按钮在「账号与设备」卡上
    （全套登录方式在高级卡，那是换登录方式才去的地方）。 */
export const legacySettingsTarget = (hash: string, focus: unknown): SettingsCardId | null =>
  (hash === '#connection' || focus === 'connection' ? 'account' : null);
