import type { DesignIconName } from '../../components/DesignIcon.vue';

export interface DemoScene {
  id: string;
  route: string;
  icon: DesignIconName;
}

/** 试用区五个入口。运动用训练负荷仪表，不用跑步小人。 */
export const DEMO_SCENES: readonly DemoScene[] = [
  { id: 'overview', route: '/', icon: 'overview' },
  { id: 'sleep', route: '/sleep', icon: 'sleep' },
  { id: 'workouts', route: '/workouts', icon: 'training-load' },
  { id: 'ai', route: '/ai', icon: 'handoff' },
  { id: 'plan', route: '/ai/plan', icon: 'document' },
];

/** 旧章节组件和录制脚本仍按这五个 id 找画面。 */
export const FEATURE_SCENES = DEMO_SCENES;
