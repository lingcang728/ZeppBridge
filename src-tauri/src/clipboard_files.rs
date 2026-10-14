//! 交给 AI（计划 12.1）用到的几样系统能力：把文件当「文件」放进剪贴板、读前台窗口标题、替用户按键。
//!
//! 为什么不做浏览器插件（10-13 用户：Safari / Edge / Arc / 小众浏览器各不相同，多装一个插件太麻烦）：
//! 把文件管理器里复制的文件粘进网页，Chrome 66+、Edge 79+、Firefox 63+、Safari 13.1+ 都支持
//! （paste 事件的 `clipboardData.files`），所以只要把 `.md` 以文件放进剪贴板，
//! 用户在任何浏览器的对话框里按一下 Ctrl+V（Mac 上 ⌘V）就附上了，什么都不用装。
//!
//! - Windows：自己写 `CF_HDROP` + `Preferred DropEffect`（复制，不是剪切）；读前台标题、替用户按键也只有这里有。
//! - Mac / Linux：用依赖树里本来就有的 arboard（Mac 写 `NSURL`，同访达里复制文件；Linux 在 X11 / Wayland
//!   上写 `text/uri-list`）。全自动替按键在这两个系统上不做（Mac 要辅助功能授权），界面不显示那个开关。
//!   放不进去（比如没有图形会话）返回错误，界面退回「拖文件进对话框」。

use std::path::Path;

#[derive(Debug)]
pub enum ClipboardError {
    /// 这个系统 / 会话里拿不到剪贴板（Mac、Linux 没有图形会话时）。Windows 上不会走到。
    #[cfg_attr(windows, allow(dead_code))]
    Unsupported,
    Busy,
}

#[cfg(windows)]
mod imp {
    use super::ClipboardError;
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;
    use windows_sys::Win32::Foundation::{GlobalFree, HWND};
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
    };
    use windows_sys::Win32::System::Memory::{
        GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE,
    };
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
        VIRTUAL_KEY, VK_CONTROL, VK_ESCAPE, VK_RETURN, VK_V,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};

    const CF_UNICODETEXT: u32 = 13;
    const CF_HDROP: u32 = 15;
    const DROPEFFECT_COPY: u32 = 1;
    /// `DROPFILES` 的大小：pFiles(u32) + POINT(2×i32) + fNC(BOOL) + fWide(BOOL)。
    const DROPFILES_SIZE: usize = 20;

    /// 一块交给剪贴板的全局内存。交出去以后归系统，没交出去就自己释放。
    fn global_bytes(bytes: &[u8]) -> Result<*mut core::ffi::c_void, ClipboardError> {
        // SAFETY: 分配、加锁、整段拷贝、解锁都在这一个函数里，长度就是 bytes 的长度。
        unsafe {
            let handle = GlobalAlloc(GMEM_MOVEABLE, bytes.len());
            if handle.is_null() {
                return Err(ClipboardError::Busy);
            }
            let target = GlobalLock(handle);
            if target.is_null() {
                GlobalFree(handle);
                return Err(ClipboardError::Busy);
            }
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), target.cast::<u8>(), bytes.len());
            GlobalUnlock(handle);
            Ok(handle)
        }
    }

    /// 打开剪贴板、清空、放进几种格式。别的程序正占着剪贴板时隔一会儿重试几次。
    fn put(entries: &[(u32, Vec<u8>)]) -> Result<(), ClipboardError> {
        let mut opened = false;
        for _ in 0..10 {
            // SAFETY: 不绑定窗口打开剪贴板，下面成对关闭。
            if unsafe { OpenClipboard(std::ptr::null_mut()) } != 0 {
                opened = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(30));
        }
        if !opened {
            return Err(ClipboardError::Busy);
        }
        let result = (|| {
            // SAFETY: 剪贴板已由本线程打开。
            if unsafe { EmptyClipboard() } == 0 {
                return Err(ClipboardError::Busy);
            }
            for (format, bytes) in entries {
                let handle = global_bytes(bytes)?;
                // SAFETY: 成功后内存归系统；失败时还归我们，释放掉。
                if unsafe { SetClipboardData(*format, handle) }.is_null() {
                    unsafe { GlobalFree(handle) };
                    return Err(ClipboardError::Busy);
                }
            }
            Ok(())
        })();
        // SAFETY: 和上面的 OpenClipboard 成对。
        unsafe { CloseClipboard() };
        result
    }

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn u16_bytes(units: &[u16]) -> Vec<u8> {
        units.iter().flat_map(|unit| unit.to_le_bytes()).collect()
    }

    pub fn copy_file(path: &Path) -> Result<(), ClipboardError> {
        // DROPFILES 头 + 宽字符路径 + 结尾两个 0（路径列表以空串结束）。
        let mut drop = Vec::with_capacity(DROPFILES_SIZE + 512);
        drop.extend_from_slice(&(DROPFILES_SIZE as u32).to_le_bytes());
        drop.extend_from_slice(&[0u8; 12]);
        drop.extend_from_slice(&1u32.to_le_bytes());
        let mut units: Vec<u16> = path.as_os_str().encode_wide().collect();
        units.extend_from_slice(&[0, 0]);
        drop.extend_from_slice(&u16_bytes(&units));
        // 「复制」而不是「剪切」：用户顺手粘进资源管理器时，原文件不能被挪走。
        // SAFETY: 传入以 0 结尾的宽字符串。
        let effect = unsafe { RegisterClipboardFormatW(wide("Preferred DropEffect").as_ptr()) };
        let mut entries = vec![(CF_HDROP, drop)];
        if effect != 0 {
            entries.push((effect, DROPEFFECT_COPY.to_le_bytes().to_vec()));
        }
        put(&entries)
    }

    pub fn copy_text(text: &str) -> Result<(), ClipboardError> {
        put(&[(CF_UNICODETEXT, u16_bytes(&wide(text)))])
    }

    pub fn foreground_window() -> Option<isize> {
        // SAFETY: 只读前台窗口句柄。
        let hwnd: HWND = unsafe { GetForegroundWindow() };
        (!hwnd.is_null()).then_some(hwnd as isize)
    }

    pub fn foreground_title() -> Option<String> {
        // SAFETY: 只读前台窗口的标题，缓冲区长度如实传入。
        unsafe {
            let hwnd: HWND = GetForegroundWindow();
            if hwnd.is_null() {
                return None;
            }
            let mut buffer = [0u16; 512];
            let len = GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32);
            (len > 0).then(|| String::from_utf16_lossy(&buffer[..len as usize]))
        }
    }

    pub fn escape_down() -> bool {
        // SAFETY: 只读按键状态。最高位 = 此刻按着。
        (unsafe { GetAsyncKeyState(i32::from(VK_ESCAPE)) } as u16 & 0x8000) != 0
    }

    fn key(vk: VIRTUAL_KEY, up: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: if up { KEYEVENTF_KEYUP } else { 0 },
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    fn send(inputs: &[INPUT]) -> bool {
        // SAFETY: inputs 是一段连续的 INPUT，大小如实传入。
        let sent = unsafe {
            SendInput(
                inputs.len() as u32,
                inputs.as_ptr(),
                std::mem::size_of::<INPUT>() as i32,
            )
        };
        sent as usize == inputs.len()
    }

    pub fn press_paste() -> bool {
        send(&[
            key(VK_CONTROL, false),
            key(VK_V, false),
            key(VK_V, true),
            key(VK_CONTROL, true),
        ])
    }

    pub fn press_enter() -> bool {
        send(&[key(VK_RETURN, false), key(VK_RETURN, true)])
    }
}

#[cfg(not(windows))]
mod imp {
    use super::ClipboardError;
    use std::path::Path;
    use std::sync::Mutex;

    /// Linux 上剪贴板内容由持有它的进程提供：`Clipboard` 一放下，粘贴就取不到了。
    /// 所以留一个常驻实例，应用不退出，用户什么时候按 Ctrl+V 都还在。
    static CLIPBOARD: Mutex<Option<arboard::Clipboard>> = Mutex::new(None);

    fn with(
        put: impl FnOnce(&mut arboard::Clipboard) -> Result<(), arboard::Error>,
    ) -> Result<(), ClipboardError> {
        let mut guard = CLIPBOARD.lock().unwrap_or_else(|e| e.into_inner());
        if guard.is_none() {
            *guard = Some(arboard::Clipboard::new().map_err(|_| ClipboardError::Unsupported)?);
        }
        let clipboard = guard.as_mut().ok_or(ClipboardError::Unsupported)?;
        put(clipboard).map_err(|_| ClipboardError::Busy)
    }

    pub fn copy_file(path: &Path) -> Result<(), ClipboardError> {
        with(|clipboard| clipboard.set().file_list(&[path]))
    }
}

pub fn copy_file(path: &Path) -> Result<(), ClipboardError> {
    imp::copy_file(path)
}

// 下面这些只给全自动用，全自动只有 Windows（commands/ai_handoff.rs 的 `auto`）。
#[cfg(windows)]
pub use imp::{
    copy_text, escape_down, foreground_title, foreground_window, press_enter, press_paste,
};
