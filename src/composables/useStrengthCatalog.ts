/* Zepp 力量动作目录（#163）：按界面语言取一次，整个会话共用。
 *
 * 静态表只认 0–130 的老动作；1001 起的新动作名字和肌群要靠这份目录。后端缓存优先、
 * 一个月才问一次 Zepp；拉不到时给空目录，界面退回 `#编号`，不报错、不阻塞卡片。 */
import { shallowRef, watch, type Ref, type ShallowRef } from 'vue';
import { backend } from '../lib/bridge';
import { locale } from '../i18n';
import type { StrengthCatalogAction, StrengthCatalogResult } from '../types';

export type StrengthCatalogMap = ReadonlyMap<number, StrengthCatalogAction>;

const EMPTY: StrengthCatalogMap = new Map();
const RETRY_MS = 60_000;
type CatalogLoad = { map: StrengthCatalogMap; status: StrengthCatalogResult['status'] };
const byLocale = new Map<string, { until: number; result: Promise<CatalogLoad> }>();

const load = (value: string, refresh: boolean): Promise<CatalogLoad> => {
  const key = `${value}:${refresh}`;
  const cached = byLocale.get(key);
  if (cached && cached.until > Date.now()) return cached.result;
  const result = backend.getStrengthCatalog(value, refresh).then((response): CatalogLoad => ({
    map: new Map(response.actions.map((action) => [action.action_code, action])),
    status: response.status,
  })).catch((): CatalogLoad => ({ map: EMPTY, status: 'unavailable' }));
  const entry = { until: Infinity, result };
  byLocale.set(key, entry);
  void result.then(({ status }) => {
    if (status === 'fresh') byLocale.set(`${value}:false`, entry);
    else entry.until = Date.now() + RETRY_MS;
  });
  return result;
};

/** Only a workout with strength data needs the catalog. Cached names appear before refresh. */
export function useStrengthCatalog(needed: Ref<boolean>): ShallowRef<StrengthCatalogMap> {
  const catalog = shallowRef<StrengthCatalogMap>(EMPTY);
  watch([locale, needed], ([value, active], _, onCleanup) => {
    catalog.value = EMPTY;
    if (!active) return;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    onCleanup(() => { canceled = true; clearTimeout(timer); });
    const update = async (refresh: boolean) => {
      const { map, status } = await load(value, refresh);
      if (canceled) return;
      if (status !== 'unavailable') catalog.value = map;
      if (status === 'stale' && !refresh) void update(true);
      else if (status !== 'fresh') timer = setTimeout(() => { void update(true); }, RETRY_MS);
    };
    void update(false);
  }, { immediate: true });
  return catalog;
}
