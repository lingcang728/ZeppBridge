fn main() {
    // Keep the Windows resource in sync when the master-derived ICO changes.
    println!("cargo:rerun-if-changed=icons/icon.ico");
    tauri_build::build()
}
