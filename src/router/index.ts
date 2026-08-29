import { createRouter, createWebHistory } from 'vue-router';
import Overview from '../views/Overview.vue';
import RecentRecords from '../views/RecentRecords.vue';
import Explore from '../views/Explore.vue';
import BodyStatus from '../views/BodyStatus.vue';
import TrainingStatus from '../views/TrainingStatus.vue';
import SleepList from '../views/SleepList.vue';
import WorkoutList from '../views/WorkoutList.vue';
import SleepDetail from '../views/SleepDetail.vue';
import WorkoutDetail from '../views/WorkoutDetail.vue';
import HealthCheck from '../views/HealthCheck.vue';
import Settings from '../views/Settings.vue';

const routes = [
  {
    path: '/',
    name: 'Overview',
    component: Overview,
  },
  {
    path: '/recent',
    name: 'RecentRecords',
    component: RecentRecords,
  },
  {
    path: '/explore',
    name: 'Explore',
    component: Explore,
  },
  {
    path: '/body',
    name: 'BodyStatus',
    component: BodyStatus,
  },
  {
    path: '/training',
    name: 'TrainingStatus',
    component: TrainingStatus,
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
    path: '/health-check',
    name: 'HealthCheck',
    component: HealthCheck,
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
