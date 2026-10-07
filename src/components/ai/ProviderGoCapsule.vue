<script setup lang="ts">
/**
 * 底栏右边那一枚主按钮（批次 5.1，10-07 第二轮改成真正的 Liquid Glass 滚轮）：
 * 「交给 ChatGPT」本身就是一只横向的玻璃滚轮（CapsuleWheel）——
 *   - 左右拖、触控板横滑、滚轮、← / →：换一家，邻近的几家在两侧沿圆柱侧转、露出半截，玻璃镜片跟手；
 *   - 单击镜片里的那一家（或 Enter / 空格）：寄出；点两侧露出的那一家：先转过去；
 *   - 镜片染成品牌绿，是整页唯一的实色；右上角一枚小角标说这家是「免费版」还是「已订阅」（在寄出前检查里改）。
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
const items = computed(() => AI_PROVIDERS.map((p) => ({ value: p.id, label: t.value.go(p.label), image: p.localIcon })));
const pick = (id: AiProviderId) => {
  const next = AI_PROVIDERS.find((p) => p.id === id);
  if (next && next.id !== props.provider.id) emit('pick', next);
};
const go = () => { if (!props.disabled) emit('go'); };
</script>

<template>
  <div :class="['go-capsule', { disabled }]" :title="title">
    <CapsuleWheel class="go-wheel" loop activatable :span="300" :items="items" :model-value="provider.id" :disabled="disabled"
      :aria-label="`${t.go(provider.label)} · ${paid ? t.planPaid : t.planFree}`" @update:model-value="pick" @activate="go" />
    <span :class="['badge', { paid }]" aria-hidden="true">{{ paid ? t.planPaid : t.planFree }}</span>
    <button type="button" class="send" :disabled="disabled" :aria-label="t.go(provider.label)" @click="go"><Icon name="send" :size="17" /></button>
  </div>
</template>

<style scoped>
.go-capsule { position: relative; display: flex; align-items: center; gap: 6px; padding: 4px; border-radius: 999px; background: var(--cap-track); box-shadow: var(--cap-track-shadow); }
.go-capsule.disabled { opacity: .55; }
/* 滚轮放大一号；镜片是品牌绿的实心胶囊，镜片里的字用绿底上的深色。 */
.go-wheel { --cap-ink: var(--accent-ink, #10140c); height: 48px; background: none !important; box-shadow: none !important; }
.go-wheel :deep(.wheel-lens) { top: 2px; bottom: 2px; background: linear-gradient(180deg, rgba(255, 255, 255, .28), rgba(255, 255, 255, 0) 55%), var(--accent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .45), inset 0 -2px 6px rgba(0, 0, 0, .16), 0 8px 22px -10px color-mix(in srgb, var(--accent) 75%, transparent); }
.go-wheel :deep(.wheel-refract) { top: 2px; bottom: 2px; }
.go-wheel :deep(.wheel-item) { font-size: var(--fs-md); padding: 0 14px; }
.go-wheel :deep(.wheel-label) { font-weight: 700; }
.go-wheel :deep(.wheel-image) { width: 22px; height: 22px; flex-basis: 22px; border-radius: 6px; }
.badge { position: absolute; top: -7px; right: 46px; z-index: 2; padding: 1px 7px; border-radius: 999px; background: var(--mat-glass-strong); box-shadow: var(--glass-rim);
  color: var(--muted); font-size: 10px; font-weight: 700; line-height: 15px; pointer-events: none; }
.badge.paid { background: var(--accent); color: var(--accent-ink, #10140c); box-shadow: none; }
.send { display: grid; place-items: center; width: 44px; height: 44px; flex: 0 0 44px; border: 0; border-radius: 50%; background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent); cursor: pointer; transition: transform 160ms ease, background var(--dur-base) ease; }
.send:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 28%, transparent); transform: translateX(2px); }
.send:active:not(:disabled) { transform: scale(.94); }
.send:disabled { cursor: default; }
.send:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
