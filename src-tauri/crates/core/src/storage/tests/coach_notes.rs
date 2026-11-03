use super::*;
use crate::storage::coach_notes::{Proposal, MAX_PROPOSED};

#[test]
fn ai_can_only_propose_and_only_accepted_notes_reach_the_profile() {
    let db = Database::in_memory().unwrap();
    let Proposal::Proposed { id } = db
        .propose_coach_note("  左膝跑 15 km 以上会痛\n", Some("Claude Desktop\u{7}"))
        .unwrap()
    else {
        panic!()
    };
    // 没确认之前，交给 AI 的档案里没有它。
    assert!(db.athlete_profile().unwrap().coach_notes.is_empty());
    assert_eq!(
        db.propose_coach_note("左膝跑 15 km 以上会痛", None)
            .unwrap(),
        Proposal::AlreadyProposed { id }
    );
    let proposed = db.proposed_coach_notes().unwrap();
    assert_eq!(proposed[0].text, "左膝跑 15 km 以上会痛");
    assert_eq!(proposed[0].source_name.as_deref(), Some("Claude Desktop"));

    assert!(db.decide_coach_note(id, true).unwrap());
    assert!(!db.decide_coach_note(id, false).unwrap());
    assert_eq!(
        db.propose_coach_note("左膝跑 15 km 以上会痛", None)
            .unwrap(),
        Proposal::AlreadyKnown { id }
    );
    let mine = db.add_coach_note("周三晚上固定游泳").unwrap();
    let profile = db.athlete_profile().unwrap();
    let texts: Vec<&str> = profile
        .coach_notes
        .iter()
        .map(|n| n.text.as_str())
        .collect();
    assert_eq!(texts, ["左膝跑 15 km 以上会痛", "周三晚上固定游泳"]);
    assert_eq!(profile.coach_notes[0].source, "mcp");
    assert_eq!(profile.coach_notes[1].source, "user");

    assert!(db.edit_coach_note(mine, "周三、周六晚上游泳").unwrap());
    db.delete_coach_note(id).unwrap();
    let left = db.accepted_coach_notes().unwrap();
    assert_eq!(left.len(), 1);
    assert_eq!(left[0].text, "周三、周六晚上游泳");
}

#[test]
fn rejected_or_overflowing_proposals_are_not_written() {
    let db = Database::in_memory().unwrap();
    assert!(db.propose_coach_note("   ", None).is_err());
    assert!(db.propose_coach_note(&"长".repeat(501), None).is_err());
    let Proposal::Proposed { id } = db.propose_coach_note("喜欢早上跑", None).unwrap() else {
        panic!()
    };
    db.decide_coach_note(id, false).unwrap();
    assert_eq!(
        db.propose_coach_note("喜欢早上跑", None).unwrap(),
        Proposal::RejectedBefore
    );
    for i in 0..MAX_PROPOSED {
        assert!(matches!(
            db.propose_coach_note(&format!("note {i}"), None).unwrap(),
            Proposal::Proposed { .. }
        ));
    }
    assert_eq!(
        db.propose_coach_note("one more", None).unwrap(),
        Proposal::InboxFull
    );
    assert_eq!(
        db.proposed_coach_notes().unwrap().len() as i64,
        MAX_PROPOSED
    );
}
