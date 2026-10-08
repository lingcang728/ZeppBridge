import { defineMessages } from '../../../i18n';

/* 设置「显示与语言」卡（2A 极简重写）。 */
export const displayCardMessages = defineMessages(
  {
    focusTitle: '我关注',
    focusSub: '概览先摆这几块，其余收进「查看全部」；都不选就是原样',
  },
  {
    focusTitle: 'I care about',
    focusSub: 'Overview puts these first and folds the rest under “Show all”; pick none to keep it as is',
  },
  {
    focusTitle: 'Me interesa',
    focusSub: 'El resumen muestra primero estos bloques y agrupa el resto en «Mostrar todo»; sin elegir ninguno queda igual',
  },
  'views/settings/sections/display',
);
