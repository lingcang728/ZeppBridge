import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { isLandingMode } from '../lib/landingMode';
import { installReturnScroll } from '../lib/returnScroll';

/*
 * 每个页面都是动态 import，包括首屏 Overview。
 *
 * 收益集中在几个重量级模块：图表页拖着 ECharts，运动详情还拖着地图，
 * 数据健康和备份恢复则是典型的「装完一年点两次」。把它们和入口绑在一起，
 * 等于让每次冷启动都付一遍这些代价——而浏览器里只会看到落地页的访客，
 * 会下载一整个图表引擎却一次也用不上。
 *
 * 首屏也异步不会造成白屏闪烁：Tauri 从本地磁盘取这些 chunk，
 * 解析在同一帧内就完成了。
 */
const routes = [
  {
    path: '/',
    name: 'Overview',
    component: () => import('../views/Overview.vue'),
  },
  {
    path: '/recent',
    name: 'RecentRecords',
    component: () => import('../views/RecentRecords.vue'),
  },
  {
    path: '/ai',
    component: () => import('../views/AiComposer.vue'),
    // 已保存的任务 / 寄出前检查 / 往返记录：舞台上浮起的一张玻璃大卡（子路由，舞台留在后面虚化，10-08 H18）。
    children: [
      { path: '', name: 'AiComposer', component: { render: () => null } },
      { path: 'check', name: 'AiCheck', component: () => import('../views/ai/AiCheck.vue') },
      { path: 'tasks', name: 'AiTasks', component: () => import('../views/ai/AiTasks.vue') },
      { path: 'exchanges', name: 'AiExchanges', component: () => import('../views/ai/AiExchanges.vue') },
      { path: 'exchanges/:id', name: 'AiExchange', component: () => import('../views/ai/AiExchange.vue') },
    ],
  },
  // 交给 AI 的下钻全是路由（2026-10 精修批次 3）：点开从被点的卡 / 行长出来，返回缩回去（usePageMorph）。
  // 「你的过去」二级页已经取消（2026-10-08 横向舞台）：要交的每一类是舞台左边的一张牌，点牌翻到背面。旧链接回到舞台。
  { path: '/ai/past', redirect: '/ai' },
  { path: '/ai/past/:category', redirect: '/ai' },
  { path: '/ai/plan', name: 'AiPlanWeek', component: () => import('../views/ai/AiPlanWeek.vue') },
  { path: '/ai/plan/:date', name: 'AiPlanDay', component: () => import('../views/ai/AiPlanDay.vue') },
  {
    path: '/body',
    name: 'BodyStatus',
    component: () => import('../views/BodyStatus.vue'),
  },
  {
    path: '/training',
    name: 'TrainingStatus',
    component: () => import('../views/TrainingStatus.vue'),
  },
  {
    path: '/sleep',
    name: 'SleepList',
    component: () => import('../views/SleepList.vue'),
  },
  {
    path: '/workouts',
    name: 'WorkoutList',
    component: () => import('../views/WorkoutList.vue'),
  },
  {
    path: '/sleep/:sleepId',
    name: 'SleepDetail',
    component: () => import('../views/SleepDetail.vue'),
  },
  {
    path: '/workouts/:workoutId',
    name: 'WorkoutDetail',
    component: () => import('../views/WorkoutDetail.vue'),
  },
  {
    path: '/heart',
    name: 'HeartRateDetail',
    component: () => import('../views/HeartRateDetail.vue'),
  },
  {
    path: '/activity',
    name: 'ActivityDetail',
    component: () => import('../views/ActivityDetail.vue'),
  },
  {
    path: '/devices/:deviceKey',
    name: 'DeviceDetail',
    component: () => import('../views/DeviceDetail.vue'),
  },
  {
    path: '/health-check',
    name: 'HealthCheck',
    component: () => import('../views/HealthCheck.vue'),
  },
  {
    // /settings 是卡叠总览，/settings/:card 是展开的某一张（account / sync / archive …）。
    path: '/settings/:card?',
    name: 'Settings',
    component: () => import('../views/Settings.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: { path: '/', query: { notice: 'not-found' } },
  },
];

/*
 * 落地页不渲染 <RouterView>，可路由器启动时照样会把当前地址对应的页面 chunk 解析下来：
 * 浏览器访客因此白下 Overview 那一整串（18 个 chunk，约 140 KB JS + 32 KB CSS）。
 * 落地模式只挂一条什么都不画的路由，页面 chunk 一个都不碰。
 */
const LANDING_ROUTES: RouteRecordRaw[] = [
  { path: '/:pathMatch(.*)*', component: { render: () => null } },
];

const router = createRouter({
  history: createWebHistory(),
  routes: isLandingMode() ? LANDING_ROUTES : routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

// 滚动区是 #main-content：前进回到顶部，后退回到离开时的位置（见 lib/returnScroll.ts）。
installReturnScroll(router);

export default router;
