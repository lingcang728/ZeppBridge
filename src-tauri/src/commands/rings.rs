//! 年轮年度回顾（批次 7）：只读的年度汇总，外加把界面画好的分享图存到本机。
//! 图在界面上用 canvas 画、在本机存，原始数据不离开这台电脑。

use super::spawn_independent_read;
use crate::app_state::AppState;
use crate::ipc_error::AppError;
use zeppbridge_core::storage::rings::AnnualRings;

/// 分享图的上限（PNG）。
const IMAGE_MAX_BYTES: usize = 16 * 1024 * 1024;
const PNG_MAGIC: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];

#[tauri::command]
pub async fn annual_rings(state: tauri::State<'_, AppState>) -> Result<AnnualRings, AppError> {
    spawn_independent_read(state.data_dir.clone(), |db| db.annual_rings()).await
}

/// 文件名里不能有的字符去掉；空了就用默认名。
fn clean_stem(file_stem: &str) -> String {
    let stem: String = file_stem
        .chars()
        .filter(|c| !c.is_control() && !r#"\/:*?"<>|"#.contains(*c))
        .take(60)
        .collect();
    let stem = stem.trim().trim_matches('.');
    if stem.is_empty() {
        "zeppbridge-rings".into()
    } else {
        stem.into()
    }
}

/// 存到「图片\ZeppBridge」（没有图片文件夹就放数据目录的 exports），返回完整路径。
#[tauri::command]
pub async fn rings_save_image(
    state: tauri::State<'_, AppState>,
    file_stem: String,
    png: Vec<u8>,
) -> Result<String, AppError> {
    let failed = || AppError::new("err.rings.save", "年轮图片没存下来");
    if png.len() > IMAGE_MAX_BYTES || !png.starts_with(&PNG_MAGIC) {
        return Err(failed());
    }
    let root = directories::UserDirs::new()
        .and_then(|dirs| dirs.picture_dir().map(|path| path.join("ZeppBridge")))
        .unwrap_or_else(|| state.data_dir.join("exports").join("rings"));
    let path = root.join(format!("{}.png", clean_stem(&file_stem)));
    std::fs::create_dir_all(&root).map_err(|_| failed())?;
    std::fs::write(&path, png).map_err(|_| failed())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::clean_stem;

    #[test]
    fn file_names_cannot_escape_the_pictures_folder() {
        assert_eq!(clean_stem(r"..\..\年轮 2025"), "年轮 2025");
        assert_eq!(clean_stem("a/b:c"), "abc");
        assert_eq!(clean_stem("  "), "zeppbridge-rings");
    }
}
