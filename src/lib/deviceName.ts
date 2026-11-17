/**
 * 「这条记录来自哪块表」的名字，唯一一份渲染实现。
 *
 * 没有具体设备时（云端融合来源、记录带不出是哪块表）后端只给 `name_code`，不给中文名——
 * 英文用户在运动详情里看到过「设备未确定」。运动详情和睡眠详情都从这里取。
 */
import { defineMessages, messagesOf } from '../i18n';

const messages = defineMessages(
  { fused: '融合来源', undetermined: '设备未确定' },
  { fused: 'Combined sources', undetermined: 'Device undetermined' },
  { fused: 'Fuentes combinadas', undetermined: 'Dispositivo sin determinar' },
  'lib/deviceName',
);

export interface DeviceNameInput {
  readonly canonical_name?: string;
  readonly name?: string;
  readonly name_code?: string;
}

/** 设备名；什么都没有时返回空串，由调用方决定写「未提供」还是不显示。 */
export const deviceNameText = (profile: DeviceNameInput | null | undefined): string => {
  if (!profile) return '';
  const named = profile.canonical_name || profile.name;
  if (named) return named;
  const t = messagesOf(messages);
  switch (profile.name_code) {
    case 'ui.device.fused': return t.fused;
    case 'ui.device.undetermined': return t.undetermined;
    default: return '';
  }
};

/** 读设备档案失败时的兜底档案。 */
export const undeterminedDevice = (): DeviceNameInput => ({ name_code: 'ui.device.undetermined' });
