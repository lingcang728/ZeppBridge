// Prevents additional console window on Windows in release, DO NOT REMOVE!!
// On macOS, .app bundles have no console window by default.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 卸载程序勾了「删除应用数据」时调这一次，删完令牌就退出，不起界面（uninstall.rs）。
    if std::env::args().any(|arg| arg == zeppbridge_lib::PURGE_CREDENTIALS_ARG) {
        zeppbridge_lib::purge_credentials_for_uninstall();
        return;
    }
    // 跑后打分通知上的按钮：只写下打分就退出，不起界面（feedback_toast.rs）。
    if let Some(link) = std::env::args()
        .find(|arg| arg.starts_with(zeppbridge_lib::feedback_toast::FEEDBACK_LINK_PREFIX))
    {
        zeppbridge_lib::feedback_toast::handle_feedback_link(&link);
        return;
    }
    zeppbridge_lib::run()
}
