<script setup lang="ts">
/**
 * 「接回定稿」按钮（2026-10-12 第 3 批）。三种样子：
 *   - `icon`：计划面标题旁的一枚圆形图标按钮；
 *   - `primary`：还没有计划时的大按钮；
 *   - `pill`：周视图标题行的小胶囊。
 * 按下去：玻璃纸片从按钮里抽出来，读到定稿就滑到 `target()`（日程那一块）盖住它，旧的几行退下，
 * 存好以后一行一行让开、新行逐行落定（lib/motion/paper.ts）；读不到 / 存不了就在纸片上写原因、原路退回。
 * 网页预览没有剪贴板权限：点开是一块粘贴框，粘贴后走同一段动画。
 */
import { onBeforeUnmount, ref } from 'vue';
import { useTrainingPlan } from '../../../composables/useTrainingPlan';
import { useBridgeText } from './bridge.i18n';
import { usePlanText } from '../../plan/usePlanText';
import { isDesktop } from '../../../lib/bridge';
import { createPaper, type Paper } from '../../../lib/motion/paper';
import Icon from '../../Icon.vue';

const props = withDefaults(defineProps<{ variant?: 'icon' | 'primary' | 'pill'; target?: () => HTMLElement | null }>(), { variant: 'pill', target: undefined });
const emit = defineEmits<{ received: [] }>();
const t = useBridgeText();
const { t: pt } = usePlanText();
const plan = useTrainingPlan();
const button = ref<HTMLButtonElement | null>(null);
const webOpen = ref(false);
const reply = ref('');
const running = ref(false);
let paper: Paper | null = null;

/** 纸片上写的原因：和页面底下那条提示是同一句。 */
const reason = (): string => {
  const n = plan.notice.value;
  if (n?.kind === 'clipboard_not_a_plan') return t.value.receiveEmpty;
  if (n?.kind === 'paste_failed') return { empty: pt.value.pasteEmpty, no_json: pt.value.pasteNoJson, not_a_plan: pt.value.pasteNotPlan }[n.failure];
  if (n?.kind === 'error' && n.text) return n.text;
  return pt.value.noticeError;
};

const run = async (read: () => Promise<string | null>) => {
  if (running.value || plan.busy.value || !button.value) return;
  running.value = true;
  paper = createPaper(button.value);
  try {
    const pulled = paper.pullOut();
    const text = await read();
    await pulled;
    if (!text) { await paper.fail(reason()); return; }
    const lines = text.split(/\r?\n/);
    paper.fill(lines.filter((line) => line.trim()).slice(0, 5), t.value.transcript(lines.length));
    if (await paper.land(props.target?.() ?? null, () => plan.paste(text), reason)) emit('received');
  } finally {
    paper = null;
    running.value = false;
  }
};

const receive = () => {
  if (!isDesktop()) { webOpen.value = !webOpen.value; return; }
  void run(() => plan.readClipboardPlan());
};
const paste = () => {
  const text = reply.value;
  if (!text.trim()) return;
  reply.value = '';
  webOpen.value = false;
  void run(async () => text);
};
onBeforeUnmount(() => paper?.dispose());
</script>

<template>
  <div :class="['receive', `is-${variant}`]">
    <button ref="button" type="button" class="receive-button" :disabled="plan.busy.value || running" :aria-label="t.receive" :title="variant === 'icon' ? t.receive : undefined" @click="receive">
      <Icon name="copy" :size="variant === 'primary' ? 18 : 15" />
      <span v-if="variant !== 'icon'">{{ running ? t.receiving : t.receive }}</span>
    </button>
    <div v-if="webOpen" class="web-paste">
      <label>{{ t.previewPaste }}<textarea v-model="reply" rows="4"></textarea></label>
      <div class="web-acts">
        <button type="button" class="pill-button quiet" @click="webOpen = false">{{ t.close }}</button>
        <button type="button" class="pill-button" :disabled="!reply.trim() || plan.busy.value" @click="paste">{{ t.inspect }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./ReceiveCapsule.css"></style>
