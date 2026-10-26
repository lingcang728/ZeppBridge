// Prevents additional console window on Windows in release, DO NOT REMOVE!!
// On macOS, .app bundles have no console window by default.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 卸载程序勾了「删除应用数据」时调这一次，删完令牌就退出，不起界面（uninstall.rs）。
    if std::env::args().any(|arg| arg == zeppbridge_lib::PURGE_CREDENTIALS_ARG) {
        zeppbridge_lib::purge_credentials_for_uninstall();
        return;
    }
    zeppbridge_lib::run()
}
