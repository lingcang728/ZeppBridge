/**
 * 后端错误码 → 界面文案。
 *
 * 后端不按界面语言出文案：它只给一个稳定的 `err.*` 码和中文原文。这里按码取
 * 当前语言的说法，取不到才回落到那句中文。
 *
 * 上一版没有这一层，`toUserMessage` 把后端的中文字符串原样显示，于是英文界面
 * 上每一个后端错误都是中文——Reddit 上真实走通流程的用户就是被这个绊住的。
 *
 * 加后端错误码时这里必须同时补中英德三份，`npm run i18n:check` 会挡住漏掉的
 * 那一半。码本身是契约，不要改名。
 */
import { defineMessages, messagesOf } from './index';

const messages = defineMessages(
  {
    /* —— core：从 ZeppBridgeError 抬上来的通用错误 —— */
    'err.core.network': '无法连接 Zepp 区域，请检查网络后重试',
    'err.core.needs_reauth': '认证已失效，请重新连接 Zepp',
    'err.core.unavailable': '这个账号或区域没有这项数据',
    'err.core.retry_exhausted': 'Zepp 服务暂时不可用，请稍后重试',
    'err.core.http_status': 'Zepp 服务返回了错误，请稍后重试',
    'err.core.cancelled': '操作已取消',
    'err.core.auth': '认证出错了',
    // 有人报上来的原话就是这一句加一个红条，然后没有下文（反馈 e5fb37a5）：
    // 登录明明走完了，凭据却存不下，而界面没告诉他还能怎么办。出路本来就
    // 有——设置里那个「手动填 App Token」——只是没人会想到去找它。
    'err.core.credential_store':
      '令牌没能存进系统凭据管理器。常见原因：凭据管理器被组策略或安全软件禁用了，'
      + '或者读到的根本不是 App Token（长得超出了凭据管理器的容量）。'
      + '出路：到「设置 → 高级 → 手动填写 App Token」直接把令牌填进去，'
      + '或者用 HAR 导入。两条路都不依赖这次自动保存。',
    'err.core.invalid_host': '不安全的 Zepp 区域地址',
    'err.core.config': '配置有问题，需要先改一下',
    'err.core.busy': '另一个写入操作正在进行，请等它结束',
    'err.core.parse': 'Zepp 返回的数据无法解析',
    'err.core.database': '本地数据库暂时不可用',
    'err.core.io': '读写本地文件失败',
    'err.core.unknown': '出了点问题',

    /* —— 连接与认证 —— */
    'err.auth.sync_init_failed': '无法初始化同步，请检查认证区域后重试',
    'err.auth.verify_network': '认证验证失败：无法连接 Zepp 服务，请检查网络后重试',
    'err.auth.verify_needs_reauth': '认证验证失败：认证已失效，请重新保存认证信息',
    'err.auth.verify_failed': '认证验证失败',

    /* —— 网页登录 —— */
    'err.login.waiting': '请在弹出窗口完成 Zepp 登录',
    'err.login.fallback_page': '正在打开备用登录页',
    'err.login.extracting': '已读取登录凭据，正在确认区域',
    'err.login.verifying': '正在验证账号',
    'err.login.connected': '已连接 Zepp 账号',
    'err.login.timeout': '登录超时，请重试',
    'err.login.credentials_unreadable':
      '已经登录，但没能从登录窗口读到凭据。可以改用 HAR 导入或手动填写 App Token。',
    'err.login.region_probe_failed':
      '读到了凭据，但无法确认账号区域。请重新登录，或改用 HAR 导入。',
    'err.login.credentials_rejected': 'Zepp 拒绝了这次登录凭据，请退出登录窗口后重新登录',
    'err.login.region_unreachable': '暂时无法连接 Zepp 区域服务，请检查网络后重试',
    'err.login.region_retrying': '暂时连不上 Zepp 区域服务，正在重试；登录窗口先留着，不用重新登录',
    'err.login.third_party_stalled':
      '第三方登录好像卡住了。Google 的通行密钥在应用内窗口里经常停在验证那一步走不下去。可以关掉登录窗口改用邮箱+密码，或者在设置里手动填写 App Token。',
    'err.login.bad_url': '登录地址无效',
    'err.login.window_failed': '无法打开登录窗口',
    'err.login.window_busy': '上一个登录窗口还没有关完，请稍等一下再试',
    'err.login.state_unavailable': '应用状态不可用',
    'err.login.cancelled': '登录已取消',
    'err.login.sync_init_failed': '登录成功了，但同步初始化失败',

    /* —— 同步与补拉 —— */
    'err.sync.not_connected': '尚未连接 Zepp，请先完成连接',
    'err.sync.not_verified': '请先完成连接验证，再同步最近数据',
    'err.sync.not_verified_probe': '请先完成连接验证，再探测数据能力',
    'err.sync.not_verified_backfill': '请先完成连接验证，再补拉历史',
    'err.sync.history_days_out_of_range': '同步天数超出允许范围',
    'err.sync.deferred_compaction': '正在压缩历史报文以节省磁盘空间，本次云端同步稍后自动重试',
    'err.sync.deferred_replay': '正在用本地原始报文重建派生数据，本次云端同步稍后自动重试',
    'err.backfill.bad_start_date': '补拉起点日期无效，需要 YYYY-MM-DD',
    'err.backfill.no_canonical_records': '云端返回了报文，但没有解析出可用记录',
    'err.backfill.start_in_future': '补拉起点不能晚于今天',

    /* —— 能力状态 —— */
    'err.capability.not_synced': '尚未同步',
    'err.capability.needs_reauth': '需要重新认证',
    'err.capability.unverified': '能力尚未验证',
    'err.capability.unavailable': '能力不可用',
    'err.capability.unknown': '能力状态未知',
    'err.capability.other': '能力状态未知',

    /* —— 导出 —— */
    'err.export.empty_range': '这段时间没有可导出的记录',
    'err.export.read_failed': '读取导出数据失败',
    'err.export.convert_failed': '转换导出格式失败',
    'err.export.write_failed': '写入导出文件失败',
    'err.export.write_json_failed': '写入 JSON 导出失败',
    'err.export.mkdir_failed': '创建导出目录失败',
    'err.export.path_required': '请先选择保存位置',
    'err.export.path_not_absolute': '保存位置必须是绝对路径',
    'err.export.not_a_directory': 'FIT 导出需要一个目录，这里选中的是一个文件',
    'err.export.bad_extension': '导出文件的扩展名不对',
    'err.export.path_no_parent': '保存位置缺少有效的文件夹',
    'err.export.parent_missing': '所选保存文件夹不存在',

    /* —— 交给 AI —— */
    'err.handoff.prompt_required': '请先填写提示词',
    'err.handoff.empty_range': '这段时间没有可交接的记录',
    'err.handoff.mkdir_failed': '创建数据包导出目录失败',
    'err.handoff.write_failed': '写入脱敏 AI 数据失败',
    'err.handoff.parse_failed': '解析 AI 导出 JSON 失败',
    'err.handoff.encode_failed': '编码脱敏 AI 导出失败',

    /* —— 问题反馈 —— */
    'err.diagnostic.nothing_to_submit': '这台设备没有可用于补充目录的型号编号，暂时不需要提交',
    'err.diagnostic.empty_report':
      '请先选择要反馈的问题类型，或写一句说明——否则这份报告里没有任何可处理的内容',
    'err.diagnostic.client_init_failed': '无法初始化错误报告连接',
    'err.diagnostic.send_failed': '错误报告发送失败，请检查网络后重试',
    'err.diagnostic.http_error': '错误报告服务返回了错误',
    'err.diagnostic.rate_limited':
      '短时间内提交了太多份报告，请过一会儿再试。已经交过的那几份不会丢，也不用重复提交。',
    'err.diagnostic.bad_response': '错误报告服务返回了无法识别的结果',

    /* —— 其它 —— */
    'err.workout.not_found': '运动记录不存在',
    'err.prefs.retention_out_of_range': '保留天数必须在 1 到 365 天之间',
    'err.storage.write_busy': '另一个 ZeppBridge 写入操作正在进行，请等它结束',
    'err.storage.write_lock_unavailable': '无法建立写入锁，请检查数据文件夹的权限',
    'err.local_api.token_unavailable': '无法读取本机 API 凭据',
    'err.local_api.token_rotate_failed': '无法重新生成本机 API 凭据',
    'err.data_folder.open_failed': '打开数据文件夹失败',
    'err.data_folder.unsupported_os': '打开数据文件夹仅支持 Windows/macOS',
    'err.update.localappdata_missing': 'Windows LOCALAPPDATA 路径不可用',
    'err.update.launch_failed': '无法启动更新后的安装版',
    'err.update.installed_build_missing': '安装完成后未找到新的 ZeppBridge 安装版',
    'err.update.portable_windows_only': '便携版安装迁移仅支持 Windows',
  },
  {
    /* —— core —— */
    'err.core.network': "Couldn't reach the Zepp region. Check your network and try again",
    'err.core.needs_reauth': 'Your sign-in has expired. Connect to Zepp again',
    'err.core.unavailable': "This account or region doesn't provide that data",
    'err.core.retry_exhausted': 'Zepp is temporarily unavailable. Try again shortly',
    'err.core.http_status': 'Zepp returned an error. Try again shortly',
    'err.core.cancelled': 'Cancelled',
    'err.core.auth': 'Something went wrong with authentication',
    'err.core.credential_store':
      'The token could not be saved to the system credential store. Common causes: the credential store is '
      + 'disabled by a group policy or security software, or what was read is not an App Token at all '
      + '(too long for the store to hold). What to do: go to Settings -> Advanced and enter the App Token '
      + 'manually, or use the HAR import. Neither path depends on this automatic save.',
    'err.core.invalid_host': 'Unsafe Zepp region address',
    'err.core.config': 'Something in the configuration needs changing first',
    'err.core.busy': 'Another write is in progress. Wait for it to finish',
    'err.core.parse': "Zepp's response could not be parsed",
    'err.core.database': 'The local database is temporarily unavailable',
    'err.core.io': 'Reading or writing a local file failed',
    'err.core.unknown': 'Something went wrong',

    /* —— connect & auth —— */
    'err.auth.sync_init_failed': "Couldn't set up syncing. Check the account region and try again",
    'err.auth.verify_network':
      "Verification failed: couldn't reach Zepp. Check your network and try again",
    'err.auth.verify_needs_reauth':
      'Verification failed: the credential is no longer valid. Save it again',
    'err.auth.verify_failed': 'Verification failed',

    /* —— web login —— */
    'err.login.waiting': 'Finish signing in to Zepp in the pop-up window',
    'err.login.fallback_page': 'Opening the alternate sign-in page',
    'err.login.extracting': 'Credentials read. Confirming your region',
    'err.login.verifying': 'Verifying the account',
    'err.login.connected': 'Connected to your Zepp account',
    'err.login.timeout': 'Sign-in timed out. Try again',
    'err.login.credentials_unreadable':
      "You're signed in, but the credentials could not be read from the sign-in window. Try the HAR import or enter an App Token manually.",
    'err.login.region_probe_failed':
      "Credentials were read, but the account region couldn't be confirmed. Sign in again or import a HAR file.",
    'err.login.credentials_rejected':
      'Zepp rejected these credentials. Sign out in the login window, then sign in again',
    'err.login.region_unreachable':
      "Couldn't reach the Zepp region service. Check your network and try again",
    'err.login.region_retrying':
      "Can't reach the Zepp region service right now — retrying. The sign-in window stays open, so there is no need to sign in again",
    'err.login.third_party_stalled':
      'This third-party sign-in looks stuck. Google passkeys often stall at the verification step inside an in-app window. Close the sign-in window and use email + password instead, or enter an App Token manually in Settings.',
    'err.login.bad_url': 'Invalid sign-in address',
    'err.login.window_failed': "Couldn't open the sign-in window",
    'err.login.window_busy':
      'The previous sign-in window is still closing. Wait a moment and try again',
    'err.login.state_unavailable': 'Application state is unavailable',
    'err.login.cancelled': 'Sign-in cancelled',
    'err.login.sync_init_failed': "Signed in, but syncing couldn't be initialised",

    /* —— sync & backfill —— */
    'err.sync.not_connected': 'Not connected to Zepp yet. Connect first',
    'err.sync.not_verified': 'Finish verifying the connection before syncing recent data',
    'err.sync.not_verified_probe': 'Finish verifying the connection before probing capabilities',
    'err.sync.not_verified_backfill': 'Finish verifying the connection before backfilling history',
    'err.sync.history_days_out_of_range': 'That number of days is outside the allowed range',
    'err.sync.deferred_compaction':
      'Compacting stored payloads to save disk space. This sync will retry automatically',
    'err.sync.deferred_replay':
      'Rebuilding derived data from local payloads. This sync will retry automatically',
    'err.backfill.bad_start_date': 'Invalid backfill start date — use YYYY-MM-DD',
    'err.backfill.no_canonical_records':
      'The cloud returned a payload, but no usable records could be parsed from it',
    'err.backfill.start_in_future': 'The backfill start cannot be later than today',

    /* —— capabilities —— */
    'err.capability.not_synced': 'Not synced yet',
    'err.capability.needs_reauth': 'Needs re-authentication',
    'err.capability.unverified': 'Not verified yet',
    'err.capability.unavailable': 'Unavailable',
    'err.capability.unknown': 'Status unknown',
    'err.capability.other': 'Status unknown',

    /* —— export —— */
    'err.export.empty_range': 'No records in this range to export',
    'err.export.read_failed': "Couldn't read the export data",
    'err.export.convert_failed': "Couldn't convert to the requested format",
    'err.export.write_failed': "Couldn't write the export file",
    'err.export.write_json_failed': "Couldn't write the JSON export",
    'err.export.mkdir_failed': "Couldn't create the export folder",
    'err.export.path_required': 'Choose where to save the file first',
    'err.export.path_not_absolute': 'The save location must be an absolute path',
    'err.export.not_a_directory':
      'A FIT export needs a folder, but the selected path is a file',
    'err.export.bad_extension': 'The export file has the wrong extension',
    'err.export.path_no_parent': 'The save location has no valid folder',
    'err.export.parent_missing': "The chosen folder doesn't exist",

    /* —— hand to AI —— */
    'err.handoff.prompt_required': 'Write a prompt first',
    'err.handoff.empty_range': 'No records in this range to hand off',
    'err.handoff.mkdir_failed': "Couldn't create the hand-off folder",
    'err.handoff.write_failed': "Couldn't write the redacted AI data",
    'err.handoff.parse_failed': "Couldn't parse the AI export JSON",
    'err.handoff.encode_failed': "Couldn't encode the redacted AI export",

    /* —— feedback —— */
    'err.diagnostic.nothing_to_submit':
      "This device has no model number that would help the catalogue, so there's nothing to submit",
    'err.diagnostic.empty_report':
      "Pick a problem type or write a sentence first — otherwise the report contains nothing anyone can act on",
    'err.diagnostic.client_init_failed': "Couldn't open a connection for the report",
    'err.diagnostic.send_failed': "Couldn't send the report. Check your network and try again",
    'err.diagnostic.http_error': 'The report service returned an error',
    'err.diagnostic.rate_limited':
      'Too many reports in a short time. Try again in a little while — the ones already sent are kept, and there is no need to resend them.',
    'err.diagnostic.bad_response': 'The report service returned something we could not read',

    /* —— misc —— */
    'err.workout.not_found': 'That workout no longer exists',
    'err.prefs.retention_out_of_range': 'Retention must be between 1 and 365 days',
    'err.storage.write_busy': 'Another ZeppBridge write is in progress. Wait for it to finish',
    'err.storage.write_lock_unavailable':
      "Couldn't create the write lock. Check permissions on the data folder",
    'err.local_api.token_unavailable': "Couldn't read the local API credential",
    'err.local_api.token_rotate_failed': "Couldn't regenerate the local API credential",
    'err.data_folder.open_failed': "Couldn't open the data folder",
    'err.data_folder.unsupported_os': 'Opening the data folder is supported on Windows and macOS only',
    'err.update.localappdata_missing': 'The Windows LOCALAPPDATA path is unavailable',
    'err.update.launch_failed': "Couldn't start the updated installed build",
    'err.update.installed_build_missing': 'No new installed ZeppBridge build was found after setup',
    'err.update.portable_windows_only': 'Portable-to-installed migration is Windows only',
  },
  {
    /* —— core —— */
    'err.core.network': 'Zepp-Region nicht erreichbar. Netzwerk prüfen und erneut versuchen',
    'err.core.needs_reauth': 'Anmeldung ist abgelaufen. Erneut mit Zepp verbinden',
    'err.core.unavailable': 'Dieses Konto oder diese Region stellt diese Daten nicht bereit',
    'err.core.retry_exhausted': 'Zepp ist vorübergehend nicht erreichbar. In Kürze erneut versuchen',
    'err.core.http_status': 'Zepp hat einen Fehler zurückgegeben. In Kürze erneut versuchen',
    'err.core.cancelled': 'Abgebrochen',
    'err.core.auth': 'Bei der Authentifizierung ist etwas schiefgelaufen',
    'err.core.credential_store':
      'Das Token konnte nicht im System-Anmeldeinformationsspeicher gespeichert werden. Häufige Ursachen: '
      + 'der Speicher ist per Gruppenrichtlinie oder Sicherheitssoftware deaktiviert, oder es wurde gar kein '
      + 'App-Token gelesen (zu lang für den Speicher). Lösung: unter Einstellungen -> Erweitert das App-Token '
      + 'manuell eingeben, oder den HAR-Import verwenden. Beide Wege sind von dieser automatischen '
      + 'Speicherung unabhängig.',
    'err.core.invalid_host': 'Unsichere Zepp-Regionsadresse',
    'err.core.config': 'An der Konfiguration muss zuerst etwas geändert werden',
    'err.core.busy': 'Ein anderer Schreibvorgang läuft noch. Bitte warten, bis er abgeschlossen ist',
    'err.core.parse': 'Antwort von Zepp konnte nicht verarbeitet werden',
    'err.core.database': 'Die lokale Datenbank ist vorübergehend nicht verfügbar',
    'err.core.io': 'Lesen oder Schreiben einer lokalen Datei ist fehlgeschlagen',
    'err.core.unknown': 'Etwas ist schiefgelaufen',

    /* —— Verbindung & Anmeldung —— */
    'err.auth.sync_init_failed': 'Synchronisierung konnte nicht eingerichtet werden. Kontoregion prüfen und erneut versuchen',
    'err.auth.verify_network':
      'Überprüfung fehlgeschlagen: Zepp nicht erreichbar. Netzwerk prüfen und erneut versuchen',
    'err.auth.verify_needs_reauth':
      'Überprüfung fehlgeschlagen: Anmeldedaten sind nicht mehr gültig. Erneut speichern',
    'err.auth.verify_failed': 'Überprüfung fehlgeschlagen',

    /* —— Web-Anmeldung —— */
    'err.login.waiting': 'Anmeldung bei Zepp im Popup-Fenster abschliessen',
    'err.login.fallback_page': 'Alternative Anmeldeseite wird geöffnet',
    'err.login.extracting': 'Anmeldedaten gelesen. Region wird bestätigt',
    'err.login.verifying': 'Konto wird überprüft',
    'err.login.connected': 'Mit Zepp-Konto verbunden',
    'err.login.timeout': 'Anmeldung hat zu lange gedauert. Erneut versuchen',
    'err.login.credentials_unreadable':
      'Anmeldung erfolgt, aber Anmeldedaten konnten nicht aus dem Anmeldefenster gelesen werden. '
      + 'HAR-Import verwenden oder App-Token manuell eingeben.',
    'err.login.region_probe_failed':
      'Anmeldedaten wurden gelesen, aber die Kontoregion konnte nicht bestätigt werden. '
      + 'Erneut anmelden oder eine HAR-Datei importieren.',
    'err.login.credentials_rejected':
      'Zepp hat diese Anmeldedaten abgelehnt. Im Anmeldefenster abmelden und dann erneut anmelden',
    'err.login.region_unreachable':
      'Zepp-Regionsdienst vorübergehend nicht erreichbar. Netzwerk prüfen und erneut versuchen',
    'err.login.region_retrying':
      'Zepp-Regionsdienst gerade nicht erreichbar — wird automatisch erneut versucht. '
      + 'Das Anmeldefenster bleibt geöffnet, eine erneute Anmeldung ist nicht nötig',
    'err.login.third_party_stalled':
      'Diese Anmeldung über einen Drittanbieter scheint zu hängen. Passkeys von Google bleiben in '
      + 'einem eingebetteten Fenster häufig beim Überprüfungsschritt stecken. Anmeldefenster schliessen '
      + 'und stattdessen E-Mail + Passwort verwenden, oder das App-Token manuell in den Einstellungen eingeben.',
    'err.login.bad_url': 'Ungültige Anmeldeadresse',
    'err.login.window_failed': 'Anmeldefenster konnte nicht geöffnet werden',
    'err.login.window_busy':
      'Das vorherige Anmeldefenster wird noch geschlossen. Kurz warten und erneut versuchen',
    'err.login.state_unavailable': 'Anwendungsstatus nicht verfügbar',
    'err.login.cancelled': 'Anmeldung abgebrochen',
    'err.login.sync_init_failed': 'Angemeldet, aber Synchronisierung konnte nicht initialisiert werden',

    /* —— Synchronisierung & Nachladen —— */
    'err.sync.not_connected': 'Noch nicht mit Zepp verbunden. Zuerst verbinden',
    'err.sync.not_verified': 'Verbindung zuerst überprüfen, bevor aktuelle Daten synchronisiert werden',
    'err.sync.not_verified_probe': 'Verbindung zuerst überprüfen, bevor Funktionen geprüft werden',
    'err.sync.not_verified_backfill': 'Verbindung zuerst überprüfen, bevor der Verlauf nachgeladen wird',
    'err.sync.history_days_out_of_range': 'Diese Anzahl Tage liegt ausserhalb des zulässigen Bereichs',
    'err.sync.deferred_compaction':
      'Gespeicherte Rohdaten werden komprimiert, um Speicherplatz zu sparen. Diese Synchronisierung wird automatisch erneut versucht',
    'err.sync.deferred_replay':
      'Abgeleitete Daten werden aus lokalen Rohdaten neu aufgebaut. Diese Synchronisierung wird automatisch erneut versucht',
    'err.backfill.bad_start_date': 'Ungültiges Startdatum für das Nachladen — Format JJJJ-MM-TT verwenden',
    'err.backfill.no_canonical_records':
      'Die Cloud hat Daten zurückgegeben, aber daraus liessen sich keine verwertbaren Datensätze extrahieren',
    'err.backfill.start_in_future': 'Der Startzeitpunkt für das Nachladen darf nicht in der Zukunft liegen',

    /* —— Funktionsstatus —— */
    'err.capability.not_synced': 'Noch nicht synchronisiert',
    'err.capability.needs_reauth': 'Erneute Authentifizierung erforderlich',
    'err.capability.unverified': 'Noch nicht überprüft',
    'err.capability.unavailable': 'Nicht verfügbar',
    'err.capability.unknown': 'Status unbekannt',
    'err.capability.other': 'Status unbekannt',

    /* —— Export —— */
    'err.export.empty_range': 'In diesem Zeitraum gibt es keine exportierbaren Datensätze',
    'err.export.read_failed': 'Exportdaten konnten nicht gelesen werden',
    'err.export.convert_failed': 'Umwandlung in das gewünschte Format ist fehlgeschlagen',
    'err.export.write_failed': 'Exportdatei konnte nicht geschrieben werden',
    'err.export.write_json_failed': 'JSON-Export konnte nicht geschrieben werden',
    'err.export.mkdir_failed': 'Exportordner konnte nicht erstellt werden',
    'err.export.path_required': 'Bitte zuerst einen Speicherort auswählen',
    'err.export.path_not_absolute': 'Der Speicherort muss ein absoluter Pfad sein',
    'err.export.not_a_directory': 'Ein FIT-Export benötigt einen Ordner, ausgewählt wurde jedoch eine Datei',
    'err.export.bad_extension': 'Die Exportdatei hat die falsche Dateiendung',
    'err.export.path_no_parent': 'Dem Speicherort fehlt ein gültiger übergeordneter Ordner',
    'err.export.parent_missing': 'Der ausgewählte Ordner existiert nicht',

    /* —— an KI übergeben —— */
    'err.handoff.prompt_required': 'Bitte zuerst einen Prompt eingeben',
    'err.handoff.empty_range': 'In diesem Zeitraum gibt es keine übergebbaren Datensätze',
    'err.handoff.mkdir_failed': 'Übergabeordner konnte nicht erstellt werden',
    'err.handoff.write_failed': 'Anonymisierte KI-Daten konnten nicht geschrieben werden',
    'err.handoff.parse_failed': 'JSON-Export für KI konnte nicht verarbeitet werden',
    'err.handoff.encode_failed': 'Anonymisierter KI-Export konnte nicht kodiert werden',

    /* —— Problemfeedback —— */
    'err.diagnostic.nothing_to_submit':
      'Dieses Gerät hat keine Modellnummer, die dem Gerätekatalog weiterhelfen würde — es gibt gerade nichts einzureichen',
    'err.diagnostic.empty_report':
      'Bitte zuerst einen Problemtyp auswählen oder einen Satz schreiben — sonst enthält der Bericht nichts Verwertbares',
    'err.diagnostic.client_init_failed': 'Verbindung für den Bericht konnte nicht hergestellt werden',
    'err.diagnostic.send_failed': 'Bericht konnte nicht gesendet werden. Netzwerk prüfen und erneut versuchen',
    'err.diagnostic.http_error': 'Der Berichtsdienst hat einen Fehler zurückgegeben',
    'err.diagnostic.rate_limited':
      'Zu viele Berichte in kurzer Zeit. Bitte etwas später erneut versuchen — bereits gesendete Berichte gehen nicht verloren und müssen nicht erneut eingereicht werden.',
    'err.diagnostic.bad_response': 'Der Berichtsdienst hat eine nicht lesbare Antwort zurückgegeben',

    /* —— sonstiges —— */
    'err.workout.not_found': 'Dieses Training existiert nicht mehr',
    'err.prefs.retention_out_of_range': 'Aufbewahrungsdauer muss zwischen 1 und 365 Tagen liegen',
    'err.storage.write_busy': 'Ein anderer ZeppBridge-Schreibvorgang läuft noch. Bitte warten, bis er abgeschlossen ist',
    'err.storage.write_lock_unavailable':
      'Schreibsperre konnte nicht erstellt werden. Berechtigungen des Datenordners prüfen',
    'err.local_api.token_unavailable': 'Lokale API-Anmeldedaten konnten nicht gelesen werden',
    'err.local_api.token_rotate_failed': 'Lokale API-Anmeldedaten konnten nicht erneuert werden',
    'err.data_folder.open_failed': 'Datenordner konnte nicht geöffnet werden',
    'err.data_folder.unsupported_os': 'Das Öffnen des Datenordners wird nur unter Windows und macOS unterstützt',
    'err.update.localappdata_missing': 'Der Windows-Pfad LOCALAPPDATA ist nicht verfügbar',
    'err.update.launch_failed': 'Aktualisierte installierte Version konnte nicht gestartet werden',
    'err.update.installed_build_missing': 'Nach der Einrichtung wurde keine neue installierte ZeppBridge-Version gefunden',
    'err.update.portable_windows_only': 'Die Migration von der portablen zur installierten Version ist nur unter Windows möglich',
  },
);

/** 按错误码取当前界面语言的文案。没有这个码就返回 `undefined`。 */
export const errorTextFor = (code: string | null | undefined): string | undefined => {
  if (!code) return undefined;
  return (messagesOf(messages) as Record<string, string>)[code];
};
