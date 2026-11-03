use super::*;

pub(super) fn cmd_workout_edit(command: &str, args: &[String]) -> u8 {
    let json = scan_json_flag(args);
    let flags = match Flags::parse(args) {
        Ok(v) => v,
        Err(e) => return fail(json, EXIT_USAGE, "usage", &e),
    };
    let known: &[&str] = match command {
        "set-type" => &["workout", "type", "clear", "json", "undo"],
        "hide" => &["workout", "json", "undo", "list"],
        "restore" => &["workout", "json", "undo"],
        _ => return fail(json, EXIT_USAGE, "usage", "Unknown workout edit command"),
    };
    if let Err(e) = flags
        .reject_unknown(known)
        .and_then(|_| flags.validate_values(&["workout", "type", "undo"]))
    {
        return fail(json, EXIT_USAGE, "usage", &e);
    }
    // --workout is deliberately repeatable; every other option is unique.
    let mut seen = BTreeSet::new();
    for (key, value) in &flags.values {
        if key != "workout" && !seen.insert(key.as_str()) {
            return fail(json, EXIT_USAGE, "usage", "Only --workout may be repeated");
        }
        if matches!(key.as_str(), "workout" | "type" | "undo") && value.is_none() {
            return fail(json, EXIT_USAGE, "usage", "Missing option value");
        }
    }
    let ids: Vec<String> = flags
        .values
        .iter()
        .filter(|(key, _)| key == "workout")
        .filter_map(|(_, value)| value.clone())
        .collect();
    let undo = flags.get("undo");
    let list = command == "hide" && flags.has("list");
    if (undo.is_some() || list) && (!ids.is_empty() || flags.has("type") || flags.has("clear"))
        || (undo.is_some() && list)
        || (command == "set-type"
            && undo.is_none()
            && (ids.is_empty() || flags.has("type") == flags.has("clear")))
        || (command != "set-type" && (flags.has("type") || flags.has("clear")))
        || (command != "set-type" && undo.is_none() && !list && ids.is_empty())
    {
        return fail(json, EXIT_USAGE, "usage", "Use --workout ID (repeatable), set-type --type TYPE or --clear; alternatively --undo EDIT_ID, or hide --list");
    }
    if list {
        let db = match open_read_only() {
            Ok(db) => db,
            Err((c, e)) => return fail(json, c, error_kind_for(c), &e),
        };
        return match db.hidden_workouts_page(1000, 0) {
            Ok(items) => {
                emit(
                    json,
                    serde_json::json!({"ok":true, "workouts":items}),
                    &items
                        .iter()
                        .map(|w| {
                            format!("{}  {}  {}", w.workout_id, w.start_time, w.effective_type)
                        })
                        .collect::<Vec<_>>()
                        .join("\n"),
                );
                EXIT_OK
            }
            Err(e) => {
                let (c, k) = exit_code_for(&e);
                fail(json, c, k, &user_text(&e))
            }
        };
    }
    let (dir, db) = match open_writable() {
        Ok(v) => v,
        Err((c, e)) => return fail(json, c, error_kind_for(c), &e),
    };
    let _lock = match write_lock::acquire_with_timeout(
        &dir,
        WritePurpose::Metadata,
        Duration::from_secs(20),
    ) {
        Ok(v) => v,
        Err(e) => {
            let c = write_lock_exit(&e);
            return fail(json, c, error_kind_for(c), &e.to_string());
        }
    };
    let result = if let Some(id) = undo {
        db.undo_workout_edit(id)
            .map(|n| serde_json::json!({"ok":true,"restored":n}))
    } else {
        let change_type = (command == "set-type").then_some(flags.get("type"));
        let hidden = match command {
            "hide" => Some(true),
            "restore" => Some(false),
            _ => None,
        };
        db.edit_workouts(&ids, change_type, hidden)
            .map(|edit| serde_json::json!({"ok":true,"edit":edit}))
    };
    match result {
        Ok(value) => {
            emit(
                json,
                value.clone(),
                &format!(
                    "Local workout edit saved: {value}. Use --undo with the edit ID to reverse it."
                ),
            );
            EXIT_OK
        }
        Err(e) => {
            let (c, k) = exit_code_for(&e);
            fail(json, c, k, &user_text(&e))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_edits_are_rejected_before_opening_the_library() {
        for (command, values) in [
            ("restore", vec!["--list", "--workout", "123"]),
            ("set-type", vec!["--list", "--undo", "edit-1"]),
            ("set-type", vec!["--workout", "123", "--type"]),
            (
                "set-type",
                vec!["--workout", "123", "--type", "run", "--clear"],
            ),
            ("set-type", vec!["--workout", "123", "--clear=false"]),
            ("hide", vec!["--workout", "123", "--undo", "edit-1"]),
            ("hide", vec!["--workout=", "--json"]),
            ("hide", vec!["--list", "--list"]),
        ] {
            let args = values.iter().map(|v| v.to_string()).collect::<Vec<_>>();
            assert_eq!(
                cmd_workout_edit(command, &args),
                EXIT_USAGE,
                "{command} {values:?}"
            );
        }
    }
}
