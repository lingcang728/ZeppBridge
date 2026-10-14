import { computed, ref } from 'vue';
import { locale, type Locale } from '../../i18n';

/**
 * 换语言的涟漪还没放完时又拨了一下：新选择先记在这里，等这一圈放完再接着换（lib/motion/ashSwitch.ts）。
 * 语言轮显示的是 `shownLocale`，不然它会被拉回还没换过去的那一项、过一会儿又自己转过去。
 */
export const localeTarget = ref<Locale | null>(null);

export const shownLocale = computed<Locale>(() => localeTarget.value ?? locale.value);
