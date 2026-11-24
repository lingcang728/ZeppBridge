/**
 * 应用内的确认框：替代原生 window.confirm（原生对话框打断玻璃界面，按钮文字也跟着系统语言走）。
 * 全局只挂一个 ConfirmHost（components/shell/ConfirmHost.vue）；调用方 `await confirm({...})` 拿到真 / 假。
 * Esc、点遮罩、点取消都算取消。同一时刻只有一个确认框：新的来了，旧的按取消结算。
 */
import { computed, shallowRef } from 'vue';

export type ConfirmAction = 'continue' | 'delete' | 'disconnect' | 'signOut' | 'regenerate' | 'startOver' | 'reset' | 'change' | 'send';

export interface ConfirmOptions {
  /** 正文：调用方现成的那句确认文案，可以带 \n 分段。 */
  text: string;
  /** 加粗的标题，可省略；省略时正文的第一段当标题。 */
  title?: string;
  /** 确认按钮上的字：给现成的动作词，或直接给一句已翻好的文字。 */
  confirm?: ConfirmAction | { text: string };
  /** 删除、断开、重新开始这类不可逆操作：确认按钮用警示色。 */
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  id: number;
  origin: HTMLElement | null;
  resolve: (confirmed: boolean) => void;
}

const pending = shallowRef<PendingConfirm | null>(null);
let nextId = 1;

// 不用 readonly()：深只读代理会包住 origin 元素，量尺寸时报 Illegal invocation。
export const confirmState = computed(() => pending.value);

export function settleConfirm(confirmed: boolean): void {
  const current = pending.value;
  if (!current) return;
  pending.value = null;
  current.resolve(confirmed);
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  settleConfirm(false);
  // 从按下的那个按钮里长出来、关时缩回去（ModalDialog 的 origin）。
  const origin = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null;
  return new Promise<boolean>((resolve) => {
    pending.value = { ...options, id: nextId++, origin, resolve };
  });
}

export const useConfirm = () => confirmDialog;
