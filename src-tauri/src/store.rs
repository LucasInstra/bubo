use rusqlite::backup::Backup;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

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
pub struct SessionSummary {
    pub id: i64,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub archived: bool,
    pub messages: i64,
    pub preview: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrillItem {
    pub id: i64,
    pub wrong: String,
    pub right: String,
    pub note: String,
    pub streak: i64,
    pub seen: i64,
    pub context: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrillStats {
    pub total: i64,
    pub due: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonProgress {
    pub lesson_id: String,
    pub step: i64,
    pub completed: bool,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayActivity {
    pub date: String,
    pub messages: i64,
    pub reviews: i64,
    pub correct: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopMistake {
    pub wrong: String,
    pub right: String,
    pub note: String,
    pub streak: i64,
    pub seen: i64,
    pub attempts: i64,
    pub correct: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressStats {
    pub streak: i64,
    pub messages: i64,
    pub cards: i64,
    pub due: i64,
    pub reviews: i64,
    pub correct: i64,
    pub accuracy: f64,
    pub days: Vec<DayActivity>,
    pub top: Vec<TopMistake>,
}

pub fn open(path: PathBuf) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    init(&conn)?;
    backfill_fixes(&conn)?;
    Ok(conn)
}

/// Writes a consistent copy of the live database to a user-chosen file.
pub fn backup_to(conn: &Connection, path: &Path) -> rusqlite::Result<()> {
    let mut destination = Connection::open(path)?;
    let backup = Backup::new(conn, &mut destination)?;
    backup.run_to_completion(5, Duration::from_millis(50), None)?;
    Ok(())
}

/// True when the file looks like a bubo database with all the tables we need.
pub fn is_backup(path: &Path) -> rusqlite::Result<bool> {
    let source = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let tables: i64 = source.query_row(
        "SELECT COUNT(*) FROM sqlite_master
         WHERE type = 'table' AND name IN ('sessions', 'messages', 'fixes', 'reviews')",
        [],
        |row| row.get(0),
    )?;
    if tables != 4 {
        return Ok(false);
    }
    let integrity: String = source.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    Ok(integrity == "ok")
}

/// Replaces the live database with a backup, keeping the same connection.
pub fn restore_from(conn: &mut Connection, path: &Path) -> rusqlite::Result<()> {
    let source = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    {
        let backup = Backup::new(&source, conn)?;
        backup.run_to_completion(5, Duration::from_millis(50), None)?;
    }
    init(conn)?;
    backfill_fixes(conn)?;
    Ok(())
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

pub(crate) fn init(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            fixes TEXT,
            session_id INTEGER,
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
        );
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fix_id INTEGER NOT NULL,
            correct INTEGER NOT NULL,
            reviewed_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            archived INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS lesson_progress (
            lesson_id TEXT PRIMARY KEY,
            step INTEGER NOT NULL DEFAULT 0,
            completed INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reviews_fix ON reviews(fix_id);
        CREATE INDEX IF NOT EXISTS idx_reviews_at ON reviews(reviewed_at);
        CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);",
    )?;
    // Older databases predate the link between a correction and its message.
    let _ = conn.execute("ALTER TABLE fixes ADD COLUMN message_id INTEGER", []);
    // ... the number of times a correction was produced again ...
    let _ = conn.execute(
        "ALTER TABLE fixes ADD COLUMN seen INTEGER NOT NULL DEFAULT 1",
        [],
    );
    // ... and the link between a message and a session.
    let _ = conn.execute("ALTER TABLE messages ADD COLUMN session_id INTEGER", []);
    // ... and whether an old conversation was put away.
    let _ = conn.execute(
        "ALTER TABLE sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
        [],
    );
    migrate_sessions(conn)
}

/// Gives every existing message a session and remembers which one is open.
fn migrate_sessions(conn: &Connection) -> rusqlite::Result<()> {
    let now = now();
    conn.execute(
        "INSERT INTO sessions (title, created_at, updated_at)
         SELECT COALESCE(
                  (SELECT substr(content, 1, 48) FROM messages WHERE role = 'user' ORDER BY id LIMIT 1),
                  'Conversation'
                ),
                COALESCE((SELECT MIN(created_at) FROM messages), ?1),
                COALESCE((SELECT MAX(created_at) FROM messages), ?1)
         WHERE NOT EXISTS (SELECT 1 FROM sessions)",
        [now],
    )?;

    let first: i64 = conn.query_row("SELECT MIN(id) FROM sessions", [], |row| row.get(0))?;
    conn.execute(
        "UPDATE messages SET session_id = ?1 WHERE session_id IS NULL",
        [first],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO meta (key, value)
         VALUES ('current_session', (SELECT CAST(MAX(id) AS TEXT) FROM sessions))",
        [],
    )?;
    Ok(())
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn set_current_session(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO meta (key, value) VALUES ('current_session', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [id.to_string()],
    )?;
    Ok(())
}

pub fn current_session(conn: &Connection) -> rusqlite::Result<i64> {
    if let Some(value) = conn
        .query_row(
            "SELECT value FROM meta WHERE key = 'current_session'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()?
    {
        if let Ok(id) = value.parse::<i64>() {
            let exists = conn
                .query_row("SELECT 1 FROM sessions WHERE id = ?1", [id], |_| Ok(()))
                .optional()?
                .is_some();
            if exists {
                return Ok(id);
            }
        }
    }

    let newest = conn.query_row("SELECT MAX(id) FROM sessions", [], |row| {
        row.get::<_, Option<i64>>(0)
    })?;
    match newest {
        Some(id) => {
            set_current_session(conn, id)?;
            Ok(id)
        }
        None => create_session(conn),
    }
}

pub fn create_session(conn: &Connection) -> rusqlite::Result<i64> {
    let stamp = now();
    conn.execute(
        "INSERT INTO sessions (title, created_at, updated_at) VALUES ('New chat', ?1, ?1)",
        [stamp],
    )?;
    let id = conn.last_insert_rowid();
    set_current_session(conn, id)?;
    Ok(id)
}

pub fn list_sessions(conn: &Connection) -> rusqlite::Result<Vec<SessionSummary>> {
    let mut statement = conn.prepare(
        "SELECT s.id, s.title, s.created_at, s.updated_at, s.archived,
                (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id),
                (SELECT content FROM messages m
                  WHERE m.session_id = s.id AND m.role = 'user'
                  ORDER BY m.id DESC LIMIT 1)
         FROM sessions s
         ORDER BY s.updated_at DESC, s.id DESC",
    )?;
    let rows = statement.query_map([], |row| {
        let preview: Option<String> = row.get(6)?;
        Ok(SessionSummary {
            id: row.get(0)?,
            title: row.get(1)?,
            created_at: row.get(2)?,
            updated_at: row.get(3)?,
            archived: row.get::<_, i64>(4)? != 0,
            messages: row.get(5)?,
            preview: preview.map(|text| text.chars().take(90).collect()),
        })
    })?;
    rows.collect()
}

pub fn rename_session(conn: &Connection, id: i64, title: &str) -> rusqlite::Result<()> {
    let title = title.trim();
    let title = if title.is_empty() { "New chat" } else { title };
    conn.execute(
        "UPDATE sessions SET title = ?1 WHERE id = ?2",
        params![title, id],
    )?;
    Ok(())
}

pub fn archive_session(conn: &Connection, id: i64, archived: bool) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE sessions SET archived = ?1 WHERE id = ?2",
        params![if archived { 1 } else { 0 }, id],
    )?;
    Ok(())
}

pub fn messages_for_session(
    conn: &Connection,
    session_id: i64,
    limit: i64,
) -> rusqlite::Result<Vec<StoredMessage>> {
    let mut statement = conn.prepare(
        "SELECT id, role, content, fixes, created_at FROM messages
         WHERE session_id = ?1 ORDER BY id DESC LIMIT ?2",
    )?;
    let rows = statement.query_map(params![session_id, limit], |row| {
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

pub fn open_session(
    conn: &Connection,
    id: i64,
    limit: i64,
) -> rusqlite::Result<Vec<StoredMessage>> {
    let exists = conn
        .query_row("SELECT 1 FROM sessions WHERE id = ?1", [id], |_| Ok(()))
        .optional()?
        .is_some();
    if !exists {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    set_current_session(conn, id)?;
    messages_for_session(conn, id, limit)
}

/// Removes a session and everything that belonged to it, returning the
/// session that should be open next.
pub fn delete_session(conn: &Connection, id: i64) -> rusqlite::Result<i64> {
    let current = current_session(conn)?;
    conn.execute(
        "DELETE FROM reviews WHERE fix_id IN (
            SELECT id FROM fixes WHERE message_id IN (
                SELECT id FROM messages WHERE session_id = ?1
            )
        )",
        [id],
    )?;
    conn.execute(
        "DELETE FROM fixes WHERE message_id IN (SELECT id FROM messages WHERE session_id = ?1)",
        [id],
    )?;
    conn.execute("DELETE FROM messages WHERE session_id = ?1", [id])?;
    conn.execute("DELETE FROM sessions WHERE id = ?1", [id])?;

    if id == current {
        let newest = conn.query_row("SELECT MAX(id) FROM sessions", [], |row| {
            row.get::<_, Option<i64>>(0)
        })?;
        let next = match newest {
            Some(next) => next,
            None => create_session(conn)?,
        };
        set_current_session(conn, next)?;
        Ok(next)
    } else {
        Ok(current)
    }
}

pub fn insert(
    conn: &Connection,
    role: &str,
    content: &str,
    fixes: Option<&str>,
) -> rusqlite::Result<i64> {
    let session_id = current_session(conn)?;
    insert_in_session(conn, role, content, fixes, session_id)
}

pub fn insert_in_session(
    conn: &Connection,
    role: &str,
    content: &str,
    fixes: Option<&str>,
    session_id: i64,
) -> rusqlite::Result<i64> {
    let stamp = now();
    conn.execute(
        "INSERT INTO messages (role, content, fixes, session_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![role, content, fixes, session_id, stamp],
    )?;
    let id = conn.last_insert_rowid();

    if role == "user" {
        let title: String = content.trim().chars().take(48).collect();
        conn.execute(
            "UPDATE sessions
             SET title = CASE WHEN title = 'New chat' AND ?1 != '' THEN ?1 ELSE title END,
                 updated_at = ?2
             WHERE id = ?3",
            params![title, stamp, session_id],
        )?;
    } else {
        conn.execute(
            "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
            params![stamp, session_id],
        )?;
    }

    Ok(id)
}

pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM messages WHERE id = ?1", [id])?;
    Ok(())
}

/// Deletes a message together with the corrections that point at it. The
/// correction text is also stripped from every remaining message so the
/// startup backfill cannot bring a shared card back.
pub fn delete_message(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    let pairs = {
        let mut statement = tx.prepare("SELECT wrong, right FROM fixes WHERE message_id = ?1")?;
        let rows = statement
            .query_map([id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        rows
    };

    tx.execute(
        "DELETE FROM reviews WHERE fix_id IN (SELECT id FROM fixes WHERE message_id = ?1)",
        [id],
    )?;
    tx.execute("DELETE FROM fixes WHERE message_id = ?1", [id])?;
    for (wrong, right) in &pairs {
        remove_fix_from_messages(&tx, wrong, right)?;
    }
    tx.execute("DELETE FROM messages WHERE id = ?1", [id])?;
    tx.commit()
}

pub fn set_message_fixes(conn: &Connection, id: i64, fixes: Option<&str>) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE messages SET fixes = ?1 WHERE id = ?2",
        params![fixes, id],
    )?;
    Ok(())
}

/// Removes one correction from the JSON of every stored message.
fn remove_fix_from_messages(conn: &Connection, wrong: &str, right: &str) -> rusqlite::Result<()> {
    let mut statement = conn.prepare("SELECT id, fixes FROM messages WHERE fixes IS NOT NULL")?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(statement);

    for (id, raw) in rows {
        let Ok(mut fixes) = serde_json::from_str::<Vec<Fix>>(&raw) else {
            continue;
        };
        let before = fixes.len();
        fixes.retain(|fix| !(fix.wrong == wrong && fix.right == right));
        if fixes.len() == before {
            continue;
        }
        let json = if fixes.is_empty() {
            None
        } else {
            serde_json::to_string(&fixes).ok()
        };
        set_message_fixes(conn, id, json.as_deref())?;
    }

    Ok(())
}

/// Removes a correction everywhere it can come back from: its reviews, the
/// fix row itself, and the `fixes` JSON stored on every message. Without the
/// JSON cleanup the startup backfill would resurrect the card on next launch.
pub fn delete_fix(
    conn: &Connection,
    _message_id: i64,
    wrong: &str,
    right: &str,
) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "DELETE FROM reviews WHERE fix_id IN (
            SELECT id FROM fixes WHERE wrong = ?1 AND right = ?2
        )",
        params![wrong, right],
    )?;
    tx.execute(
        "DELETE FROM fixes WHERE wrong = ?1 AND right = ?2",
        params![wrong, right],
    )?;
    remove_fix_from_messages(&tx, wrong, right)?;
    tx.commit()
}

#[cfg(test)]
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
        seen: row.get(5)?,
        context: row.get(6)?,
    })
}

/// Corrections are stored once; the drill later schedules them.
///
/// This is the non-counting path: it is used by the startup backfill and by
/// tests, so replaying the same correction never inflates its recurrence.
pub fn save_fixes(conn: &Connection, fixes: &[Fix]) -> rusqlite::Result<()> {
    save_fixes_inner(conn, fixes, None, false)
}

pub fn save_fixes_for_message(
    conn: &Connection,
    fixes: &[Fix],
    message_id: Option<i64>,
) -> rusqlite::Result<()> {
    save_fixes_inner(conn, fixes, message_id, true)
}

fn save_fixes_inner(
    conn: &Connection,
    fixes: &[Fix],
    message_id: Option<i64>,
    count_seen: bool,
) -> rusqlite::Result<()> {
    let now = now();
    let mut unique: HashSet<(&str, &str)> = HashSet::new();
    for fix in fixes {
        // The model occasionally repeats the same pair inside one response;
        // count a live recurrence once per turn, not once per array entry.
        if !unique.insert((fix.wrong.as_str(), fix.right.as_str())) {
            continue;
        }
        if count_seen {
            conn.execute(
                "INSERT INTO fixes (wrong, right, note, created_at, due_at, message_id, seen)
                 VALUES (?1, ?2, ?3, ?4, ?4, ?5, 1)
                 ON CONFLICT(wrong, right) DO UPDATE SET
                   seen = fixes.seen + 1,
                   note = CASE WHEN excluded.note != '' THEN excluded.note ELSE fixes.note END,
                   message_id = COALESCE(fixes.message_id, excluded.message_id)",
                params![fix.wrong, fix.right, fix.note, now, message_id],
            )?;
        } else {
            conn.execute(
                "INSERT OR IGNORE INTO fixes (wrong, right, note, created_at, due_at, message_id, seen)
                 VALUES (?1, ?2, ?3, ?4, ?4, ?5, 1)",
                params![fix.wrong, fix.right, fix.note, now, message_id],
            )?;
        }
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

pub fn lesson_progress(conn: &Connection) -> rusqlite::Result<Vec<LessonProgress>> {
    let mut statement = conn.prepare(
        "SELECT lesson_id, step, completed, updated_at
         FROM lesson_progress
         ORDER BY updated_at DESC",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(LessonProgress {
            lesson_id: row.get(0)?,
            step: row.get(1)?,
            completed: row.get::<_, i64>(2)? != 0,
            updated_at: row.get(3)?,
        })
    })?;
    rows.collect()
}

pub fn save_lesson_progress(
    conn: &Connection,
    lesson_id: &str,
    step: i64,
    completed: bool,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO lesson_progress (lesson_id, step, completed, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(lesson_id) DO UPDATE SET
           step = excluded.step,
           completed = excluded.completed,
           updated_at = excluded.updated_at",
        params![lesson_id, step, completed, now()],
    )?;
    Ok(())
}

/// A wrong answer from a lesson goes into the same spaced-repetition queue as
/// a chat correction, but without a message to link back to.
pub fn save_manual_fix(
    conn: &Connection,
    wrong: &str,
    right: &str,
    note: &str,
) -> rusqlite::Result<()> {
    let fix = crate::llm::Fix {
        wrong: wrong.to_string(),
        right: right.to_string(),
        note: note.to_string(),
    };
    save_fixes_inner(conn, &[fix], None, false)
}

const STREAK_SQL: &str = "
WITH activity AS (
    SELECT DISTINCT date(created_at / 1000, 'unixepoch', 'localtime') AS day FROM messages
    UNION
    SELECT DISTINCT date(reviewed_at / 1000, 'unixepoch', 'localtime') FROM reviews
),
ranked AS (
    SELECT day, julianday(day) - ROW_NUMBER() OVER (ORDER BY day) AS grp FROM activity
)
SELECT CASE
    WHEN (SELECT MAX(day) FROM activity) IN (date('now', 'localtime'), date('now', 'localtime', '-1 day'))
    THEN (SELECT COUNT(*) FROM ranked WHERE grp = (SELECT grp FROM ranked ORDER BY day DESC LIMIT 1))
    ELSE 0
END";

const DAYS_SQL: &str = "
WITH RECURSIVE days(d) AS (
    SELECT date('now', 'localtime', '-13 days')
    UNION ALL
    SELECT date(d, '+1 day') FROM days WHERE d < date('now', 'localtime')
)
SELECT d,
    (SELECT COUNT(*) FROM messages WHERE date(created_at / 1000, 'unixepoch', 'localtime') = d),
    (SELECT COUNT(*) FROM reviews WHERE date(reviewed_at / 1000, 'unixepoch', 'localtime') = d),
    (SELECT COUNT(*) FROM reviews WHERE correct = 1 AND date(reviewed_at / 1000, 'unixepoch', 'localtime') = d)
FROM days
ORDER BY d";

const TOP_SQL: &str = "
SELECT f.wrong, f.right, f.note, f.streak, f.seen, COUNT(r.id), COALESCE(SUM(r.correct), 0)
FROM fixes f
LEFT JOIN reviews r ON r.fix_id = f.id
GROUP BY f.id
ORDER BY COUNT(r.id) DESC, f.created_at DESC
LIMIT 5";

pub fn progress_stats(conn: &Connection) -> rusqlite::Result<ProgressStats> {
    let now = now();
    let messages = conn.query_row("SELECT COUNT(*) FROM messages", [], |row| row.get(0))?;
    let (cards, due) = conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(CASE WHEN due_at <= ?1 THEN 1 ELSE 0 END), 0) FROM fixes",
        [now],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let (reviews, correct) = conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(correct), 0) FROM reviews",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let streak = conn
        .query_row(STREAK_SQL, [], |row| row.get::<_, i64>(0))
        .unwrap_or(0);

    let mut day_statement = conn.prepare(DAYS_SQL)?;
    let days = day_statement
        .query_map([], |row| {
            Ok(DayActivity {
                date: row.get(0)?,
                messages: row.get(1)?,
                reviews: row.get(2)?,
                correct: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut top_statement = conn.prepare(TOP_SQL)?;
    let top = top_statement
        .query_map([], |row| {
            Ok(TopMistake {
                wrong: row.get(0)?,
                right: row.get(1)?,
                note: row.get(2)?,
                streak: row.get(3)?,
                seen: row.get(4)?,
                attempts: row.get(5)?,
                correct: row.get(6)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(ProgressStats {
        streak,
        messages,
        cards,
        due,
        reviews,
        correct,
        accuracy: if reviews > 0 {
            correct as f64 / reviews as f64
        } else {
            0.0
        },
        days,
        top,
    })
}

/// Removes cards whose only difference is letter case.
pub fn purge_case_only(conn: &Connection) -> rusqlite::Result<usize> {
    let mut statement = conn.prepare("SELECT id, wrong, right FROM fixes")?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(statement);

    let tx = conn.unchecked_transaction()?;
    let mut removed = 0;
    for (id, wrong, right) in rows {
        if wrong.trim().to_lowercase() == right.trim().to_lowercase() {
            tx.execute("DELETE FROM reviews WHERE fix_id = ?1", [id])?;
            tx.execute("DELETE FROM fixes WHERE id = ?1", [id])?;
            remove_fix_from_messages(&tx, &wrong, &right)?;
            removed += 1;
        }
    }
    tx.commit()?;
    Ok(removed)
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
    conn.execute("DELETE FROM reviews", [])?;
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
            "SELECT f.id, f.wrong, f.right, f.note, f.streak, f.seen, m.content
             FROM fixes f LEFT JOIN messages m ON m.id = f.message_id
             WHERE (?1 IS NULL OR f.id != ?1)
             ORDER BY f.due_at ASC, RANDOM() LIMIT 1",
            [exclude_id],
            row_to_item,
        )
        .optional()
    } else {
        conn.query_row(
            "SELECT f.id, f.wrong, f.right, f.note, f.streak, f.seen, m.content
             FROM fixes f LEFT JOIN messages m ON m.id = f.message_id
             WHERE f.due_at <= ?1 AND (?2 IS NULL OR f.id != ?2)
             ORDER BY f.due_at ASC, RANDOM() LIMIT 1",
            params![now, exclude_id],
            row_to_item,
        )
        .optional()
    }
}

/// Looks a card up by its wording, ignoring whether it is due. Used by the
/// focused practice view, which must show even a scheduled card.
pub fn focus_drill(
    conn: &Connection,
    wrong: &str,
    right: &str,
) -> rusqlite::Result<Option<DrillItem>> {
    conn.query_row(
        "SELECT f.id, f.wrong, f.right, f.note, f.streak, f.seen, m.content
         FROM fixes f LEFT JOIN messages m ON m.id = f.message_id
         WHERE f.wrong = ?1 AND f.right = ?2",
        params![wrong, right],
        row_to_item,
    )
    .optional()
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
            "SELECT f.id, f.wrong, f.right, f.note, f.streak, f.seen, m.content
             FROM fixes f LEFT JOIN messages m ON m.id = f.message_id
             WHERE f.id = ?1",
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
    let reviewed = now();

    conn.execute(
        "UPDATE fixes SET streak = ?1, due_at = ?2 WHERE id = ?3",
        params![streak, reviewed + delay, id],
    )?;
    conn.execute(
        "INSERT INTO reviews (fix_id, correct, reviewed_at) VALUES (?1, ?2, ?3)",
        params![id, if correct { 1 } else { 0 }, reviewed],
    )?;

    Ok(Some(DrillItem { streak, ..item }))
}

/// Marks the most recent review of a card as correct. This is the escape
/// hatch for a valid alternative that the exact-match checker rejected.
pub fn override_review(conn: &Connection, id: i64) -> rusqlite::Result<Option<DrillItem>> {
    let item = conn
        .query_row(
            "SELECT f.id, f.wrong, f.right, f.note, f.streak, f.seen, m.content
             FROM fixes f LEFT JOIN messages m ON m.id = f.message_id
             WHERE f.id = ?1",
            [id],
            row_to_item,
        )
        .optional()?;

    let Some(item) = item else {
        return Ok(None);
    };

    let reviewed = now();
    let streak = 1;
    let delay = INTERVALS_MS[0];

    conn.execute(
        "UPDATE fixes SET streak = ?1, due_at = ?2 WHERE id = ?3",
        params![streak, reviewed + delay, id],
    )?;
    conn.execute(
        "UPDATE reviews SET correct = 1
         WHERE id = (SELECT id FROM reviews WHERE fix_id = ?1 ORDER BY id DESC LIMIT 1)",
        [id],
    )?;

    Ok(Some(DrillItem { streak, ..item }))
}

#[cfg(test)]
mod tests {
    use super::{delete, insert, list, StoredMessage};

    #[test]
    fn renames_and_archives_sessions() {
        let conn = memory_db();
        let id = super::create_session(&conn).unwrap();

        super::rename_session(&conn, id, "Travel English").unwrap();
        let session = super::list_sessions(&conn)
            .unwrap()
            .into_iter()
            .find(|session| session.id == id)
            .unwrap();
        assert_eq!(session.title, "Travel English");
        assert!(!session.archived);

        super::archive_session(&conn, id, true).unwrap();
        let session = super::list_sessions(&conn)
            .unwrap()
            .into_iter()
            .find(|session| session.id == id)
            .unwrap();
        assert!(session.archived);

        super::archive_session(&conn, id, false).unwrap();
        let session = super::list_sessions(&conn)
            .unwrap()
            .into_iter()
            .find(|session| session.id == id)
            .unwrap();
        assert!(!session.archived);
    }

    #[test]
    fn overrides_an_incorrect_review() {
        let conn = memory_db();
        insert(&conn, "user", "i go yesterday", None).unwrap();
        super::save_fixes(
            &conn,
            &[super::Fix {
                wrong: "i go".to_string(),
                right: "I went".to_string(),
                note: String::new(),
            }],
        )
        .unwrap();

        let item = super::next_drill(&conn, true, None).unwrap().unwrap();
        super::review_drill(&conn, item.id, false).unwrap();
        let updated = super::override_review(&conn, item.id).unwrap().unwrap();
        assert_eq!(updated.streak, 1);

        let correct: i64 = conn
            .query_row(
                "SELECT correct FROM reviews WHERE fix_id = ?1 ORDER BY id DESC LIMIT 1",
                [item.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(correct, 1);
    }

    #[test]
    fn backs_up_and_restores_a_database() {
        let conn = memory_db();
        insert(&conn, "user", "i go yesterday", None).unwrap();
        let path = std::env::temp_dir().join(format!(
            "bubo-backup-test-{}-{}.db",
            std::process::id(),
            super::now()
        ));

        super::backup_to(&conn, &path).unwrap();
        assert!(super::is_backup(&path).unwrap());

        let mut restored = memory_db();
        super::restore_from(&mut restored, &path).unwrap();
        let messages = list(&restored, 10).unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].content, "i go yesterday");

        let _ = std::fs::remove_file(path);
    }

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
    fn drill_context_links_to_the_message() {
        use crate::llm::Fix;

        let conn = memory_db();
        let user_id = insert(&conn, "user", "i go yesterday", None).unwrap();
        super::save_fixes_for_message(
            &conn,
            &[Fix {
                wrong: "i go yesterday".to_string(),
                right: "I went yesterday".to_string(),
                note: String::new(),
            }],
            Some(user_id),
        )
        .unwrap();

        let item = super::next_drill(&conn, true, None).unwrap().unwrap();
        assert_eq!(item.context.as_deref(), Some("i go yesterday"));
    }

    #[test]
    fn deleting_a_message_removes_its_cards() {
        use crate::llm::Fix;

        let conn = memory_db();
        let user_id = insert(&conn, "user", "she don't know", None).unwrap();
        super::save_fixes_for_message(
            &conn,
            &[Fix {
                wrong: "she don't".to_string(),
                right: "she doesn't".to_string(),
                note: String::new(),
            }],
            Some(user_id),
        )
        .unwrap();

        super::delete_message(&conn, user_id).unwrap();
        assert_eq!(super::drill_stats(&conn).unwrap().total, 0);
        assert!(list(&conn, 10).unwrap().is_empty());
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

    #[test]
    fn progress_tracks_reviews_and_reset() {
        use crate::llm::Fix;

        let conn = memory_db();
        insert(&conn, "user", "i go yesterday", None).unwrap();
        let bot = insert(&conn, "assistant", "ok", None).unwrap();
        super::save_fixes_for_message(
            &conn,
            &[Fix {
                wrong: "i go".to_string(),
                right: "I went".to_string(),
                note: "passado".to_string(),
            }],
            Some(bot),
        )
        .unwrap();

        let item = super::next_drill(&conn, true, None).unwrap().unwrap();
        super::review_drill(&conn, item.id, true).unwrap();

        let stats = super::progress_stats(&conn).unwrap();
        assert_eq!(stats.messages, 2);
        assert_eq!(stats.cards, 1);
        assert_eq!(stats.reviews, 1);
        assert_eq!(stats.correct, 1);
        assert!((stats.accuracy - 1.0).abs() < f64::EPSILON);
        assert_eq!(stats.days.len(), 14);
        assert_eq!(stats.top[0].attempts, 1);
        assert_eq!(stats.top[0].correct, 1);
        assert!(stats.streak >= 1);

        super::reset_fixes(&conn).unwrap();
        let after = super::progress_stats(&conn).unwrap();
        assert_eq!(after.reviews, 0);
        assert_eq!(after.cards, 0);
    }

    #[test]
    fn sessions_create_open_and_delete() {
        let conn = memory_db();
        let first = super::current_session(&conn).unwrap();
        insert(&conn, "user", "hello from the first session", None).unwrap();

        let second = super::create_session(&conn).unwrap();
        assert_ne!(first, second);
        insert(&conn, "user", "hello from the second session", None).unwrap();

        let sessions = super::list_sessions(&conn).unwrap();
        assert_eq!(sessions.len(), 2);
        assert_eq!(sessions[0].id, second);
        assert!(sessions[0].title.contains("hello from the second"));

        let messages = super::open_session(&conn, first, 200).unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(super::current_session(&conn).unwrap(), first);

        let next = super::delete_session(&conn, first).unwrap();
        assert_eq!(next, second);
        let remaining = super::list_sessions(&conn).unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, second);
    }

    #[test]
    fn seen_increments_on_live_save() {
        use crate::llm::Fix;

        let conn = memory_db();
        let user_id = insert(&conn, "user", "i go yesterday", None).unwrap();
        let fix = Fix {
            wrong: "i go yesterday".to_string(),
            right: "I went yesterday".to_string(),
            note: "passado".to_string(),
        };

        super::save_fixes_for_message(&conn, std::slice::from_ref(&fix), Some(user_id)).unwrap();
        super::save_fixes_for_message(&conn, &[fix], Some(user_id)).unwrap();

        let item = super::next_drill(&conn, false, None)
            .unwrap()
            .expect("due item");
        assert_eq!(item.seen, 2);

        let focused = super::focus_drill(&conn, "i go yesterday", "I went yesterday")
            .unwrap()
            .expect("focused item");
        assert_eq!(focused.seen, 2);
    }

    #[test]
    fn backfill_does_not_increment_seen() {
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

        let item = super::focus_drill(&conn, "i go", "I went")
            .unwrap()
            .expect("card from backfill");
        assert_eq!(item.seen, 1);

        let top = super::progress_stats(&conn).unwrap().top;
        assert_eq!(top[0].seen, 1);
    }

    #[test]
    fn focus_drill_returns_a_card_even_when_not_due() {
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

        assert_eq!(super::skip_due(&conn).unwrap(), 1);
        assert!(super::next_drill(&conn, false, None).unwrap().is_none());

        let focused = super::focus_drill(&conn, "i go", "I went")
            .unwrap()
            .expect("focused card is not limited by due date");
        assert_eq!(focused.right, "I went");
        assert!(super::focus_drill(&conn, "missing", "card")
            .unwrap()
            .is_none());
    }

    #[test]
    fn delete_fix_removes_reviews_rows_and_message_json() {
        use crate::llm::Fix;

        let conn = memory_db();
        let fixes = vec![
            Fix {
                wrong: "i go".to_string(),
                right: "I went".to_string(),
                note: "passado".to_string(),
            },
            Fix {
                wrong: "she don't".to_string(),
                right: "she doesn't".to_string(),
                note: String::new(),
            },
        ];
        let bot = insert(
            &conn,
            "assistant",
            "ok",
            Some(r#"[{"wrong":"i go","right":"I went","note":"passado"},{"wrong":"she don't","right":"she doesn't","note":""}]"#),
        )
        .unwrap();
        super::save_fixes_for_message(&conn, &fixes, Some(bot)).unwrap();

        let item = super::focus_drill(&conn, "i go", "I went")
            .unwrap()
            .expect("saved card");
        super::review_drill(&conn, item.id, true).unwrap();

        super::delete_fix(&conn, bot, "i go", "I went").unwrap();

        let fixes_left: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM fixes WHERE wrong = 'i go' AND right = 'I went'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let reviews_left: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM reviews WHERE fix_id = ?1",
                [item.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(fixes_left, 0);
        assert_eq!(reviews_left, 0);
        assert!(super::focus_drill(&conn, "i go", "I went")
            .unwrap()
            .is_none());

        let stored: Option<String> = conn
            .query_row("SELECT fixes FROM messages WHERE id = ?1", [bot], |row| {
                row.get(0)
            })
            .unwrap();
        let stored = stored.expect("the other correction stays on the message");
        assert!(!stored.contains("i go"));
        assert!(stored.contains("she don't"));

        // The startup backfill must not bring the deleted card back.
        super::backfill_fixes(&conn).unwrap();
        assert!(super::focus_drill(&conn, "i go", "I went")
            .unwrap()
            .is_none());
        assert_eq!(super::drill_stats(&conn).unwrap().total, 1);
    }

    #[test]
    fn deleting_a_message_strips_a_shared_pair_from_other_json() {
        use crate::llm::Fix;

        let conn = memory_db();
        let user = insert(&conn, "user", "i go yesterday", None).unwrap();
        let _bot = insert(
            &conn,
            "assistant",
            "ok",
            Some(r#"[{"wrong":"i go","right":"I went","note":"past"}]"#),
        )
        .unwrap();
        let other = insert(
            &conn,
            "assistant",
            "ok",
            Some(r#"[{"wrong":"i go","right":"I went","note":"past"}]"#),
        )
        .unwrap();
        super::save_fixes_for_message(
            &conn,
            &[Fix {
                wrong: "i go".to_string(),
                right: "I went".to_string(),
                note: "past".to_string(),
            }],
            Some(user),
        )
        .unwrap();

        super::delete_message(&conn, user).unwrap();
        assert_eq!(super::drill_stats(&conn).unwrap().total, 0);

        let stored: Option<String> = conn
            .query_row("SELECT fixes FROM messages WHERE id = ?1", [other], |row| {
                row.get(0)
            })
            .unwrap();
        assert!(stored.is_none());

        // The shared JSON was cleaned, so startup backfill stays empty.
        super::backfill_fixes(&conn).unwrap();
        assert_eq!(super::drill_stats(&conn).unwrap().total, 0);
    }

    #[test]
    fn purging_case_only_strips_the_message_json() {
        use crate::llm::Fix;

        let conn = memory_db();
        let bot = insert(
            &conn,
            "assistant",
            "ok",
            Some(r#"[{"wrong":"i went out on friday","right":"I went out on Friday","note":""}]"#),
        )
        .unwrap();
        super::save_fixes(
            &conn,
            &[Fix {
                wrong: "i went out on friday".to_string(),
                right: "I went out on Friday".to_string(),
                note: String::new(),
            }],
        )
        .unwrap();

        assert_eq!(super::purge_case_only(&conn).unwrap(), 1);

        let stored: Option<String> = conn
            .query_row("SELECT fixes FROM messages WHERE id = ?1", [bot], |row| {
                row.get(0)
            })
            .unwrap();
        assert!(stored.is_none());

        super::backfill_fixes(&conn).unwrap();
        assert_eq!(super::drill_stats(&conn).unwrap().total, 0);
    }

    #[test]
    fn lesson_progress_round_trips() {
        let conn = memory_db();
        assert!(super::lesson_progress(&conn).unwrap().is_empty());

        super::save_lesson_progress(&conn, "to_be", 1, false).unwrap();
        super::save_lesson_progress(&conn, "to_be", 2, true).unwrap();
        super::save_lesson_progress(&conn, "past_simple", 0, false).unwrap();

        let rows = super::lesson_progress(&conn).unwrap();
        assert_eq!(rows.len(), 2);
        let to_be = rows
            .iter()
            .find(|row| row.lesson_id == "to_be")
            .expect("to_be progress");
        assert_eq!(to_be.step, 2);
        assert!(to_be.completed);
    }

    #[test]
    fn lesson_fix_enters_the_practice_queue() {
        let conn = memory_db();
        super::save_manual_fix(&conn, "I go", "I went", "past simple").unwrap();
        super::save_manual_fix(&conn, "I go", "I went", "past simple").unwrap();

        let stats = super::drill_stats(&conn).unwrap();
        assert_eq!(stats.total, 1);
        assert_eq!(stats.due, 1);

        let item = super::next_drill(&conn, false, None)
            .unwrap()
            .expect("due lesson card");
        assert_eq!(item.wrong, "I go");
        assert_eq!(item.right, "I went");
        assert_eq!(item.note, "past simple");
        assert!(item.context.is_none());
    }
}
