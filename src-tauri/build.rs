fn main() {
    // Keep the Windows resource in sync when the master-derived ICO changes.
    println!("cargo:rerun-if-changed=icons/icon.ico");
    if std::env::var_os("CARGO_FEATURE_STORE").is_some() {
        // The GitHub capability references `updater:default`, which is absent
        // from Store builds by design. Validate only the Store capability set.
        println!("cargo:rerun-if-changed=capabilities/store.json");
        tauri_build::try_build(
            tauri_build::Attributes::new().capabilities_path_pattern("capabilities/store.json"),
        )
        .expect("failed to build the Microsoft Store Tauri configuration");
    } else {
        tauri_build::build();
    }
}
