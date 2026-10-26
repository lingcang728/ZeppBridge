//! 跑后打分的系统通知（批次 7，令牌与写库在 `core::storage::feedback_toast`）。
//!
//! - Windows：WinRT 原生通知，带五档按钮。按钮是 `zeppbridge://feedback?t=…&r=…` 链接，
//!   系统点了就用它启动本程序；`main.rs` 一见到这种参数就只写下打分、立刻退出，不起界面。
//!   点通知正文是 `zeppbridge://open`，走正常启动（单实例插件把已开着的窗口叫到前面）。
//! - 其他平台：普通通知，只有标题和正文，点开应用再打分。
//!
//! 文案由界面按界面语言组好传进来，后端不出文案。

use std::time::Duration;

use serde::Deserialize;
use zeppbridge_core::storage::feedback_toast::{parse_feedback_link, ToastRating};
use zeppbridge_core::storage::write_lock::{self, WritePurpose};
use zeppbridge_core::storage::Database;

use crate::paths;

/// 通知按钮链接的前缀。`main.rs` 用它认出「只是来打个分」的启动。
pub const FEEDBACK_LINK_PREFIX: &str = "zeppbridge://feedback";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackToastText {
    pub token: String,
    pub title: String,
    pub body: String,
    /// 五档，从「太轻松」到「太难」。
    pub labels: Vec<String>,
}

/// 由通知按钮启动：写下打分就结束。尽力而为——令牌不对、库被占着都只是不写。
pub fn handle_feedback_link(link: &str) {
    let Some((token, rating)) = parse_feedback_link(link) else {
        return;
    };
    let Ok(data_dir) = paths::resolve_data_dir() else {
        return;
    };
    let Ok(_guard) = write_lock::acquire_with_timeout(
        &data_dir,
        WritePurpose::Metadata,
        Duration::from_secs(20),
    ) else {
        return;
    };
    let Ok(db) = Database::open_without_migration(data_dir.join("zepp.db")) else {
        return;
    };
    if let Ok(ToastRating::Saved) = db.rate_from_toast(&token, rating, chrono::Utc::now()) {
        crate::diagnostics::init(Some(&data_dir));
        crate::diagnostics::log("跑后打分：通知按钮写下了一次打分");
    }
}

#[cfg(windows)]
pub fn show(text: &FeedbackToastText) -> Result<(), String> {
    windows_toast::show(text)
}

#[cfg(not(windows))]
pub fn show(text: &FeedbackToastText) -> Result<(), String> {
    notify_rust::Notification::new()
        .appname("ZeppBridge")
        .summary(&text.title)
        .body(&text.body)
        .show()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg(windows)]
mod windows_toast {
    use super::FeedbackToastText;
    use windows::core::HSTRING;
    use windows::Data::Xml::Dom::XmlDocument;
    use windows::UI::Notifications::{ToastNotification, ToastNotificationManager};

    /// 和安装版快捷方式上的 AppUserModelID 一致（tauri.conf.json 的 identifier）。
    const AUMID: &str = "com.zeppbridge.app";
    const ICON_PNG: &[u8] = include_bytes!("../icons/128x128.png");

    pub fn show(text: &FeedbackToastText) -> Result<(), String> {
        if text.labels.len() != 5 || text.token.len() != 32 {
            return Err("invalid toast text".into());
        }
        register()?;
        let xml = toast_xml(text);
        let document = XmlDocument::new().map_err(|e| e.to_string())?;
        document
            .LoadXml(&HSTRING::from(xml))
            .map_err(|e| e.to_string())?;
        let toast =
            ToastNotification::CreateToastNotification(&document).map_err(|e| e.to_string())?;
        // 同一个标签的新通知顶掉旧的：通知中心里最多一张。
        toast
            .SetTag(&HSTRING::from("workout-feedback"))
            .map_err(|e| e.to_string())?;
        ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(AUMID))
            .and_then(|notifier| notifier.Show(&toast))
            .map_err(|e| e.to_string())
    }

    fn escape(text: &str) -> String {
        text.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&apos;")
    }

    pub(super) fn toast_xml(text: &FeedbackToastText) -> String {
        let actions: String = text
            .labels
            .iter()
            .enumerate()
            .map(|(index, label)| {
                format!(
                    r#"<action content="{}" activationType="protocol" arguments="{}"/>"#,
                    escape(label),
                    escape(&format!(
                        "{}?t={}&r={}",
                        super::FEEDBACK_LINK_PREFIX,
                        text.token,
                        index + 1
                    ))
                )
            })
            .collect();
        format!(
            r#"<toast activationType="protocol" launch="zeppbridge://open"><visual><binding template="ToastGeneric"><text>{}</text><text>{}</text></binding></visual><actions>{actions}</actions></toast>"#,
            escape(&text.title),
            escape(&text.body)
        )
    }

    /// 便携版没有带 AppUserModelID 的快捷方式：在当前用户下登记名字和图标，系统才肯显示通知；
    /// 再登记 `zeppbridge:` 链接指向当前这个 exe（便携版可能被挪过，每次发通知都重写）。
    /// 卸载程序会删掉这两处（windows/hooks.nsh）。
    fn register() -> Result<(), String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let data_dir = crate::paths::resolve_data_dir().map_err(|e| e.to_string())?;
        let icon = data_dir.join("notify-icon.png");
        if !icon.exists() {
            std::fs::write(&icon, ICON_PNG).map_err(|e| e.to_string())?;
        }
        let aumid_key = format!(r"Software\Classes\AppUserModelId\{AUMID}");
        set_value(&aumid_key, Some("DisplayName"), "ZeppBridge")?;
        set_value(&aumid_key, Some("IconUri"), &icon.to_string_lossy())?;
        set_value(r"Software\Classes\zeppbridge", None, "URL:ZeppBridge")?;
        set_value(r"Software\Classes\zeppbridge", Some("URL Protocol"), "")?;
        set_value(
            r"Software\Classes\zeppbridge\shell\open\command",
            None,
            &format!("\"{}\" \"%1\"", exe.display()),
        )
    }

    fn set_value(key: &str, name: Option<&str>, value: &str) -> Result<(), String> {
        use windows_sys::Win32::System::Registry::{RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ};
        let wide = |text: &str| text.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
        let key = wide(key);
        let name = name.map(wide);
        let data = wide(value);
        // SAFETY: 全是以 0 结尾的 UTF-16 缓冲，长度按字节传，调用期间都活着。
        let status = unsafe {
            RegSetKeyValueW(
                HKEY_CURRENT_USER,
                key.as_ptr(),
                name.as_ref().map_or(std::ptr::null(), |n| n.as_ptr()),
                REG_SZ,
                data.as_ptr().cast(),
                (data.len() * 2) as u32,
            )
        };
        if status == 0 {
            Ok(())
        } else {
            Err(format!("registry write failed: {status}"))
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn toast_xml_escapes_text_and_carries_one_link_per_level() {
        let text = FeedbackToastText {
            token: "a".repeat(32),
            title: "昨天的 <间歇> 跑 & 感觉".into(),
            body: "Tempo".into(),
            labels: ["1", "2", "3", "4", "\"5\""].map(String::from).to_vec(),
        };
        let xml = windows_toast::toast_xml(&text);
        assert!(xml.contains("&lt;间歇&gt; 跑 &amp; 感觉"));
        assert!(xml.contains("&quot;5&quot;"));
        for rating in 1..=5 {
            let link = format!("zeppbridge://feedback?t={}&amp;r={rating}", "a".repeat(32));
            assert!(xml.contains(&link), "{link}");
        }
        windows::Data::Xml::Dom::XmlDocument::new()
            .unwrap()
            .LoadXml(&windows::core::HSTRING::from(xml))
            .expect("well-formed toast XML");
    }
}

/// 真发一条通知，确认系统收下了（进了通知历史），再立刻撤掉。会在屏幕上闪一下，所以默认不跑：
/// `cargo test -p zeppbridge --lib -- --ignored real_toast`。
#[cfg(all(test, windows))]
#[test]
#[ignore]
fn real_toast_is_accepted_by_windows() {
    use windows::core::HSTRING;
    use windows::UI::Notifications::ToastNotificationManager;
    let text = FeedbackToastText {
        token: "0".repeat(32),
        title: "ZeppBridge".into(),
        body: "test".into(),
        labels: ["1", "2", "3", "4", "5"].map(String::from).to_vec(),
    };
    show(&text).expect("toast shown");
    let history = ToastNotificationManager::History().unwrap();
    let aumid = HSTRING::from("com.zeppbridge.app");
    let count = history.GetHistoryWithId(&aumid).unwrap().Size().unwrap();
    history.ClearWithId(&aumid).unwrap();
    assert!(count >= 1, "Windows dropped the toast");
}
