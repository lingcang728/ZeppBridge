//! 退出码契约：错误到退出码与错误类型的映射、数据目录定位与提示（从 main.rs 拆出，逻辑不变）。

use super::*;

/// 把 core 的错误映射到退出码。
///
/// 分类是为了让调度脚本能写出「busy 就等五分钟重试，云端失败就退避，
/// 数据库错误就报警」这种逻辑，而不是对着同一个 1 猜。
pub(super) fn exit_code_for(error: &ZeppBridgeError) -> (u8, &'static str) {
    match error {
        ZeppBridgeError::AuthError(_) | ZeppBridgeError::NeedsReauth(_) => {
            (EXIT_NOT_CONFIGURED, "auth")
        }
        ZeppBridgeError::NetworkError(_)
        | ZeppBridgeError::RetryExhausted { .. }
        | ZeppBridgeError::HttpStatus { .. }
        | ZeppBridgeError::Unavailable(_)
        | ZeppBridgeError::TimedOut(_) => (EXIT_CLOUD, "cloud"),
        ZeppBridgeError::DataUnavailable(_) => (EXIT_FAILED, "data_unavailable"),
        ZeppBridgeError::Busy(_) => (EXIT_BUSY, "busy"),
        ZeppBridgeError::DatabaseError(_) => (EXIT_DATABASE, "database"),
        ZeppBridgeError::ConfigError(_) | ZeppBridgeError::InvalidHost(_) => (EXIT_USAGE, "usage"),
        // 库要先升级和「拿不到令牌」是两码事：前者重试没用、要先跑一次
        // reprocess（调度脚本按这个码决定别再试了），后者要人把凭据给进来。
        ZeppBridgeError::Headless(HeadlessProblem::SchemaUpgradeRequired { .. }) => {
            (EXIT_SCHEMA, "schema")
        }
        ZeppBridgeError::Headless(_) => (EXIT_NOT_CONFIGURED, "auth"),
        // 库属于另一个账号：重试没用，要人换数据目录或换回原账号。
        ZeppBridgeError::AccountMismatch => (EXIT_NOT_CONFIGURED, "account_mismatch"),
        _ => (EXIT_FAILED, "failed"),
    }
}

/// 这条错误给命令行用户看的那句话。
///
/// `user_message()` 是中文——桌面端按错误码取本地化文案，所以那边一直
/// 没问题；命令行没有 i18n 层，直接印它就是给英文用户一句中文。issue #40 那位
/// Linux 用户正是这么收到「无法读取系统密钥环…」和「本机数据库还是 v19…」的。
///
/// 所以在这里按变体逐一出英文。带自由文本的那几种（配置、认证、数据不可用……），
/// 原话是 core 七百多处拼出来的中文，没法逐句翻：英文那句说清是哪一类问题，
/// 原话是 ASCII 就接在后面，是中文就换成稳定的错误码——同一句里中英混排比
/// 全中文更难读（见 main.rs 顶上的说明），而错误码在文档和反馈里搜得到。
///
/// match 不留 `_`：core 加了新变体，这里编译不过，逼着补一句英文。
/// 带原话的分支一律先过 core 的脱敏（去地址、限长），不能把带请求地址的
/// Display 原样写到 stdout / stderr。
pub(super) fn user_text(error: &ZeppBridgeError) -> String {
    let code = error.code();
    match error {
        ZeppBridgeError::Headless(problem) => problem.english(),
        ZeppBridgeError::AccountMismatch => "This database already holds another Zepp account's             data, so nothing was written for this account. To switch accounts, move or rename             the data folder, then connect again."
            .to_string(),
        ZeppBridgeError::TimedOut(_) => {
            "This sync ran out of time; the remaining streams will continue next time.".to_string()
        }
        ZeppBridgeError::NetworkError(_) => {
            "Could not reach the Zepp region service. Check the network and try again.".to_string()
        }
        ZeppBridgeError::NeedsReauth(_) => "The saved Zepp sign-in is no longer valid. Reconnect             the account in the desktop app, or supply a fresh ZEPPBRIDGE_APP_TOKEN, then try again."
            .to_string(),
        ZeppBridgeError::RetryExhausted { status, .. } => {
            format!("The Zepp service is temporarily unavailable (HTTP {status}). Try again later.")
        }
        ZeppBridgeError::HttpStatus { status, .. } => {
            format!("The Zepp service returned HTTP {status}. Try again later.")
        }
        ZeppBridgeError::CloudRejected {
            code: cloud_code,
            message,
        } => with_detail(
            &format!(
                "Zepp's cloud rejected the request (cloud code {cloud_code}); if this keeps                  happening, reconnect the Zepp account in the desktop app"
            ),
            message,
            code,
        ),
        ZeppBridgeError::Cancelled => "The sync was cancelled.".to_string(),
        ZeppBridgeError::ParseError(_) => "The data Zepp returned could not be parsed.".to_string(),
        ZeppBridgeError::DatabaseError(_) => {
            "The local database is temporarily unavailable.".to_string()
        }
        ZeppBridgeError::IoError(_) => "Reading or writing a local file failed.".to_string(),
        ZeppBridgeError::Busy(_) => "Another ZeppBridge process is writing to this library.             Try again in a moment."
            .to_string(),
        ZeppBridgeError::AuthError(message) => with_detail("Authentication failed", message, code),
        ZeppBridgeError::CredentialStore(message) => with_detail(
            "The system credential store refused to read or write the token",
            message,
            code,
        ),
        ZeppBridgeError::InvalidHost(message) => {
            with_detail("The Zepp region host is not allowed", message, code)
        }
        ZeppBridgeError::ConfigError(message) => {
            with_detail("Configuration problem", message, code)
        }
        ZeppBridgeError::Unavailable(message) | ZeppBridgeError::DataUnavailable(message) => {
            with_detail(
                "Not available: this library or account does not provide the requested data",
                message,
                code,
            )
        }
        ZeppBridgeError::TrainingPlan { message, .. } => {
            with_detail("The training-plan action failed", message, code)
        }
        ZeppBridgeError::AiTask(inner) => with_detail(
            "The AI task could not be completed",
            &inner.user_message(),
            code,
        ),
        ZeppBridgeError::Unknown(message) => with_detail("Unexpected error", message, code),
    }
}

/// 英文的那一句，加上脱敏后的原话（ASCII 时）或错误码（原话是中文时）。
fn with_detail(lead: &str, detail: &str, code: &str) -> String {
    // core 的脱敏把地址换成中文的「[已隐藏地址]」；命令行换成英文，免得一句
    // 英文原话因为这个占位符被当成中文丢掉。
    let detail = sanitize_user_text(detail).replace("[已隐藏地址]", "[address hidden]");
    if detail.is_empty() {
        format!("{lead}.")
    } else if detail.chars().any(is_cjk) {
        format!("{lead} ({code}).")
    } else {
        format!("{lead}: {detail}")
    }
}

/// CJK 统一表意文字、标点和全角形式：出现任何一个就当这句是中文。
pub(super) fn is_cjk(character: char) -> bool {
    matches!(character, '　'..='〿' | '㐀'..='鿿' | '豈'..='﫿' | '＀'..='￯')
}

/// `ExportScope::validated()` 活在 core 里，给 GUI 用，按现有约定回中文——
/// 界面按 `code()` 取本地化文案，中文原文只是取不到时的兜底（参见它自己的
/// 文档注释）。但 CLI 没有那层，直接把它塞进 usage 错误里，就会在这份英文
/// 命令行输出里冒出中文，和 `user_text()` 顶上要解决的是同一个问题。
///
/// 消息集合比 `ZeppBridgeError` 的变体小得多，这里直接按原文匹配；认不出
/// 的（原文改了、或者以后新增了分支）是中文就换成一句笼统的英文，否则原样透传；
/// 不瞎猜，不递归。测试直接拿 core 的 `validated()` 造这五种错误，原文一改就会挂。
pub(super) fn translate_export_scope_error(message: String) -> String {
    match message.as_str() {
        "导出开始日期无效" => "Invalid export start date",
        "导出结束日期无效" => "Invalid export end date",
        "导出结束日期不能早于开始日期" => {
            "Export end date cannot be before the start date"
        }
        "单次导出范围不能超过 366 天" => {
            "A single export cannot span more than 366 days"
        }
        "workout id 不能为空" => "Workout id cannot be empty",
        // 原文改了或新增了分支：不瞎猜具体是哪条，但也不把中文印出去。
        _ if message.chars().any(is_cjk) => "Invalid export range or workout id",
        _ => return message,
    }
    .to_string()
}

/// 退出码对应的机器可读错误类型，供 `--json` 输出使用。
pub(super) fn error_kind_for(code: u8) -> &'static str {
    match code {
        EXIT_NOT_CONFIGURED => "not_configured",
        EXIT_BUSY => "busy",
        EXIT_CLOUD => "cloud",
        EXIT_DATABASE => "database",
        EXIT_SCHEMA => "schema_mismatch",
        EXIT_USAGE => "usage",
        _ => "failed",
    }
}

/* ------------------------------ 公共装配 ------------------------------ */

pub(super) fn data_dir() -> Result<std::path::PathBuf, String> {
    paths::resolve_data_dir()
        .map_err(|error| format!("Could not resolve the data directory: {error}"))
}

/// 「在哪儿找的」这句话，附在每一条「找不到」后面。
///
/// issue #40 的两个小时全花在这上面：那位用户在
/// `~/ZeppBridge/src-tauri/target/release/` 下跑 CLI，而
/// `paths::is_build_artifact_dir()` 认出 `target/release` 是构建产物目录，
/// 把数据目录重定向到了**仓库根**的 `~/ZeppBridge/data/`。那条规则是对的
/// （否则 `cargo run` 会往构建缓存里丢一个上 GB 的库），但程序自己一个字
/// 都没说——他把 data 文件夹放在了 exe 旁边，看到的却是「没有本地数据库」，
/// 无从知道该往哪儿放。最后是维护者手动告诉他的。
///
/// 所以每一条「找不到」都要带上解析出来的路径；是构建目录时还要说明
/// 为什么它和 exe 不在一起。
/// 「没有连接账号」到底缺了什么。
///
/// 连接一个账号要两样东西：`auth.json`（用户 id 和区域），和凭据存储里的
/// 令牌。以前无论缺哪一样，这里都印同一句「请设 ZEPPBRIDGE_CREDENTIAL_STORE
/// =env 并提供 ZEPPBRIDGE_APP_TOKEN」——而 issue #40 那位用户**两个都设了**，
/// 缺的是 `auth.json`。程序把他已经做过的那件事又叫他做了一遍，来回四轮。
///
/// 现在先看 `auth.json` 在不在，再决定说哪一句。
pub(super) fn not_connected_message(dir: &std::path::Path) -> String {
    let auth_file = dir.join("auth.json");
    if !auth_file.is_file() {
        return format!(
            "No Zepp account is connected: {} does not exist. It holds the account id \
             and region, and it is not created by the command line -- sign in from the \
             desktop app, or copy auth.json here from a machine that already has one. \
             Note that the token is NOT in that file: it lives in the platform \
             credential store and does not copy across machines, so supply it with \
             ZEPPBRIDGE_CREDENTIAL_STORE=env and ZEPPBRIDGE_APP_TOKEN. {}",
            auth_file.display(),
            where_it_looked(dir)
        );
    }
    format!(
        "No Zepp account is connected. The command line does not sign in: sign in from \
         the desktop app, or set ZEPPBRIDGE_CREDENTIAL_STORE=env and supply \
         ZEPPBRIDGE_APP_TOKEN. Moving a library between machines: see \
         docs/guides/linux.md. {}",
        where_it_looked(dir)
    )
}

pub(super) fn where_it_looked(dir: &std::path::Path) -> String {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(std::path::Path::to_path_buf));
    where_it_looked_from(dir, exe_dir.as_deref())
}

/// 同上，但 exe 的位置由调用方给——`current_exe()` 在测试里指向测试二进制，
/// 而这个分支的全部意义就是「exe 在构建目录里」，那种情况没法靠跑测试凑出来。
pub(super) fn where_it_looked_from(
    dir: &std::path::Path,
    exe_dir: Option<&std::path::Path>,
) -> String {
    let mut text = format!("Looked in: {}", dir.display());
    if exe_dir.is_some_and(paths::is_build_artifact_dir) {
        text.push_str(
            ". That is not next to the executable because this binary sits in a build \
             directory (target/debug, target/release or a cargo target cache), and \
             ZeppBridge keeps data out of build directories -- it uses the repository \
             data/ folder instead",
        );
    }
    text.push_str(&format!(". Override it with {}", paths::DATA_DIR_ENV));
    text
}
