use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredMessage {
    pub id: i64,
    pub role: String,
    pub content: String,
    pub fixes: Option<String>,
    pub created_at: i64,
}

pub fn open(path: PathBuf) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    init(&conn)?;
    Ok(conn)
}

fn init(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            fixes TEXT,
            created_at INTEGER NOT NULL
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
        insert(&conn, "assistant", "You went yesterday.", Some(r#"[{"wrong":"i go","right":"I went","note":"passado"}]"#)).unwrap();

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
}
