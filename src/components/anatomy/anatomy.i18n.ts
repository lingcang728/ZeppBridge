import { defineMessages, useMessages } from '../../i18n';

/* 人体分块图（力量卡的肌肉负荷）：肌肉名、正反面、深浅图例。 */
const messages = defineMessages(
  {
    front: '正面',
    back: '背面',
    figureAria: (side: string) => `肌肉负荷人形图 · ${side}`,
    muscles: {
      chest: '胸大肌', obliques: '腹斜肌', abs: '腹直肌', biceps: '肱二头肌', triceps: '肱三头肌',
      neck: '颈部', trapezius: '斜方肌', deltoids: '三角肌', adductors: '大腿内收肌', quadriceps: '股四头肌',
      knees: '膝', tibialis: '胫骨前肌', calves: '小腿三头肌', forearm: '前臂', hands: '手', ankles: '踝',
      feet: '足', head: '头', hair: '头', 'upper-back': '背阔肌', 'lower-back': '竖脊肌', gluteal: '臀大肌',
      hamstring: '腘绳肌',
    },
    loadTitle: (name: string, primary: number, secondary: number) =>
      [name, primary > 0 ? `主练 ${primary} 组` : '', secondary > 0 ? `辅助 ${secondary} 组` : ''].filter(Boolean).join(' · '),
    legendLight: '少',
    legendHeavy: '多',
    legendSecondary: '仅辅助',
  },
  {
    front: 'Front',
    back: 'Back',
    figureAria: (side: string) => `Muscle load figure · ${side}`,
    muscles: {
      chest: 'Chest', obliques: 'Obliques', abs: 'Abs', biceps: 'Biceps', triceps: 'Triceps',
      neck: 'Neck', trapezius: 'Trapezius', deltoids: 'Deltoids', adductors: 'Adductors', quadriceps: 'Quadriceps',
      knees: 'Knee', tibialis: 'Tibialis', calves: 'Calves', forearm: 'Forearm', hands: 'Hand', ankles: 'Ankle',
      feet: 'Foot', head: 'Head', hair: 'Head', 'upper-back': 'Lats', 'lower-back': 'Lower back', gluteal: 'Glutes',
      hamstring: 'Hamstrings',
    },
    loadTitle: (name: string, primary: number, secondary: number) =>
      [name, primary > 0 ? `primary ${primary} ${primary === 1 ? 'set' : 'sets'}` : '', secondary > 0 ? `secondary ${secondary} ${secondary === 1 ? 'set' : 'sets'}` : ''].filter(Boolean).join(' · '),
    legendLight: 'Fewer sets',
    legendHeavy: 'More sets',
    legendSecondary: 'Secondary only',
  },
  {
    front: 'Delante',
    back: 'Detrás',
    figureAria: (side: string) => `Figura de carga muscular · ${side}`,
    muscles: {
      chest: 'Pecho', obliques: 'Oblicuos', abs: 'Abdominales', biceps: 'Bíceps', triceps: 'Tríceps',
      neck: 'Cuello', trapezius: 'Trapecio', deltoids: 'Deltoides', adductors: 'Aductores', quadriceps: 'Cuádriceps',
      knees: 'Rodilla', tibialis: 'Tibial anterior', calves: 'Gemelos', forearm: 'Antebrazo', hands: 'Mano', ankles: 'Tobillo',
      feet: 'Pie', head: 'Cabeza', hair: 'Cabeza', 'upper-back': 'Dorsales', 'lower-back': 'Zona lumbar', gluteal: 'Glúteos',
      hamstring: 'Isquiotibiales',
    },
    loadTitle: (name: string, primary: number, secondary: number) =>
      [name, primary > 0 ? `principal ${primary} ${primary === 1 ? 'serie' : 'series'}` : '', secondary > 0 ? `secundario ${secondary} ${secondary === 1 ? 'serie' : 'series'}` : ''].filter(Boolean).join(' · '),
    legendLight: 'Menos series',
    legendHeavy: 'Más series',
    legendSecondary: 'Solo secundario',
  },
  'components/anatomy/anatomy',
);

export const anatomyMessages = messages;
export const useAnatomyText = () => useMessages(messages);
