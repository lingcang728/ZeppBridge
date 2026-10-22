import { computed } from 'vue';
import { defineMessages, useMessages } from '../../i18n';
import { splitPart } from '../../lib/logbook/body';

/** 人形图：部位名（伤病、酸痛、AI 交接共用）。分左右的部位只写基本名，左右由 `sided` 拼。 */
const messages = defineMessages(
  {
    front: '正面', back: '背面', clear: '清空', none: '没点选',
    figure: '人形图：点选部位',
    sided: (base: string, side: 'l' | 'r', _key: string) => `${side === 'l' ? '左' : '右'}${base}`,
    parts: {
      neck: '颈', shoulder: '肩', upper_back: '上背', lower_back: '下背', chest: '胸', abdomen: '腹',
      hip: '髋前', glute: '臀', quad: '大腿前侧', hamstring: '大腿后侧', knee: '膝', shin: '小腿前侧',
      calf: '小腿肚', achilles: '跟腱', ankle: '踝', foot: '足', it_band: '髂胫束',
    },
  },
  {
    front: 'Front', back: 'Back', clear: 'Clear', none: 'Nothing picked',
    figure: 'Body figure: pick the spots',
    sided: (base: string, side: 'l' | 'r', _key: string) => `${side === 'l' ? 'Left' : 'Right'} ${base}`,
    parts: {
      neck: 'Neck', shoulder: 'shoulder', upper_back: 'Upper back', lower_back: 'Lower back', chest: 'Chest', abdomen: 'Abdomen',
      hip: 'hip flexor', glute: 'glute', quad: 'quad', hamstring: 'hamstring', knee: 'knee', shin: 'shin',
      calf: 'calf', achilles: 'Achilles', ankle: 'ankle', foot: 'foot', it_band: 'IT band',
    },
  },
  {
    front: 'Delante', back: 'Detrás', clear: 'Borrar', none: 'Nada marcado',
    figure: 'Figura del cuerpo: marca las zonas',
    // rodilla / espinilla / cintilla son femeninos.
    sided: (base: string, side: 'l' | 'r', key: string) => {
      const feminine = ['knee', 'shin', 'it_band'].includes(key);
      return `${base} ${side === 'l' ? (feminine ? 'izquierda' : 'izquierdo') : (feminine ? 'derecha' : 'derecho')}`;
    },
    parts: {
      neck: 'Cuello', shoulder: 'Hombro', upper_back: 'Espalda alta', lower_back: 'Zona lumbar', chest: 'Pecho', abdomen: 'Abdomen',
      hip: 'Flexor de cadera', glute: 'Glúteo', quad: 'Cuádriceps', hamstring: 'Isquiotibial', knee: 'Rodilla', shin: 'Espinilla',
      calf: 'Gemelo', achilles: 'Tendón de Aquiles', ankle: 'Tobillo', foot: 'Pie', it_band: 'Cintilla iliotibial',
    },
  },
  'components/journal/body',
);

export const useBodyText = () => useMessages(messages);

/** 部位的显示名：`knee_l` → 「左膝」/ "Left knee"。 */
export const useBodyPartName = () => {
  const t = useBodyText();
  return computed(() => (part: string) => {
    const [base, side] = splitPart(part);
    const name = (t.value.parts as Record<string, string>)[base] ?? part;
    return side ? t.value.sided(name, side, base) : name;
  });
};
