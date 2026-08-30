import { defineMessages, messagesOf } from '../i18n';

/** Display helpers for real connected devices. Never invent a product name. */

const messages = defineMessages(
  {
    introNoDevice: '本地优先，保留数据来源，将你的穿戴记录整理成清晰、可用的健康档案。',
    introOne: (name: string) =>
      `本地优先，保留数据来源，将 ${name} 的记录整理成清晰、可用的健康档案。`,
    introTwo: (first: string, second: string) =>
      `本地优先，保留数据来源，将 ${first} 与 ${second} 的记录整理成清晰、可用的健康档案。`,
    introMany: (first: string, second: string, count: number) =>
      `本地优先，保留数据来源，将 ${first}、${second} 等 ${count} 台设备的记录整理成清晰、可用的健康档案。`,
    notProvided: '未提供',
  },
  {
    introNoDevice:
      'Local-first, sources intact: your wearable records, organized into a health file you can actually read.',
    introOne: (name: string) =>
      `Local-first, sources intact: ${name} records, organized into a health file you can actually read.`,
    introTwo: (first: string, second: string) =>
      `Local-first, sources intact: ${first} and ${second} records, organized into a health file you can actually read.`,
    introMany: (first: string, second: string, count: number) =>
      `Local-first, sources intact: ${first}, ${second} and ${count} devices in all, organized into a health file you can actually read.`,
    notProvided: 'Not provided',
  },
);

const copy = () => messagesOf(messages);

export const shortDeviceName = (name: string): string =>
  name.replace(/^Amazfit\s+/i, '').replace(/^跃我\s+/u, '').trim() || name;

export const formatDeviceIntro = (names: string[]): string => {
  const short = names.map(shortDeviceName).filter(Boolean);
  const t = copy();
  if (short.length === 0) return t.introNoDevice;
  if (short.length === 1) return t.introOne(short[0]);
  if (short.length === 2) return t.introTwo(short[0], short[1]);
  return t.introMany(short[0], short[1], short.length);
};

/** `https://api-mifit-cn3.zepp.com` → `CN3`. Full host stays on title/tooltip. */
export const regionShortName = (host?: string | null): string => {
  if (!host?.trim()) return copy().notProvided;
  const match = host.match(/mifit-([a-z]{2,})(\d+)/i);
  if (match) return `${match[1].toUpperCase()}${match[2]}`;
  try {
    return new URL(host).host.replace(/^api-?/i, '') || host;
  } catch {
    return host.replace(/^https?:\/\//, '');
  }
};
