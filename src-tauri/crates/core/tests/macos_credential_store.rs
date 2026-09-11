#![cfg(target_os = "macos")]

use std::{fs, path::PathBuf, process::Command};
use zeppbridge_core::{
    auth::{AuthManager, CredentialBackend, FileCredentialBackend, CREDENTIAL_FILE},
    local_api::{LocalApiController, LOCAL_API_CREDENTIAL_ACCOUNT},
    models::AuthInfo,
};

const TEST_DIR_ENV: &str = "ZEPPBRIDGE_TEST_CREDENTIAL_DIR";
const TEST_PHASE_ENV: &str = "ZEPPBRIDGE_TEST_CREDENTIAL_PHASE";
const APP_TOKEN: &str = "fixture-app-token";
const API_TOKEN: &str = "zbk_fixture-local-api-token";

struct ForbiddenKeychain;

impl keyring::credential::CredentialBuilderApi for ForbiddenKeychain {
    fn build(
        &self,
        _target: Option<&str>,
        _service: &str,
        _user: &str,
    ) -> keyring::Result<Box<keyring::credential::Credential>> {
        panic!("file storage must never access Keychain");
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}

// Separate processes exercise the public factories with real launch-time
// environment, without racing set_var against other tests in the same process.
#[test]
fn file_credentials_survive_a_normal_macos_launch() {
    let dir = std::env::temp_dir().join(format!(
        "zeppbridge-macos-credentials-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&dir).unwrap();
    // Simulate an upgrade with metadata pointing at an inaccessible Keychain.
    fs::write(
        dir.join("auth.json"),
        r#"{"version":1,"user_id":"fixture-user","region_host":"https://api-mifit.zepp.com"}"#,
    )
    .unwrap();

    for phase in ["save", "restore", "clear", "legacy"] {
        let mut command = Command::new(std::env::current_exe().unwrap());
        command
            .args(["--exact", "credential_store_child", "--nocapture"])
            .env(TEST_DIR_ENV, &dir)
            .env(TEST_PHASE_ENV, phase)
            .env_remove("ZEPPBRIDGE_CREDENTIAL_STORE")
            .env_remove("ZEPPBRIDGE_APP_TOKEN");
        if phase == "save" || phase == "legacy" {
            command.env("ZEPPBRIDGE_CREDENTIAL_STORE", " FILE ");
        }
        let output = command.output().unwrap();
        assert!(
            output.status.success(),
            "{phase} failed:\n{}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn credential_store_child() {
    let Some(dir) = std::env::var_os(TEST_DIR_ENV).map(PathBuf::from) else {
        return;
    };
    // Fail immediately on any Keychain access instead of letting the CI runner
    // satisfy the request or hang on a password dialog.
    keyring::set_default_credential_builder(Box::new(ForbiddenKeychain));
    let manager = AuthManager::new(dir.clone());
    let file = FileCredentialBackend::new(&dir);
    match std::env::var(TEST_PHASE_ENV).unwrap().as_str() {
        "save" => {
            // Re-authentication must not read or delete the previous Keychain
            // entry before it can save to the explicitly selected file store.
            manager
                .save_auth(&AuthInfo {
                    user_id: "fixture-user".into(),
                    app_token: APP_TOKEN.into(),
                    region_host: "https://api-mifit.zepp.com".into(),
                })
                .unwrap();
            assert_eq!(
                file.get("fixture-user").unwrap().as_deref(),
                Some(APP_TOKEN)
            );
            file.set(LOCAL_API_CREDENTIAL_ACCOUNT, API_TOKEN).unwrap();
        }
        "restore" => {
            assert_eq!(manager.load_auth().unwrap().unwrap().app_token, APP_TOKEN);
            // The desktop's local API must select the same file backend too;
            // otherwise opening Settings could still prompt for Keychain.
            let api = LocalApiController::new(dir.clone());
            assert_eq!(api.reveal_token().unwrap(), API_TOKEN);
            let rotated = api.rotate_token().unwrap();
            assert_ne!(rotated, API_TOKEN);
            assert_eq!(
                file.get(LOCAL_API_CREDENTIAL_ACCOUNT).unwrap(),
                Some(rotated)
            );
            assert_eq!(manager.load_auth().unwrap().unwrap().app_token, APP_TOKEN);
        }
        "clear" => {
            manager.clear_auth().unwrap();
            assert!(manager.load_auth().unwrap().is_none());
            assert!(file.get("fixture-user").unwrap().is_none());
            assert!(file.get(LOCAL_API_CREDENTIAL_ACCOUNT).unwrap().is_some());
            file.delete(LOCAL_API_CREDENTIAL_ACCOUNT).unwrap();
            assert!(!dir.join(CREDENTIAL_FILE).exists());
            return;
        }
        "legacy" => {
            fs::write(
                dir.join("auth.json"),
                format!(
                    r#"{{"user_id":"fixture-user","app_token":"{APP_TOKEN}","region_host":"https://api-mifit.zepp.com"}}"#
                ),
            )
            .unwrap();
            assert_eq!(manager.load_auth().unwrap().unwrap().app_token, APP_TOKEN);
            assert_eq!(
                file.get("fixture-user").unwrap().as_deref(),
                Some(APP_TOKEN)
            );
        }
        phase => panic!("unknown test phase: {phase}"),
    }
    assert!(!fs::read_to_string(dir.join("auth.json"))
        .unwrap()
        .contains(APP_TOKEN));
    use std::os::unix::fs::PermissionsExt;
    assert_eq!(
        fs::metadata(dir.join(CREDENTIAL_FILE))
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o600
    );
    assert_eq!(
        fs::metadata(&dir).unwrap().permissions().mode() & 0o777,
        0o700
    );
}
