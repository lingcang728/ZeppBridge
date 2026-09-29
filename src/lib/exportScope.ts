/**
 * 默认导出格式：设置页「默认导出格式」和运动详情共用这一份。
 *
 * 以前这里还有一份导出范围的前端构造 / 校验（日期范围与单条运动互斥、365 天上限）。
 * 现行运动详情直接构造请求，范围规则只由后端 models/types/export.rs 负责，
 * 那份前端镜像只剩自己的测试在用，已删（瘦身审计 D03）。
 */
export const DEFAULT_EXPORT_FORMAT_KEY = 'zeppbridge-default-export-format';
export const DEFAULT_EXPORT_FORMATS = ['json', 'csv', 'gpx'] as const;
export type DefaultExportFormat = (typeof DEFAULT_EXPORT_FORMATS)[number];

export const isDefaultExportFormat = (value: unknown): value is DefaultExportFormat =>
  value === 'json' || value === 'csv' || value === 'gpx';

export const readDefaultExportFormat = (): DefaultExportFormat => {
  if (typeof window === 'undefined') return 'json';
  try {
    const raw = window.localStorage.getItem(DEFAULT_EXPORT_FORMAT_KEY);
    if (isDefaultExportFormat(raw)) return raw;
  } catch {
    // 隐私模式读不了 localStorage，退回 JSON。
  }
  return 'json';
};

export const writeDefaultExportFormat = (format: DefaultExportFormat): void => {
  if (!isDefaultExportFormat(format)) return;
  try {
    window.localStorage.setItem(DEFAULT_EXPORT_FORMAT_KEY, format);
  } catch {
    // 写失败只影响下次打开的默认值，这次导出不受影响。
  }
};
