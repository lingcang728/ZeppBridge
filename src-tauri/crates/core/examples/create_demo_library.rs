//! Creates the schema through real migrations. Never opens an existing library.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = std::path::PathBuf::from(std::env::args().nth(1).ok_or("destination required")?);
    let path = root.join("zepp.db");
    if path.exists() {
        return Err("destination database already exists".into());
    }
    std::fs::create_dir_all(&root)?;
    let _db = zeppbridge_core::storage::Database::open_migrated(&path)?;
    std::fs::write(
        root.join(".demo-library"),
        "Isolated synthetic data. No credentials or watch requests.\n",
    )?;
    println!("Created isolated demo schema in {}", root.display());
    Ok(())
}
