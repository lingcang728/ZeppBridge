//! 登录窗口的地址策略：允许的主机、第三方登录停滞判定、日志只记脱敏字段（从 commands/login.rs 拆出）。

use super::*;

pub(super) fn is_allowed_login_url(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return false;
    };
    // Only HTTPS navigation to the Zepp/Huami account domains and the exact
    // OAuth hosts used by the official universal-login page is allowed.
    // `data:`, `blob:` and `about:` URLs are deliberately rejected: page
    // scripts must never be able to steer the credential-collecting webview
    // onto attacker-controlled inline content.
    if parsed.scheme() != "https" {
        return false;
    }
    parsed.host_str().is_some_and(|host| {
        let host = host.to_ascii_lowercase();
        host == "zepp.com"
            || host.ends_with(".zepp.com")
            || host == "huami.com"
            || host.ends_with(".huami.com")
            || THIRD_PARTY_AUTH_HOSTS.contains(&host.as_str())
    })
}

/// 官方通用登录页会跳过去的第三方账号域名。
///
/// 放行导航和判断「是不是卡在第三方授权页」用的是同一份表：多一处手写的名单，
/// 就多一个哪天加了新登录方式却漏改的地方。
pub(super) const THIRD_PARTY_AUTH_HOSTS: &[&str] = &[
    "account.xiaomi.com",
    "open.weixin.qq.com",
    "accounts.google.com",
    "www.facebook.com",
    "account-us.amazfit.com",
];

/// 这个地址是不是第三方账号的授权页（而不是我们自己打开的 Zepp 登录页）。
pub(super) fn is_third_party_auth_page(url: &str) -> bool {
    reqwest::Url::parse(url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_ascii_lowercase))
        .is_some_and(|host| THIRD_PARTY_AUTH_HOSTS.contains(&host.as_str()))
}

/// 该不该现在就把兜底路径摆出来。
///
/// 四个条件缺一不可：停在第三方授权页、在这一页上已经待够久、还没读到凭据、
/// 这一轮没说过。「在这一页上」是关键——计时要跟着地址走，用户在几个授权页之间
/// 来回跳的时候，每一页都重新计时，不会因为整场登录拖得久就误报。
pub(super) fn third_party_stall_is_due(
    page_url: &str,
    elapsed_on_page: Duration,
    credentials_extracted: bool,
    already_hinted: bool,
) -> bool {
    !already_hinted
        && !credentials_extracted
        && elapsed_on_page >= THIRD_PARTY_STALL_AFTER
        && is_third_party_auth_page(page_url)
}

pub(super) fn login_url_log_fields(url: &reqwest::Url) -> String {
    let host = url.host_str().unwrap_or("<none>");
    format!("host={host} path={}", url.path())
}

pub(super) fn log_blocked_login_url(kind: &str, url: &reqwest::Url) {
    // Query and fragment can contain OAuth state/code values.  Never log them.
    eprintln!("blocked Zepp login {kind}: {}", login_url_log_fields(url));
}

/// 这一页看起来已经登录了吗。
///
/// 判断只看两件公开的事：页面是不是已经离开登录页，以及 **Zepp/Huami** cookie
/// 里有没有出现任何一个「登录之后才会有」的名字。第三方 OAuth（Google /
/// Facebook / 微信 / 小米）上的 `session` / `token` 不算——那只说明授权页自己
/// 有会话，不是 Zepp 已经签入。看不到凭据本身也没关系：我们要区分的是
/// 「用户还没登录」和「用户登录了但我们没读到」，前者该继续等，后者该停下来
/// 把兜底路径给他。
pub(super) fn page_looks_signed_in(page_url: &str, cookies: &[(String, String)]) -> bool {
    const SIGNED_IN_HINTS: &[&str] = &[
        "hm-user-login-info",
        "hm_user_login_info",
        "userid",
        "user_id",
        "apptoken",
        "app_token",
    ];
    if page_host_is_zepp_or_huami(page_url)
        && cookies.iter().any(|(name, _)| {
            let lowered = name.to_ascii_lowercase();
            SIGNED_IN_HINTS
                .iter()
                .any(|hint| lowered == *hint || lowered.contains(hint))
        })
    {
        return true;
    }
    // 表盘站登录成功后会离开 /login 这一层。
    page_url.starts_with("https://watchface.zepp.com/")
        && !page_url.contains("/login")
        && !page_url.contains("account.xiaomi.com")
}

pub(super) fn page_host_is_zepp_or_huami(page_url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(page_url) else {
        return false;
    };
    if parsed.scheme() != "https" {
        return false;
    }
    parsed.host_str().is_some_and(|host| {
        let host = host.to_ascii_lowercase();
        host == "zepp.com"
            || host.ends_with(".zepp.com")
            || host == "huami.com"
            || host.ends_with(".huami.com")
    })
}

/// 调试时记下「这一页看起来已登录」以及看到了多少个 cookie 名字。
///
/// 发布构建不写。即使开着 debug，也只写 host 和数量，不写名字——名字本身
/// 有时就是账号相关的标识。值、query、fragment 任何情况下都不写。
#[cfg(debug_assertions)]
pub(super) fn log_credential_probe(page_url: &str, cookies: &[(String, String)]) {
    let host = reqwest::Url::parse(page_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
        .unwrap_or_else(|| "unknown".to_string());
    eprintln!(
        "Zepp login: page looks signed in (host={host}); {} cookie name(s) seen",
        cookies.len()
    );
}

#[cfg(not(debug_assertions))]
pub(super) fn log_credential_probe(_page_url: &str, _cookies: &[(String, String)]) {}

/// 备用页的时间前提。
///
/// 「这一页还有没有人在用」由 `login_page_activity` 单独回答，两件事分开判断：
/// 这里只管等够了没有、以及是不是已经跳过一次。
///
/// 之前这里只看时间，于是所有需要输密码或等验证码的登录都会在计时到点时被
/// 打断，页面被换成 `user.huami.com` 的隐私页（那上面只有清除数据、注销账号
/// 这些选项）。
pub(super) fn fallback_is_due(elapsed: Duration, fallback_used: bool) -> bool {
    !fallback_used && elapsed >= FALLBACK_AFTER
}

/// 窗口是不是还停在我们自己打开的那一页。
///
/// 地址一变，用户就已经在第三方登录流程里了，任何自动跳转都是打断。
pub(super) fn is_primary_login_page(page_url: &str) -> bool {
    page_url.starts_with("https://watchface.zepp.com")
}
