//! 交给 AI 的最后一步（计划 12.1）：交出去的 `.md` 以「文件」放进系统剪贴板，任何浏览器里 Ctrl+V 就附上；
//! 打开「全自动」时（只有 Windows），等那个 AI 网页到了前台，替用户粘文件、粘开场白、回车。
//!
//! 全自动每一步都先看网页的界面树（`crate::web_composer`）再动手：输入框拿到焦点才粘、附件卡片出现才算附上、
//! 输入框里的开场白不见了才算发出。用户按 Esc、切走窗口、等不到网页，就停下，剪贴板里留着文件，用户自己粘。
//! 拿不准的时候停在安全的一边：文件没确认附上就不替用户回车。

use crate::app_state::AppState;
use crate::clipboard_files::{self, ClipboardError};
use crate::ipc_error::AppError;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::AppHandle;

/// 交出去的 `.md` 上限（按 token 预算裁过，正常远小于这个数）。
const MAX_HANDOFF_BYTES: u64 = 16 * 1024 * 1024;

/// 认 AI 网页的标题关键字（区分大小写：网页还没加载完时标题是小写的网址，不算）。
const TITLES: &[(&str, &[&str])] = &[
    ("chatgpt", &["ChatGPT"]),
    ("claude", &["Claude"]),
    ("gemini", &["Gemini"]),
    ("kimi", &["Kimi"]),
    ("doubao", &["豆包", "Doubao"]),
    ("deepseek", &["DeepSeek"]),
    ("grok", &["Grok"]),
];

static GENERATION: AtomicU64 = AtomicU64::new(0);

/// 只交 `ai_task_prepare` 写出来的那种文件：输出目录里的 `.md`。
fn handoff_file(state: &AppState, raw: &str) -> Result<PathBuf, AppError> {
    let missing = || AppError::new("err.ai_handoff.file", "找不到要交出去的文件");
    let path = Path::new(raw).canonicalize().map_err(|_| missing())?;
    let is_md = path
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("md"));
    let roots = [
        directories::UserDirs::new()
            .and_then(|dirs| dirs.desktop_dir().map(|path| path.join("ZeppBridge AI"))),
        Some(state.data_dir.join("exports").join("ai-tasks")),
    ];
    let inside = roots
        .iter()
        .flatten()
        .filter_map(|root| root.canonicalize().ok())
        .any(|root| path.starts_with(root));
    let size = std::fs::metadata(&path).map_err(|_| missing())?.len();
    if !is_md || !inside || size > MAX_HANDOFF_BYTES {
        return Err(missing());
    }
    Ok(path)
}

fn clipboard_error(error: ClipboardError) -> AppError {
    match error {
        ClipboardError::Unsupported => AppError::new(
            "err.ai_handoff.unsupported",
            "这个系统上还不能把文件放进剪贴板",
        ),
        ClipboardError::Busy => AppError::new(
            "err.ai_handoff.clipboard",
            "剪贴板正被别的程序占用，稍后再试",
        ),
    }
}

/// 把交出去的 `.md` 以「文件」放进剪贴板（同资源管理器里 Ctrl+C）。
#[tauri::command]
pub async fn ai_handoff_copy_file(
    state: tauri::State<'_, AppState>,
    md_path: String,
) -> std::result::Result<(), AppError> {
    let path = handoff_file(&state, &md_path)?;
    clipboard_files::copy_file(&path).map_err(clipboard_error)
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiHandoffAutoRequest {
    provider: String,
    md_path: String,
    kickoff: String,
    send: bool,
}

/// 全自动：文件先进剪贴板，等 AI 网页到前台再替用户粘贴、回车。立刻返回这一次的编号，进度走事件
/// `ai-handoff://auto`。再调一次（或 `ai_handoff_cancel`）会顶掉还在跑的那一次。
#[tauri::command]
pub async fn ai_handoff_autopaste(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    request: AiHandoffAutoRequest,
) -> std::result::Result<u64, AppError> {
    let titles = TITLES
        .iter()
        .find(|(id, _)| *id == request.provider)
        .map(|(_, titles)| *titles)
        .ok_or_else(|| AppError::new("err.ai_handoff.provider", "目标 AI 不在允许列表里"))?;
    let path = handoff_file(&state, &request.md_path)?;
    #[cfg(windows)]
    {
        clipboard_files::copy_file(&path).map_err(clipboard_error)?;
        let ticket = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
        auto::spawn(app, ticket, titles, path, request.kickoff, request.send);
        Ok(ticket)
    }
    // 替用户按键只有 Windows 有；别的系统界面上也没有这个开关。
    #[cfg(not(windows))]
    {
        let _ = (app, titles, path, request.kickoff, request.send);
        Err(clipboard_error(ClipboardError::Unsupported))
    }
}

/// 收回还在跑的那一次（界面上点了取消、换了别的 AI）。
#[tauri::command]
pub fn ai_handoff_cancel() {
    GENERATION.fetch_add(1, Ordering::SeqCst);
}

#[cfg(windows)]
mod auto {
    use super::GENERATION;
    use crate::clipboard_files::{
        copy_file, copy_text, escape_down, foreground_title, foreground_window, press_enter,
        press_paste,
    };
    use crate::web_composer::Composer;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::Ordering;
    use std::time::{Duration, Instant};
    use tauri::{AppHandle, Emitter};

    const AUTO_EVENT: &str = "ai-handoff://auto";
    /// 等 AI 网页到前台：浏览器冷启动 + 首屏，45 秒足够。
    const WAIT_FOREGROUND: Duration = Duration::from_secs(45);
    /// 网页到了前台以后，等它把输入框挂好、能拿到焦点。
    const WAIT_INPUT: Duration = Duration::from_secs(20);
    /// 输入框刚出来时网页常常还没「活」过来（服务端先给的页面，脚本还在跑），再稳一下才粘。
    const WARM_UP: Duration = Duration::from_millis(1200);
    /// 粘完文件等附件卡片出现，等不到就是这一下落空了（10-13 实测：ChatGPT 输入框出来以后还要好几秒
    /// 页面才真正能接粘贴），再粘一次。落空的粘贴不留东西；但 Grok 有时 4 秒多才画出卡片，等短了会
    /// 粘出两份，所以放宽到 7 秒。
    const WAIT_ATTACH: Duration = Duration::from_secs(7);
    const FILE_TRIES: usize = 4;
    /// 粘贴前焦点不在输入框上时，等它回来最多这么久。
    const REFOCUS: Duration = Duration::from_secs(3);
    const WAIT_TEXT: Duration = Duration::from_secs(3);
    /// 回车以后等它发出去（输入框里的开场白没了，读不到输入框的网站看对话里出现这条开场白）；
    /// 上传没完时网站会挡住回车，隔一会儿再按，最多这么久。
    const WAIT_SENT: Duration = Duration::from_secs(60);
    const POLL: Duration = Duration::from_millis(250);

    #[derive(Debug, Clone, serde::Serialize)]
    struct AutoStage {
        ticket: u64,
        /// waiting → file → sent / filled；中途停下是 aborted（Esc、切走窗口、文件没确认附上）或 timeout。
        stage: &'static str,
    }

    pub(super) fn spawn(
        app: AppHandle,
        ticket: u64,
        titles: &'static [&'static str],
        path: PathBuf,
        kickoff: String,
        send: bool,
    ) {
        std::thread::spawn(move || {
            let emit = |stage| {
                let _ = app.emit(AUTO_EVENT, AutoStage { ticket, stage });
            };
            let stage = run(ticket, titles, &path, &kickoff, send, &emit);
            // 不管停在哪一步，剪贴板里都放回那份文件：用户接着自己粘也行。
            if stage != "superseded" {
                let _ = copy_file(&path);
                emit(stage);
            }
        });
    }

    /// 附件卡片上认文件名用的：完整的主文件名（带时间戳，页面上别处不会有；只比开头一截会被侧栏里
    /// 以前会话的标题骗过——10-13 实测 ChatGPT 就是这样，没附上也当附上了）。
    fn file_needle(path: &Path) -> String {
        path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_string()
    }

    /// 比较开场白时去掉空白（网页里换行、空格会变）。
    fn squash(text: &str) -> String {
        text.chars().filter(|c| !c.is_whitespace()).collect()
    }

    fn run(
        ticket: u64,
        titles: &[&str],
        path: &Path,
        kickoff: &str,
        send: bool,
        emit: &dyn Fn(&'static str),
    ) -> &'static str {
        let live = || GENERATION.load(Ordering::SeqCst) == ticket;
        emit("waiting");

        // 1. 等 AI 网页到前台（标题对上），记下那个窗口。
        let deadline = Instant::now() + WAIT_FOREGROUND;
        let hwnd = loop {
            if !live() {
                return "superseded";
            }
            if escape_down() {
                return "aborted";
            }
            if Instant::now() > deadline {
                return "timeout";
            }
            let titled = foreground_title().is_some_and(|t| titles.iter().any(|k| t.contains(k)));
            if let (true, Some(hwnd)) = (titled, foreground_window()) {
                break hwnd;
            }
            std::thread::sleep(POLL);
        };
        let Some(page) = Composer::attach(hwnd) else {
            return "aborted";
        };

        // 之后的每一段等待：被顶掉、按了 Esc、切走了窗口，都立刻停。同一个浏览器窗口里切到别的标签页
        // 也算切走（10-13 实测时用户切去 X 写帖子）：窗口标题跟着标签页变，标题对不上就停。
        let in_page = || {
            foreground_window() == Some(hwnd)
                && foreground_title().is_some_and(|t| titles.iter().any(|k| t.contains(k)))
        };
        let stopped = || -> Option<&'static str> {
            if !live() {
                Some("superseded")
            } else if escape_down() || !in_page() {
                Some("aborted")
            } else {
                None
            }
        };
        let wait_for =
            |limit: Duration, ok: &mut dyn FnMut() -> bool| -> Result<bool, &'static str> {
                let end = Instant::now() + limit;
                loop {
                    if let Some(stop) = stopped() {
                        return Err(stop);
                    }
                    if ok() {
                        return Ok(true);
                    }
                    if Instant::now() > end {
                        return Ok(false);
                    }
                    std::thread::sleep(POLL);
                }
            };

        // 2. 等网页里的输入框能拿到焦点，再稳一下。
        match wait_for(WAIT_INPUT, &mut || page.focus()) {
            Err(stop) => return stop,
            Ok(false) => return "aborted",
            Ok(true) => {}
        }
        if let Err(stop) = wait_for(WARM_UP, &mut || false) {
            return stop;
        }

        // 3. 粘文件，等附件卡片（带文件名）出现。
        let needle = file_needle(path);
        let mut attached = false;
        for _ in 0..FILE_TRIES {
            if let Some(stop) = stopped() {
                return stop;
            }
            // 焦点被附件卡片、弹层抢走时先等它回来，别把重试次数在一瞬间烧光。
            if let Err(stop) = wait_for(REFOCUS, &mut || page.focus()) {
                return stop;
            }
            if !page.focus() || copy_file(path).is_err() || !press_paste() {
                continue;
            }
            match wait_for(WAIT_ATTACH, &mut || page.shows(&needle)) {
                Err(stop) => return stop,
                Ok(true) => {
                    attached = true;
                    break;
                }
                Ok(false) => {}
            }
        }
        if !attached {
            // 文件没确认附上：不往下替用户做了，剪贴板里留着文件，提示用户自己 Ctrl+V。
            return "aborted";
        }
        emit("file");

        // 4. 粘开场白，确认它进了输入框。先看这个网站的输入框读不读得到：读得到（多数）就必须亲眼看到
        //    开场白进去了，没看到就重粘（10-13 Grok：那一瞬间没读到就当粘上了，结果只发出去附件）；
        //    本来就读不到的（豆包）只能盲粘一次，免得粘两遍。
        let head: String = squash(kickoff).chars().take(8).collect();
        let readable = match wait_for(Duration::from_secs(1), &mut || page.text().is_some()) {
            Err(stop) => return stop,
            Ok(readable) => readable,
        };
        if !head.is_empty() {
            let mut typed = false;
            for _ in 0..2 {
                if let Some(stop) = stopped() {
                    return stop;
                }
                if let Err(stop) = wait_for(REFOCUS, &mut || page.focus()) {
                    return stop;
                }
                if !page.focus() || copy_text(kickoff).is_err() || !press_paste() {
                    continue;
                }
                let landed = &mut || match page.text() {
                    Some(text) => squash(&text).contains(&head),
                    None => !readable,
                };
                match wait_for(WAIT_TEXT, landed) {
                    Err(stop) => return stop,
                    Ok(true) => {
                        typed = true;
                        break;
                    }
                    Ok(false) => {}
                }
            }
            let _ = copy_file(path);
            if !typed {
                return "aborted";
            }
        }
        if !send {
            return "filled";
        }

        // 5. 回车，直到输入框里的开场白不见了。上传还没完时网站会挡住回车，隔一会儿再按。
        if head.is_empty() {
            return if page.focus() && press_enter() {
                "sent"
            } else {
                "filled"
            };
        }
        let bubble: String = kickoff.trim().chars().take(12).collect();
        let end = Instant::now() + WAIT_SENT;
        loop {
            if let Some(stop) = stopped() {
                return stop;
            }
            if page.focus() {
                press_enter();
            }
            // 读得到输入框：开场白从输入框里没了就是发出去了；读不到（豆包）：对话里出现了这条开场白才算。
            let gone = &mut || match page.text() {
                Some(text) => !squash(&text).contains(&head),
                None => page.shows(&bubble),
            };
            match wait_for(Duration::from_secs(2), gone) {
                // 发出去以后网站常会改标题（ChatGPT 换成对话名），被当成「切走了」——停之前再看一眼发没发出去。
                Err(stop) => return if gone() { "sent" } else { stop },
                Ok(true) => return "sent",
                Ok(false) if Instant::now() > end => return "filled",
                Ok(false) => {}
            }
        }
    }
}
