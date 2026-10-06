/**
 * 往返记录（每一次交给 AI 的数据，和接回来的下一步）。全局单例：交给 AI 的总页、往返详情页、
 * 周视图读同一份，切子页面不重读、不丢。
 */
import { ref } from 'vue';
import { backend, toUserMessage } from '../lib/bridge';
import type { AiExchange } from '../types/timeBridge';

const exchanges = ref<AiExchange[]>([]);
const error = ref<string | null>(null);
const loaded = ref(false);
let seq = 0;

const load = async () => {
  const mine = ++seq;
  try {
    const next = await backend.aiExchangeList(30);
    if (mine === seq) { exchanges.value = next; error.value = null; loaded.value = true; }
  } catch (e) {
    if (mine === seq) error.value = toUserMessage(e, '');
  }
};

export const useExchanges = () => ({ exchanges, error, loaded, load });
