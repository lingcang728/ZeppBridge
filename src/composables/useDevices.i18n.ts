import { defineMessages } from '../i18n';

/* useDevices 的文案。moduleId 不变，语言包不用跟着搬家。 */
export const devicesMessages = defineMessages(
  {
    stateAccount: '账号已识别',
    stateUserAssigned: '你指认的型号',
    stateRecentData: '最近有数据',
    stateCached: '使用缓存',
    stateUnknown: '未识别',
    notFetchedYet: '尚未获取',
    timeUnknown: '时间未知',
    unidentifiedDevice: '未识别设备',
    notProvided: '未提供',
    identifyUnavailable: '设备识别暂时不可用',
    cacheUnavailable: '设备缓存暂时不可用',
    noLocalIdentifier: '这台设备没有可用的本机标识，无法保存指认。',
    assignmentCleared: '已撤销型号指认，恢复成自动识别结果。',
    assignmentSaved: '已记录你的型号指认。界面会把它标成「你指认的型号」，不会当成自动识别结果。',
    assignmentContributed: (reportId: string) =>
      `已记录你的型号指认，并把型号编号交给了 ZeppBridge（编号 ${reportId}）。下一版目录会让同款设备自动识别。`,
    assignmentContributionFailed: (reason: string) =>
      `已记录你的型号指认（只在本机）。补充目录没发送成功：${reason}`,
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
    identifyUnavailable: 'Device identification is unavailable right now',
    cacheUnavailable: 'The device cache is unavailable right now',
    noLocalIdentifier: 'This device carries no local identifier, so the pick cannot be saved.',
    assignmentCleared: 'Pick withdrawn. Back to the automatic match.',
    assignmentSaved: 'Your pick is saved. It shows up as "Model you picked" — never passed off as an automatic match.',
    assignmentContributed: (reportId: string) =>
      `Your pick is saved, and the model numbers went to ZeppBridge (report ${reportId}). The next catalog release will identify this model on its own.`,
    assignmentContributionFailed: (reason: string) =>
      `Your pick is saved on this machine. Sending the catalog contribution failed: ${reason}`,
    networkUnavailable: 'Network unavailable',
    assignmentFailed: 'Could not save the model pick',
  },
  {
    stateAccount: 'Conocido por la cuenta',
    stateUserAssigned: 'Modelo que elegiste',
    stateRecentData: 'Tiene datos recientes',
    stateCached: 'Desde la caché',
    stateUnknown: 'Sin identificar',
    notFetchedYet: 'Aún sin datos',
    timeUnknown: 'Hora desconocida',
    unidentifiedDevice: 'Dispositivo sin identificar',
    notProvided: 'Sin datos',
    identifyUnavailable: 'La identificación de dispositivos no está disponible en este momento',
    cacheUnavailable: 'La caché de dispositivos no está disponible en este momento',
    noLocalIdentifier: 'Este dispositivo no tiene un identificador local, así que no se puede guardar la elección.',
    assignmentCleared: 'Elección retirada. Se vuelve a la coincidencia automática.',
    assignmentSaved: 'Tu elección quedó guardada. Aparece como «Modelo que elegiste», nunca como una coincidencia automática.',
    assignmentContributed: (reportId: string) =>
      `Tu elección quedó guardada, y los números de modelo se enviaron a ZeppBridge (reporte ${reportId}). La próxima versión del catálogo identificará este modelo sola.`,
    assignmentContributionFailed: (reason: string) =>
      `Tu elección quedó guardada en este equipo. No se pudo enviar el aporte al catálogo: ${reason}`,
    networkUnavailable: 'Sin conexión a la red',
    assignmentFailed: 'No se pudo guardar el modelo elegido',
  },
  'composables/useDevices',
);
