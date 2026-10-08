import type { DesignIconName } from '../../components/DesignIcon.vue';
import type { GlyphTone } from '../../lib/glyphs';

/** 设置卡叠里的八张卡，按总览里从上到下的顺序。id 也是路由 /settings/:card 的那一段。 */
export const SETTINGS_CARD_IDS = ['account', 'sync', 'archive', 'data', 'ai', 'display', 'privacy', 'advanced'] as const;
export type SettingsCardId = (typeof SETTINGS_CARD_IDS)[number];

export const SETTINGS_CARD_ICONS: Record<SettingsCardId, DesignIconName> = {
  account: 'profile',
  sync: 'auto-sync',
  archive: 'database',
  data: 'structured-data',
  ai: 'handoff',
  display: 'overview',
  privacy: 'secure',
  advanced: 'settings',
};

/** 每张卡一个颜色：叠在一起时像钱包里颜色不同的卡，一眼分得开。 */
export const SETTINGS_CARD_TONES: Record<SettingsCardId, GlyphTone> = {
  account: 'pace',
  sync: 'training',
  archive: 'sleep',
  data: 'activity',
  ai: 'accent',
  display: 'altitude',
  privacy: 'heart',
  advanced: 'neutral',
};

export const isSettingsCardId = (value: unknown): value is SettingsCardId =>
  typeof value === 'string' && (SETTINGS_CARD_IDS as readonly string[]).includes(value);

/** 旧链接（#connection、?focus=connection）是来重新连接的：连接 / 重新授权的主按钮在「账号与设备」卡上
    （全套登录方式在高级卡，那是换登录方式才去的地方）。 */
export const legacySettingsTarget = (hash: string, focus: unknown): SettingsCardId | null =>
  (hash === '#connection' || focus === 'connection' ? 'account' : null);
