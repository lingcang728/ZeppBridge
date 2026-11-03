use super::*;

fn temp_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "zeppbridge-letters-{}-{}",
        std::process::id(),
        unique_suffix()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn pending(local_id: &str) -> PendingReply {
    PendingReply {
        local_id: local_id.into(),
        letter_version: "3.1.0".into(),
        app_version: "3.1.0".into(),
        locale: "zh".into(),
        text: "补拉卡住了".into(),
        allow_quote: false,
        also_hit: vec![],
        queued_at: "2026-10-21T10:00:00Z".into(),
        attempts: 0,
    }
}

#[test]
fn a_reply_never_leaves_with_paths_or_secret_looking_words_but_keeps_its_paragraphs() {
    let text = "你好，\r\n日志在 C:\\Users\\me\\zepp.log\n\n\n\n我的邮箱 me@example.com，token abcdef0123456789abcdef\n谢谢";
    let cleaned = sanitize_reply(text);
    assert!(!cleaned.contains("C:\\Users"));
    assert!(!cleaned.contains("me@example.com"));
    assert!(!cleaned.contains("abcdef0123456789abcdef"));
    // 连续空行收成一个，分段还在。
    assert!(cleaned.contains("\n\n我的邮箱"));
    assert!(!cleaned.contains("\n\n\n"));
    assert_eq!(
        sanitize_reply(&"字".repeat(1200)).chars().count(),
        LETTER_REPLY_MAX_CHARS
    );
    assert_eq!(sanitize_reply("   \n  "), "");
}

#[test]
fn an_unsent_reply_survives_a_restart_and_is_sent_exactly_once() {
    let dir = temp_dir();
    let mut state = LetterBoxState::load(&dir);
    let id = state.ensure_install_id([7; 16]);
    assert!(is_install_id(&id));
    assert_eq!(
        state.ensure_install_id([9; 16]),
        id,
        "install id 只生成一次"
    );
    state.queue(pending("a"));
    state.save(&dir).unwrap();

    let mut reloaded = LetterBoxState::load(&dir);
    assert_eq!(reloaded.outbox, vec![pending("a")]);
    assert_eq!(reloaded.install_id.as_deref(), Some(id.as_str()));
    let queued = reloaded.outbox[0].clone();
    reloaded.mark_sent(&queued, "r1".into(), "2026-10-21T11:00:00Z".into());
    reloaded.mark_sent(&queued, "r1".into(), "2026-10-21T11:00:01Z".into());
    assert!(reloaded.outbox.is_empty());
    assert_eq!(reloaded.sent.len(), 1);
    assert_eq!(reloaded.sent[0].text, "补拉卡住了");
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn a_damaged_state_file_is_set_aside_instead_of_overwritten() {
    let dir = temp_dir();
    let path = state_path(&dir);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, "{ half written").unwrap();
    assert_eq!(LetterBoxState::load(&dir), LetterBoxState::default());
    let kept = std::fs::read_dir(path.parent().unwrap())
        .unwrap()
        .filter_map(|entry| entry.ok())
        .any(|entry| entry.file_name().to_string_lossy().contains("damaged"));
    assert!(kept);
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn also_hit_ids_and_locales_are_shaped_like_the_server_expects() {
    let ids = vec![
        "backfill-stuck".to_string(),
        "backfill-stuck".to_string(),
        "Bad Id".to_string(),
        "linux-lag".to_string(),
    ];
    assert_eq!(
        normalize_also_hit(&ids),
        vec!["backfill-stuck", "linux-lag"]
    );
    assert_eq!(normalize_locale("pt-BR"), Some("pt-BR"));
    assert_eq!(normalize_locale("xx"), None);
    assert!(is_letter_version("3.1.0"));
    assert!(!is_letter_version("3.1"));
}
