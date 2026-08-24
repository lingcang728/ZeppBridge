// Prevents additional console window on Windows in release, DO NOT REMOVE!!
// On macOS, .app bundles have no console window by default.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    zeppbridge_lib::run()
}
