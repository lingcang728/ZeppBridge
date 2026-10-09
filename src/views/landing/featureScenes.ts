/** The capture manifest uses these same five chapter IDs. */
export const FEATURE_SCENES = [
  { id: 'overview', route: '/', icon: 'cards' },
  { id: 'sleep', route: '/sleep', icon: 'moon' },
  { id: 'workouts', route: '/workouts', icon: 'run' },
  { id: 'ai', route: '/ai', icon: 'spark' },
  { id: 'plan', route: '/ai/plan', icon: 'send' },
] as const;
