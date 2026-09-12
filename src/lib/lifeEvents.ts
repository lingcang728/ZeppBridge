import { defineMessages } from '../i18n';
import type { LifeEventInput } from '../types';

export const eventCategories = ['health', 'travel', 'routine', 'training', 'other'] as const;
export const lifeEventMessages = defineMessages(
  {
    title: '生活事件', intro: '记录这段时间发生的事，让健康数据有背景。',
    add: '添加事件', edit: '编辑事件', empty: '还没有生活事件。可以从一次感冒、一段旅程或训练变化开始。',
    name: '标题', category: '分类', start: '开始日期', end: '结束日期', ongoing: '仍在持续',
    notes: '备注（可选）', placeholder: '例如：感冒，暂停训练几天', save: '保存', cancel: '取消',
    remove: '删除', deleteTitle: '删除这条生活事件？', deleteHint: '这条备注将从本地数据库中移除。',
    invalid: '请输入标题和有效日期，结束日期不能早于开始日期。', failed: '操作失败，请重试。',
    saved: '生活事件已保存。', deleted: '生活事件已删除。', loading: '正在读取生活事件…', retry: '重试',
    all: '全部', active: '持续中', search: '搜索生活事件', noMatch: '没有符合条件的事件。',
    previous: '上一页', next: '下一页', manage: '管理生活事件', related: '相关事件',
    local: '保存在本机，随数据库备份。交给 AI 时可勾选包含生活事件。',
    categories: { health: '身体与恢复', travel: '旅行与出差', routine: '作息与生活', training: '训练与比赛', other: '其他' },
  },
  {
    title: 'Life events', intro: 'Record what happened alongside your health data.',
    add: 'Add event', edit: 'Edit event', empty: 'No life events yet. Start with an illness, a trip, or a change in training.',
    name: 'Title', category: 'Category', start: 'Start date', end: 'End date', ongoing: 'Still ongoing',
    notes: 'Notes (optional)', placeholder: 'For example: a cold, taking a few days off training', save: 'Save', cancel: 'Cancel',
    remove: 'Delete', deleteTitle: 'Delete this life event?', deleteHint: 'This note will be removed from the local database.',
    invalid: 'Enter a title and valid dates. The end date cannot be before the start date.', failed: 'Could not complete the action. Please retry.',
    saved: 'Life event saved.', deleted: 'Life event deleted.', loading: 'Loading life events…', retry: 'Retry',
    all: 'All', active: 'Ongoing', search: 'Search life events', noMatch: 'No matching events.',
    previous: 'Previous', next: 'Next', manage: 'Manage life events', related: 'Related events',
    local: 'Saved locally and included in database backups. You can include life events when handing data to AI.',
    categories: { health: 'Health & recovery', travel: 'Travel', routine: 'Routine & lifestyle', training: 'Training & races', other: 'Other' },
  },
  {
    title: 'Eventos de vida', intro: 'Registra lo que ocurrió junto a tus datos de salud.',
    add: 'Agregar evento', edit: 'Editar evento', empty: 'Todavía no hay eventos. Empieza con una enfermedad, un viaje o un cambio de entrenamiento.',
    name: 'Título', category: 'Categoría', start: 'Fecha de inicio', end: 'Fecha de fin', ongoing: 'Sigue en curso',
    notes: 'Notas (opcional)', placeholder: 'Por ejemplo: resfriado, unos días sin entrenar', save: 'Guardar', cancel: 'Cancelar',
    remove: 'Eliminar', deleteTitle: '¿Eliminar este evento?', deleteHint: 'Esta nota se eliminará de la base de datos local.',
    invalid: 'Ingresa un título y fechas válidas. La fecha de fin no puede ser anterior a la de inicio.', failed: 'No se pudo completar la acción. Inténtalo de nuevo.',
    saved: 'Evento guardado.', deleted: 'Evento eliminado.', loading: 'Cargando eventos…', retry: 'Reintentar',
    all: 'Todos', active: 'En curso', search: 'Buscar eventos', noMatch: 'No hay eventos que coincidan.',
    previous: 'Anterior', next: 'Siguiente', manage: 'Administrar eventos', related: 'Eventos relacionados',
    local: 'Se guardan localmente y se incluyen en las copias de seguridad. Puedes incluirlos al compartir datos con la IA.',
    categories: { health: 'Salud y recuperación', travel: 'Viajes', routine: 'Rutina y estilo de vida', training: 'Entrenamiento y carreras', other: 'Otros' },
  },
);

export function validEventDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
export function validLifeEvent(event: LifeEventInput): boolean {
  return Boolean(event.title.trim()) && Array.from(event.title.trim()).length <= 120
    && Array.from(event.notes).length <= 4000 && validEventDate(event.startDate)
    && (event.endDate === null || (validEventDate(event.endDate) && event.endDate >= event.startDate));
}
export const overlapsEvent = (event: LifeEventInput, start: string, end: string): boolean =>
  event.startDate <= end && (event.endDate === null || event.endDate >= start);
