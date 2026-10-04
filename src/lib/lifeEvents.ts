import { defineMessages, messagesOf } from '../i18n';
import type { LifeEventInput } from '../types';
import type { ChartPalette } from './echartsTheme';
import { displayDateTimeFormatter, parseDisplayDate } from './dateTime';

export const eventCategories = ['health', 'travel', 'routine', 'training', 'other'] as const;
export const lifeEventMessages = defineMessages(
  {
    title: '生活事件', intro: '记录这段时间发生的事，让健康数据有背景。',
    add: '添加事件', edit: '编辑事件', empty: '还没有生活事件。从一次感冒、一段旅程或训练变化记起。',
    name: '标题', category: '分类', start: '开始日期', end: '结束日期', ongoing: '仍在持续',
    notes: '备注（可选）', placeholder: '例如：感冒，暂停训练几天', save: '保存', cancel: '取消',
    remove: '删除', deleteTitle: '删除这条生活事件？', deleteHint: '这条备注会从本地数据库移除。',
    invalid: '需要标题和有效日期，结束日期不能早于开始日期。', failed: '操作失败，重试一次。',
    loading: '正在读取生活事件…', retry: '重试',
    since: (date: string) => `${date} 起`, chartKey: '生活事件',
    today: '今天', yesterday: '昨天', sameAsStart: '同开始日期',
    active: '持续中', search: '搜索生活事件', noMatch: '没有符合条件的事件。',
    all: '全部', showMore: (count: number) => `再看 ${count} 件`, showLess: '收起', manage: '管理生活事件', related: '相关事件',
    local: '只存本机，随数据库备份；交给 AI 时可勾选带上。',
    categories: { health: '身体与恢复', travel: '旅行与出差', routine: '作息与生活', training: '训练与比赛', other: '其他' },
    // 编辑器里的分类胶囊用短名：五项一行放得下才能拖（全名太长的语言会折成两行）；全名进悬停提示和列表。
    categoryShort: { health: '身体与恢复', travel: '旅行与出差', routine: '作息与生活', training: '训练与比赛', other: '其他' },
  },
  {
    title: 'Life events', intro: 'Record what happened alongside your health data.',
    add: 'Add event', edit: 'Edit event', empty: 'No life events yet. Start with an illness, a trip, or a training change.',
    name: 'Title', category: 'Category', start: 'Start date', end: 'End date', ongoing: 'Still ongoing',
    notes: 'Notes (optional)', placeholder: 'e.g. a cold, a few days off training', save: 'Save', cancel: 'Cancel',
    remove: 'Delete', deleteTitle: 'Delete this life event?', deleteHint: 'Removed from the local database.',
    invalid: 'Enter a title and valid dates. End date cannot be before start date.', failed: 'Action failed. Try again.',
    loading: 'Loading life events…', retry: 'Retry',
    since: (date: string) => `from ${date}`, chartKey: 'Life events',
    today: 'Today', yesterday: 'Yesterday', sameAsStart: 'Same as start',
    active: 'Ongoing', search: 'Search life events', noMatch: 'No matching events.',
    all: 'All', showMore: (count: number) => `Show ${count} more`, showLess: 'Show less', manage: 'Manage life events', related: 'Related events',
    local: 'Saved locally, included in backups. Optional in AI handoffs.',
    categories: { health: 'Health & recovery', travel: 'Travel', routine: 'Routine & lifestyle', training: 'Training & races', other: 'Other' },
    categoryShort: { health: 'Health', travel: 'Travel', routine: 'Routine', training: 'Training', other: 'Other' },
  },
  {
    title: 'Eventos de vida', intro: 'Registra lo ocurrido junto a tus datos de salud.',
    add: 'Agregar evento', edit: 'Editar evento', empty: 'Sin eventos aún. Empieza con un resfriado, un viaje o un cambio de rutina.',
    name: 'Título', category: 'Categoría', start: 'Fecha de inicio', end: 'Fecha de fin', ongoing: 'En curso',
    notes: 'Notas (opcional)', placeholder: 'Ej.: resfriado, descanso de entrenamientos', save: 'Guardar', cancel: 'Cancelar',
    remove: 'Eliminar', deleteTitle: '¿Eliminar este evento?', deleteHint: 'Se eliminará de la base de datos local.',
    invalid: 'Ingresa un título y fechas válidas. El fin no puede ser anterior al inicio.', failed: 'Acción fallida; reintenta.',
    loading: 'Cargando eventos…', retry: 'Reintentar',
    since: (date: string) => `desde ${date}`, chartKey: 'Eventos de vida',
    today: 'Hoy', yesterday: 'Ayer', sameAsStart: 'Igual que el inicio',
    active: 'En curso', search: 'Buscar eventos', noMatch: 'Sin eventos coincidentes.',
    all: 'Todos', showMore: (count: number) => `Ver ${count} más`, showLess: 'Ver menos', manage: 'Administrar eventos', related: 'Eventos relacionados',
    local: 'Solo local, incluido en copias; opcional al pasar a la IA.',
    categories: { health: 'Salud y recuperación', travel: 'Viajes', routine: 'Rutina y estilo de vida', training: 'Entrenamiento y carreras', other: 'Otros' },
    categoryShort: { health: 'Salud', travel: 'Viajes', routine: 'Rutina', training: 'Entreno', other: 'Otros' },
  },
  'lib/lifeEvents',
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
/** 生活事件分类的颜色（CSS 变量）：时间线上的节点、胶囊的底色。 */
export const eventTone = (category: string): string => ({
  health: 'var(--heart)',
  travel: 'var(--pace)',
  routine: 'var(--sleep)',
  training: 'var(--training)',
}[category] ?? 'var(--subtle)');

/** 生活事件分类的图标（Icon.vue 的名字）。 */
export const eventIcon = (category: string): 'heart' | 'map' | 'moon' | 'run' | 'star' => ({
  health: 'heart' as const,
  travel: 'map' as const,
  routine: 'moon' as const,
  training: 'run' as const,
}[category] ?? 'star');

export const overlapsEvent =(event: LifeEventInput, start: string, end: string): boolean =>
  event.startDate <= end && (event.endDate === null || event.endDate >= start);

/** 图表里事件区带的颜色：和 eventTone 同一套分类色，只是换成图表调色板里的实色。 */
export const eventChartTone = (category: string, palette: ChartPalette): string => ({
  health: palette.series.heart,
  travel: palette.series.pace,
  routine: palette.series.sleep.light,
  training: palette.series.training,
}[category] ?? palette.legendOff);

/** 事件胶囊上的日期（U24）：单日「9/24」，一段「9/24–9/26」，仍在持续「9/24 起」。 */
export const eventSpanLabel = (event: LifeEventInput): string => {
  const format = displayDateTimeFormatter({ month: 'numeric', day: 'numeric' });
  const day = (date: string) => format.format(parseDisplayDate(date));
  if (event.endDate === null) return messagesOf(lifeEventMessages).since(day(event.startDate));
  if (event.endDate === event.startDate) return day(event.startDate);
  return `${day(event.startDate)}–${day(event.endDate)}`;
};
