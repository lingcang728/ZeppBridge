import { ref } from 'vue';
import { backend, isDesktop } from '../lib/bridge';
import { localDateString } from '../lib/format';
import type { LifeEvent, LifeEventInput } from '../types';

const events = ref<LifeEvent[]>([]);
const loading = ref(false);
const failed = ref(false);
const draft = ref<LifeEventInput | null>(null);
/* 胶囊与图上事件区带互相高亮（U24）。分两个方向存：图表只跟着胶囊变，胶囊只跟着图表变——
   否则悬停图表 → 改图表 → 图表重绘触发移出 → 又改回来，来回抖。 */
const chipFocus = ref<number | null>(null);
const chartFocus = ref<number | null>(null);
let pending: Promise<void> | null = null;
let loadedOnce = false;
/** 读过至少一次（响应式）：之后的重读不该让界面回到「不知道有没有」的状态。 */
const loaded = ref(false);
async function reload() {
  if (!isDesktop()) return;
  if (pending) return pending;
  loading.value = true;
  failed.value = false;
  pending = backend.listLifeEvents().then(rows => { events.value = rows; loadedOnce = true; loaded.value = true; })
    .catch(() => { failed.value = true; })
    .finally(() => { loading.value = false; pending = null; });
  return pending;
}
function open(event?: LifeEvent, date = localDateString(new Date())) {
  draft.value = event ? { id: event.id, title: event.title, category: event.category,
    startDate: event.startDate, endDate: event.endDate, notes: event.notes }
    : { id: null, title: '', category: 'other', startDate: date, endDate: date, notes: '' };
}
/** 趋势图要画事件区带，但不是每页都有事件胶囊（它负责 reload）：没读过就读一次。 */
function ensureLoaded() {
  if (!loadedOnce) void reload();
}
export const useLifeEvents = () => ({ ensureLoaded, events, loading, loaded, failed, draft, reload, open, chipFocus, chartFocus });
