import workoutCatalog from '../assets/workouts/catalog.json';
import { defineMessages, locale, messagesOf } from '../i18n';

/*
 * 运动名来自随包目录（`src/assets/workouts/catalog.json`），后端也 include! 同
 * 一个文件。目录里每个运动都有 `label_zh` 和 `label_en` 两个名字，界面按当前
 * 语言取。
 *
 * 后端的 `sport_catalog::options()` 仍然只发 `key` 和中文 `label`——那是给
 * CLI / MCP 用的，不该跟着界面语言变。界面拿到那份列表之后，**按 key 自己
 * 查名字**，不用后端发来的 label。
 */
const catalogLabels: Record<'zh' | 'en', Map<string, string>> = {
  zh: new Map(workoutCatalog.sports.map((sport) => [sport.key, sport.label_zh])),
  en: new Map(workoutCatalog.sports.map((sport) => [sport.key, sport.label_en])),
};

const messages = defineMessages(
  {
    unknownWithCode: (code: string) => `未识别运动（编号 ${code}）`,
    unknownWorkout: '未识别运动',
    workout: '运动',
    fallback: {
      run: '户外跑步',
      running: '跑步',
      walking: '健走',
      walk: '步行',
      ride: '户外骑行',
      cycling: '户外骑行',
      indoor_cycling: '室内骑行',
      swimming: '游泳',
      treadmill: '室内跑步',
      indoor_run: '室内跑步',
      trail: '越野跑',
      hiking: '徒步',
      strength: '力量训练',
      elliptical: '椭圆机',
      rowing: '划船',
      yoga: '瑜伽',
      climb: '攀爬',
      badminton: '羽毛球',
      activity: '活动',
      unknown: '未识别运动',
    },
    providerZeppCloud: 'Zepp 云端',
    scopeUserFused: '用户融合',
    scopeDevice: '单设备',
    scopeMixed: '多来源',
    scopeUnknown: '范围未确认',
  },
  {
    unknownWithCode: (code: string) => `Unrecognized workout (code ${code})`,
    unknownWorkout: 'Unrecognized workout',
    workout: 'Workout',
    fallback: {
      run: 'Outdoor Running',
      running: 'Running',
      walking: 'Walking',
      walk: 'Walk',
      ride: 'Outdoor Cycling',
      cycling: 'Outdoor Cycling',
      indoor_cycling: 'Indoor Cycling',
      swimming: 'Swimming',
      treadmill: 'Treadmill',
      indoor_run: 'Indoor Running',
      trail: 'Trail Running',
      hiking: 'Hiking',
      strength: 'Strength Training',
      elliptical: 'Elliptical',
      rowing: 'Rowing',
      yoga: 'Yoga',
      climb: 'Climbing',
      badminton: 'Badminton',
      activity: 'Activity',
      unknown: 'Unrecognized workout',
    },
    providerZeppCloud: 'Zepp Cloud',
    scopeUserFused: 'User-fused',
    scopeDevice: 'Single device',
    scopeMixed: 'Multiple sources',
    scopeUnknown: 'Scope unconfirmed',
  },
);

const copy = () => messagesOf(messages);

export const workoutLabel = (value: string): string => {
  const t = copy();
  const unknownCode = value.trim().toLowerCase().match(/^unknown:(-?\d+)$/);
  if (unknownCode) return t.unknownWithCode(unknownCode[1]);
  const normalized = value.trim().toLowerCase();
  const fallback = t.fallback as Record<string, string | undefined>;
  return catalogLabels[locale.value].get(normalized) || fallback[normalized] || value || t.workout;
};

export const sourceLabel = (scope?: string): string => dataScopeLabel(scope);

/** 数据提供方。ZeppBridge 只从 Zepp 云端拉取，不用范围冒充来源。 */
export const dataProviderLabel = (): string => copy().providerZeppCloud;

/** 数据作用范围 / 融合范围，不是数据提供方。 */
export const dataScopeLabel = (scope?: string): string => {
  const t = copy();
  if (scope === 'user_fused') return t.scopeUserFused;
  if (scope === 'device') return t.scopeDevice;
  if (scope === 'mixed') return t.scopeMixed;
  return t.scopeUnknown;
};
