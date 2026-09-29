import { defineMessages, messagesOf } from '../i18n';

/** Display helpers for real connected devices. Never invent a product name. */

const messages = defineMessages(
  {
    notProvided: '未提供',
  },
  {
    notProvided: 'Not provided',
  },
  {
    notProvided: 'Sin datos',
  },
  'lib/deviceCopy',
);

const copy = () => messagesOf(messages);

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
