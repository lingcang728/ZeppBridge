import { defineMessages } from '../../i18n';

/** 关系网（TaskGraph）的界面文案。moduleId 不随文件名变，语言包不用搬家。 */
export const taskGraphMessages = defineMessages(
  {
    label: '任务数据关系网',
    zone: '交给 AI',
    hint: '拖入圆圈选用，拖出移除 · 点节点看选项 · 拖空白平移',
    undo: '撤销', fit: '适应画布', zoomIn: '放大', zoomOut: '缩小', resetView: '重置视图',
    zoomLevel: (percent: number) => `缩放 ${percent}%，点一下让整图装进画布`,
    includeNode: '交给 AI', excludeNode: '不交给 AI',
    backToAll: '全部类别',
    dismissHint: '知道了',
  },
  {
    label: 'Task data graph',
    zone: 'Send to AI',
    hint: 'Drag into the circle to include, out to remove · Click for options · Drag empty space to pan',
    undo: 'Undo', fit: 'Fit', zoomIn: 'Zoom in', zoomOut: 'Zoom out', resetView: 'Reset view',
    zoomLevel: (percent: number) => `Zoom ${percent}% — click to fit the whole graph`,
    includeNode: 'Include', excludeNode: 'Exclude',
    backToAll: 'All categories',
    dismissHint: 'Got it',
  },
  {
    label: 'Grafo de datos',
    zone: 'A la IA',
    hint: 'Arrastra dentro del círculo para usar, fuera para quitar · Toca un nodo para ver opciones · Arrastra el fondo para moverte',
    undo: 'Deshacer', fit: 'Ajustar', zoomIn: 'Acercar', zoomOut: 'Alejar', resetView: 'Restablecer',
    zoomLevel: (percent: number) => `Zoom ${percent}%: haz clic para encajar todo el grafo`,
    includeNode: 'Incluir', excludeNode: 'Quitar',
    backToAll: 'Todas las categorías',
    dismissHint: 'Entendido',
  },
  'components/ai/TaskGraph',
);
