/**
 * 年轮的年度数据（后端 `annual_rings`）：履历页的年轮区块和 /rings 页共用一份。
 *
 * 全应用一份、读过就留着：履历页不在页面缓存里，每次返回都重新挂载——以前它挂上那一刻数据是空的，
 * 日历和四张小结卡要等一帧读库才出来，返回形变量卡时 PB 墙还在高处，窗口落到了 PB 墙上面两百像素
 * （用户 2026-10-27 录屏「PB 的位置根本不在原来的地方」）。现在重新挂载直接用上次的数据画，
 * 后台再读一次，内容没变不换引用。
 */
import { ref, shallowRef } from 'vue';
import { backend, toUserMessage } from '../lib/bridge';
import type { AnnualRings } from '../types/rings';

const data = shallowRef<AnnualRings | null>(null);
const error = ref<string | null>(null);
/** 读过一次了（成功或失败）：在这之前界面画占位，不说「还没有」。 */
const loaded = ref(false);
let inflight: Promise<void> | null = null;

const load = () => inflight ??= (async () => {
  try {
    const next = await backend.annualRings();
    if (JSON.stringify(next) !== JSON.stringify(data.value)) data.value = next;
    error.value = null;
  } catch (e) {
    error.value = toUserMessage(e, '');
  } finally {
    loaded.value = true;
    inflight = null;
  }
})();

export const useAnnualRings = () => ({ data, error, loaded, load });
