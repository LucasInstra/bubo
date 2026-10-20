use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::llm::Fix;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredMessage {
    pub id: i64,
    pub role: String,
    pub content: String,
    pub fixes: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrillItem {
    pub id: i64,
    pub wrong: String,
    pub right: String,
    pub note: String,
    pub streak: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrillStats {
    pub total: i64,
    pub due: i64,
}

pub fn open(path: PathBuf) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    init(&conn)?;
    backfill_fixes(&conn)?;
    Ok(conn)
}

/// Older databases stored corrections only inside messages; seed the drill
/// table from them so history is practiceable right away. Idempotent.
fn backfill_fixes(conn: &Connection) -> rusqlite::Result<()> {
    let mut statement = conn.prepare("SELECT fixes FROM messages WHERE fixes IS NOT NULL")?;
    let raws = statement
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    for raw in raws {
        if let Ok(fixes) = serde_json::from_str::<Vec<Fix>>(&raw) {
            save_fixes(conn, &fixes)?;
        }
    }

    Ok(())
}

fn init(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            fixes TEXT,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS fixes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wrong TEXT NOT NULL,
            right TEXT NOT NULL,
            note TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            streak INTEGER NOT NULL DEFAULT 0,
            due_at INTEGER NOT NULL,
            UNIQUE(wrong, right)
        );",
    )?;
    Ok(())
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn insert(
    conn: &Connection,
    role: &str,
    content: &str,
    fixes: Option<&str>,
) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO messages (role, content, fixes, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![role, content, fixes, now()],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM messages WHERE id = ?1", [id])?;
    Ok(())
}

pub fn set_message_fixes(conn: &Connection, id: i64, fixes: Option<&str>) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE messages SET fixes = ?1 WHERE id = ?2",
        params![fixes, id],
    )?;
    Ok(())
}

pub fn list(conn: &Connection, limit: i64) -> rusqlite::Result<Vec<StoredMessage>> {
    let mut stmt = conn.prepare(
        "SELECT id, role, content, fixes, created_at FROM messages ORDER BY id DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit], |row| {
        Ok(StoredMessage {
            id: row.get(0)?,
            role: row.get(1)?,
            content: row.get(2)?,
            fixes: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    let mut messages = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    messages.reverse();
    Ok(messages)
}

pub fn clear(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM messages", [])?;
    Ok(())
}

fn row_to_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<DrillItem> {
    Ok(DrillItem {
        id: row.get(0)?,
        wrong: row.get(1)?,
        right: row.get(2)?,
        note: row.get(3)?,
        streak: row.get(4)?,
    })
}

/// Corrections are stored once; the drill later schedules them.
pub fn save_fixes(conn: &Connection, fixes: &[Fix]) -> rusqlite::Result<()> {
    let now = now();
    for fix in fixes {
        conn.execute(
            "INSERT OR IGNORE INTO fixes (wrong, right, note, created_at, due_at)
             VALUES (?1, ?2, ?3, ?4, ?4)",
            params![fix.wrong, fix.right, fix.note, now],
        )?;
    }
    Ok(())
}

pub fn drill_stats(conn: &Connection) -> rusqlite::Result<DrillStats> {
    let now = now();
    conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(CASE WHEN due_at <= ?1 THEN 1 ELSE 0 END), 0) FROM fixes",
        [now],
        |row| {
            Ok(DrillStats {
                total: row.get(0)?,
                due: row.get(1)?,
            })
        },
    )
}

/// Removes cards whose only difference is letter case.
pub fn purge_case_only(conn: &Connection) -> rusqlite::Result<usize> {
    conn.execute(
        "DELETE FROM fixes WHERE lower(trim(wrong)) = lower(trim(right))",
        [],
    )
}

/// Moves everything that is due to tomorrow.
pub fn skip_due(conn: &Connection) -> rusqlite::Result<usize> {
    let now = now();
    conn.execute(
        "UPDATE fixes SET due_at = ?1 WHERE due_at <= ?2",
        params![now + 86_400_000, now],
    )
}

/// Wipes the practice queue and the corrections stored on messages, so the
/// backfill on the next start does not bring them back.
pub fn reset_fixes(conn: &Connection) -> rusqlite::Result<usize> {
    let removed = conn.execute("DELETE FROM fixes", [])?;
    conn.execute("UPDATE messages SET fixes = NULL", [])?;
    Ok(removed)
}

pub fn next_drill(
    conn: &Connection,
    include_future: bool,
    exclude_id: Option<i64>,
) -> rusqlite::Result<Option<DrillItem>> {
    let now = now();
    if include_future {
        conn.query_row(
            "SELECT id, wrong, right, note, streak FROM fixes
             WHERE (?1 IS NULL OR id != ?1)
             ORDER BY due_at ASC, RANDOM() LIMIT 1",
            [exclude_id],
            row_to_item,
        )
        .optional()
    } else {
        conn.query_row(
            "SELECT id, wrong, right, note, streak FROM fixes
             WHERE due_at <= ?1 AND (?2 IS NULL OR id != ?2)
             ORDER BY due_at ASC, RANDOM() LIMIT 1",
            params![now, exclude_id],
            row_to_item,
        )
        .optional()
    }
}

const INTERVALS_MS: [i64; 5] = [
    86_400_000,
    259_200_000,
    604_800_000,
    1_814_400_000,
    3_888_000_000,
];

pub fn review_drill(
    conn: &Connection,
    id: i64,
    correct: bool,
) -> rusqlite::Result<Option<DrillItem>> {
    let item = conn
        .query_row(
            "SELECT id, wrong, right, note, streak FROM fixes WHERE id = ?1",
            [id],
            row_to_item,
        )
        .optional()?;

    let Some(item) = item else {
        return Ok(None);
    };

    let streak = if correct { item.streak + 1 } else { 0 };
    let delay = if correct {
        INTERVALS_MS[streak.saturating_sub(1).min(4) as usize]
    } else {
        600_000
    };

    conn.execute(
        "UPDATE fixes SET streak = ?1, due_at = ?2 WHERE id = ?3",
        params![streak, now() + delay, id],
    )?;

    Ok(Some(DrillItem { streak, ..item }))
}

#[cfg(test)]
mod tests {
    use super::{delete, insert, list, StoredMessage};

    fn memory_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().expect("memory db");
        super::init(&conn).expect("schema");
        conn
    }

    #[test]
    fn stores_and_reads_a_turn_in_order() {
        let conn = memory_db();
        let user_id = insert(&conn, "user", "i go yesterday", None).unwrap();
        insert(
            &conn,
            "assistant",
            "You went yesterday.",
            Some(r#"[{"wrong":"i go","right":"I went","note":"passado"}]"#),
        )
        .unwrap();

        let messages: Vec<StoredMessage> = list(&conn, 10).unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[1].role, "assistant");
        assert!(messages[1].fixes.is_some());
        assert!(user_id > 0);
    }

    #[test]
    fn deleting_a_failed_user_message_keeps_history_clean() {
        let conn = memory_db();
        insert(&conn, "user", "hello", None).unwrap();
        let orphan = insert(&conn, "user", "failed request", None).unwrap();
        delete(&conn, orphan).unwrap();

        let messages = list(&conn, 10).unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].content, "hello");
    }

    #[test]
    fn clear_empties_the_table() {
        let conn = memory_db();
        insert(&conn, "user", "hello", None).unwrap();
        super::clear(&conn).unwrap();
        assert!(list(&conn, 10).unwrap().is_empty());
    }

    #[test]
    fn corrections_feed_the_drill_once() {
        use crate::llm::Fix;

        let conn = memory_db();
        let fix = Fix {
            wrong: "i go yesterday".to_string(),
            right: "I went yesterday".to_string(),
            note: "passado".to_string(),
        };

        super::save_fixes(&conn, std::slice::from_ref(&fix)).unwrap();
        super::save_fixes(&conn, &[fix]).unwrap();

        let stats = super::drill_stats(&conn).unwrap();
        assert_eq!(stats.total, 1);
        assert_eq!(stats.due, 1);

        let item = super::next_drill(&conn, false, None)
            .unwrap()
            .expect("due item");
        assert_eq!(item.right, "I went yesterday");

        let reviewed = super::review_drill(&conn, item.id, true).unwrap().unwrap();
        assert_eq!(reviewed.streak, 1);
        assert_eq!(super::drill_stats(&conn).unwrap().due, 0);
    }

    #[test]
    fn purge_removes_case_only_cards() {
        use crate::llm::Fix;

        let conn = memory_db();
        super::save_fixes(
            &conn,
            &[
                Fix {
                    wrong: "i went out on friday".to_string(),
                    right: "I went out on Friday".to_string(),
                    note: String::new(),
                },
                Fix {
                    wrong: "was very good".to_string(),
                    right: "it was very good".to_string(),
                    note: String::new(),
                },
            ],
        )
        .unwrap();

        assert_eq!(super::purge_case_only(&conn).unwrap(), 1);
        assert_eq!(super::drill_stats(&conn).unwrap().total, 1);
    }

    #[test]
    fn skipping_due_cards_pushes_them_to_tomorrow() {
        use crate::llm::Fix;

        let conn = memory_db();
        super::save_fixes(
            &conn,
            &[Fix {
                wrong: "i go".to_string(),
                right: "I went".to_string(),
                note: String::new(),
            }],
        )
        .unwrap();

        assert_eq!(super::drill_stats(&conn).unwrap().due, 1);
        assert_eq!(super::skip_due(&conn).unwrap(), 1);
        assert_eq!(super::drill_stats(&conn).unwrap().due, 0);
        assert!(super::next_drill(&conn, false, None).unwrap().is_none());
    }

    #[test]
    fn resetting_removes_the_queue_and_the_stored_fixes() {
        use crate::llm::Fix;

        let conn = memory_db();
        insert(
            &conn,
            "assistant",
            "ok",
            Some(r#"[{"wrong":"i go","right":"I went","note":"passado"}]"#),
        )
        .unwrap();
        super::save_fixes(
            &conn,
            &[Fix {
                wrong: "i go".to_string(),
                right: "I went".to_string(),
                note: "passado".to_string(),
            }],
        )
        .unwrap();

        assert_eq!(super::reset_fixes(&conn).unwrap(), 1);
        assert_eq!(super::drill_stats(&conn).unwrap().total, 0);

        // The startup backfill must not resurrect what was intentionally erased.
        super::backfill_fixes(&conn).unwrap();
        assert_eq!(super::drill_stats(&conn).unwrap().total, 0);
    }

    #[test]
    fn a_correct_answer_schedules_one_day_ahead() {
        use crate::llm::Fix;

        let conn = memory_db();
        super::save_fixes(
            &conn,
            &[Fix {
                wrong: "i go".to_string(),
                right: "I went".to_string(),
                note: String::new(),
            }],
        )
        .unwrap();

        let item = super::next_drill(&conn, true, None).unwrap().unwrap();
        super::review_drill(&conn, item.id, true).unwrap();

        let due_at: i64 = conn
            .query_row("SELECT due_at FROM fixes WHERE id = ?1", [item.id], |row| {
                row.get(0)
            })
            .unwrap();
        let delay = due_at - super::now();

        assert!(
            delay > 86_000_000 && delay <= 86_400_000,
            "a correct answer should be due in a day, got {delay} ms"
        );
    }

    #[test]
    fn next_drill_can_exclude_the_last_card() {
        use crate::llm::Fix;

        let conn = memory_db();
        super::save_fixes(
            &conn,
            &[Fix {
                wrong: "she don't".to_string(),
                right: "she doesn't".to_string(),
                note: String::new(),
            }],
        )
        .unwrap();

        let item = super::next_drill(&conn, true, None).unwrap().unwrap();
        assert!(super::next_drill(&conn, true, Some(item.id))
            .unwrap()
            .is_none());
    }

    #[test]
    fn backfills_the_drill_from_messages() {
        let conn = memory_db();
        insert(
            &conn,
            "assistant",
            "ok",
            Some(r#"[{"wrong":"i go","right":"I went","note":"passado"}]"#),
        )
        .unwrap();

        super::backfill_fixes(&conn).unwrap();
        super::backfill_fixes(&conn).unwrap();

        assert_eq!(super::drill_stats(&conn).unwrap().total, 1);
    }

    #[test]
    fn a_wrong_answer_resets_the_streak_and_reschedules_soon() {
        use crate::llm::Fix;

        let conn = memory_db();
        super::save_fixes(
            &conn,
            &[Fix {
                wrong: "she don't".to_string(),
                right: "she doesn't".to_string(),
                note: "terceira pessoa".to_string(),
            }],
        )
        .unwrap();

        let item = super::next_drill(&conn, true, None).unwrap().unwrap();
        super::review_drill(&conn, item.id, true).unwrap();
        let reviewed = super::review_drill(&conn, item.id, false).unwrap().unwrap();

        assert_eq!(reviewed.streak, 0);
        // A miss comes back in ten minutes, so it is scheduled but not due now.
        assert_eq!(super::drill_stats(&conn).unwrap().due, 0);
        assert!(super::next_drill(&conn, false, None).unwrap().is_none());
        assert!(super::next_drill(&conn, true, None).unwrap().is_some());

        let due_at: i64 = conn
            .query_row("SELECT due_at FROM fixes WHERE id = ?1", [item.id], |row| {
                row.get(0)
            })
            .unwrap();
        assert!(
            due_at - super::now() <= 600_000,
            "a miss should come back within ten minutes"
        );
    }

    #[test]
    fn intervals_follow_the_ladder() {
        use crate::llm::Fix;

        let conn = memory_db();
        super::save_fixes(
            &conn,
            &[Fix {
                wrong: "i go".to_string(),
                right: "I went".to_string(),
                note: String::new(),
            }],
        )
        .unwrap();

        let item = super::next_drill(&conn, true, None).unwrap().unwrap();
        let days = [1_i64, 3, 7, 21, 45];

        for expected_days in days {
            super::review_drill(&conn, item.id, true).unwrap();
            let due_at: i64 = conn
                .query_row("SELECT due_at FROM fixes WHERE id = ?1", [item.id], |row| {
                    row.get(0)
                })
                .unwrap();
            let delay = due_at - super::now();
            let expected = expected_days * 86_400_000;
            assert!(
                delay > expected - 5_000 && delay <= expected,
                "expected {expected_days} days, got {delay} ms"
            );
        }
    }
}
