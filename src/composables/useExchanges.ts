import { ref } from 'vue';
import { backend, toUserMessage } from '../lib/bridge';
import type { AiExchange } from '../types/timeBridge';

export const useExchanges = () => {
  const exchanges = ref<AiExchange[]>([]), error = ref<string | null>(null);
  let seq = 0;
  const load = async () => { const mine = ++seq; try { const next = await backend.aiExchangeList(30); if (mine === seq) { exchanges.value = next; error.value = null; } } catch (e) { if (mine === seq) error.value = toUserMessage(e, ''); } };
  return { exchanges, error, load };
};
