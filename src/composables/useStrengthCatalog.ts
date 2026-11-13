/* Zepp 力量动作目录（#163）：按界面语言取一次，整个会话共用。
 *
 * 静态表只认 0–130 的老动作；1001 起的新动作名字和肌群要靠这份目录。后端缓存优先、
 * 一个月才问一次 Zepp；拉不到时给空目录，界面退回 `#编号`，不报错、不阻塞卡片。 */
import { shallowRef, watch, type ShallowRef } from 'vue';
import { backend } from '../lib/bridge';
import { locale } from '../i18n';
import type { StrengthCatalogAction } from '../types';

export type StrengthCatalogMap = ReadonlyMap<number, StrengthCatalogAction>;

const EMPTY: StrengthCatalogMap = new Map();
const byLocale = new Map<string, Promise<StrengthCatalogMap>>();

const load = (value: string): Promise<StrengthCatalogMap> => {
  let pending = byLocale.get(value);
  if (!pending) {
    pending = backend
      .getStrengthCatalog(value)
      .then((result) => {
        // 一份都没有（没连旧连接器、离线）：不记住这次结果，下次打开再问后端。
        if (result.status === 'unavailable') byLocale.delete(value);
        return new Map(result.actions.map((action) => [action.action_code, action])) as StrengthCatalogMap;
      })
      .catch(() => {
        // 浏览器预览或后端暂不可用：下次再试，这次用空目录。
        byLocale.delete(value);
        return EMPTY;
      });
    byLocale.set(value, pending);
  }
  return pending;
};

/** 当前界面语言的动作目录；切语言时自动换。 */
export function useStrengthCatalog(): ShallowRef<StrengthCatalogMap> {
  const catalog = shallowRef<StrengthCatalogMap>(EMPTY);
  watch(
    locale,
    (value) => {
      void load(value).then((map) => {
        if (locale.value === value) catalog.value = map;
      });
    },
    { immediate: true },
  );
  return catalog;
}
