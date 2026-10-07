<script setup lang="ts">
/**
 * 底栏右边那一枚主按钮（批次 5.1，10-07 第二轮改成真正的 Liquid Glass 滚轮）：
 * 「交给 ChatGPT」本身就是一只横向的玻璃滚轮（CapsuleWheel）——
 *   - 左右拖、触控板横滑、滚轮、← / →：换一家，邻近的几家在两侧沿圆柱侧转、露出半截，玻璃镜片跟手；
 *   - 单击镜片里的那一家（或 Enter / 空格）：寄出；点两侧露出的那一家：先转过去；
 *   - 镜片是透明的折射玻璃（同顶栏导航胶囊），镜片里的模型名用品牌绿字（第四轮 1D·D3，用户 10-07：整页不再有大块实色）；
 *     右上角一枚小玻璃角标说这家是「免费版」还是「已订阅」（在寄出前检查里改）。
 * 第三轮 B2：「交给」固定在左边，滚轮只滚「图标 + 模型名」（以前每一项都带「交给」，滚起来一排「交给交给」）；
 * 去掉胶囊外的绿色外发光和渐变高光（「AI 味」）；数据没备好时整枚是中性玻璃，备好了才点亮绿色；
 * 悬停只让镜片微微提亮、边缘一道高光，不换底色。底栏的毛玻璃挪到了垫底的一层（HandoffDock.css），透镜看得见滚轮里的字。
 */
import { computed } from 'vue';
import CapsuleWheel from '../CapsuleWheel.vue';
import Icon from '../Icon.vue';
import { AI_PROVIDERS, type AiProvider, type AiProviderId } from '../../lib/aiProviders';
import { isSubscribed } from '../../lib/aiTask/budget';
import { useHandoffText } from './HandoffDock.i18n';

const props = defineProps<{ provider: AiProvider; disabled: boolean; sub: string; title: string }>();
const emit = defineEmits<{ go: []; pick: [AiProvider] }>();
const t = useHandoffText();
const paid = computed(() => isSubscribed(props.provider.id));
const items = computed(() => AI_PROVIDERS.map((p) => ({ value: p.id, label: p.label, image: p.localIcon })));
const pick = (id: AiProviderId) => {
  const next = AI_PROVIDERS.find((p) => p.id === id);
  if (next && next.id !== props.provider.id) emit('pick', next);
};
const go = () => { if (!props.disabled) emit('go'); };
</script>

<template>
  <div :class="['go-capsule', { disabled }]" :title="title">
    <span class="go-prefix" aria-hidden="true">{{ t.goPrefix }}</span>
    <CapsuleWheel class="go-wheel" loop activatable :span="250" :items="items" :model-value="provider.id" :disabled="disabled"
      :aria-label="`${t.go(provider.label)} · ${paid ? t.planPaid : t.planFree}`" @update:model-value="pick" @activate="go" />
    <span :class="['badge', { paid }]" aria-hidden="true">{{ paid ? t.planPaid : t.planFree }}</span>
    <button type="button" class="send" :disabled="disabled" :aria-label="t.go(provider.label)" @click="go"><Icon name="send" :size="17" /></button>
  </div>
</template>

<style scoped>
.go-capsule { position: relative; display: flex; align-items: center; gap: 6px; padding: 4px 4px 4px 16px; border-radius: 999px; background: var(--cap-track); box-shadow: var(--cap-track-shadow); }
.go-capsule.disabled { opacity: .7; }
/* 固定的「交给」：滚轮只滚后面的模型。 */
.go-prefix { flex: 0 0 auto; color: var(--muted); font-size: var(--fs-md); font-weight: 700; white-space: nowrap; }
/* 滚轮放大一号；镜片是透明玻璃（同顶栏的玻璃镜片 token），镜片里的模型名是品牌绿字。没有外发光、没有实色底。 */
.go-wheel { --cap-ink: var(--accent); height: 48px; background: none !important; box-shadow: none !important; }
.go-wheel :deep(.wheel-lens) { top: 2px; bottom: 2px; background: var(--cap-glass-thumb); box-shadow: var(--cap-glass-thumb-rim);
  transition: scale var(--dur-base) var(--ease-spring), filter var(--dur-base) ease, box-shadow var(--dur-base) ease; }
.go-capsule:not(.disabled) .go-wheel:hover :deep(.wheel-lens) { filter: brightness(1.08); box-shadow: var(--cap-glass-thumb-rim), inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent); }
/* 没备好：中性玻璃，字是普通的墨色。 */
.go-capsule.disabled .go-wheel { --cap-ink: var(--ink); }
.go-capsule.disabled .go-wheel :deep(.wheel-lens) { background: var(--cap-thumb); box-shadow: var(--cap-thumb-rim); }
.go-capsule.disabled .send { background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--muted); }
.go-wheel :deep(.wheel-refract) { top: 2px; bottom: 2px; }
.go-wheel :deep(.wheel-item) { font-size: var(--fs-md); padding: 0 14px; }
.go-wheel :deep(.wheel-label) { font-weight: 700; }
.go-wheel :deep(.wheel-image) { width: 22px; height: 22px; flex-basis: 22px; border-radius: 6px; }
.badge { position: absolute; top: -7px; right: 46px; z-index: 2; padding: 1px 7px; border-radius: 999px; background: var(--mat-glass-strong); box-shadow: var(--glass-rim);
  color: var(--muted); font-size: 10px; font-weight: 700; line-height: 15px; pointer-events: none; }
.badge.paid { color: var(--accent); box-shadow: var(--glass-rim), inset 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent); }
.send { display: grid; place-items: center; width: 44px; height: 44px; flex: 0 0 44px; border: 0; border-radius: 50%; background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent); cursor: pointer; transition: transform 160ms ease, background var(--dur-base) ease; }
.send:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 28%, transparent); transform: translateX(2px); }
.send:active:not(:disabled) { transform: scale(.94); }
.send:disabled { cursor: default; }
.send:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
