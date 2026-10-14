import { defineMessages, useMessages } from '../../i18n';

/** 「上次发到手表」状态胶囊和它的玻璃弹层（2026-10-12 计划模块重构第 3 批）。 */
const messages = defineMessages(
  {
    draft: '草稿待发',
    delivered: '已送达',
    partial: '部分送达',
    unconfirmed: '未确认',
    rejected: '没送达',
    sending: '发送中…',
    title: '上次发到手表',
    sentAt: (when: string) => `${when} 发出`,
    demo: '模拟发送',
    never: '还没发过',
    undo: '撤销上一次',
    clear: '清空手表计划',
  },
  {
    draft: 'Draft not sent',
    delivered: 'Delivered',
    partial: 'Partly delivered',
    unconfirmed: 'Unconfirmed',
    rejected: 'Not delivered',
    sending: 'Sending…',
    title: 'Last sent to the watch',
    sentAt: (when: string) => `Sent ${when}`,
    demo: 'Simulated',
    never: 'Nothing sent yet',
    undo: 'Undo last send',
    clear: 'Clear watch plan',
  },
  {
    draft: 'Borrador sin enviar',
    delivered: 'Entregado',
    partial: 'Entrega parcial',
    unconfirmed: 'Sin confirmar',
    rejected: 'No entregado',
    sending: 'Enviando…',
    title: 'Último envío al reloj',
    sentAt: (when: string) => `Enviado ${when}`,
    demo: 'Simulado',
    never: 'Aún no se ha enviado nada',
    undo: 'Deshacer el último envío',
    clear: 'Borrar el plan del reloj',
  },
  'components/plan/status',
);

export const useStatusText = () => useMessages(messages);
