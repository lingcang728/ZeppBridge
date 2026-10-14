//! 全自动交给 AI 的「眼睛」（10-13 用户实测后重做，只在 Windows 上）。
//!
//! 第一版是闭着眼按键：标题一对上就等 1.5 秒按 Ctrl+V、再按回车。实测只有 DeepSeek 全对——
//! ChatGPT 这类网站标题是服务端先给的，页面还没活过来，第一下粘文件落空；有的网站输入框不自动聚焦，
//! 粘贴和回车全落空；文件还在上传时回车被网站挡住，只剩开场白。
//!
//! 现在读浏览器给读屏软件的那棵界面树（UI Automation，Chrome / Edge / Firefox 都提供），每一步都看着做：
//! - 网页里的输入框（Edit）找到了、焦点在它身上，才粘贴；
//! - 粘完文件，等网页上出现带这个文件名的元素（附件卡片），才算附上；
//! - 回车以后，输入框里的开场白不见了，才算发出去。
//!
//! 只读网页的界面树、只对输入框调 SetFocus，不点、不改网页里的任何东西。

use std::mem::ManuallyDrop;
use windows::core::BSTR;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
};
use windows::Win32::System::Variant::{VariantClear, VARIANT, VT_BSTR, VT_I4};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationCondition, IUIAutomationElement,
    IUIAutomationTextPattern, IUIAutomationValuePattern, PropertyConditionFlags_MatchSubstring,
    TreeScope_Descendants, UIA_ControlTypePropertyId, UIA_DocumentControlTypeId,
    UIA_EditControlTypeId, UIA_NamePropertyId, UIA_TextPatternId, UIA_ValuePatternId,
    UIA_CONTROLTYPE_ID,
};

/// 一个属性条件用的 VARIANT；用完 `VariantClear`（BSTR 要释放）。
struct Variant(VARIANT);

impl Variant {
    fn i4(value: i32) -> Self {
        let mut variant = VARIANT::default();
        // SAFETY: 先写类型再写同一个联合体里对应的成员。
        unsafe {
            let inner = &mut *variant.Anonymous.Anonymous;
            inner.vt = VT_I4;
            inner.Anonymous.lVal = value;
        }
        Self(variant)
    }

    fn bstr(text: &str) -> Self {
        let mut variant = VARIANT::default();
        // SAFETY: 同上；BSTR 的所有权交给 VARIANT，Drop 里 VariantClear 释放。
        unsafe {
            let inner = &mut *variant.Anonymous.Anonymous;
            inner.vt = VT_BSTR;
            inner.Anonymous.bstrVal = ManuallyDrop::new(BSTR::from(text));
        }
        Self(variant)
    }
}

impl Drop for Variant {
    fn drop(&mut self) {
        // SAFETY: 这个 VARIANT 是上面按规矩构造的。
        let _ = unsafe { VariantClear(&mut self.0) };
    }
}

pub struct Composer {
    uia: IUIAutomation,
    window: IUIAutomationElement,
}

impl Drop for Composer {
    fn drop(&mut self) {
        // SAFETY: 和 `attach` 里的 CoInitializeEx 成对（同一线程）。
        unsafe { CoUninitialize() };
    }
}

fn center_in(rect: &RECT, outer: &RECT) -> bool {
    let x = (rect.left + rect.right) / 2;
    let y = (rect.top + rect.bottom) / 2;
    x >= outer.left && x <= outer.right && y >= outer.top && y <= outer.bottom
}

fn area(rect: &RECT) -> i64 {
    i64::from((rect.right - rect.left).max(0)) * i64::from((rect.bottom - rect.top).max(0))
}

impl Composer {
    /// 对准前台那个浏览器窗口。要在同一条线程里用完（COM 对象不跨线程）。
    pub fn attach(hwnd: isize) -> Option<Self> {
        // SAFETY: 本线程初始化 COM；失败（已经按别的模式初始化过）也照样能建 UIA 对象。
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let uia: IUIAutomation =
                match CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) {
                    Ok(uia) => uia,
                    Err(_) => {
                        CoUninitialize();
                        return None;
                    }
                };
            let window = uia.ElementFromHandle(HWND(hwnd as *mut _)).ok();
            match window {
                Some(window) => Some(Self { uia, window }),
                None => {
                    CoUninitialize();
                    None
                }
            }
        }
    }

    fn type_condition(&self, id: UIA_CONTROLTYPE_ID) -> Option<IUIAutomationCondition> {
        let value = Variant::i4(id.0);
        // SAFETY: 只读查询。
        unsafe {
            self.uia
                .CreatePropertyCondition(UIA_ControlTypePropertyId, &value.0)
                .ok()
        }
    }

    /// 网页本身（Document）。浏览器的地址栏也是 Edit，只在网页里面找输入框。
    /// 取面积最大的那个：有的网站页面里还嵌着小框架（10-13 实测豆包），取第一个会取错。
    fn document(&self) -> Option<IUIAutomationElement> {
        let condition = self.type_condition(UIA_DocumentControlTypeId)?;
        // SAFETY: 只读查询。
        let all = unsafe { self.window.FindAll(TreeScope_Descendants, &condition) }.ok()?;
        let count = unsafe { all.Length() }.unwrap_or(0);
        (0..count)
            .filter_map(|index| unsafe { all.GetElement(index) }.ok())
            .filter_map(|element| Self::rect(&element).map(|rect| (area(&rect), element)))
            .max_by_key(|(size, _)| *size)
            .map(|(_, element)| element)
    }

    fn rect(element: &IUIAutomationElement) -> Option<RECT> {
        // SAFETY: 只读属性。
        unsafe { element.CurrentBoundingRectangle().ok() }
    }

    fn is_edit(element: &IUIAutomationElement) -> bool {
        // SAFETY: 只读属性。
        unsafe { element.CurrentControlType() }.is_ok_and(|kind| kind == UIA_EditControlTypeId)
    }

    /// 网页里的输入框：焦点正在网页里的某个输入框上就是它；否则取网页里看得见的最大那个。
    fn composer(&self) -> Option<(IUIAutomationElement, bool)> {
        let document = self.document()?;
        let page = Self::rect(&document)?;
        // SAFETY: 只读查询。
        let focused = unsafe { self.uia.GetFocusedElement() }.ok();
        if let Some(focused) = focused {
            if Self::is_edit(&focused)
                && Self::rect(&focused).is_some_and(|r| area(&r) > 0 && center_in(&r, &page))
            {
                return Some((focused, true));
            }
        }
        let condition = self.type_condition(UIA_EditControlTypeId)?;
        // SAFETY: 只读查询。
        let all = unsafe { document.FindAll(TreeScope_Descendants, &condition) }.ok()?;
        let count = unsafe { all.Length() }.unwrap_or(0);
        let mut best: Option<(IUIAutomationElement, i64)> = None;
        for index in 0..count {
            // SAFETY: 下标在 Length 以内；只读属性。
            let Ok(element) = (unsafe { all.GetElement(index) }) else {
                continue;
            };
            let visible = unsafe { element.CurrentIsOffscreen() }.is_ok_and(|off| !off.as_bool())
                && unsafe { element.CurrentIsEnabled() }.is_ok_and(|on| on.as_bool());
            let Some(rect) = Self::rect(&element) else {
                continue;
            };
            let size = area(&rect);
            if visible && size > 0 && best.as_ref().is_none_or(|(_, s)| size > *s) {
                best = Some((element, size));
            }
        }
        best.map(|(element, _)| (element, false))
    }

    /// 让网页里的输入框拿到焦点。返回 true = 此刻焦点就在它上面。
    pub fn focus(&self) -> bool {
        let Some((element, focused)) = self.composer() else {
            return self.focus_in_page();
        };
        if focused {
            return true;
        }
        // SAFETY: 只对输入框设焦点。
        if unsafe { element.SetFocus() }.is_err() {
            return false;
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
        self.composer().is_some_and(|(_, focused)| focused)
    }

    /// 网页里找不到能读的输入框（10-13 实测豆包：编辑区对读屏软件藏起来了）：焦点在网页里就当它在
    /// 输入框上——这类网站自己会把光标放进输入框。之后靠附件卡片、对话里出现的消息来确认，不靠读输入框。
    fn focus_in_page(&self) -> bool {
        let Some(document) = self.document() else {
            return false;
        };
        let Some(page) = Self::rect(&document) else {
            return false;
        };
        // SAFETY: 只读查询。
        let Ok(focused) = (unsafe { self.uia.GetFocusedElement() }) else {
            return false;
        };
        Self::rect(&focused).is_some_and(|r| center_in(&r, &page)) && !Self::is_edit(&focused)
    }

    /// 输入框里此刻的文字（拿不到就是 None）。
    pub fn text(&self) -> Option<String> {
        let (element, _) = self.composer()?;
        // SAFETY: 只读模式接口。
        unsafe {
            if let Ok(value) =
                element.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId)
            {
                if let Ok(text) = value.CurrentValue() {
                    return Some(text.to_string());
                }
            }
            let pattern = element
                .GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId)
                .ok()?;
            Some(pattern.DocumentRange().ok()?.GetText(-1).ok()?.to_string())
        }
    }

    /// 网页上有没有一个名字里带 `needle` 的元素（附件卡片会带文件名）。
    pub fn shows(&self, needle: &str) -> bool {
        let Some(document) = self.document() else {
            return false;
        };
        let value = Variant::bstr(needle);
        // SAFETY: 只读查询。
        unsafe {
            let Ok(condition) = self.uia.CreatePropertyConditionEx(
                UIA_NamePropertyId,
                &value.0,
                PropertyConditionFlags_MatchSubstring,
            ) else {
                return false;
            };
            document
                .FindFirst(TreeScope_Descendants, &condition)
                .is_ok()
        }
    }
}
