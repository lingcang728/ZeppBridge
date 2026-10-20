import { defineMessages, useMessages } from '../i18n';

/** 就地补拉那一行（3.0.4）。 */
const messages = defineMessages(
  {
    offer: (date: string) => `本机最早只到 ${date}。要从云端补拉更早的吗？`,
    years: (n: number) => `${n} 年`,
    later: '先不用',
    running: '正在后台补拉，离开这页也会继续',
    stop: '停止',
    settings: '补拉设置',
  },
  {
    offer: (date: string) => `This computer only goes back to ${date}. Backfill earlier history from the cloud?`,
    years: (n: number) => (n === 1 ? '1 year' : `${n} years`),
    later: 'Not now',
    running: 'Backfilling in the background — it keeps going if you leave this page',
    stop: 'Stop',
    settings: 'Backfill settings',
  },
  {
    offer: (date: string) => `Este equipo solo llega hasta ${date}. ¿Recuperar historial anterior de la nube?`,
    years: (n: number) => (n === 1 ? '1 año' : `${n} años`),
    later: 'Ahora no',
    running: 'Recuperando en segundo plano; sigue aunque salgas de esta página',
    stop: 'Detener',
    settings: 'Ajustes de recuperación',
  },
  'components/BackfillOffer',
);

export const useBackfillOfferText = () => useMessages(messages);
