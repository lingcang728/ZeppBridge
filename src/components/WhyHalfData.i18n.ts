import { defineMessages } from '../i18n';

/*
 * 「为什么有些数据没有？」——设置页账号卡常驻入口和 3.0.2 更新说明第一页共用这一份。
 * 措辞对照 docs/development/v3-plan.md 的接口事实与 official/fetch.rs 实际在拉的流：
 * 官方能给心率、睡眠、步数、运动、PAI、体重；没有 HRV、血氧、全天压力、准备度、
 * Charge、训练负荷、饮食；补拉历史只走高级数据。不夸大、不承诺。
 * `*Has` 是用 `|` 分隔的清单，界面拆成一枚枚小标签；翻译时保留 `|`。
 * 另外 9 种语言在 src/i18n/locales/*.ts 的 'components/WhyHalfData' 下（待翻登记在桌面《翻译.md》）。
 */
export const whyHalfDataMessages = defineMessages(
  {
    title: '为什么有些数据没有？',
    lead: 'ZeppBridge 有两条连接，能拿到的数据不一样。',
    officialName: '官方授权',
    officialHas: '心率|睡眠|步数|运动|PAI|体重',
    officialLacks: '不能补拉更早的历史',
    advancedName: '高级数据',
    advancedHas: 'HRV|血氧|全天压力|准备度|Charge|训练负荷|饮食记录|更早的历史',
    advancedLogin: '只能用 Zepp 邮箱 / 手机号 + 密码登录',
    advancedNoThirdParty: '不支持 Google、Apple、微信、小米等第三方登录',
    footer: '只连官方授权时，高级数据那一栏都拿不到——这是官方开放的权限不够，不是 ZeppBridge 出了问题。我们已向华米反馈，至今没有回复。',
    close: '知道了',
  },
  {
    title: 'Why is some data missing?',
    lead: 'ZeppBridge has two connections, and they don’t return the same data.',
    officialName: 'Official authorization',
    officialHas: 'Heart rate|Sleep|Steps|Workouts|PAI|Weight',
    officialLacks: 'Can’t backfill older history',
    advancedName: 'Advanced data',
    advancedHas: 'HRV|Blood oxygen|All-day stress|Readiness|Charge|Training load|Food logs|Older history',
    advancedLogin: 'Zepp email or phone number + password only',
    advancedNoThirdParty: 'Google, Apple, WeChat, Xiaomi and other third-party sign-in don’t work',
    footer: 'With official authorization alone, nothing in the Advanced data column comes through. That’s a limit of what the official channel offers, not a ZeppBridge bug. We’ve raised it with Zepp (Huami) and haven’t had a reply.',
    close: 'Got it',
  },
  {
    title: '¿Por qué faltan algunos datos?',
    lead: 'ZeppBridge tiene dos conexiones y no devuelven los mismos datos.',
    officialName: 'Autorización oficial',
    officialHas: 'Frecuencia cardíaca|Sueño|Pasos|Entrenamientos|PAI|Peso',
    officialLacks: 'No recupera historial anterior',
    advancedName: 'Datos avanzados',
    advancedHas: 'VFC|Oxígeno en sangre|Estrés de todo el día|Recuperación|Charge|Carga de entrenamiento|Registros de comida|Historial anterior',
    advancedLogin: 'Solo correo o teléfono de Zepp + contraseña',
    advancedNoThirdParty: 'No funciona con Google, Apple, WeChat, Xiaomi ni otros inicios de sesión externos',
    footer: 'Con solo la autorización oficial no llega nada de la columna Datos avanzados. Es un límite del canal oficial, no un fallo de ZeppBridge. Se lo hemos comunicado a Zepp (Huami) y no hay respuesta.',
    close: 'Entendido',
  },
  'components/WhyHalfData',
);
