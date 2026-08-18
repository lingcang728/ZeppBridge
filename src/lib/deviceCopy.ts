/** Display helpers for real connected devices. Never invent a product name. */

export const shortDeviceName = (name: string): string =>
  name.replace(/^Amazfit\s+/i, '').replace(/^跃我\s+/u, '').trim() || name;

export const formatDeviceIntro = (names: string[]): string => {
  const short = names.map(shortDeviceName).filter(Boolean);
  if (short.length === 0) return '本地优先，保留数据来源，将你的穿戴记录整理成清晰、可用的健康档案。';
  if (short.length === 1) return `本地优先，保留数据来源，将 ${short[0]} 的记录整理成清晰、可用的健康档案。`;
  if (short.length === 2) return `本地优先，保留数据来源，将 ${short[0]} 与 ${short[1]} 的记录整理成清晰、可用的健康档案。`;
  return `本地优先，保留数据来源，将 ${short[0]}、${short[1]} 等 ${short.length} 台设备的记录整理成清晰、可用的健康档案。`;
};

/** `https://api-mifit-cn3.zepp.com` → `CN3`. Full host stays on title/tooltip. */
export const regionShortName = (host?: string | null): string => {
  if (!host?.trim()) return '未提供';
  const match = host.match(/mifit-([a-z]{2,})(\d+)/i);
  if (match) return `${match[1].toUpperCase()}${match[2]}`;
  try {
    return new URL(host).host.replace(/^api-?/i, '') || host;
  } catch {
    return host.replace(/^https?:\/\//, '');
  }
};
