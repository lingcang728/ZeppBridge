import { createRouter, createWebHistory } from 'vue-router';
import Overview from '../views/Overview.vue';
import AiExport from '../views/AiExport.vue';
import SleepList from '../views/SleepList.vue';
import WorkoutList from '../views/WorkoutList.vue';
import SleepDetail from '../views/SleepDetail.vue';
import WorkoutDetail from '../views/WorkoutDetail.vue';
import Settings from '../views/Settings.vue';

const routes = [
  {
    path: '/',
    name: 'Overview',
    component: Overview,
  },
  {
    path: '/ai',
    name: 'AiExport',
    component: AiExport,
  },
  {
    path: '/sleep',
    name: 'SleepList',
    component: SleepList,
  },
  {
    path: '/workouts',
    name: 'WorkoutList',
    component: WorkoutList,
  },
  {
    path: '/sleep/:sleepId',
    name: 'SleepDetail',
    component: SleepDetail,
  },
  {
    path: '/workouts/:workoutId',
    name: 'WorkoutDetail',
    component: WorkoutDetail,
  },
  {
    path: '/settings',
    name: 'Settings',
    component: Settings,
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: { path: '/', query: { notice: 'not-found' } },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
