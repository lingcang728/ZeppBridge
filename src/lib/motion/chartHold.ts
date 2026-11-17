import { inject, provide, type InjectionKey, type Ref } from 'vue';

/**
 * 「这一片的图表先别画」（2026-11-17，心率页下半截晚一拍才出来）。
 *
 * #168 为了让卡 → 页形变起飞不被首屏之外的那几张卡拖住，把下半截整段延后到落地才挂——用户看到的是页面长满以后
 * 下面一大片空着、过一会儿整块冒出来。现在下半截首帧就挂（标题、数字、卡片都在），只有画布（ECharts 建图、
 * 排版、画第一帧，这一页最贵的那部分）押到落地以后，一帧一张地画、淡入。
 *
 * 用法：页面把首屏之外那一片包在 `<ChartHold :ready="...">` 里；里面的 SwapChart 在 ready 之前只放同样大小的空壳。
 * 不放 ChartHold 的地方照旧直接画。
 */
export const CHART_HOLD: InjectionKey<Readonly<Ref<boolean>>> = Symbol('chart-hold');

export const provideChartHold = (ready: Readonly<Ref<boolean>>) => provide(CHART_HOLD, ready);

/** 外面没包 ChartHold 时是 null（= 不押）。 */
export const useChartHold = (): Readonly<Ref<boolean>> | null => inject(CHART_HOLD, null);
