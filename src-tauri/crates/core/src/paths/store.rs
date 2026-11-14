//! Windows Store package data locations and the explicit first-run import.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
// Only the Windows exclusive-handle copy and the Store LocalState checks open
// files directly; on Linux/macOS these would be unused imports (clippy -D warnings).
#[cfg(windows)]
use std::fs::{File, OpenOptions};
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const SQLITE_GROUP: [&str; 3] = ["zepp.db", "zepp.db-wal", "zepp.db-shm"];
const IGNORABLE_DESTINATION_ENTRIES: [&str; 3] = ["logs", "webview", ".write-probe"];
const PRIVATE_IMPORT_ENTRIES: [&str; 5] = [
    "auth.json",
    "auth.user-id",
    "credentials.json",
    "local-api.json",
    "official.json",
];
const IMPORT_JOURNAL: &str = ".store-import-journal.json";
const IMPORT_STAGE_PREFIX: &str = ".store-import-";
const STORE_PACKAGE_FAMILY_NAME: &str = "LincStudio.ZeppBridge_pwftgd5x5w3va";
#[cfg(all(windows, feature = "store"))]
const STORE_PACKAGE_NAME: &str = "LincStudio.ZeppBridge";
#[cfg(all(windows, feature = "store"))]
const STORE_PACKAGE_PUBLISHER_ID: &str = "pwftgd5x5w3va";
#[cfg(all(windows, feature = "store"))]
const IO_REPARSE_TAG_MOUNT_POINT: u32 = 0xA000_0003;
const RUNTIME_ENTRIES: [&str; 7] = [
    "logs",
    "webview",
    ".write-probe",
    "zepp.db.write-lock",
    "zepp.db.write-lock.holder",
    "zepp.db.sync-lock",
    "zepp.db.sync-lock.holder",
];

/// Resolve the Store package's private local state directory from its runtime
/// package family name. This works for the full-trust app and its execution
/// alias child processes, including the CLI and MCP sidecars.
pub fn package_local_data_dir() -> io::Result<Option<PathBuf>> {
    let Some(family) = current_package_family_name()? else {
        return Ok(None);
    };
    if !family.eq_ignore_ascii_case(STORE_PACKAGE_FAMILY_NAME) {
        return Ok(None);
    }
    #[cfg(all(windows, feature = "store"))]
    {
        let local_app_data = known_local_app_data()?;
        return Ok(Some(
            local_app_data
                .join("Packages")
                .join(family)
                .join("LocalState/ZeppBridge/data"),
        ));
    }
    #[allow(unreachable_code)]
    Ok(None)
}

fn current_package_family_name() -> io::Result<Option<String>> {
    #[cfg(all(windows, feature = "store"))]
    {
        use windows_sys::Win32::Foundation::{
            APPMODEL_ERROR_NO_PACKAGE, ERROR_INSUFFICIENT_BUFFER, ERROR_SUCCESS,
        };
        use windows_sys::Win32::Storage::Packaging::Appx::GetCurrentPackageFamilyName;

        let mut length = 0u32;
        let first = unsafe { GetCurrentPackageFamilyName(&mut length, std::ptr::null_mut()) };
        if first == APPMODEL_ERROR_NO_PACKAGE {
            return Ok(None);
        }
        if first != ERROR_INSUFFICIENT_BUFFER || length == 0 {
            return Err(io::Error::other(format!(
                "GetCurrentPackageFamilyName failed with Win32 error {first}"
            )));
        }

        let mut family = vec![0u16; length as usize];
        let result = unsafe { GetCurrentPackageFamilyName(&mut length, family.as_mut_ptr()) };
        if result != ERROR_SUCCESS || length == 0 {
            return Err(io::Error::other(format!(
                "GetCurrentPackageFamilyName failed with Win32 error {result}"
            )));
        }
        let family = String::from_utf16_lossy(&family[..length.saturating_sub(1) as usize]);
        return Ok(Some(family));
    }

    #[allow(unreachable_code)]
    Ok(None)
}

/// Locate the exact Store package registered for this user, then let Windows
/// resolve its package-volume path. `InstallLocation` can be a C: path whose
/// package directory is a Windows-managed junction to a secondary volume.
#[cfg(all(windows, feature = "store"))]
fn registered_store_package_install_path() -> io::Result<(PathBuf, String)> {
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, ERROR_SUCCESS};
    use windows_sys::Win32::Storage::Packaging::Appx::{
        GetPackagePathByFullName, GetPackagesByPackageFamily,
    };

    let runtime_full_name = current_store_package_full_name()?;
    let family: Vec<u16> = STORE_PACKAGE_FAMILY_NAME
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

    let mut count = 0u32;
    let mut buffer_length = 0u32;
    let first = unsafe {
        GetPackagesByPackageFamily(
            family.as_ptr(),
            &mut count,
            std::ptr::null_mut(),
            &mut buffer_length,
            std::ptr::null_mut(),
        )
    };
    if !matches!(first, ERROR_INSUFFICIENT_BUFFER | ERROR_SUCCESS) {
        return Err(io::Error::from_raw_os_error(first as i32));
    }
    if count == 0 || buffer_length == 0 {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            "the ZeppBridge Store package is not registered for this Windows user",
        ));
    }

    let mut names = vec![std::ptr::null_mut(); count as usize];
    let mut name_buffer = vec![0u16; buffer_length as usize];
    let listed = unsafe {
        GetPackagesByPackageFamily(
            family.as_ptr(),
            &mut count,
            names.as_mut_ptr(),
            &mut buffer_length,
            name_buffer.as_mut_ptr(),
        )
    };
    if listed != ERROR_SUCCESS {
        return Err(io::Error::from_raw_os_error(listed as i32));
    }

    let mut matching_names = Vec::new();
    for pointer in names.into_iter().take(count as usize) {
        if pointer.is_null() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Windows returned an empty Store package name",
            ));
        }
        let mut length = 0usize;
        unsafe {
            while *pointer.add(length) != 0 {
                length += 1;
            }
            let name = String::from_utf16_lossy(std::slice::from_raw_parts(pointer, length));
            matching_names.push(name);
        }
    }
    let selected = select_registered_store_package(&matching_names, runtime_full_name.as_deref())?;
    let full_name: Vec<u16> = selected.encode_utf16().chain(std::iter::once(0)).collect();
    let mut path_length = 0u32;
    let first = unsafe {
        GetPackagePathByFullName(full_name.as_ptr(), &mut path_length, std::ptr::null_mut())
    };
    if first != ERROR_INSUFFICIENT_BUFFER || path_length == 0 {
        return Err(io::Error::from_raw_os_error(first as i32));
    }
    let mut path = vec![0u16; path_length as usize];
    let result = unsafe {
        GetPackagePathByFullName(full_name.as_ptr(), &mut path_length, path.as_mut_ptr())
    };
    if result != ERROR_SUCCESS || path_length == 0 {
        return Err(io::Error::from_raw_os_error(result as i32));
    }
    let end = path
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(path.len());
    Ok((
        PathBuf::from(std::ffi::OsString::from_wide(&path[..end])),
        selected,
    ))
}

#[cfg(all(windows, feature = "store"))]
fn store_package_architecture() -> io::Result<&'static str> {
    let architecture = match std::env::consts::ARCH {
        "x86_64" => "x64",
        "x86" => "x86",
        "aarch64" => "arm64",
        other => {
            return Err(io::Error::new(
                io::ErrorKind::Unsupported,
                format!("unsupported Store package architecture: {other}"),
            ));
        }
    };
    Ok(architecture)
}

/// Package deployment versions can differ from the application's Cargo version;
/// the Store can also assign the fourth version component. Never synthesize one.
#[cfg(all(windows, feature = "store"))]
fn current_store_package_full_name() -> io::Result<Option<String>> {
    use windows_sys::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, ERROR_SUCCESS};
    use windows_sys::Win32::Storage::Packaging::Appx::GetCurrentPackageFullName;

    if !current_package_family_name()?
        .is_some_and(|family| family.eq_ignore_ascii_case(STORE_PACKAGE_FAMILY_NAME))
    {
        // CLI/MCP launched outside this package must query the current user's
        // registration, not adopt their launching client's package identity.
        return Ok(None);
    }
    let mut length = 0;
    let first = unsafe { GetCurrentPackageFullName(&mut length, std::ptr::null_mut()) };
    if first != ERROR_INSUFFICIENT_BUFFER || length == 0 {
        return Err(io::Error::other(format!(
            "GetCurrentPackageFullName failed: {first}"
        )));
    }
    let mut buffer = vec![0u16; length as usize];
    let result = unsafe { GetCurrentPackageFullName(&mut length, buffer.as_mut_ptr()) };
    if result != ERROR_SUCCESS || length == 0 {
        return Err(io::Error::other(format!(
            "GetCurrentPackageFullName failed: {result}"
        )));
    }
    String::from_utf16(&buffer[..length.saturating_sub(1) as usize])
        .map(Some)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

#[cfg(all(windows, feature = "store"))]
fn select_registered_store_package(
    names: &[String],
    runtime_name: Option<&str>,
) -> io::Result<String> {
    let architecture = store_package_architecture()?;
    let matches_identity = |name: &str| {
        let fields: Vec<_> = name.split('_').collect();
        if fields.len() != 5
            || !fields[0].eq_ignore_ascii_case(STORE_PACKAGE_NAME)
            || !fields[2].eq_ignore_ascii_case(architecture)
            || !fields[3].is_empty()
            || !fields[4].eq_ignore_ascii_case(STORE_PACKAGE_PUBLISHER_ID)
        {
            return false;
        }
        let version: Vec<_> = fields[1].split('.').collect();
        version.len() == 4
            && version.iter().all(|part| {
                !part.is_empty()
                    && part.bytes().all(|byte| byte.is_ascii_digit())
                    && part.parse::<u16>().is_ok()
            })
            && version[0].parse::<u16>().is_ok_and(|major| major > 0)
    };
    let candidates: Vec<_> = names
        .iter()
        .filter(|name| {
            matches_identity(name)
                && runtime_name.is_none_or(|runtime| name.eq_ignore_ascii_case(runtime))
        })
        .collect();
    if candidates.len() != 1 {
        return Err(io::Error::new(io::ErrorKind::PermissionDenied,
            format!("expected one registered Store main package matching the runtime identity and architecture, found {}", candidates.len())));
    }
    Ok(candidates[0].clone())
}

#[cfg(all(windows, feature = "store"))]
fn current_user_sid() -> io::Result<String> {
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_INSUFFICIENT_BUFFER};
    use windows_sys::Win32::Security::{GetTokenInformation, TokenUser, TOKEN_QUERY, TOKEN_USER};
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    let mut token = std::ptr::null_mut();
    if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) } == 0 {
        return Err(io::Error::last_os_error());
    }
    let result = (|| {
        let mut required = 0u32;
        let first = unsafe {
            GetTokenInformation(token, TokenUser, std::ptr::null_mut(), 0, &mut required)
        };
        if first != 0 || required == 0 || unsafe { GetLastError() } != ERROR_INSUFFICIENT_BUFFER {
            return Err(io::Error::last_os_error());
        }
        let word_count = (required as usize).div_ceil(std::mem::size_of::<usize>());
        let mut buffer = vec![0usize; word_count];
        let read = unsafe {
            GetTokenInformation(
                token,
                TokenUser,
                buffer.as_mut_ptr().cast(),
                required,
                &mut required,
            )
        };
        if read == 0 {
            return Err(io::Error::last_os_error());
        }
        let user = unsafe { &*buffer.as_ptr().cast::<TOKEN_USER>() };
        sid_to_string(user.User.Sid.cast())
    })();
    unsafe {
        CloseHandle(token);
    }
    result
}

#[cfg(all(windows, feature = "store"))]
fn sid_to_string(sid: *const u8) -> io::Result<String> {
    if sid.is_null() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "the current Windows token has no user SID",
        ));
    }
    let revision = unsafe { *sid };
    let sub_authority_count = unsafe { *sid.add(1) } as usize;
    if sub_authority_count > 15 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "the current Windows token has an invalid user SID",
        ));
    }
    let mut identifier_authority = 0u64;
    for offset in 0..6 {
        identifier_authority = (identifier_authority << 8) | unsafe { *sid.add(2 + offset) } as u64;
    }
    let mut value = format!("S-{revision}-{identifier_authority}");
    for index in 0..sub_authority_count {
        let offset = 8 + index * 4;
        let bytes = unsafe {
            [
                *sid.add(offset),
                *sid.add(offset + 1),
                *sid.add(offset + 2),
                *sid.add(offset + 3),
            ]
        };
        value.push('-');
        value.push_str(&u32::from_le_bytes(bytes).to_string());
    }
    Ok(value)
}

pub fn current_package_identity_mismatch() -> io::Result<Option<String>> {
    let Some(family) = current_package_family_name()? else {
        return Ok(None);
    };
    Ok((!family.eq_ignore_ascii_case(STORE_PACKAGE_FAMILY_NAME)).then_some(family))
}

#[derive(Debug, Serialize, Deserialize)]
struct StoreImportJournal {
    stage: String,
    entries: Vec<String>,
}

fn validate_journal_entry_name(name: &str) -> io::Result<()> {
    let path = Path::new(name);
    if name.is_empty()
        || name == "."
        || name == ".."
        || path.components().count() != 1
        || path.file_name().and_then(|value| value.to_str()) != Some(name)
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("invalid Store import journal entry: {name:?}"),
        ));
    }
    Ok(())
}

fn is_generated_import_stage_name(name: &str) -> bool {
    let Some(suffix) = name.strip_prefix(IMPORT_STAGE_PREFIX) else {
        return false;
    };
    let mut parts = suffix.split('-');
    let is_digits = |value: Option<&str>| {
        value.is_some_and(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit()))
    };
    is_digits(parts.next())
        && is_digits(parts.next())
        && is_digits(parts.next())
        && parts.next().is_none()
}

fn backup_sqlite_snapshot(source: &Path, destination: &Path) -> io::Result<()> {
    #[cfg(windows)]
    {
        let parent = destination
            .parent()
            .ok_or_else(|| io::Error::other("Store database snapshot has no parent"))?;
        let local_source = parent.join(format!(
            ".sqlite-source-{}-{}",
            std::process::id(),
            crate::unique_suffix()
        ));
        std::fs::create_dir(&local_source)?;
        match copy_quiescent_source(source, &local_source) {
            Ok(true) => {
                let result = backup_sqlite_file(
                    &local_source.join(SQLITE_GROUP[0]),
                    destination,
                    rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE,
                );
                remove_tree_without_reparse(&local_source)?;
                result
            }
            Ok(false) => {
                remove_tree_without_reparse(&local_source)?;
                Err(io::Error::new(
                    io::ErrorKind::WouldBlock,
                    "the GitHub data folder is in use. Close ZeppBridge and any program using its data folder, then retry the import; the source files were not changed",
                ))
            }
            Err(error) => {
                let _ = remove_tree_without_reparse(&local_source);
                Err(error)
            }
        }
    }

    // Non-Windows hosts use this only in isolated tests; the Store product is
    // Windows-only and uses the exclusive-handle copy above.
    #[cfg(not(windows))]
    backup_sqlite_file(
        source,
        destination,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
}

fn backup_sqlite_file(
    source: &Path,
    destination: &Path,
    source_flags: rusqlite::OpenFlags,
) -> io::Result<()> {
    use rusqlite::backup::StepResult;

    let source_db = Connection::open_with_flags(source, source_flags)
        .map_err(|error| io::Error::other(format!("open SQLite backup source: {error}")))?;
    let mut destination_db = Connection::open(destination)
        .map_err(|error| io::Error::other(format!("create Store database snapshot: {error}")))?;
    let backup = rusqlite::backup::Backup::new(&source_db, &mut destination_db)
        .map_err(|error| io::Error::other(format!("start SQLite online backup: {error}")))?;
    let started = Instant::now();
    loop {
        match backup
            .step(128)
            .map_err(|error| io::Error::other(format!("copy SQLite snapshot: {error}")))?
        {
            StepResult::Done => break,
            StepResult::More => {}
            StepResult::Busy | StepResult::Locked => std::thread::sleep(Duration::from_millis(50)),
            _ => {
                return Err(io::Error::other(
                    "SQLite online backup returned an unsupported step result",
                ));
            }
        }
        if started.elapsed() >= Duration::from_secs(300) {
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "SQLite online backup did not complete within five minutes",
            ));
        }
    }
    drop(backup);
    let check: String = destination_db
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| io::Error::other(format!("verify SQLite snapshot: {error}")))?;
    if check != "ok" {
        return Err(io::Error::other(format!(
            "SQLite snapshot integrity check failed: {check}"
        )));
    }
    Ok(())
}

/// When no SQLite connection has the source open, hold read-only exclusive
/// Windows handles while copying the main/WAL files into this private staging
/// directory. This keeps SQLite from creating temporary sidecars in a closed
/// user's source folder. An active process causes the share-mode open to fail,
/// in which case the caller returns a retryable error without touching source files.
#[cfg(windows)]
fn copy_quiescent_source(source: &Path, destination: &Path) -> io::Result<bool> {
    use std::os::windows::fs::OpenOptionsExt;

    let Some(name) = source.file_name().and_then(|value| value.to_str()) else {
        return Ok(false);
    };
    let names = [name, "zepp.db-wal", "zepp.db-shm"];
    let mut files: Vec<(&str, File)> = Vec::new();
    for name in names {
        let path = source
            .parent()
            .ok_or_else(|| io::Error::other("GitHub database has no parent"))?
            .join(name);
        let metadata = match std::fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == io::ErrorKind::NotFound && name != SQLITE_GROUP[0] => {
                continue;
            }
            Err(_) => return Ok(false),
        };
        if is_reparse_point(&metadata) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("SQLite source entry is a reparse point: {}", path.display()),
            ));
        }
        let file = match OpenOptions::new().read(true).share_mode(0).open(&path) {
            Ok(file) => file,
            Err(_) => return Ok(false),
        };
        files.push((name, file));
    }
    if !files.iter().any(|(name, _)| *name == SQLITE_GROUP[0]) {
        return Ok(false);
    }

    for (name, mut source_file) in files {
        let mut destination_file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(destination.join(name))?;
        io::copy(&mut source_file, &mut destination_file)?;
        destination_file.sync_all()?;
    }
    Ok(true)
}

#[cfg(all(windows, feature = "store"))]
fn known_local_app_data() -> io::Result<PathBuf> {
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::System::Com::CoTaskMemFree;
    use windows_sys::Win32::UI::Shell::{FOLDERID_LocalAppData, SHGetKnownFolderPath};

    let mut raw = std::ptr::null_mut();
    let result =
        unsafe { SHGetKnownFolderPath(&FOLDERID_LocalAppData, 0, std::ptr::null_mut(), &mut raw) };
    if result < 0 || raw.is_null() {
        return Err(io::Error::from_raw_os_error(result));
    }
    let mut length = 0usize;
    unsafe {
        while *raw.add(length) != 0 {
            length += 1;
        }
    }
    let path = unsafe { std::ffi::OsString::from_wide(std::slice::from_raw_parts(raw, length)) };
    unsafe { CoTaskMemFree(raw.cast()) };
    Ok(PathBuf::from(path))
}

#[cfg(all(windows, feature = "store"))]
#[derive(Debug, Clone, PartialEq, Eq)]
struct VerifiedStoreLocalState {
    logical: PathBuf,
    physical: PathBuf,
}

#[cfg(all(windows, feature = "store"))]
fn verified_store_local_state(data_dir: &Path) -> io::Result<Option<VerifiedStoreLocalState>> {
    if !is_store_local_state_data_dir(data_dir)? {
        return Ok(None);
    }
    let logical = known_local_app_data()?
        .join("Packages")
        .join(STORE_PACKAGE_FAMILY_NAME)
        .join("LocalState");
    let physical = validate_package_local_state_target(&logical)?;
    Ok(Some(VerifiedStoreLocalState { logical, physical }))
}

#[cfg(not(all(windows, feature = "store")))]
#[derive(Debug, Clone, PartialEq, Eq)]
struct VerifiedStoreLocalState {
    logical: PathBuf,
    physical: PathBuf,
}

#[cfg(not(all(windows, feature = "store")))]
fn verified_store_local_state(_data_dir: &Path) -> io::Result<Option<VerifiedStoreLocalState>> {
    Ok(None)
}

#[cfg(all(windows, feature = "store"))]
fn validate_package_local_state_target(local_state: &Path) -> io::Result<PathBuf> {
    use windows_sys::Win32::Storage::FileSystem::{VOLUME_NAME_DOS, VOLUME_NAME_GUID};

    // Windows keeps LocalState under the documented per-user Packages path,
    // but for an Appx package on a secondary volume it junctions that one leaf
    // into WpSystem on the package volume. Resolve both handles before allowing
    // that exact SID/PFN path; callers still reject every other reparse point.
    let (package_path, package_full_name) = registered_store_package_install_path()?;
    let package_final = final_path_for_path(&package_path, true, VOLUME_NAME_GUID)?;
    if !is_expected_package_install_path(&package_final, &package_full_name) {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            format!(
                "registered Store package resolved outside its WindowsApps package directory: {}",
                package_final.display()
            ),
        ));
    }
    let package_volume = volume_guid_prefix(&package_final).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            "Windows did not return a volume-GUID package path",
        )
    })?;

    let user_sid = current_user_sid()?;
    let reparse_tag = reparse_tag(local_state)?;
    let physical = final_path_for_path(local_state, true, VOLUME_NAME_GUID)?;
    let local_state_volume = volume_guid_prefix(&physical).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            "Windows did not return a volume-GUID LocalState path",
        )
    })?;
    if local_state_volume != package_volume {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            format!(
                "Store LocalState volume {local_state_volume} does not match registered package volume {package_volume}"
            ),
        ));
    }

    match reparse_tag {
        Some(IO_REPARSE_TAG_MOUNT_POINT) => {
            if !is_managed_local_state_junction(
                &physical,
                IO_REPARSE_TAG_MOUNT_POINT,
                &user_sid,
                STORE_PACKAGE_FAMILY_NAME,
                &package_volume,
            ) {
                return Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    format!(
                        "Store LocalState junction does not target this user's registered package storage: {}",
                        physical.display()
                    ),
                ));
            }
        }
        Some(tag) => {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                format!(
                    "Store LocalState uses an unapproved reparse tag 0x{tag:08x}: {}",
                    local_state.display()
                ),
            ));
        }
        None => {
            let physical_dos = final_path_for_path(local_state, true, VOLUME_NAME_DOS)?;
            if normalize_win32_path(&physical_dos) != normalize_win32_path(local_state) {
                return Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    format!(
                        "Store LocalState resolved to an unexpected path: requested {}, opened {}",
                        local_state.display(),
                        physical_dos.display()
                    ),
                ));
            }
        }
    }
    Ok(physical)
}

#[cfg(all(windows, feature = "store"))]
fn final_path_for_path(path: &Path, follow_reparse: bool, name_flags: u32) -> io::Result<PathBuf> {
    use std::os::windows::fs::OpenOptionsExt;
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_READ_ATTRIBUTES,
    };

    let mut flags = FILE_FLAG_BACKUP_SEMANTICS;
    if !follow_reparse {
        flags |= FILE_FLAG_OPEN_REPARSE_POINT;
    }
    let file = OpenOptions::new()
        .access_mode(FILE_READ_ATTRIBUTES)
        .custom_flags(flags)
        .open(path)?;
    final_path_from_handle(file.as_raw_handle() as HANDLE, name_flags)
}

#[cfg(all(windows, feature = "store"))]
fn final_path_from_handle(
    handle: windows_sys::Win32::Foundation::HANDLE,
    name_flags: u32,
) -> io::Result<PathBuf> {
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::Storage::FileSystem::GetFinalPathNameByHandleW;

    let mut buffer = vec![0u16; 32_768];
    let length = unsafe {
        GetFinalPathNameByHandleW(handle, buffer.as_mut_ptr(), buffer.len() as u32, name_flags)
    };
    if length == 0 {
        return Err(io::Error::last_os_error());
    }
    if length >= buffer.len() as u32 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "final package path is longer than the Windows API buffer",
        ));
    }
    Ok(PathBuf::from(std::ffi::OsString::from_wide(
        &buffer[..length as usize],
    )))
}

#[cfg(all(windows, feature = "store"))]
fn reparse_tag(path: &Path) -> io::Result<Option<u32>> {
    use std::os::windows::fs::OpenOptionsExt;
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::Storage::FileSystem::{
        FileAttributeTagInfo, GetFileInformationByHandleEx, FILE_ATTRIBUTE_REPARSE_POINT,
        FILE_ATTRIBUTE_TAG_INFO, FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT,
        FILE_READ_ATTRIBUTES,
    };

    let file = OpenOptions::new()
        .access_mode(FILE_READ_ATTRIBUTES)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)?;
    let mut info = FILE_ATTRIBUTE_TAG_INFO::default();
    let result = unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle() as HANDLE,
            FileAttributeTagInfo,
            (&mut info as *mut FILE_ATTRIBUTE_TAG_INFO).cast(),
            std::mem::size_of::<FILE_ATTRIBUTE_TAG_INFO>() as u32,
        )
    };
    if result == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok((info.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0).then_some(info.ReparseTag))
}

#[cfg(all(windows, feature = "store"))]
fn volume_guid_prefix(path: &Path) -> Option<String> {
    let normalized = normalize_win32_path(path);
    if !normalized.starts_with("volume{") {
        return None;
    }
    let end = normalized.find('}')?;
    Some(normalized[..=end].to_string())
}

#[cfg(all(windows, feature = "store"))]
fn is_expected_package_install_path(path: &Path, full_name: &str) -> bool {
    let Some(volume) = volume_guid_prefix(path) else {
        return false;
    };
    let normalized = normalize_win32_path(path);
    let expected_tail = format!("{volume}\\windowsapps\\{}", full_name.to_ascii_lowercase());
    normalized == expected_tail
}

#[cfg(all(windows, feature = "store"))]
fn is_managed_local_state_junction(
    target: &Path,
    tag: u32,
    user_sid: &str,
    family: &str,
    package_volume: &str,
) -> bool {
    if tag != IO_REPARSE_TAG_MOUNT_POINT
        || volume_guid_prefix(target).as_deref() != Some(package_volume)
    {
        return false;
    }
    let normalized = normalize_win32_path(target);
    let expected = format!(
        "{package_volume}\\wpsystem\\{}\\appdata\\local\\packages\\{}\\localstate",
        user_sid.to_ascii_lowercase(),
        family.to_ascii_lowercase()
    );
    normalized == expected
}

#[cfg(all(windows, feature = "store"))]
fn verify_package_local_state_handle(
    data_dir: &Path,
    verified_local_state: Option<&VerifiedStoreLocalState>,
) -> io::Result<()> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::Storage::FileSystem::{
        GetFinalPathNameByHandleW, VOLUME_NAME_DOS, VOLUME_NAME_GUID,
    };

    let probe = data_dir.join(".write-probe");
    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .create_new(true)
        .open(&probe)?;
    use std::io::Write as _;
    file.write_all(b"ok")?;

    let flags = if verified_local_state.is_some() {
        VOLUME_NAME_GUID
    } else {
        VOLUME_NAME_DOS
    };
    let handle = file.as_raw_handle() as HANDLE;
    let mut buffer = vec![0u16; 32_768];
    let length = unsafe {
        GetFinalPathNameByHandleW(handle, buffer.as_mut_ptr(), buffer.len() as u32, flags)
    };
    let result = if length == 0 {
        Err(io::Error::last_os_error())
    } else if length >= buffer.len() as u32 {
        Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "final LocalState path is longer than the Windows API buffer",
        ))
    } else {
        use std::os::windows::ffi::OsStringExt;
        let actual = PathBuf::from(std::ffi::OsString::from_wide(&buffer[..length as usize]));
        let expected = if let Some(route) = verified_local_state {
            route
                .physical
                .join("ZeppBridge")
                .join("data")
                .join(".write-probe")
        } else {
            probe.clone()
        };
        if normalize_win32_path(&actual) == normalize_win32_path(&expected) {
            Ok(())
        } else {
            Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                format!(
                    "Store LocalState resolved to an unexpected physical path: expected {}, opened {}",
                    expected.display(),
                    actual.display()
                ),
            ))
        }
    };
    drop(file);
    let _ = std::fs::remove_file(&probe);
    result
}

#[cfg(not(all(windows, feature = "store")))]
fn verify_package_local_state_handle(
    _data_dir: &Path,
    _verified_local_state: Option<&VerifiedStoreLocalState>,
) -> io::Result<()> {
    Ok(())
}

#[cfg(all(windows, feature = "store"))]
fn normalize_win32_path(path: &Path) -> String {
    let value = path.to_string_lossy().replace('/', "\\");
    value
        .strip_prefix("\\\\?\\")
        .unwrap_or(&value)
        .trim_end_matches('\\')
        .to_ascii_lowercase()
}

/// Prepare the package's data directory for the desktop first-run prompt.
///
/// Sidecars must use [`super::resolve_data_dir`] instead; it refuses to create
/// a new library until the desktop process records an import/skip choice.
pub fn prepare_package_local_data_dir() -> io::Result<Option<PathBuf>> {
    let Some(data_dir) = package_local_data_dir()? else {
        return Ok(None);
    };
    prepare_store_data_dir(&data_dir)?;
    Ok(Some(data_dir))
}

fn prepare_store_data_dir(data_dir: &Path) -> io::Result<()> {
    // Validate the Windows-managed LocalState junction before following it to
    // create app folders, then repeat after creation to catch path replacement.
    let route_before = verified_store_local_state(data_dir)?;
    reject_reparse_ancestors(
        data_dir,
        route_before.as_ref().map(|route| route.logical.as_path()),
    )?;
    std::fs::create_dir_all(data_dir)?;
    let route_after = verified_store_local_state(data_dir)?;
    if route_before != route_after {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "Store LocalState changed while preparing its data directory",
        ));
    }
    reject_reparse_ancestors(
        data_dir,
        route_after.as_ref().map(|route| route.logical.as_path()),
    )?;
    remove_stale_store_path_probe(data_dir)?;
    verify_package_local_state_handle(data_dir, route_after.as_ref())?;
    let database = data_dir.join(SQLITE_GROUP[0]);
    match std::fs::symlink_metadata(&database) {
        Ok(metadata) if is_reparse_point(&metadata) => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "the Store database cannot be a symbolic link, junction, or other reparse point",
            ));
        }
        Ok(metadata) if !metadata.is_file() => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "the Store database path is not a regular file",
            ));
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    recover_interrupted_store_import(data_dir)?;
    Ok(())
}

/// A Store MCP host may start its WindowsApps alias without package identity.
/// Its generated configuration supplies this package LocalState path instead.
pub fn prepare_configured_store_data_dir(data_dir: &Path) -> io::Result<bool> {
    if let Some(family) = current_package_family_name()? {
        if !family.eq_ignore_ascii_case(STORE_PACKAGE_FAMILY_NAME) {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                format!("Store data path validation refused package family {family}"),
            ));
        }
    }
    if !is_store_local_state_data_dir(data_dir)? {
        return Ok(false);
    }
    prepare_store_data_dir(data_dir)?;
    Ok(true)
}

/// Detect a Store alias process whose package identity was not propagated. Such
/// a process must not fall through and create a library beside WindowsApps.
pub fn current_executable_is_windows_apps_alias() -> bool {
    #[cfg(all(windows, feature = "store"))]
    {
        return std::env::current_exe().is_ok_and(|path| is_windows_apps_path(&path));
    }
    #[allow(unreachable_code)]
    false
}

#[cfg(all(windows, feature = "store"))]
fn is_windows_apps_path(path: &Path) -> bool {
    path.components().any(|component| {
        component
            .as_os_str()
            .to_string_lossy()
            .eq_ignore_ascii_case("WindowsApps")
    })
}

fn is_store_local_state_data_dir(_data_dir: &Path) -> io::Result<bool> {
    #[cfg(all(windows, feature = "store"))]
    {
        let expected = known_local_app_data()?
            .join("Packages")
            .join(STORE_PACKAGE_FAMILY_NAME)
            .join("LocalState/ZeppBridge/data");
        let candidate = normalize_win32_path(_data_dir);
        return Ok(candidate == normalize_win32_path(&expected));
    }
    #[allow(unreachable_code)]
    Ok(false)
}

/// Resolve the real WindowsApps alias directory through the Known Folder API,
/// not the package process's potentially redirected `LOCALAPPDATA` string.
#[cfg(all(windows, feature = "store"))]
pub fn windows_apps_alias_dir() -> io::Result<PathBuf> {
    known_local_app_data().map(|path| path.join("Microsoft").join("WindowsApps"))
}

#[cfg(not(all(windows, feature = "store")))]
pub fn windows_apps_alias_dir() -> io::Result<PathBuf> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "WindowsApps execution aliases are only available to a Windows Store build",
    ))
}

/// Whether the desktop app must ask before initializing this Store library.
pub fn store_import_required(data_dir: &Path) -> bool {
    !data_dir.join(SQLITE_GROUP[0]).is_file() && !store_import_reviewed(data_dir)
}

/// Shared CLI/MCP gate: do not initialize an empty Store database before the
/// desktop app records an import/skip choice.
pub fn require_store_import_decision(data_dir: &Path) -> io::Result<()> {
    if store_import_required(data_dir) {
        return Err(io::Error::new(
            io::ErrorKind::WouldBlock,
            "Store first run is waiting for a data choice. Open ZeppBridge from the Start menu and choose whether to import the GitHub library.",
        ));
    }
    Ok(())
}

/// Roll back a partially published import, or finish cleanup after its commit
/// marker was published. The GitHub source remains untouched in either case.
pub fn recover_interrupted_store_import(data_dir: &Path) -> io::Result<()> {
    let parent = data_dir
        .parent()
        .ok_or_else(|| io::Error::other("Store data directory has no parent"))?;
    let journal_path = parent.join(IMPORT_JOURNAL);
    let journal_exists = match std::fs::symlink_metadata(&journal_path) {
        Ok(metadata) if is_reparse_point(&metadata) || !metadata.is_file() => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Store import journal is not a regular file",
            ));
        }
        Ok(_) => true,
        Err(error) if error.kind() == io::ErrorKind::NotFound => false,
        Err(error) => return Err(error),
    };
    if !journal_exists {
        remove_orphan_import_stages(parent)?;
        if data_dir.join(SQLITE_GROUP[0]).is_file() || store_import_reviewed(data_dir) {
            remove_abandoned_review_marker_temps(data_dir)?;
        }
        return Ok(());
    }

    let bytes = std::fs::read(&journal_path)?;
    let journal: StoreImportJournal = serde_json::from_slice(&bytes).map_err(|error| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            format!("Store import recovery journal is invalid: {error}"),
        )
    })?;
    let stage_name = Path::new(&journal.stage)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "invalid Store import stage"))?;
    if journal.stage != stage_name || !is_generated_import_stage_name(stage_name) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "invalid Store import stage",
        ));
    }
    let stage = parent.join(stage_name);
    if stage.parent() != Some(parent) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Store import stage escaped its parent directory",
        ));
    }
    let stage_exists = match std::fs::symlink_metadata(&stage) {
        Ok(metadata) if !is_reparse_point(&metadata) && metadata.is_dir() => true,
        Ok(_) => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Store import stage is not a normal directory",
            ));
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => false,
        Err(error) => return Err(error),
    };
    for name in &journal.entries {
        validate_journal_entry_name(name)?;
    }

    let database_was_staged = journal.entries.iter().any(|name| name == SQLITE_GROUP[0]);
    let database_is_published = data_dir.join(SQLITE_GROUP[0]).is_file();
    if database_was_staged && database_is_published {
        // The database rename is the commit point. Marker creation and cleanup
        // may have been interrupted, but the imported database is already safe.
        let _ = mark_store_import_reviewed(data_dir);
        if stage_exists {
            for entry in std::fs::read_dir(&stage)? {
                let entry = entry?;
                if entry.file_name() != ".store-import-reviewed" {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        format!(
                            "unexpected Store import staging entry after database commit: {}",
                            entry.path().display()
                        ),
                    ));
                }
                std::fs::remove_file(entry.path())?;
            }
            std::fs::remove_dir(&stage)?;
        }
        std::fs::remove_file(journal_path)?;
        remove_abandoned_review_marker_temps(data_dir)?;
        return Ok(());
    }
    if database_is_published {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Store import journal does not account for the published database",
        ));
    }

    for name in journal.entries.iter().rev() {
        let target = data_dir.join(name);
        let staged = stage.join(name);
        match (entry_exists(&target)?, entry_exists(&staged)?) {
            (true, false) => std::fs::rename(&target, &staged)?,
            (false, true) | (false, false) => {}
            (true, true) => {
                return Err(io::Error::new(
                    io::ErrorKind::AlreadyExists,
                    format!("cannot recover Store import because both copies exist: {name}"),
                ));
            }
        }
    }
    if stage_exists {
        remove_tree_without_reparse(&stage)?;
    }
    std::fs::remove_file(journal_path)?;
    Ok(())
}

fn is_review_marker_temp(name: &str) -> bool {
    let Some(suffix) = name.strip_prefix(".store-import-reviewed.tmp-") else {
        return false;
    };
    let parts = suffix.split('-').collect::<Vec<_>>();
    parts.len() == 3
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit()))
}

fn remove_abandoned_review_marker_temps(data_dir: &Path) -> io::Result<()> {
    for entry in std::fs::read_dir(data_dir)? {
        let entry = entry?;
        let Some(name) = entry.file_name().to_str().map(ToOwned::to_owned) else {
            continue;
        };
        if !is_review_marker_temp(&name) {
            continue;
        }
        let path = entry.path();
        let metadata = std::fs::symlink_metadata(&path)?;
        if is_reparse_point(&metadata) || !metadata.is_file() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!(
                    "unexpected import marker temporary file: {}",
                    path.display()
                ),
            ));
        }
        std::fs::remove_file(path)?;
    }
    Ok(())
}

fn remove_orphan_import_stages(parent: &Path) -> io::Result<()> {
    for entry in std::fs::read_dir(parent)? {
        let entry = entry?;
        let Some(name) = entry.file_name().to_str().map(ToOwned::to_owned) else {
            continue;
        };
        if !is_generated_import_stage_name(&name) {
            continue;
        }
        let metadata = std::fs::symlink_metadata(entry.path())?;
        if is_reparse_point(&metadata) || !metadata.is_dir() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!(
                    "unexpected orphaned Store import stage: {}",
                    entry.path().display()
                ),
            ));
        }
        remove_tree_without_reparse(&entry.path())?;
    }
    Ok(())
}

/// Candidate GitHub libraries shown on the Store edition's first launch.
/// Discovery is read-only: only the user-triggered import below copies data.
pub fn store_import_candidates(data_dir: &Path) -> Vec<PathBuf> {
    if data_dir.join(SQLITE_GROUP[0]).is_file() || store_import_reviewed(data_dir) {
        return Vec::new();
    }

    // Off Windows nothing is ever pushed, so an untyped `let mut candidates =
    // Vec::new()` neither infers its element type nor needs `mut` there.
    #[cfg(not(windows))]
    let candidates: Vec<PathBuf> = Vec::new();
    #[cfg(windows)]
    let candidates = {
        let mut candidates = super::legacy_source_dirs();
        if let Some(exe) = github_executable_from_app_paths() {
            if let Some(parent) = exe.parent() {
                candidates.push(parent.join("data"));
            }
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                candidates.push(parent.join("data"));
            }
        }
        candidates
    };

    let destination = data_dir
        .canonicalize()
        .unwrap_or_else(|_| data_dir.to_path_buf());
    let mut found = Vec::new();
    for candidate in candidates {
        if !candidate.join(SQLITE_GROUP[0]).is_file() {
            continue;
        }
        let resolved = candidate.canonicalize().unwrap_or(candidate);
        if resolved == destination || found.contains(&resolved) {
            continue;
        }
        found.push(resolved);
    }
    found.sort();
    found
}

/// Whether the Store edition has already resolved its first-run import choice.
pub fn store_import_reviewed(data_dir: &Path) -> bool {
    std::fs::symlink_metadata(data_dir.join(".store-import-reviewed"))
        .is_ok_and(|metadata| !is_reparse_point(&metadata) && metadata.is_file())
}

/// Persist a first-run choice without storing any source path or account data.
pub fn mark_store_import_reviewed(data_dir: &Path) -> io::Result<()> {
    super::write_file_atomically(&data_dir.join(".store-import-reviewed"), b"reviewed\n")
}

/// Copy one library into the Store edition. The GitHub source is read only and
/// never receives lock/bookkeeping files. The main database and sidecars are
/// copied under exclusive read handles, then SQLite's online backup API
/// captures their committed WAL contents in the Store staging directory.
/// Sensitive sign-in and local API state is not copied between the editions.
pub fn import_store_library(source: &Path, destination: &Path) -> io::Result<()> {
    let source = source.canonicalize()?;
    std::fs::create_dir_all(destination)?;
    let destination = destination.canonicalize()?;
    if source == destination || source.starts_with(&destination) || destination.starts_with(&source)
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "source and Store data directories must be separate",
        ));
    }
    recover_interrupted_store_import(&destination)?;
    let source_db = source.join(SQLITE_GROUP[0]);
    if !source_db.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            "the selected folder does not contain zepp.db",
        ));
    }
    let source_db_metadata = std::fs::symlink_metadata(&source_db)?;
    if is_reparse_point(&source_db_metadata) || !source_db_metadata.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "the selected zepp.db is a link or reparse point; choose its real data folder",
        ));
    }
    if !destination_is_empty(destination.as_path())? {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "Store data already exists; import will not overwrite it",
        ));
    }

    let parent = destination
        .parent()
        .ok_or_else(|| io::Error::other("Store data directory has no parent"))?;
    let stage_name = format!(
        "{IMPORT_STAGE_PREFIX}{}-{}",
        std::process::id(),
        crate::unique_suffix()
    );
    let stage = parent.join(&stage_name);
    std::fs::create_dir(&stage)?;

    let staged = (|| -> io::Result<()> {
        backup_sqlite_snapshot(&source.join(SQLITE_GROUP[0]), &stage.join(SQLITE_GROUP[0]))?;
        let target_db = Connection::open(stage.join(SQLITE_GROUP[0]))
            .map_err(|error| io::Error::other(format!("open imported database: {error}")))?;
        let check: String = target_db
            .query_row("PRAGMA quick_check", [], |row| row.get(0))
            .map_err(|error| io::Error::other(format!("verify imported database: {error}")))?;
        if check != "ok" {
            return Err(io::Error::other(format!(
                "copied database integrity check failed: {check}"
            )));
        }
        drop(target_db);

        for entry in std::fs::read_dir(&source)? {
            let entry = entry?;
            let name = entry.file_name();
            let Some(name_str) = name.to_str() else {
                return Err(io::Error::other("source contains a non-Unicode entry name"));
            };
            if RUNTIME_ENTRIES.contains(&name_str)
                || PRIVATE_IMPORT_ENTRIES.contains(&name_str)
                || SQLITE_GROUP.contains(&name_str)
                || name_str == IMPORT_JOURNAL
                || name_str == ".store-import-reviewed"
                || is_review_marker_temp(name_str)
            {
                continue;
            }
            copy_entry_without_links(&entry.path(), &stage.join(name))?;
        }
        std::fs::write(stage.join(".store-import-reviewed"), b"reviewed\n")?;
        Ok(())
    })();

    if let Err(error) = staged {
        let _ = remove_tree_without_reparse(&stage);
        return Err(error);
    }

    let staged_entries = std::fs::read_dir(&stage)?
        .map(|entry| entry.map(|entry| (entry.file_name(), entry.path())))
        .collect::<io::Result<Vec<_>>>()?;
    // The library is published transactionally across individual renames. The
    // journal lets the next Store launch roll back if Windows stops the process
    // part way through. The database is the final rename and commit point; the
    // reviewed marker is created only after that commit.
    let mut publish_entries = staged_entries
        .iter()
        .filter(|(name, _)| name != std::ffi::OsStr::new(".store-import-reviewed"))
        .cloned()
        .collect::<Vec<_>>();
    publish_entries.sort_by_key(|(name, _)| name == std::ffi::OsStr::new(SQLITE_GROUP[0]));
    if !publish_entries
        .iter()
        .any(|(name, _)| name == std::ffi::OsStr::new(SQLITE_GROUP[0]))
    {
        let _ = remove_tree_without_reparse(&stage);
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "staged Store import has no database commit file",
        ));
    }
    for (name, _) in &staged_entries {
        let target = destination.join(name);
        if target.exists() {
            let _ = remove_tree_without_reparse(&stage);
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                format!("destination entry already exists: {}", target.display()),
            ));
        }
    }

    let journal = StoreImportJournal {
        stage: stage_name,
        entries: staged_entries
            .iter()
            .map(|(name, _)| {
                name.to_str()
                    .map(ToOwned::to_owned)
                    .ok_or_else(|| io::Error::other("staging contains a non-Unicode entry name"))
            })
            .collect::<io::Result<Vec<_>>>()?,
    };
    let journal_bytes = serde_json::to_vec(&journal)
        .map_err(|error| io::Error::other(format!("encode Store import journal: {error}")))?;
    super::write_file_atomically(&parent.join(IMPORT_JOURNAL), &journal_bytes)?;

    let mut publish_error = None;
    for (name, path) in publish_entries {
        let target = destination.join(&name);
        if let Err(error) = std::fs::rename(path, &target) {
            publish_error = Some(error);
            break;
        }
    }
    if let Some(error) = publish_error {
        return match recover_interrupted_store_import(&destination) {
            Ok(()) => Err(error),
            Err(rollback) => Err(io::Error::other(format!(
                "Store import failed ({error}) and rollback is pending ({rollback})"
            ))),
        };
    }

    // The database rename is the commit point. A crash before it rolls back the
    // other renamed entries; a crash after it keeps the imported library and
    // recovery writes the marker/cleans the stage without asking the user twice.
    let _ = recover_interrupted_store_import(&destination);
    Ok(())
}

fn destination_is_empty(destination: &Path) -> io::Result<bool> {
    for entry in std::fs::read_dir(destination)? {
        let name = entry?.file_name();
        let is_marker_temp = name.to_str().is_some_and(is_review_marker_temp);
        if name
            .to_str()
            .is_none_or(|name| !IGNORABLE_DESTINATION_ENTRIES.contains(&name) && !is_marker_temp)
        {
            return Ok(false);
        }
    }
    Ok(true)
}

fn entry_exists(path: &Path) -> io::Result<bool> {
    match std::fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

fn is_reparse_point(metadata: &std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;
        metadata.file_type().is_symlink()
            || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
    }
}

fn reject_reparse_ancestors(path: &Path, allowed_local_state: Option<&Path>) -> io::Result<()> {
    let mut current = PathBuf::new();
    for component in path.components() {
        current.push(component.as_os_str());
        match std::fs::symlink_metadata(&current) {
            Ok(metadata) if is_reparse_point(&metadata) => {
                if allowed_local_state.is_some_and(|allowed| same_reparse_path(&current, allowed)) {
                    continue;
                }
                return Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    format!(
                        "Store LocalState path crosses an unapproved reparse point: {}",
                        current.display()
                    ),
                ));
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => break,
            Err(error) => return Err(error),
        }
    }
    Ok(())
}

fn same_reparse_path(left: &Path, right: &Path) -> bool {
    #[cfg(all(windows, feature = "store"))]
    {
        normalize_win32_path(left) == normalize_win32_path(right)
    }
    #[cfg(not(all(windows, feature = "store")))]
    {
        left == right
    }
}

fn remove_stale_store_path_probe(data_dir: &Path) -> io::Result<()> {
    let probe = data_dir.join(".write-probe");
    match std::fs::symlink_metadata(&probe) {
        Ok(metadata) if is_reparse_point(&metadata) || !metadata.is_file() => Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Store LocalState write probe is not a regular file",
        )),
        Ok(_) => std::fs::remove_file(probe),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

/// Remove a private staging tree without traversing symbolic links, junctions,
/// or other Windows reparse points.
fn remove_tree_without_reparse(path: &Path) -> io::Result<()> {
    let metadata = std::fs::symlink_metadata(path)?;
    if is_reparse_point(&metadata) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("refusing to traverse a reparse point: {}", path.display()),
        ));
    }
    if metadata.is_dir() {
        for entry in std::fs::read_dir(path)? {
            remove_tree_without_reparse(&entry?.path())?;
        }
        std::fs::remove_dir(path)
    } else {
        std::fs::remove_file(path)
    }
}

fn copy_entry_without_links(source: &Path, destination: &Path) -> io::Result<()> {
    let meta = std::fs::symlink_metadata(source)?;
    if is_reparse_point(&meta) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!(
                "links and reparse points are not imported: {}",
                source.display()
            ),
        ));
    }
    if meta.is_dir() {
        std::fs::create_dir(destination)?;
        for entry in std::fs::read_dir(source)? {
            let entry = entry?;
            copy_entry_without_links(&entry.path(), &destination.join(entry.file_name()))?;
        }
    } else if meta.is_file() {
        std::fs::copy(source, destination)?;
    } else {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("unsupported source entry: {}", source.display()),
        ));
    }
    Ok(())
}

#[cfg(windows)]
fn github_executable_from_app_paths() -> Option<PathBuf> {
    use windows_sys::Win32::Foundation::{ERROR_MORE_DATA, ERROR_SUCCESS};
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_SZ};

    let key: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\ZeppBridge.exe\0"
        .encode_utf16()
        .collect();
    let mut bytes = 0u32;
    let first = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            key.as_ptr(),
            std::ptr::null(),
            RRF_RT_REG_SZ,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            &mut bytes,
        )
    };
    if !matches!(first, ERROR_SUCCESS | ERROR_MORE_DATA) || bytes < 2 {
        return None;
    }
    let mut value = vec![0u16; (bytes as usize).div_ceil(2)];
    let result = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            key.as_ptr(),
            std::ptr::null(),
            RRF_RT_REG_SZ,
            std::ptr::null_mut(),
            value.as_mut_ptr().cast(),
            &mut bytes,
        )
    };
    if result != ERROR_SUCCESS {
        return None;
    }
    let end = value
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(value.len());
    let path = String::from_utf16_lossy(&value[..end]);
    let path = PathBuf::from(path);
    path.is_file().then_some(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "store-import-{label}-{}-{}",
            std::process::id(),
            crate::unique_suffix()
        ));
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn library(path: &Path, value: &str) {
        std::fs::create_dir_all(path).unwrap();
        let db = Connection::open(path.join("zepp.db")).unwrap();
        db.execute_batch("CREATE TABLE sample(value TEXT);")
            .unwrap();
        db.execute("INSERT INTO sample VALUES (?1)", [value])
            .unwrap();
    }

    #[test]
    fn import_copies_database_and_user_files_without_touching_source() {
        let root = temp_root("copies");
        let source = root.join("github-data");
        let destination = root.join("store-data");
        library(&source, "github");
        std::fs::write(source.join("auth.json"), b"account metadata").unwrap();
        std::fs::write(source.join("auth.user-id"), b"github-user").unwrap();
        std::fs::write(source.join("credentials.json"), b"secret token").unwrap();
        std::fs::write(source.join("local-api.json"), b"{\"enabled\":true}").unwrap();
        std::fs::write(source.join("official.json"), b"official account metadata").unwrap();
        std::fs::write(source.join("devices.json"), b"device settings").unwrap();
        let source_names_before = std::fs::read_dir(&source)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect::<std::collections::BTreeSet<_>>();
        std::fs::create_dir_all(destination.join("logs")).unwrap();
        import_store_library(&source, &destination).unwrap();

        let imported = Connection::open(destination.join("zepp.db")).unwrap();
        let value: String = imported
            .query_row("SELECT value FROM sample", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "github");
        assert_eq!(
            std::fs::read(source.join("auth.json")).unwrap(),
            b"account metadata"
        );
        assert_eq!(
            std::fs::read(source.join("credentials.json")).unwrap(),
            b"secret token"
        );
        let source_names_after = std::fs::read_dir(&source)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect::<std::collections::BTreeSet<_>>();
        assert_eq!(
            source_names_after, source_names_before,
            "source folder must not gain lock or staging files"
        );
        assert!(!destination.join("auth.json").exists());
        assert!(!destination.join("auth.user-id").exists());
        assert!(!destination.join("credentials.json").exists());
        assert!(!destination.join("local-api.json").exists());
        assert!(!destination.join("official.json").exists());
        assert_eq!(
            std::fs::read(destination.join("devices.json")).unwrap(),
            b"device settings"
        );
        assert!(store_import_reviewed(&destination));
        drop(imported);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(not(windows))]
    #[test]
    fn online_backup_includes_committed_wal_data_without_source_bookkeeping() {
        let root = temp_root("wal-snapshot");
        let source = root.join("github-data");
        let destination = root.join("store-data");
        std::fs::create_dir_all(&source).unwrap();
        let source_db = source.join("zepp.db");
        let writer = Connection::open(&source_db).unwrap();
        writer
            .execute_batch(
                "PRAGMA journal_mode=WAL;
                 CREATE TABLE sample(value TEXT);
                 INSERT INTO sample VALUES ('committed in WAL');",
            )
            .unwrap();
        assert!(source.join("zepp.db-wal").is_file());
        let db_before = std::fs::read(&source_db).unwrap();
        let wal_before = std::fs::read(source.join("zepp.db-wal")).unwrap();
        let source_names_before = std::fs::read_dir(&source)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect::<std::collections::BTreeSet<_>>();

        import_store_library(&source, &destination).unwrap();

        let imported = Connection::open(destination.join("zepp.db")).unwrap();
        let value: String = imported
            .query_row("SELECT value FROM sample", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "committed in WAL");
        assert_eq!(std::fs::read(&source_db).unwrap(), db_before);
        assert_eq!(
            std::fs::read(source.join("zepp.db-wal")).unwrap(),
            wal_before
        );
        assert_eq!(
            std::fs::read_dir(&source)
                .unwrap()
                .map(|entry| entry.unwrap().file_name())
                .collect::<std::collections::BTreeSet<_>>(),
            source_names_before
        );
        assert!(!source.join("zepp.db.write-lock").exists());
        drop(imported);
        drop(writer);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn a_busy_github_database_is_refused_without_changing_source_files() {
        let root = temp_root("busy-source");
        let source = root.join("github-data");
        let destination = root.join("store-data");
        std::fs::create_dir_all(&source).unwrap();
        let source_db = source.join("zepp.db");
        let writer = Connection::open(&source_db).unwrap();
        writer
            .execute_batch(
                "PRAGMA journal_mode=WAL;
                 CREATE TABLE sample(value TEXT);
                 INSERT INTO sample VALUES ('github');",
            )
            .unwrap();
        let db_before = std::fs::read(&source_db).unwrap();
        let names_before = std::fs::read_dir(&source)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect::<std::collections::BTreeSet<_>>();

        let error = import_store_library(&source, &destination).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::WouldBlock);
        assert!(error.to_string().contains("Close ZeppBridge"));
        assert_eq!(std::fs::read(&source_db).unwrap(), db_before);
        assert_eq!(
            std::fs::read_dir(&source)
                .unwrap()
                .map(|entry| entry.unwrap().file_name())
                .collect::<std::collections::BTreeSet<_>>(),
            names_before
        );
        assert!(!source.join("zepp.db.write-lock").exists());
        assert!(!destination.join("zepp.db").exists());
        drop(writer);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn a_closed_wal_source_is_backed_up_from_staging_without_new_source_files() {
        let root = temp_root("closed-wal-source");
        let source = root.join("github-data");
        let destination = root.join("store-data");
        std::fs::create_dir_all(&source).unwrap();
        let source_db = source.join("zepp.db");
        let writer = Connection::open(&source_db).unwrap();
        writer
            .execute_batch(
                "PRAGMA journal_mode=WAL;
                 CREATE TABLE sample(value TEXT);
                 INSERT INTO sample VALUES ('committed in WAL');",
            )
            .unwrap();
        let main_before = std::fs::read(&source_db).unwrap();
        let wal_before = std::fs::read(source.join("zepp.db-wal")).unwrap();
        drop(writer);

        // Recreate a closed database with committed pages still in its WAL,
        // like a process that stopped before checkpointing the final frames.
        std::fs::write(&source_db, main_before).unwrap();
        std::fs::write(source.join("zepp.db-wal"), wal_before).unwrap();
        let db_before_import = std::fs::read(&source_db).unwrap();
        let wal_before_import = std::fs::read(source.join("zepp.db-wal")).unwrap();
        let names_before = std::fs::read_dir(&source)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect::<std::collections::BTreeSet<_>>();

        import_store_library(&source, &destination).unwrap();

        let imported = Connection::open(destination.join("zepp.db")).unwrap();
        let value: String = imported
            .query_row("SELECT value FROM sample", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "committed in WAL");
        assert_eq!(std::fs::read(&source_db).unwrap(), db_before_import);
        assert_eq!(
            std::fs::read(source.join("zepp.db-wal")).unwrap(),
            wal_before_import
        );
        assert_eq!(
            std::fs::read_dir(&source)
                .unwrap()
                .map(|entry| entry.unwrap().file_name())
                .collect::<std::collections::BTreeSet<_>>(),
            names_before
        );
        assert!(!source.join("zepp.db-shm").exists());
        assert!(!source.join("zepp.db.write-lock").exists());
        drop(imported);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn import_refuses_to_overwrite_an_existing_store_library() {
        let root = temp_root("no-overwrite");
        let source = root.join("github-data");
        let destination = root.join("store-data");
        library(&source, "source");
        library(&destination, "destination");
        assert_eq!(
            import_store_library(&source, &destination)
                .unwrap_err()
                .kind(),
            io::ErrorKind::AlreadyExists
        );
        let db = Connection::open(destination.join("zepp.db")).unwrap();
        let value: String = db
            .query_row("SELECT value FROM sample", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "destination");
        drop(db);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn the_shared_cli_mcp_resolver_blocks_before_a_store_choice_without_creating_a_database() {
        let root = temp_root("choice-gate");
        let destination = root.join("store-data");
        std::fs::create_dir_all(destination.join("logs")).unwrap();
        assert!(store_import_required(&destination));
        let error = require_store_import_decision(&destination).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::WouldBlock);
        assert!(error.to_string().contains("Open ZeppBridge"));
        assert!(!destination.join("zepp.db").exists());
        std::fs::write(destination.join(".store-import-reviewed"), b"reviewed\n").unwrap();
        assert!(!store_import_required(&destination));
        require_store_import_decision(&destination).unwrap();
        std::fs::remove_file(destination.join(".store-import-reviewed")).unwrap();
        library(&destination, "already-initialized");
        assert!(!store_import_required(&destination));
        require_store_import_decision(&destination).unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn interrupted_import_is_rolled_back_before_a_sidecar_can_open_the_library() {
        let root = temp_root("recovery");
        let parent = root.join("package-local-state");
        let destination = parent.join("data");
        let stage_name = format!("{IMPORT_STAGE_PREFIX}{}-123-0", std::process::id());
        let stage = parent.join(&stage_name);
        std::fs::create_dir_all(destination.join("logs")).unwrap();
        std::fs::create_dir(&stage).unwrap();
        std::fs::write(destination.join("devices.json"), b"already published").unwrap();
        std::fs::write(stage.join("zepp.db"), b"database not published").unwrap();
        std::fs::write(stage.join(".store-import-reviewed"), b"reviewed\n").unwrap();
        let journal = StoreImportJournal {
            stage: stage_name,
            entries: vec![
                "devices.json".into(),
                "zepp.db".into(),
                ".store-import-reviewed".into(),
            ],
        };
        super::super::write_file_atomically(
            &parent.join(IMPORT_JOURNAL),
            &serde_json::to_vec(&journal).unwrap(),
        )
        .unwrap();

        recover_interrupted_store_import(&destination).unwrap();
        assert!(store_import_required(&destination));
        assert!(!destination.join("devices.json").exists());
        assert!(!destination.join("zepp.db").exists());
        assert!(!destination.join(".store-import-reviewed").exists());
        assert!(!stage.exists());
        assert!(!parent.join(IMPORT_JOURNAL).exists());
        assert!(destination.join("logs").is_dir());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn an_orphaned_stage_without_a_journal_is_removed_before_retry() {
        let root = temp_root("orphan-stage");
        let parent = root.join("package-local-state");
        let destination = parent.join("data");
        let stage_name = format!("{IMPORT_STAGE_PREFIX}{}-123-0", std::process::id());
        let stage = parent.join(stage_name);
        std::fs::create_dir_all(destination.join("logs")).unwrap();
        std::fs::create_dir(&stage).unwrap();
        std::fs::write(stage.join("partial-copy"), b"incomplete staging only").unwrap();

        recover_interrupted_store_import(&destination).unwrap();
        assert!(!stage.exists());
        assert!(store_import_required(&destination));
        assert!(destination.join("logs").is_dir());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn an_import_with_a_published_commit_marker_only_needs_cleanup() {
        let root = temp_root("committed-recovery");
        let parent = root.join("package-local-state");
        let destination = parent.join("data");
        let stage_name = format!("{IMPORT_STAGE_PREFIX}{}-123-0", std::process::id());
        let stage = parent.join(&stage_name);
        std::fs::create_dir_all(&destination).unwrap();
        std::fs::create_dir(&stage).unwrap();
        library(&destination, "committed");
        std::fs::write(stage.join(".store-import-reviewed"), b"reviewed\n").unwrap();
        let journal = StoreImportJournal {
            stage: stage_name,
            entries: vec!["zepp.db".into(), ".store-import-reviewed".into()],
        };
        super::super::write_file_atomically(
            &parent.join(IMPORT_JOURNAL),
            &serde_json::to_vec(&journal).unwrap(),
        )
        .unwrap();

        recover_interrupted_store_import(&destination).unwrap();
        assert!(!store_import_required(&destination));
        assert!(destination.join(".store-import-reviewed").is_file());
        let db = Connection::open(destination.join("zepp.db")).unwrap();
        let value: String = db
            .query_row("SELECT value FROM sample", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "committed");
        assert!(destination.join(".store-import-reviewed").is_file());
        assert!(!stage.exists());
        assert!(!parent.join(IMPORT_JOURNAL).exists());
        drop(db);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(all(windows, feature = "store"))]
    #[test]
    fn registered_store_selection_accepts_deployment_and_store_revision_updates() {
        let arch = store_package_architecture().unwrap();
        let old = format!("LincStudio.ZeppBridge_3.1.1.0_{arch}__pwftgd5x5w3va");
        let new = format!("LincStudio.ZeppBridge_3.1.3.42_{arch}__pwftgd5x5w3va");
        assert_eq!(
            select_registered_store_package(std::slice::from_ref(&new), None).unwrap(),
            new
        );
        assert_eq!(
            select_registered_store_package(&[old.clone(), new.clone()], Some(&new)).unwrap(),
            new
        );
        assert!(select_registered_store_package(&[old.clone(), new.clone()], None).is_err());
        assert!(select_registered_store_package(&[new], Some(&old)).is_err());
    }

    #[cfg(all(windows, feature = "store"))]
    #[test]
    fn registered_store_selection_rejects_foreign_resource_and_invalid_packages() {
        let arch = store_package_architecture().unwrap();
        let valid = format!("LincStudio.ZeppBridge_3.1.3.0_{arch}__pwftgd5x5w3va");
        for invalid in [
            valid.replace("LincStudio.ZeppBridge", "Other.ZeppBridge"),
            valid.replace("pwftgd5x5w3va", "otherpublisher"),
            valid.replace("__", "_resources_"),
            valid.replace(arch, "unknownarch"),
            valid.replace("3.1.3.0", "3.1.3"),
            valid.replace("3.1.3.0", "3.1.3.65536"),
            valid.replace("3.1.3.0", "0.1.3.0"),
            valid.replace("3.1.3.0", "3.1.3.+1"),
        ] {
            assert!(
                select_registered_store_package(std::slice::from_ref(&invalid), None).is_err(),
                "{invalid}"
            );
            assert!(
                select_registered_store_package(std::slice::from_ref(&valid), Some(&invalid))
                    .is_err()
            );
        }
    }

    #[cfg(all(windows, feature = "store"))]
    #[test]
    fn token_sid_is_formatted_with_windows_sid_subauthorities() {
        let mut sid = [0u8; 28];
        sid[0] = 1;
        sid[1] = 5;
        sid[7] = 5;
        for (index, part) in [21u32, 705_008_641, 3_810_487_677, 2_678_661_352, 1001]
            .into_iter()
            .enumerate()
        {
            let offset = 8 + index * 4;
            sid[offset..offset + 4].copy_from_slice(&part.to_le_bytes());
        }
        assert_eq!(
            sid_to_string(sid.as_ptr()).unwrap(),
            "S-1-5-21-705008641-3810487677-2678661352-1001"
        );
    }

    #[cfg(all(windows, feature = "store"))]
    #[test]
    fn package_volume_redirect_requires_the_exact_user_family_and_local_state_tail() {
        let volume = "volume{94d06f05-28fd-4b85-a4d3-d09066a94794}";
        let sid = "S-1-5-21-705008641-3810487677-2678661352-1001";
        let full_name = "LincStudio.ZeppBridge_3.1.3.42_x64__pwftgd5x5w3va".to_owned();
        let package_install =
            format!(r"\\?\Volume{{94d06f05-28fd-4b85-a4d3-d09066a94794}}\WindowsApps\{full_name}");
        assert!(is_expected_package_install_path(
            Path::new(&package_install),
            &full_name,
        ));
        assert!(!is_expected_package_install_path(
            Path::new(&package_install.replace("WindowsApps", "OtherApps")),
            &full_name,
        ));

        let target = Path::new(
            r"\\?\Volume{94d06f05-28fd-4b85-a4d3-d09066a94794}\WpSystem\S-1-5-21-705008641-3810487677-2678661352-1001\AppData\Local\Packages\LincStudio.ZeppBridge_pwftgd5x5w3va\LocalState",
        );
        assert!(is_managed_local_state_junction(
            target,
            IO_REPARSE_TAG_MOUNT_POINT,
            sid,
            STORE_PACKAGE_FAMILY_NAME,
            volume,
        ));

        let wrong_sid = Path::new(
            r"\\?\Volume{94d06f05-28fd-4b85-a4d3-d09066a94794}\WpSystem\S-1-5-21-1-2-3-1002\AppData\Local\Packages\LincStudio.ZeppBridge_pwftgd5x5w3va\LocalState",
        );
        assert!(!is_managed_local_state_junction(
            wrong_sid,
            IO_REPARSE_TAG_MOUNT_POINT,
            sid,
            STORE_PACKAGE_FAMILY_NAME,
            volume,
        ));
        let wrong_family = Path::new(
            r"\\?\Volume{94d06f05-28fd-4b85-a4d3-d09066a94794}\WpSystem\S-1-5-21-705008641-3810487677-2678661352-1001\AppData\Local\Packages\LincStudio.ZeppBridge_other\LocalState",
        );
        assert!(!is_managed_local_state_junction(
            wrong_family,
            IO_REPARSE_TAG_MOUNT_POINT,
            sid,
            STORE_PACKAGE_FAMILY_NAME,
            volume,
        ));
        let wrong_volume = Path::new(
            r"\\?\Volume{2e6f77f2-7087-4278-a89d-ca3faa2f8663}\WpSystem\S-1-5-21-705008641-3810487677-2678661352-1001\AppData\Local\Packages\LincStudio.ZeppBridge_pwftgd5x5w3va\LocalState",
        );
        assert!(!is_managed_local_state_junction(
            wrong_volume,
            IO_REPARSE_TAG_MOUNT_POINT,
            sid,
            STORE_PACKAGE_FAMILY_NAME,
            volume,
        ));
        assert!(!is_managed_local_state_junction(
            target,
            0xA000_000C,
            sid,
            STORE_PACKAGE_FAMILY_NAME,
            volume,
        ));
    }

    #[cfg(all(windows, feature = "store"))]
    #[test]
    fn arbitrary_user_targets_and_extra_local_state_ancestors_remain_rejected() {
        let volume = "volume{94d06f05-28fd-4b85-a4d3-d09066a94794}";
        let sid = "S-1-5-21-705008641-3810487677-2678661352-1001";
        let arbitrary = Path::new(
            r"\\?\Volume{94d06f05-28fd-4b85-a4d3-d09066a94794}\Users\15pro\AppData\Local\ZeppBridge\data",
        );
        assert!(!is_managed_local_state_junction(
            arbitrary,
            IO_REPARSE_TAG_MOUNT_POINT,
            sid,
            STORE_PACKAGE_FAMILY_NAME,
            volume,
        ));
        let local_state = Path::new(
            r"C:\Users\15pro\AppData\Local\Packages\LincStudio.ZeppBridge_pwftgd5x5w3va\LocalState",
        );
        assert!(same_reparse_path(local_state, local_state));
        assert!(!same_reparse_path(
            Path::new(r"C:\Users\15pro\AppData\Local\Packages\LincStudio.ZeppBridge_pwftgd5x5w3va"),
            local_state,
        ));
        assert!(!same_reparse_path(
            Path::new(
                r"C:\Users\15pro\AppData\Local\Packages\LincStudio.ZeppBridge_pwftgd5x5w3va\LocalState\ZeppBridge"
            ),
            local_state,
        ));
    }

    #[cfg(all(windows, feature = "store"))]
    #[test]
    fn store_mcp_data_override_is_accepted_only_under_this_store_family_shape() {
        let local = known_local_app_data().unwrap();
        let store_path = local.join(format!(
            "Packages/{STORE_PACKAGE_FAMILY_NAME}/LocalState/ZeppBridge/data"
        ));
        let wrong_family =
            local.join("Packages/LincStudio.ZeppBridge_other/LocalState/ZeppBridge/data");
        let github_path = local.join("ZeppBridge/data");
        assert!(is_store_local_state_data_dir(&store_path).unwrap());
        assert!(!is_store_local_state_data_dir(&wrong_family).unwrap());
        assert!(!is_store_local_state_data_dir(&github_path).unwrap());
        assert!(is_windows_apps_path(Path::new(
            r"C:\Users\example\AppData\Local\Microsoft\WindowsApps\zeppbridge-store-mcp.exe"
        )));
        assert!(!is_windows_apps_path(Path::new(
            r"C:\Users\example\Desktop\ZeppBridge\target\debug\zeppbridge-mcp.exe"
        )));
    }
}
