import { defineMessages } from '../../i18n';

/** 关系网（TaskGraph）的界面文案。moduleId 不随文件名变，语言包不用搬家。 */
export const taskGraphMessages = defineMessages(
  {
    label: '任务数据关系网',
    zone: '交给 AI',
    hint: '拖入圆圈以选用，拖出以移除 · 点击节点查看选项 · 拖动空白处平移',
    undo: '撤销', fit: '适应画布', zoomIn: '放大', zoomOut: '缩小', resetView: '重置视图',
    zoomLevel: (percent: number) => `缩放 ${percent}%，点一下让整张图正好装进画布`,
    includeNode: '交给 AI', excludeNode: '不交给 AI',
    backToAll: '全部类别',
    dismissHint: '知道了',
  },
  {
    label: 'Task data graph',
    zone: 'To the AI',
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
    hint: 'Arrastra al círculo para incluir, fuera para quitar · Haz clic para ver opciones · Arrastra el fondo para desplazar',
    undo: 'Deshacer', fit: 'Ajustar', zoomIn: 'Acercar', zoomOut: 'Alejar', resetView: 'Restablecer',
    zoomLevel: (percent: number) => `Zoom ${percent} %: haz clic para encajar todo el grafo`,
    backToAll: 'Todas las categorías',
    dismissHint: 'Entendido',
  },
  'components/ai/TaskGraph',
);
