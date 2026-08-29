import { createRouter, createWebHistory } from 'vue-router';

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
    path: '/explore',
    name: 'Explore',
    component: () => import('../views/Explore.vue'),
  },
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
    path: '/health-check',
    name: 'HealthCheck',
    component: () => import('../views/HealthCheck.vue'),
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/Settings.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: { path: '/', query: { notice: 'not-found' } },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

router.afterEach(() => {
  const main = document.getElementById('main-content');
  if (main) main.scrollTo({ top: 0 });
  else window.scrollTo({ top: 0 });
});

export default router;
