import { defineMessages } from '../i18n';

/* useDevices 的文案。moduleId 不变，语言包不用跟着搬家。 */
export const devicesMessages = defineMessages(
  {
    stateAccount: '账号已识别',
    stateUserAssigned: '你指认的型号',
    stateRecentData: '最近有数据',
    stateCached: '本机缓存',
    stateUnknown: '未识别',
    notFetchedYet: '尚未获取',
    timeUnknown: '时间未知',
    unidentifiedDevice: '未识别设备',
    notProvided: '未提供',
    identifyUnavailable: '设备识别暂不可用',
    cacheUnavailable: '设备缓存暂不可用',
    noLocalIdentifier: '这台设备没有可用的本机标识，存不了指认。',
    assignmentCleared: '已撤销型号指认，恢复自动识别结果。',
    assignmentSaved: '已记录型号指认。界面会标成「你指认的型号」，不当作自动识别结果。',
    assignmentContributed: (reportId: string) =>
      `已记录型号指认，型号编号已交给 ZeppBridge（${reportId}）。下一版目录会自动识别同款设备。`,
    assignmentContributionFailed: (reason: string) =>
      `已记录型号指认（只存本机）。补充目录没发出去：${reason}`,
    networkUnavailable: '网络不可用',
    assignmentFailed: '无法保存型号指认',
  },
  {
    stateAccount: 'Known from account',
    stateUserAssigned: 'Model you picked',
    stateRecentData: 'Has recent data',
    stateCached: 'From cache',
    stateUnknown: 'Not identified',
    notFetchedYet: 'Not fetched yet',
    timeUnknown: 'Time unknown',
    unidentifiedDevice: 'Unidentified device',
    notProvided: 'Not provided',
    identifyUnavailable: 'Device identification unavailable right now',
    cacheUnavailable: 'Device cache unavailable right now',
    noLocalIdentifier: 'No local identifier on this device — the pick cannot be saved.',
    assignmentCleared: 'Pick withdrawn. Back to the automatic match.',
    assignmentSaved: 'Pick saved. Shown as "Model you picked" — never passed off as an automatic match.',
    assignmentContributed: (reportId: string) =>
      `Pick saved, and the model numbers went to ZeppBridge (report ${reportId}). The next catalog release will identify this model on its own.`,
    assignmentContributionFailed: (reason: string) =>
      `Pick saved on this machine. The catalog contribution failed to send: ${reason}`,
    networkUnavailable: 'Network unavailable',
    assignmentFailed: 'Could not save the model pick',
  },
  {
    stateAccount: 'Conocido por la cuenta',
    stateUserAssigned: 'Modelo que elegiste',
    stateRecentData: 'Tiene datos recientes',
    stateCached: 'Caché local',
    stateUnknown: 'Sin identificar',
    notFetchedYet: 'Aún sin datos',
    timeUnknown: 'Hora desconocida',
    unidentifiedDevice: 'Dispositivo sin identificar',
    notProvided: 'No proporcionado',
    identifyUnavailable: 'Identificación de dispositivos no disponible de momento',
    cacheUnavailable: 'Caché de dispositivos no disponible de momento',
    noLocalIdentifier: 'Este dispositivo no tiene identificador local; no se puede guardar la elección.',
    assignmentCleared: 'Elección retirada; se volvió a la coincidencia automática.',
    assignmentSaved: 'Elección de modelo guardada. Se marca como «Modelo que elegiste», no como coincidencia automática.',
    assignmentContributed: (reportId: string) =>
      `Elección de modelo guardada y números de modelo entregados a ZeppBridge (${reportId}). El próximo catálogo reconocerá este modelo solo.`,
    assignmentContributionFailed: (reason: string) =>
      `Elección de modelo guardada solo en este equipo. El aporte al catálogo no salió: ${reason}`,
    networkUnavailable: 'Sin conexión a la red',
    assignmentFailed: 'No se pudo guardar el modelo elegido',
  },
  'composables/useDevices',
);
