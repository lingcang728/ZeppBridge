import { defineMessages, useMessages } from '../../i18n';

const messages = defineMessages({
  official: '官方授权',
  advanced: '高级数据',
  noNickname: '没有昵称',
  advancedOnlyTitle: '只用高级数据也行',
  advancedKept: '高级数据已经连着，大部分数据都从这条路来，可以不做官方授权。两条都要的话，再点一次官方授权，把链接复制到无痕窗口，用和高级数据同一个账号登录后再允许。',
  advancedAfterDisconnect: '先断开官方授权，再用手表绑定的那个账号（邮箱或手机号加密码）登录高级数据。这个账号如果是用 Google、Apple 注册的，高级数据用不了，就只留官方授权。',
  disconnectOfficial: '断开官方授权',
}, {
  official: 'Official authorization',
  advanced: 'Advanced data',
  noNickname: 'No nickname',
  advancedOnlyTitle: 'Advanced data alone works too',
  advancedKept: 'Advanced data is already connected and brings in most of your data, so you can skip official authorization. To use both, start official authorization again, copy the link into a private window, sign in with the same account you use for Advanced data, then allow.',
  advancedAfterDisconnect: 'Disconnect official authorization, then sign in to Advanced data with the account your watch is paired to (email or phone and password). If that account was created with Google or Apple, Advanced data won’t work, so keep official authorization only.',
  disconnectOfficial: 'Disconnect official authorization',
}, {
  official: 'Autorización oficial',
  advanced: 'Datos avanzados',
  noNickname: 'Sin apodo',
  advancedOnlyTitle: 'También basta con los datos avanzados',
  advancedKept: 'Los datos avanzados ya están conectados y traen la mayoría de tus datos, así que puedes omitir la autorización oficial. Para usar ambas opciones, inicia de nuevo la autorización oficial, pega el enlace en una ventana de incógnito, inicia sesión con la misma cuenta que usas para los datos avanzados y luego permite el acceso.',
  advancedAfterDisconnect: 'Desconecta la autorización oficial y luego inicia sesión en datos avanzados con la cuenta vinculada a tu reloj (correo o teléfono con contraseña). Si esa cuenta se creó con Google o Apple, no podrás iniciar sesión en datos avanzados; conserva solo la autorización oficial.',
  disconnectOfficial: 'Desconectar autorización oficial',
}, 'views/settings/accountConflict');
export const useAccountConflictText = () => useMessages(messages);
