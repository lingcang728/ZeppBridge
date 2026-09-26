import { inject, provide, type InjectionKey } from 'vue';
import { createAuthFlow, type AuthFlow } from './useAuthFlow';
import { createDiagnosticReport, type DiagnosticReport } from './useDiagnosticReport';
import { createSettingsFeedback, type SettingsFeedback } from './useSettingsFeedback';
import { createUserPrefs, type UserPrefsState } from './useUserPrefs';

/**
 * 设置页各区块共享的状态。
 *
 * 设置页不进 KeepAlive，每次进来都是新实例；用 provide/inject 而不是模块级单例，
 * 离开再回来时提示、登录进度这些才会像以前一样清空。
 */
export interface SettingsContext {
  feedback: SettingsFeedback;
  auth: AuthFlow;
  prefs: UserPrefsState;
  diagnostics: DiagnosticReport;
}

const SETTINGS_CONTEXT: InjectionKey<SettingsContext> = Symbol('settings-context');

export const provideSettingsContext = (): SettingsContext => {
  const feedback = createSettingsFeedback();
  const context: SettingsContext = {
    feedback,
    auth: createAuthFlow(feedback),
    prefs: createUserPrefs(feedback),
    diagnostics: createDiagnosticReport(feedback),
  };
  provide(SETTINGS_CONTEXT, context);
  return context;
};

export const useSettingsContext = (): SettingsContext => {
  const context = inject(SETTINGS_CONTEXT);
  if (!context) throw new Error('useSettingsContext() must be used inside the settings page');
  return context;
};
