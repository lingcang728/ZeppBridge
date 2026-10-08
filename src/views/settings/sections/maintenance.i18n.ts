import { defineMessages } from '../../../i18n';

/* 高级卡「维护」：从归档卡挪过来的立即清理、重新解析，和补拉明细里的「清空账本」。 */
export const maintenanceMessages = defineMessages(
  {
    secMaintenance: '维护',
    cleanupTitle: '按保留期清理',
    cleanupSub: (date: string) => `删掉 ${date} 以前的数据`,
    cleanupForever: '一直保留中，没有要清理的',
    reparseTitle: '重新解析本机数据',
    reparseSub: '按当前规则重算，不联网',
    resetTitle: '清空覆盖账本',
    resetSub: '只清补拉记录，已写入的数据不动',
  },
  {
    secMaintenance: 'Maintenance',
    cleanupTitle: 'Prune by retention',
    cleanupSub: (date: string) => `Deletes data older than ${date}`,
    cleanupForever: 'Keeping everything; nothing to prune',
    reparseTitle: 'Reparse local data',
    reparseSub: 'Recomputes with current rules, offline',
    resetTitle: 'Clear coverage ledger',
    resetSub: 'Clears backfill records only; saved data stays',
  },
  {
    secMaintenance: 'Mantenimiento',
    cleanupTitle: 'Limpiar según la conservación',
    cleanupSub: (date: string) => `Borra los datos anteriores al ${date}`,
    cleanupForever: 'Se conserva todo; no hay nada que limpiar',
    reparseTitle: 'Volver a analizar los datos locales',
    reparseSub: 'Recalcula con las reglas actuales, sin conexión',
    resetTitle: 'Borrar el registro de cobertura',
    resetSub: 'Solo borra el registro de recuperación; los datos guardados se quedan',
  },
  'views/settings/sections/maintenance',
);
