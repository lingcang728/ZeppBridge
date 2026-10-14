import { createApp, type Component } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import GlassWall from './GlassWall.vue';
import CardWall from './CardWall.vue';
import DeviceWall from './DeviceWall.vue';
import MetricWall from './MetricWall.vue';
import type { FilmWall } from '../presentation';

const WALLS: Record<FilmWall, Component> = { glass: GlassWall, cards: CardWall, devices: DeviceWall, metrics: MetricWall };

/**
 * 把一面展示墙挂到演示页最上层（独立的小 Vue 应用；文案、主题、颜色都是模块级状态，跟主应用同步）。
 * 墙上用到的磁贴是 RouterLink：给它一个不连浏览器地址的内存路由，点了也不会把主应用带走。
 */
export const mountWall = (kind: FilmWall): { unmount(): void } => {
  const host = document.createElement('div');
  host.className = 'film-wall-host';
  document.body.append(host);
  const app = createApp(WALLS[kind]);
  app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/:any(.*)*', component: { render: () => null } }] }));
  app.mount(host);
  return { unmount() { app.unmount(); host.remove(); } };
};
