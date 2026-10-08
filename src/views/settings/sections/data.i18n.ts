import { defineMessages } from '../../../i18n';

/* 设置「数据内容」卡（2A 极简重写）：只留拉得到 / 拉不到；接口诊断和运动编号命名在高级卡。 */
export const dataCardMessages = defineMessages(
  {
    intro: '同步时自动更新；暗着的不等于设备不支持',
    codesHint: (count: number) => `有 ${count} 个运动类型没认出`,
    codesFix: '去起名',
  },
  {
    intro: 'Updates on every sync; a dimmed item doesn’t mean your device lacks it',
    codesHint: (count: number) => `${count} workout ${count === 1 ? 'type wasn’t' : 'types weren’t'} recognized`,
    codesFix: 'Name them',
  },
  {
    intro: 'Se actualiza en cada sincronización; lo atenuado no significa que tu dispositivo no lo tenga',
    codesHint: (count: number) => `${count} ${count === 1 ? 'tipo de entrenamiento sin reconocer' : 'tipos de entrenamiento sin reconocer'}`,
    codesFix: 'Ponerles nombre',
  },
  'views/settings/sections/data',
);
