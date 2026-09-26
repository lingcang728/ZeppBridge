import { displayDateTimeFormatter } from '../../lib/dateTime';
import { useMessages } from '../../i18n';
import { settingsMessages } from '../../views/Settings.i18n';

/** 设置页各区块共用的日期时间格式：没有值显示「暂无记录」，解析不了显示「时间未知」。 */
export const useSettingsFormat = () => {
  const t = useMessages(settingsMessages);
  const formatDateTime = (value?: string | null): string => {
    if (!value) return t.value.noRecords;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t.value.timeUnknown;
    return displayDateTimeFormatter({
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(date).replace(/\//g, '-');
  };
  return { formatDateTime };
};
