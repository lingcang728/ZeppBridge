import { createRouter, createWebHistory } from 'vue-router';
import Overview from '../views/Overview.vue';
import Sleep from '../views/Sleep.vue';
import SleepDetail from '../views/SleepDetail.vue';
import Workouts from '../views/Workouts.vue';
import WorkoutDetail from '../views/WorkoutDetail.vue';
import Settings from '../views/Settings.vue';

const routes = [
  {
    path: '/',
    name: 'Overview',
    component: Overview,
  },
  {
    path: '/sleep',
    name: 'Sleep',
    component: Sleep,
  },
  {
    path: '/sleep/:sleepId',
    name: 'SleepDetail',
    component: SleepDetail,
  },
  {
    path: '/workouts',
    name: 'Workouts',
    component: Workouts,
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
