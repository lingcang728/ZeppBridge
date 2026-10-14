import { defineMessages } from '../../../i18n';

/* 设置「显示与语言」卡（2A 极简重写）。 */
export const displayCardMessages = defineMessages(
  {
    focusTitle: '我关注',
    focusSlideSub: '概览先摆这一块，其余收进「查看全部」；停在「均衡」就是原样',
  },
  {
    focusTitle: 'I care about',
    focusSlideSub: 'Overview puts this block first and folds the rest under “Show all”; “Balanced” keeps it as is',
  },
  {
    focusTitle: 'Me interesa',
    focusSlideSub: 'El resumen muestra primero este bloque y agrupa el resto en «Mostrar todo»; «Equilibrado» lo deja igual',
  },
  'views/settings/sections/display',
);
