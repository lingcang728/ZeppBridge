import { defineMessages } from '../../../i18n';

/* 设置「高级与维护」卡（2A 极简重写）：收下别的卡挪过来的次要项。 */
export const advancedCardMessages = defineMessages(
  {
    secPrefs: '更多偏好',
    folderTitle: '数据文件夹',
    folderSub: '程序旁边的 data 文件夹，健康数据都在这里',
    healthSub: '同步结果和预期对不上时，来这里找原因',
    compactSub: '装新版本后首次启动会自动做，这里手动再跑一次',
    compactMore: '详细说明',
  },
  {
    secPrefs: 'More preferences',
    folderTitle: 'Data folder',
    folderSub: 'The data folder next to the app holds all your health data',
    healthSub: 'When a sync result looks wrong, look here for the reason',
    compactSub: 'Runs on its own at first launch of a new version; this runs it again by hand',
    compactMore: 'Details',
  },
  {
    secPrefs: 'Más preferencias',
    folderTitle: 'Carpeta de datos',
    folderSub: 'La carpeta data junto a la app guarda todos tus datos de salud',
    healthSub: 'Si una sincronización no cuadra con lo esperado, busca aquí la causa',
    compactSub: 'Se hace sola al primer arranque de una versión nueva; aquí la repites a mano',
    compactMore: 'Detalles',
  },
  'views/settings/sections/advanced',
);
