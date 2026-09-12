import { ref } from 'vue';
import { tauriApi, isDesktop } from './useTauriApi';
import { localDateString } from '../lib/format';
import type { LifeEvent, LifeEventInput } from '../types';

const events = ref<LifeEvent[]>([]);
const loading = ref(false);
const failed = ref(false);
const draft = ref<LifeEventInput | null>(null);
let pending: Promise<void> | null = null;
async function reload() {
  if (!isDesktop()) return;
  if (pending) return pending;
  loading.value = true;
  failed.value = false;
  pending = tauriApi.listLifeEvents().then(rows => { events.value = rows; })
    .catch(() => { failed.value = true; })
    .finally(() => { loading.value = false; pending = null; });
  return pending;
}
function open(event?: LifeEvent, date = localDateString(new Date())) {
  draft.value = event ? { id: event.id, title: event.title, category: event.category,
    startDate: event.startDate, endDate: event.endDate, notes: event.notes }
    : { id: null, title: '', category: 'other', startDate: date, endDate: date, notes: '' };
}
export const useLifeEvents = () => ({ events, loading, failed, draft, reload, open });
