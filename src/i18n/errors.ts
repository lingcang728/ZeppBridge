/**
 * 后端错误码 → 界面文案。
 *
 * 后端不按界面语言出文案：它只给一个稳定的 `err.*` 码和中文原文。这里按码取
 * 当前语言的说法，取不到才回落到那句中文。
 *
 * 上一版没有这一层，`toUserMessage` 把后端的中文字符串原样显示，于是英文界面
 * 上每一个后端错误都是中文——Reddit 上真实走通流程的用户就是被这个绊住的。
 *
 * 加后端错误码时这里必须同时补中英两份，`npm run i18n:check` 会挡住漏掉的
 * 那一半。码本身是契约，不要改名。
 */
import { defineMessages, messagesOf } from './index';

const messages = defineMessages(
  {
    /* —— core：从 ZeppBridgeError 抬上来的通用错误 —— */
    'err.core.network': '连不上 Zepp 区域，检查网络后重试',
    'err.core.needs_reauth': '认证已失效，重新连接 Zepp',
    'err.core.unavailable': '这个账号或区域没有这项数据',
    'err.core.retry_exhausted': 'Zepp 服务暂不可用，稍后重试',
    'err.core.http_status': 'Zepp 服务返回错误，稍后重试',
    // 传输层是成功的（HTTP 200），是报文自己写着不成功。在这之前这类响应会
    // 变成一句「数据无法解析」，用户既不知道该重新登录，也不知道该等。
    'err.core.cloud_rejected': 'Zepp 云端收到请求但拒绝了。反复出现的话，在设置里重新连接 Zepp 账号',
    'err.core.cancelled': '操作已取消',
    'err.core.auth': '认证出错了',
    // 无头环境（服务器、容器）才会撞上的三种。桌面上极少见到，但它们必须有
    // 自己的码：命令行没有 i18n 层，只有按码才出得了英文——issue #40 那位
    // Linux 用户就是在英文命令行上收到了它们的中文原文。
    'err.headless.no_credential_store':
      '这台机器上没有可用的系统密钥环（GNOME Keyring / KWallet）。无头服务器和容器通常没有。'
      + '可以设 ZEPPBRIDGE_CREDENTIAL_STORE=file 把令牌以 0600 写在数据目录里，'
      + '或者用 ZEPPBRIDGE_CREDENTIAL_STORE=env 配合 ZEPPBRIDGE_APP_TOKEN 交进来。',
    'err.headless.schema_upgrade':
      '本机数据库的版本比这个程序旧，而只读连接升不了级。启动一次桌面应用，'
      + '或者在无头环境跑一次 zeppbridge-cli reprocess——两条路都会在升级前自动备份。',
    'err.headless.token_not_in_store':
      '账号信息在，但凭据里没有对应的令牌。数据库能跨机器拷贝，令牌不能——'
      + '它在原来那台机器的凭据管理器里。重新登录一次。',
    'err.core.credential_store':
      '无法访问凭据存储。检查钥匙串是否锁定、系统策略、存储配置和文件权限。'
      + '网页登录和手填 Token 用同一个存储，换登录方式绕不过存储故障。'
      + 'macOS 钥匙串或 Linux 密钥环不可用时，可按 README 的凭据存储指南，'
      + '用 ZEPPBRIDGE_CREDENTIAL_STORE=file 启动应用，再重新登录；'
      + '此方式会将令牌明文保存到仅当前用户可读写的文件中。',
    'err.core.invalid_host': '不安全的 Zepp 区域地址',
    'err.core.config': '配置有问题，需要先改一下',
    'err.core.busy': '另一个写入操作正在进行，等它结束',
    'err.core.parse': 'Zepp 返回的数据无法解析',
    'err.core.database': '本地数据库暂不可用',
    'err.core.io': '读写本地文件失败',
    'err.core.unknown': '出了点问题',

    /* —— 连接与认证 —— */
    'err.auth.sync_init_failed': '无法初始化同步，检查认证区域后重试',
    'err.auth.verify_network': '认证验证失败：连不上 Zepp 服务，检查网络后重试',
    'err.auth.verify_needs_reauth': '认证验证失败：认证已失效，重新保存认证信息',
    'err.auth.verify_failed': '认证验证失败',

    /* —— 网页登录 —— */
    'err.login.waiting': '在弹出窗口完成 Zepp 登录',
    'err.login.fallback_page': '正在打开备用登录页',
    'err.login.extracting': '已读取登录凭据，正在确认区域',
    'err.login.verifying': '正在验证账号',
    'err.login.connected': '已连接 Zepp 账号',
    'err.official.browser': '没能打开系统浏览器，检查默认浏览器设置后重试',
    'err.official.denied': '你没有同意授权，ZeppBridge 什么也没拿到',
    'err.official.rejected': 'Zepp 没有接受这次授权，重试',
    'err.official.expired': '这次授权已过期，重新点一次授权',
    'err.official.timeout': '授权等待超时，重新点一次授权',
    'err.official.not_enabled': '官方授权服务尚未启用，稍后再试',
    'err.official.store': '官方授权成功了，但令牌没能存进系统凭据存储',
    'err.official.failed': '官方授权没有完成，稍后重试',
    'err.login.timeout': '登录超时，重试',
    'err.login.credentials_unreadable':
      '已经登录，但没能从登录窗口读到凭据。可以改用手动填写 App Token。',
    'err.login.region_probe_failed':
      '读到了凭据，但无法确认账号区域。重新登录，或改用手动填写 App Token。',
    'err.login.credentials_rejected': 'Zepp 拒绝了这次登录凭据，退出登录窗口后重新登录',
    'err.login.region_unreachable': '暂时连不上 Zepp 区域服务，检查网络后重试',
    'err.login.region_retrying': '暂时连不上 Zepp 区域服务，正在重试；登录窗口先留着，不用重新登录',
    'err.login.third_party_stalled':
      '第三方登录好像卡住了。Google 通行密钥在应用内窗口里经常停在验证那一步。可以关掉登录窗口改用邮箱+密码，或者在设置里手动填 App Token。',
    'err.login.bad_url': '登录地址无效',
    'err.login.window_failed': '无法打开登录窗口',
    'err.login.window_busy': '上一个登录窗口还没关完，稍等一下再试',
    'err.login.state_unavailable': '应用状态不可用',
    'err.login.cancelled': '登录已取消',
    'err.login.sync_init_failed': '登录成功了，但同步初始化失败',

    /* —— 同步与补拉 —— */
    'err.sync.not_connected': '尚未连接 Zepp，先完成连接',
    'err.sync.not_verified': '先完成连接验证，再同步最近数据',
    'err.sync.not_verified_probe': '先完成连接验证，再探测数据能力',
    'err.sync.not_verified_backfill': '先完成连接验证，再补拉历史',
    'err.sync.history_days_out_of_range': '同步天数超出允许范围',
    'err.sync.deferred_compaction': '正在压缩历史报文省磁盘空间，本次云端同步稍后自动重试',
    'err.sync.deferred_replay': '正在用本地原始报文重建派生数据，本次云端同步稍后自动重试',
    'err.sync.deferred_busy': '另一个写入操作正在进行，本次云端同步稍后自动重试',
    'err.backfill.bad_start_date': '补拉起点日期无效，需要 YYYY-MM-DD',
    'err.backfill.no_canonical_records': '云端返回了报文，但没解析出可用记录',
    'err.backfill.partial_window': '这一块只写入部分数据，还需要重试',
    'err.backfill.start_in_future': '补拉起点不能晚于今天',
    'err.backup.restore_busy': '恢复还没执行：另一个写入操作正在进行。当前库没改动，下次启动再试。',
    'err.backup.restore_failed': '恢复没完成，当前库保持原样，下次启动再试。',

    /* —— 能力状态 —— */
    'err.capability.not_synced': '尚未同步',
    'err.capability.needs_reauth': '需要重新认证',
    'err.capability.unverified': '能力尚未验证',
    'err.capability.unavailable': '能力不可用',
    'err.capability.unknown': '能力状态未知',
    'err.capability.other': '能力状态未知',

    /* —— 导出 —— */
    'err.export.empty_range': '这段时间没有可导出的记录',
    'err.export.convert_failed': '转换导出格式失败',
    'err.export.write_failed': '写入导出文件失败',
    'err.export.path_required': '先选择保存位置',
    'err.export.path_not_absolute': '保存位置必须是绝对路径',
    'err.export.not_a_directory': 'FIT 导出需要一个目录，这里选中的是文件',

    /* —— 交给 AI —— */
    'err.handoff.prompt_required': '先填提示词',
    'err.handoff.empty_range': '这段时间没有可交接的记录',
    'err.handoff.mkdir_failed': '创建数据包导出目录失败',
    'err.handoff.write_failed': '写入脱敏 AI 数据失败',
    'err.handoff.encode_failed': '编码脱敏 AI 导出失败',

    /* —— 问题反馈 —— */
    'err.diagnostic.nothing_to_submit': '这台设备没有可补充目录的型号编号，暂时不用提交',
    'err.diagnostic.empty_report':
      '先选要反馈的问题类型，或写一句说明——否则这份报告里没有任何可处理的内容',
    'err.diagnostic.client_init_failed': '无法初始化错误报告连接',
    'err.diagnostic.send_failed': '错误报告发送失败，检查网络后重试',
    'err.diagnostic.http_error': '错误报告服务返回错误',
    'err.diagnostic.rate_limited':
      '短时间内提交了太多份报告，过一会儿再试。已交过的不会丢，也不用重复提交。',
    'err.diagnostic.bad_response': '错误报告服务返回了无法识别的结果',

    /* —— 其它 —— */
    'err.workout.not_found': '运动记录不存在',
    'err.prefs.retention_out_of_range': '保留天数必须在 1 到 365 天之间',
    'err.storage.write_busy': '另一个 ZeppBridge 写入操作正在进行，等它结束',
    'err.storage.write_lock_unavailable': '无法建立写入锁，检查数据文件夹的权限',
    'err.storage.worker_failed': '后台数据库任务被中断',
    'err.local_api.token_unavailable': '无法读取本机 API 凭据',
    'err.local_api.token_rotate_failed': '无法重新生成本机 API 凭据',
    'err.local_api.port_in_use': '本机 API 端口已被其他程序占用',
    'err.local_api.bind_failed': '无法启动本机 API',
    'err.local_api.thread_failed': '无法启动本机 API 线程',
    'err.local_api.state_write_failed': '无法保存本机 API 开关状态',
    'err.data_folder.open_failed': '打开数据文件夹失败',
    'err.data_folder.unsupported_os': '打开数据文件夹仅支持 Windows/macOS',
    'err.update.localappdata_missing': 'Windows LOCALAPPDATA 路径不可用',
    'err.update.launch_failed': '无法启动更新后的安装版',
    'err.update.installed_build_missing': '安装完成后未找到新的 ZeppBridge 安装版',
    'err.update.portable_windows_only': '便携版安装迁移仅支持 Windows',
    'err.update.unsafe_data_location': '无法确认数据目录在更新后保留，已停止安装。退出 ZeppBridge，把 app 包内的 data 完整复制到用户的 Application Support 目录，修正 ZEPPBRIDGE_DATA_DIR 后重试。不要删除旧数据。',
    /* —— ai_tasks（P3 命令与附件/授权） —— */
    'err.ai_task.invalid': '任务内容不符合要求，检查输入',
    'err.ai_task.not_found': '分析任务不存在或已删除',
    'err.ai_task.workout_not_found': '选中的运动在本机不存在',
    'err.ai_task.write_failed': '交接文件写入失败',
    'err.ai_task.attachment_missing': '附件文件已不在原位置',
    'err.ai_template.invalid': '模板内容不符合要求，检查输入',
    'err.ai_template.not_found': '模板不存在或已删除',
    'err.ai_template.builtin_readonly': '内置模板只读，另存为用户模板',

    /* —— MCP 访问范围（stdio 工具的调用方是模型；这两份是给人看的兜底） —— */
    'err.mcp.scope_denied': '这条查询超出了开放给 MCP 的任务范围',
    'err.mcp.scope_no_grants': '还没有任务开放给 MCP。在任务页把任务标为「开放给 MCP」后再试',
  },
  {
    /* —— core —— */
    'err.core.network': "Could not reach the Zepp region — check your network and retry",
    'err.core.needs_reauth': 'Sign-in expired — reconnect to Zepp',
    'err.core.unavailable': "This account or region does not provide that data",
    'err.core.retry_exhausted': 'Zepp temporarily unavailable — retry shortly',
    'err.core.http_status': 'Zepp returned an error — retry shortly',
    'err.core.cloud_rejected':
      'Zepp received the request but refused it. If it keeps happening, reconnect the Zepp account in Settings',
    'err.core.cancelled': 'Cancelled',
    'err.core.auth': 'Authentication error',
    'err.headless.no_credential_store':
      'No system credential store on this machine (GNOME Keyring / KWallet) — headless servers and containers usually have none. '
      + 'Set ZEPPBRIDGE_CREDENTIAL_STORE=file to write the token 0600 into the data directory, '
      + 'or ZEPPBRIDGE_CREDENTIAL_STORE=env with ZEPPBRIDGE_APP_TOKEN.',
    'err.headless.schema_upgrade':
      'The local database is older than this build, and a read-only connection cannot upgrade it. '
      + 'Launch the desktop app once, or run zeppbridge-cli reprocess on the headless machine — '
      + 'both back up before upgrading.',
    'err.headless.token_not_in_store':
      "Account details are here, but the credential store has no token for them. "
      + "A database copies between machines; a token does not — it lives in the original "
      + "machine's credential store. Sign in again.",
    'err.core.credential_store':
      'Could not access the credential store. Check it is unlocked, allowed by system policy, '
      + 'correctly configured and has the right file permissions. Web sign-in and manual entry '
      + 'use the same store — switching methods cannot bypass a storage failure. '
      + 'If macOS Keychain or the Linux keyring is unavailable, follow the credential storage guide '
      + 'in the README: launch with ZEPPBRIDGE_CREDENTIAL_STORE=file, then sign in again. '
      + 'This saves the token as plaintext readable only by your user.',
    'err.core.invalid_host': 'Unsafe Zepp region address',
    'err.core.config': 'Configuration needs fixing first',
    'err.core.busy': 'Another write is in progress — wait for it to finish',
    'err.core.parse': "Could not parse Zepp's response",
    'err.core.database': 'Local database temporarily unavailable',
    'err.core.io': 'Local file read/write failed',
    'err.core.unknown': 'Something went wrong',

    /* —— connect & auth —— */
    'err.auth.sync_init_failed': "Could not init sync — check the account region and retry",
    'err.auth.verify_network':
      "Verification failed: could not reach Zepp — check your network and retry",
    'err.auth.verify_needs_reauth':
      'Verification failed: credentials expired — save them again',
    'err.auth.verify_failed': 'Verification failed',

    /* —— web login —— */
    'err.login.waiting': 'Finish signing in to Zepp in the pop-up window',
    'err.login.fallback_page': 'Opening the alternate sign-in page',
    'err.login.extracting': 'Credentials read. Confirming your region',
    'err.login.verifying': 'Verifying the account',
    'err.login.connected': 'Connected to your Zepp account',
    'err.official.browser': "Could not open the system browser — check your default browser and retry.",
    'err.official.denied': 'You did not grant access — ZeppBridge received nothing.',
    'err.official.rejected': 'Zepp did not accept this authorization — retry.',
    'err.official.expired': 'This authorization expired — start it again.',
    'err.official.timeout': 'Authorization timed out — start it again.',
    'err.official.not_enabled': 'Zepp authorization service not enabled yet — try again later.',
    'err.official.store': 'Authorized, but the token could not be saved to the system credential store.',
    'err.official.failed': 'Zepp authorization did not complete — try again later.',
    'err.login.timeout': 'Sign-in timed out. Try again',
    'err.login.credentials_unreadable':
      "Signed in, but credentials could not be read from the sign-in window. Enter an App Token manually instead.",
    'err.login.region_probe_failed':
      "Credentials read, but the account region could not be confirmed. Sign in again, or enter an App Token manually.",
    'err.login.credentials_rejected':
      'Zepp rejected these credentials. Sign out in the login window, then sign in again',
    'err.login.region_unreachable':
      "Could not reach the Zepp region service — check your network and retry",
    'err.login.region_retrying':
      "Cannot reach the Zepp region service — retrying. The sign-in window stays open; no need to sign in again",
    'err.login.third_party_stalled':
      'Third-party sign-in looks stuck — Google passkeys often stall at verification inside an in-app window. Close the sign-in window and use email + password, or enter an App Token manually in Settings.',
    'err.login.bad_url': 'Invalid sign-in address',
    'err.login.window_failed': "Could not open sign-in window",
    'err.login.window_busy':
      'The previous sign-in window is still closing — wait a moment and retry',
    'err.login.state_unavailable': 'App state unavailable',
    'err.login.cancelled': 'Sign-in cancelled',
    'err.login.sync_init_failed': "Signed in, but sync could not be initialized",

    /* —— sync & backfill —— */
    'err.sync.not_connected': 'Not connected to Zepp yet — connect first',
    'err.sync.not_verified': 'Verify the connection before syncing recent data',
    'err.sync.not_verified_probe': 'Verify the connection before probing capabilities',
    'err.sync.not_verified_backfill': 'Verify the connection before backfilling history',
    'err.sync.history_days_out_of_range': 'Sync days outside the allowed range',
    'err.sync.deferred_compaction':
      'Compacting stored payloads to save disk space — this sync retries automatically',
    'err.sync.deferred_replay':
      'Rebuilding derived data from local payloads — this sync retries automatically',
    'err.sync.deferred_busy':
      'Another write is in progress — this sync retries automatically',
    'err.backfill.bad_start_date': 'Invalid backfill start date — needs YYYY-MM-DD',
    'err.backfill.no_canonical_records':
      'The cloud returned a payload, but no usable records were parsed',
    'err.backfill.partial_window':
      'Only part of this window was written — a retry is still needed',
    'err.backfill.start_in_future': 'Backfill start cannot be later than today',
    'err.backup.restore_busy':
      'Restore did not run — another write is in progress. Current library unchanged; retried at next launch',
    'err.backup.restore_failed':
      'Restore did not finish. Current library unchanged; retried at next launch',

    /* —— capabilities —— */
    'err.capability.not_synced': 'Not synced yet',
    'err.capability.needs_reauth': 'Needs re-authentication',
    'err.capability.unverified': 'Not verified yet',
    'err.capability.unavailable': 'Unavailable',
    'err.capability.unknown': 'Status unknown',
    'err.capability.other': 'Status unknown',

    /* —— export —— */
    'err.export.empty_range': 'No records in this range to export',
    'err.export.convert_failed': "Could not convert to the requested format",
    'err.export.write_failed': "Could not write the export file",
    'err.export.path_required': 'Pick a save location first',
    'err.export.path_not_absolute': 'Save location must be an absolute path',
    'err.export.not_a_directory':
      'FIT export needs a folder — the selected path is a file',

    /* —— hand to AI —— */
    'err.handoff.prompt_required': 'Write a prompt first',
    'err.handoff.empty_range': 'No records in this range to hand off',
    'err.handoff.mkdir_failed': "Could not create the export folder",
    'err.handoff.write_failed': "Could not write the de-identified AI data",
    'err.handoff.encode_failed': "Could not encode the de-identified AI export",

    /* —— feedback —— */
    'err.diagnostic.nothing_to_submit':
      "This device has no model number that would help the catalog — nothing to submit",
    'err.diagnostic.empty_report':
      "Pick a problem type or write a note first — otherwise the report has nothing actionable",
    'err.diagnostic.client_init_failed': "Could not initialize the report connection",
    'err.diagnostic.send_failed': "Could not send the report — check your network and retry",
    'err.diagnostic.http_error': 'The report service returned an error',
    'err.diagnostic.rate_limited':
      'Too many reports in a short time — retry later. Ones already sent are kept; no need to resend.',
    'err.diagnostic.bad_response': 'The report service returned an unreadable response',

    /* —— misc —— */
    'err.workout.not_found': 'Workout record does not exist',
    'err.prefs.retention_out_of_range': 'Retention must be between 1 and 365 days',
    'err.storage.write_busy': 'Another ZeppBridge write is in progress — wait for it to finish',
    'err.storage.write_lock_unavailable':
      "Could not create the write lock — check data folder permissions",
    'err.storage.worker_failed': 'Background database task was interrupted',
    'err.local_api.token_unavailable': "Could not read the local API credential",
    'err.local_api.token_rotate_failed': "Could not regenerate the local API credential",
    'err.local_api.port_in_use': 'Local API port already in use by another program',
    'err.local_api.bind_failed': "Could not start the local API",
    'err.local_api.thread_failed': "Could not start the local API thread",
    'err.local_api.state_write_failed': "Could not save the local API on/off state",
    'err.data_folder.open_failed': "Could not open the data folder",
    'err.data_folder.unsupported_os': 'Opening the data folder supports Windows/macOS only',
    'err.update.localappdata_missing': 'Windows LOCALAPPDATA path unavailable',
    'err.update.launch_failed': "Could not launch the updated installed build",
    'err.update.installed_build_missing': 'No new installed ZeppBridge build found after setup',
    'err.update.portable_windows_only': 'Portable-to-installed migration is Windows only',
    'err.update.unsafe_data_location': 'Installation stopped — the data location could not be verified as safe after update. Quit ZeppBridge, copy any in-bundle data folder to your user Application Support folder, fix ZEPPBRIDGE_DATA_DIR, and retry. Do not delete the old data.',
    /* —— ai_tasks (P3 commands & attachment/grant errors) —— */
    'err.ai_task.invalid': "Task input invalid — check the fields",
    'err.ai_task.not_found': "Analysis task does not exist or was deleted",
    'err.ai_task.workout_not_found': "The selected workout does not exist locally",
    'err.ai_task.write_failed': "Could not write handoff files",
    'err.ai_task.attachment_missing': 'Attachment file no longer at its original location',
    'err.ai_template.invalid': "Template input invalid — check the fields",
    'err.ai_template.not_found': "Template does not exist or was deleted",
    'err.ai_template.builtin_readonly': 'Built-in templates are read-only — save as a user template',

    /* —— MCP access scope (the caller is a model; these are the human fallback) —— */
    'err.mcp.scope_denied': 'That request is outside the tasks shared with MCP',
    'err.mcp.scope_no_grants': 'No task is open to MCP yet — mark a task "open to MCP" on its page and retry',
  },
  {
    /* —— core —— */
    'err.core.network': 'No se pudo conectar con la región de Zepp: revisa tu red y reintenta',
    'err.core.needs_reauth': 'Sesión caducada: reconéctate a Zepp',
    'err.core.unavailable': 'Esta cuenta o región no ofrece estos datos',
    'err.core.retry_exhausted': 'Servicio de Zepp no disponible temporalmente; reintenta más tarde',
    'err.core.http_status': 'El servicio de Zepp devolvió un error; reintenta más tarde',
    'err.core.cloud_rejected':
      'La nube de Zepp rechazó la solicitud. Si persiste, reconecta tu cuenta en Configuración',
    'err.core.cancelled': 'Operación cancelada',
    'err.core.auth': 'Error de autenticación',
    'err.headless.no_credential_store':
      'Este equipo no tiene almacén de credenciales del sistema (GNOME Keyring / KWallet). '
      + 'Los servidores sin interfaz y contenedores usualmente no lo tienen. Define '
      + 'ZEPPBRIDGE_CREDENTIAL_STORE=file para guardar el token con permisos 0600 en la carpeta de datos, '
      + 'o ZEPPBRIDGE_CREDENTIAL_STORE=env junto con ZEPPBRIDGE_APP_TOKEN.',
    'err.headless.schema_upgrade':
      'La base de datos local es más antigua que esta versión, y una conexión de solo lectura no '
      + 'puede actualizarla. Abre la app de escritorio una vez o ejecuta zeppbridge-cli reprocess en un '
      + 'equipo sin interfaz. Ambas opciones realizan una copia de seguridad antes de actualizar.',
    'err.headless.token_not_in_store':
      'Los datos de la cuenta están presentes, pero el almacén no tiene su token. La '
      + 'base de datos puede copiarse entre equipos; el token no: reside en el almacén de credenciales '
      + 'del equipo original. Inicia sesión de nuevo.',
    'err.core.credential_store':
      'No se pudo acceder al almacén de credenciales. Revisa si está bloqueado, restringido por políticas del sistema, '
      + 'mal configurado o con permisos erróneos. El inicio de sesión web y el ingreso manual '
      + 'usan el mismo almacén, por lo que cambiar el método no soluciona la falla. '
      + 'Si el Llavero de macOS o el llavero de Linux no están disponibles, consulta la guía en el README: '
      + 'inicia la app con ZEPPBRIDGE_CREDENTIAL_STORE=file y vuelve a iniciar sesión; '
      + 'así los tokens se guardan en texto plano accesible solo por tu usuario.',
    'err.core.invalid_host': 'Dirección de región de Zepp no segura',
    'err.core.config': 'Configuración con problemas; corrígela primero',
    'err.core.busy': 'Otra escritura en curso; espera a que termine',
    'err.core.parse': 'Respuesta de Zepp no interpretable',
    'err.core.database': 'Base de datos local no disponible temporalmente',
    'err.core.io': 'Error al leer o escribir un archivo local',
    'err.core.unknown': 'Ocurrió un problema',

    /* —— connect & auth —— */
    'err.auth.sync_init_failed': 'No se pudo inicializar la sincronización: revisa tu región y reintenta',
    'err.auth.verify_network':
      'Fallo de verificación: sin conexión con Zepp. Revisa tu red y reintenta',
    'err.auth.verify_needs_reauth':
      'Fallo de verificación: credenciales caducadas. Vuelve a guardarlas',
    'err.auth.verify_failed': 'Fallo de verificación',

    /* —— web login —— */
    'err.login.waiting': 'Completa el inicio de sesión en Zepp en la ventana emergente',
    'err.login.fallback_page': 'Abriendo página de inicio de sesión alternativa',
    'err.login.extracting': 'Credenciales leídas; confirmando región',
    'err.login.verifying': 'Verificando cuenta',
    'err.login.connected': 'Conectado a tu cuenta de Zepp',
    'err.official.browser': 'No se pudo abrir el navegador. Revisa el navegador predeterminado y reintenta.',
    'err.official.denied': 'Acceso no concedido: ZeppBridge no recibió datos.',
    'err.official.rejected': 'Zepp rechazó la autorización; reintenta.',
    'err.official.expired': 'Autorización caducada: iníciala de nuevo.',
    'err.official.timeout': 'Autorización agotó el tiempo: iníciala de nuevo.',
    'err.official.not_enabled': 'Servicio de autorización de Zepp no disponible aún; reintenta más tarde.',
    'err.official.store': 'Autorizado, pero no se pudo guardar el token en el almacén de credenciales.',
    'err.official.failed': 'La autorización de Zepp no se completó; reintenta más tarde.',
    'err.login.timeout': 'Inicio de sesión agotó el tiempo; reintenta',
    'err.login.credentials_unreadable':
      'Sesión iniciada, pero no se pudieron leer las credenciales. Ingresa un App Token manualmente.',
    'err.login.region_probe_failed':
      'Credenciales leídas, pero no se pudo confirmar la región. Inicia sesión de nuevo o ingresa un App Token.',
    'err.login.credentials_rejected':
      'Zepp rechazó estas credenciales. Cierra sesión en la ventana y vuelve a iniciarla',
    'err.login.region_unreachable':
      'Sin conexión con el servicio de regiones de Zepp: revisa tu red y reintenta',
    'err.login.region_retrying':
      'Sin conexión con el servicio de regiones de Zepp; reintentando. La ventana sigue abierta, no es necesario reiniciar sesión',
    'err.login.third_party_stalled':
      'Inicio de sesión externo atascado: las llaves de paso de Google suelen bloquearse en ventanas embebidas. Cierra la ventana y usa correo + contraseña, o ingresa un App Token en Configuración.',
    'err.login.bad_url': 'Dirección de inicio de sesión no válida',
    'err.login.window_failed': 'No se pudo abrir la ventana de inicio de sesión',
    'err.login.window_busy':
      'La ventana de inicio de sesión previa aún se está cerrando: espera un momento y reintenta',
    'err.login.state_unavailable': 'Estado de la app no disponible',
    'err.login.cancelled': 'Inicio de sesión cancelado',
    'err.login.sync_init_failed': 'Sesión iniciada, pero no se pudo inicializar la sincronización',

    /* —— sync & backfill —— */
    'err.sync.not_connected': 'Aún no estás conectado a Zepp: conéctate primero',
    'err.sync.not_verified': 'Verifica la conexión antes de sincronizar datos recientes',
    'err.sync.not_verified_probe': 'Verifica la conexión antes de sondear capacidades',
    'err.sync.not_verified_backfill': 'Verifica la conexión antes de recuperar el historial',
    'err.sync.history_days_out_of_range': 'Días de sincronización fuera del rango permitido',
    'err.sync.deferred_compaction':
      'Compactando registros para ahorrar espacio; esta sincronización se reintentará automáticamente',
    'err.sync.deferred_replay':
      'Reconstruyendo datos derivados desde registros locales; esta sincronización se reintentará automáticamente',
    'err.sync.deferred_busy':
      'Otra escritura en curso; esta sincronización se reintentará automáticamente',
    'err.backfill.bad_start_date': 'Fecha de inicio de historial no válida: usa AAAA-MM-DD',
    'err.backfill.no_canonical_records':
      'La nube devolvió datos, pero no se hallaron registros utilizables',
    'err.backfill.partial_window':
      'Solo se guardó parte de este intervalo; requiere reintento',
    'err.backfill.start_in_future': 'La fecha de inicio no puede ser posterior a hoy',
    'err.backup.restore_busy':
      'Restauración pospuesta: otra escritura en curso. Base intacta; se reintentará al iniciar',
    'err.backup.restore_failed':
      'Restauración incompleta. Base intacta; se reintentará al iniciar',

    /* —— capabilities —— */
    'err.capability.not_synced': 'Aún sin sincronizar',
    'err.capability.needs_reauth': 'Requiere reautenticación',
    'err.capability.unverified': 'Aún sin verificar',
    'err.capability.unavailable': 'No disponible',
    'err.capability.unknown': 'Estado desconocido',
    'err.capability.other': 'Estado desconocido',

    /* —— export —— */
    'err.export.empty_range': 'Sin registros para exportar en este rango',
    'err.export.convert_failed': 'Error al convertir al formato solicitado',
    'err.export.write_failed': 'Error al escribir el archivo de exportación',
    'err.export.path_required': 'Elige una ruta para guardar el archivo',
    'err.export.path_not_absolute': 'La ruta de guardado debe ser absoluta',
    'err.export.not_a_directory':
      'La exportación FIT requiere una carpeta, no un archivo',

    /* —— hand to AI —— */
    'err.handoff.prompt_required': 'Escribe una instrucción primero',
    'err.handoff.empty_range': 'Sin registros en este rango para pasar a la IA',
    'err.handoff.mkdir_failed': 'No se pudo crear la carpeta para pasar a la IA',
    'err.handoff.write_failed': 'Error al guardar los datos anonimizados para la IA',
    'err.handoff.encode_failed': 'Error al codificar la exportación anonimizada para la IA',

    /* —— feedback —— */
    'err.diagnostic.nothing_to_submit':
      'Este dispositivo no tiene modelo reconocible; nada que enviar',
    'err.diagnostic.empty_report':
      'Elige un tipo de problema o describe brevemente qué ocurrió',
    'err.diagnostic.client_init_failed': 'No se pudo iniciar la conexión de diagnóstico',
    'err.diagnostic.send_failed': 'Error al enviar diagnóstico: revisa tu red y reintenta',
    'err.diagnostic.http_error': 'El servicio de diagnóstico devolvió un error',
    'err.diagnostic.rate_limited':
      'Demasiados reportes en poco tiempo; reintenta más tarde',
    'err.diagnostic.bad_response': 'Respuesta ininteligible del servicio de diagnóstico',

    /* —— misc —— */
    'err.workout.not_found': 'El entrenamiento ya no existe',
    'err.prefs.retention_out_of_range': 'La retención debe estar entre 1 y 365 días',
    'err.storage.write_busy': 'Otra escritura de ZeppBridge en curso; espera a que termine',
    'err.storage.write_lock_unavailable':
      'No se pudo bloquear para escritura: revisa los permisos de la carpeta de datos',
    'err.storage.worker_failed': 'La tarea de base de datos en segundo plano falló',
    'err.local_api.token_unavailable': 'No se pudo leer el token de la API local',
    'err.local_api.token_rotate_failed': 'No se pudo regenerar el token de la API local',
    'err.local_api.port_in_use': 'El puerto de la API local está ocupado por otra app',
    'err.local_api.bind_failed': 'No se pudo iniciar la API local',
    'err.local_api.thread_failed': 'No se pudo iniciar el hilo de la API local',
    'err.local_api.state_write_failed': 'No se pudo guardar el estado de la API local',
    'err.data_folder.open_failed': 'No se pudo abrir la carpeta de datos',
    'err.data_folder.unsupported_os': 'Abrir la carpeta de datos solo funciona en Windows y macOS',
    'err.update.localappdata_missing': 'Ruta LOCALAPPDATA de Windows no disponible',
    'err.update.launch_failed': 'No se pudo iniciar la versión actualizada',
    'err.update.installed_build_missing': 'No se encontró la nueva versión instalada de ZeppBridge tras la instalación',
    'err.update.portable_windows_only': 'La migración de versión portable a instalador solo existe en Windows',
    'err.update.unsafe_data_location': 'Instalación detenida: no se pudo confirmar que los datos se conserven al actualizar. Cierra ZeppBridge, copia la carpeta data a Application Support de tu usuario y corrige ZEPPBRIDGE_DATA_DIR antes de reintentar.',
    /* —— ai_tasks (comandos P3 y adjuntos/concesiones) —— */
    'err.ai_task.invalid': 'Entrada de tarea no válida: revisa los campos',
    'err.ai_task.not_found': 'La tarea no existe o fue eliminada',
    'err.ai_task.workout_not_found': 'El entrenamiento seleccionado no existe localmente',
    'err.ai_task.write_failed': 'Error al escribir los archivos de entrega',
    'err.ai_task.attachment_missing': 'El archivo adjunto ya no está en su ubicación original',
    'err.ai_template.invalid': 'Plantilla no válida: revisa los campos',
    'err.ai_template.not_found': 'La plantilla no existe o fue eliminada',
    'err.ai_template.builtin_readonly': 'Las plantillas integradas son de solo lectura: guárdala como plantilla propia',

    /* —— MCP access scope —— */
    'err.mcp.scope_denied': 'Solicitud fuera de las tareas compartidas con MCP',
    'err.mcp.scope_no_grants': 'Ninguna tarea compartida con MCP todavía: habilita una en su página y reintenta',
  },
  // 七种新语言的错误文案不往这里塞：语言包 `errors:` 节（即
  // modules['i18n/errors']）按码覆盖，缺的码回落英文、再回落中文原文。
  'i18n/errors',
);

/** 按错误码取当前界面语言的文案。没有这个码就返回 `undefined`。 */
export const errorTextFor = (code: string | null | undefined): string | undefined => {
  if (!code) return undefined;
  return (messagesOf(messages) as Record<string, string>)[code];
};
