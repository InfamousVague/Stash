use rusqlite::{Connection, params};
use std::path::Path;
use std::sync::Mutex;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open(data_dir: &Path) -> anyhow::Result<Self> {
        std::fs::create_dir_all(data_dir)?;
        let db_path = data_dir.join("stash.db");
        let conn = Connection::open(&db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn run_migrations(&self) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(MIGRATIONS)?;
        Ok(())
    }

    // --- Users ---

    pub fn find_or_create_user(&self, apple_user_id: &str, email: Option<&str>) -> anyhow::Result<String> {
        let conn = self.conn.lock().unwrap();
        let existing: Option<String> = conn.query_row(
            "SELECT id FROM users WHERE apple_user_id = ?1", params![apple_user_id], |r| r.get(0)
        ).optional()?;

        if let Some(id) = existing {
            if let Some(email) = email {
                conn.execute("UPDATE users SET email = ?2 WHERE id = ?1", params![id, email])?;
            }
            return Ok(id);
        }

        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO users (id, apple_user_id, email) VALUES (?1, ?2, ?3)",
            params![id, apple_user_id, email],
        )?;
        Ok(id)
    }

    pub fn delete_user(&self, user_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM pending_actions WHERE user_id = ?1", params![user_id])?;
        conn.execute("DELETE FROM variables WHERE profile_id IN (SELECT id FROM profiles WHERE project_id IN (SELECT id FROM projects WHERE user_id = ?1))", params![user_id])?;
        conn.execute("DELETE FROM health WHERE project_id IN (SELECT id FROM projects WHERE user_id = ?1)", params![user_id])?;
        conn.execute("DELETE FROM profiles WHERE project_id IN (SELECT id FROM projects WHERE user_id = ?1)", params![user_id])?;
        conn.execute("DELETE FROM projects WHERE user_id = ?1", params![user_id])?;
        conn.execute("DELETE FROM device_keys WHERE user_id = ?1", params![user_id])?;
        conn.execute("DELETE FROM link_codes WHERE user_id = ?1", params![user_id])?;
        conn.execute("DELETE FROM api_tokens WHERE user_id = ?1", params![user_id])?;
        conn.execute("DELETE FROM users WHERE id = ?1", params![user_id])?;
        Ok(())
    }

    // --- API Tokens ---

    pub fn store_token(&self, id: &str, user_id: &str, label: &str, token_hash: &str, device_type: Option<&str>) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO api_tokens (id, user_id, label, token_hash, device_type) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, user_id, label, token_hash, device_type],
        )?;
        Ok(())
    }

    pub fn all_token_hashes(&self) -> anyhow::Result<Vec<(String, String, String)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, user_id, token_hash FROM api_tokens")?;
        let tokens = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok(tokens)
    }

    pub fn token_count(&self) -> anyhow::Result<usize> {
        let conn = self.conn.lock().unwrap();
        let count: usize = conn.query_row("SELECT COUNT(*) FROM api_tokens", [], |r| r.get(0))?;
        Ok(count)
    }

    pub fn update_token_last_used(&self, id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("UPDATE api_tokens SET last_used=datetime('now') WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn delete_token(&self, id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM api_tokens WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn find_token_by_label(&self, label: &str) -> anyhow::Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id FROM api_tokens WHERE label = ?1 LIMIT 1")?;
        let id = stmt.query_row(params![label], |row| row.get::<_, String>(0)).ok();
        Ok(id)
    }

    /// List all linked devices (tokens) for a user, excluding the watch itself.
    /// Returns (token_id, label, device_type, last_used) tuples.
    pub fn list_linked_devices(&self, user_id: &str) -> anyhow::Result<Vec<(String, String, Option<String>, Option<String>)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, label, device_type, last_used FROM api_tokens WHERE user_id = ?1 ORDER BY created_at"
        )?;
        let rows = stmt.query_map(params![user_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })?;
        let mut devices = Vec::new();
        for row in rows {
            devices.push(row?);
        }
        Ok(devices)
    }

    // --- Projects ---

    /// Upsert projects from a specific source device (workspace).
    /// Each tuple is (id, name, path, framework, active_profile).
    pub fn upsert_projects(
        &self,
        user_id: &str,
        source_device_id: &str,
        projects: &[(String, String, Option<String>, Option<String>, Option<String>)],
    ) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        for (id, name, path, framework, active_profile) in projects {
            conn.execute(
                "INSERT INTO projects (id, user_id, source_device_id, name, path, framework, active_profile)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    path=excluded.path,
                    framework=excluded.framework,
                    active_profile=excluded.active_profile,
                    source_device_id=excluded.source_device_id,
                    updated_at=datetime('now')",
                params![id, user_id, source_device_id, name, path, framework, active_profile],
            )?;
        }
        Ok(())
    }

    pub fn list_projects_for_device(&self, user_id: &str, source_device_id: &str) -> anyhow::Result<Vec<ProjectRow>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, source_device_id, name, path, framework, active_profile, created_at, updated_at
             FROM projects WHERE user_id = ?1 AND source_device_id = ?2 ORDER BY name"
        )?;
        let rows = stmt.query_map(params![user_id, source_device_id], |row| {
            Ok(ProjectRow {
                id: row.get(0)?,
                source_device_id: row.get(1)?,
                name: row.get(2)?,
                path: row.get(3)?,
                framework: row.get(4)?,
                active_profile: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn list_projects(&self, user_id: &str) -> anyhow::Result<Vec<ProjectRow>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, source_device_id, name, path, framework, active_profile, created_at, updated_at
             FROM projects WHERE user_id = ?1 ORDER BY name"
        )?;
        let rows = stmt.query_map(params![user_id], |row| {
            Ok(ProjectRow {
                id: row.get(0)?,
                source_device_id: row.get(1)?,
                name: row.get(2)?,
                path: row.get(3)?,
                framework: row.get(4)?,
                active_profile: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Delete projects pushed by a specific source device (called on full sync).
    /// This is scoped per-device so Mac A's sync doesn't wipe Mac B's data.
    pub fn delete_projects_for_device(&self, user_id: &str, source_device_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM variables WHERE profile_id IN (
                SELECT p.id FROM profiles p
                JOIN projects pr ON p.project_id = pr.id
                WHERE pr.user_id = ?1 AND pr.source_device_id = ?2
            )",
            params![user_id, source_device_id],
        )?;
        conn.execute(
            "DELETE FROM health WHERE project_id IN (
                SELECT id FROM projects WHERE user_id = ?1 AND source_device_id = ?2
            )",
            params![user_id, source_device_id],
        )?;
        conn.execute(
            "DELETE FROM profiles WHERE project_id IN (
                SELECT id FROM projects WHERE user_id = ?1 AND source_device_id = ?2
            )",
            params![user_id, source_device_id],
        )?;
        conn.execute(
            "DELETE FROM projects WHERE user_id = ?1 AND source_device_id = ?2",
            params![user_id, source_device_id],
        )?;
        Ok(())
    }

    pub fn update_active_profile(&self, user_id: &str, project_id: &str, profile: &str) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE projects SET active_profile = ?3, updated_at = datetime('now')
             WHERE id = ?1 AND user_id = ?2",
            params![project_id, user_id, profile],
        )?;
        Ok(changed > 0)
    }

    pub fn get_project(&self, user_id: &str, project_id: &str) -> anyhow::Result<Option<ProjectRow>> {
        let conn = self.conn.lock().unwrap();
        let row = conn.query_row(
            "SELECT id, source_device_id, name, path, framework, active_profile, created_at, updated_at
             FROM projects WHERE id = ?1 AND user_id = ?2",
            params![project_id, user_id],
            |row| Ok(ProjectRow {
                id: row.get(0)?,
                source_device_id: row.get(1)?,
                name: row.get(2)?,
                path: row.get(3)?,
                framework: row.get(4)?,
                active_profile: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            }),
        ).optional()?;
        Ok(row)
    }

    // --- Profiles ---

    pub fn upsert_profiles(&self, project_id: &str, profiles: &[(String, String)]) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        for (id, name) in profiles {
            conn.execute(
                "INSERT INTO profiles (id, project_id, name)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(id) DO UPDATE SET name=excluded.name",
                params![id, project_id, name],
            )?;
        }
        Ok(())
    }

    pub fn list_profiles(&self, project_id: &str) -> anyhow::Result<Vec<ProfileRow>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, created_at FROM profiles WHERE project_id = ?1 ORDER BY name"
        )?;
        let rows = stmt.query_map(params![project_id], |row| {
            Ok(ProfileRow {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn delete_profiles_for_project(&self, project_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM variables WHERE profile_id IN (SELECT id FROM profiles WHERE project_id = ?1)", params![project_id])?;
        conn.execute("DELETE FROM profiles WHERE project_id = ?1", params![project_id])?;
        Ok(())
    }

    // --- Variables (E2E encrypted) ---

    /// Upsert variables. Each variable has an `encrypted_for` JSON blob mapping
    /// device_id → base64 ciphertext. The relay never sees plaintext.
    pub fn upsert_variables(&self, profile_id: &str, vars: &[(String, String, String)]) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        for (id, key, encrypted_for) in vars {
            conn.execute(
                "INSERT INTO variables (id, profile_id, key, encrypted_for)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(id) DO UPDATE SET
                    key=excluded.key,
                    encrypted_for=excluded.encrypted_for,
                    updated_at=datetime('now')",
                params![id, profile_id, key, encrypted_for],
            )?;
        }
        Ok(())
    }

    pub fn list_variables(&self, profile_id: &str) -> anyhow::Result<Vec<VariableRow>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, key, encrypted_for, created_at, updated_at
             FROM variables WHERE profile_id = ?1 ORDER BY key"
        )?;
        let rows = stmt.query_map(params![profile_id], |row| {
            Ok(VariableRow {
                id: row.get(0)?,
                key: row.get(1)?,
                value_encrypted: row.get(2)?, // contains the encrypted_for JSON blob
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    // --- Device Keys (for E2E) ---

    pub fn upsert_device_key(
        &self,
        device_id: &str,
        user_id: &str,
        public_key: &str,
        device_type: &str,
        label: Option<&str>,
        lan_ip: Option<&str>,
        lan_port: Option<u16>,
    ) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        let lan_port_i64 = lan_port.map(|p| p as i64);
        if lan_ip.is_some() {
            conn.execute(
                "INSERT INTO device_keys (id, user_id, public_key, device_type, label, lan_ip, lan_port, lan_updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
                 ON CONFLICT(id) DO UPDATE SET
                    public_key=excluded.public_key,
                    device_type=excluded.device_type,
                    label=excluded.label,
                    lan_ip=excluded.lan_ip,
                    lan_port=excluded.lan_port,
                    lan_updated_at=datetime('now')",
                params![device_id, user_id, public_key, device_type, label, lan_ip, lan_port_i64],
            )?;
        } else {
            conn.execute(
                "INSERT INTO device_keys (id, user_id, public_key, device_type, label)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(id) DO UPDATE SET
                    public_key=excluded.public_key,
                    device_type=excluded.device_type,
                    label=excluded.label",
                params![device_id, user_id, public_key, device_type, label],
            )?;
        }
        Ok(())
    }

    pub fn list_device_keys(&self, user_id: &str) -> anyhow::Result<Vec<(String, String, String, Option<String>, Option<String>, Option<i64>, Option<String>)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, public_key, device_type, label, lan_ip, lan_port, lan_updated_at FROM device_keys WHERE user_id = ?1 ORDER BY created_at"
        )?;
        let rows = stmt.query_map(params![user_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<i64>>(5)?,
                row.get::<_, Option<String>>(6)?,
            ))
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn delete_device_key(&self, device_id: &str, user_id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM device_keys WHERE id = ?1 AND user_id = ?2",
            params![device_id, user_id],
        )?;
        Ok(())
    }

    pub fn variable_count_for_profile(&self, profile_id: &str) -> anyhow::Result<usize> {
        let conn = self.conn.lock().unwrap();
        let count: usize = conn.query_row(
            "SELECT COUNT(*) FROM variables WHERE profile_id = ?1", params![profile_id], |r| r.get(0)
        )?;
        Ok(count)
    }

    /// Get the profile_id for a given project and profile name
    pub fn get_profile_id(&self, project_id: &str, profile_name: &str) -> anyhow::Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let id = conn.query_row(
            "SELECT id FROM profiles WHERE project_id = ?1 AND name = ?2",
            params![project_id, profile_name],
            |r| r.get::<_, String>(0),
        ).optional()?;
        Ok(id)
    }

    // --- Health ---

    pub fn upsert_health(&self, project_id: &str, stale_count: i64, expiring_count: i64, exposed_count: i64) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO health (project_id, stale_count, expiring_count, exposed_count)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(project_id) DO UPDATE SET
                stale_count=excluded.stale_count,
                expiring_count=excluded.expiring_count,
                exposed_count=excluded.exposed_count,
                updated_at=datetime('now')",
            params![project_id, stale_count, expiring_count, exposed_count],
        )?;
        Ok(())
    }

    pub fn get_health(&self, project_id: &str) -> anyhow::Result<Option<HealthRow>> {
        let conn = self.conn.lock().unwrap();
        let row = conn.query_row(
            "SELECT stale_count, expiring_count, exposed_count, updated_at
             FROM health WHERE project_id = ?1",
            params![project_id],
            |row| Ok(HealthRow {
                stale_count: row.get(0)?,
                expiring_count: row.get(1)?,
                exposed_count: row.get(2)?,
                updated_at: row.get(3)?,
            }),
        ).optional()?;
        Ok(row)
    }

    // --- Pending Actions ---

    pub fn create_pending_action(&self, id: &str, user_id: &str, project_id: &str, action_type: &str, payload: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO pending_actions (id, user_id, project_id, action_type, payload)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, user_id, project_id, action_type, payload],
        )?;
        Ok(())
    }

    pub fn list_pending_actions(&self, user_id: &str) -> anyhow::Result<Vec<PendingActionRow>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, project_id, action_type, payload, status, created_at, completed_at
             FROM pending_actions WHERE user_id = ?1 AND status = 'pending'
             ORDER BY created_at"
        )?;
        let rows = stmt.query_map(params![user_id], |row| {
            Ok(PendingActionRow {
                id: row.get(0)?,
                project_id: row.get(1)?,
                action_type: row.get(2)?,
                payload: row.get(3)?,
                status: row.get(4)?,
                created_at: row.get(5)?,
                completed_at: row.get(6)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn complete_pending_action(&self, id: &str, user_id: &str) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE pending_actions SET status = 'completed', completed_at = datetime('now')
             WHERE id = ?1 AND user_id = ?2 AND status = 'pending'",
            params![id, user_id],
        )?;
        Ok(changed > 0)
    }

    // --- Link Codes ---

    pub fn create_link_code(&self, id: &str, user_id: &str, code: &str, expires_at: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO link_codes (id, user_id, code, expires_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, user_id, code, expires_at],
        )?;
        Ok(())
    }

    /// Returns user_id if code is valid, not expired, not used. Marks as used.
    pub fn redeem_link_code(&self, code: &str) -> anyhow::Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let row: Option<(String, String, bool)> = conn.query_row(
            "SELECT id, user_id, used FROM link_codes WHERE code = ?1 AND expires_at > datetime('now')",
            params![code],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, bool>(2)?)),
        ).optional()?;

        match row {
            Some((id, user_id, used)) if !used => {
                conn.execute(
                    "UPDATE link_codes SET used = 1 WHERE id = ?1",
                    params![id],
                )?;
                Ok(Some(user_id))
            }
            _ => Ok(None),
        }
    }

    // --- Master passphrase ---

    pub fn get_master_salt(&self) -> anyhow::Result<Option<Vec<u8>>> {
        let conn = self.conn.lock().unwrap();
        let salt: Option<Vec<u8>> = conn.query_row(
            "SELECT value FROM meta WHERE key='master_salt'", [], |r| r.get(0)
        ).optional()?;
        Ok(salt)
    }

    pub fn get_master_verify(&self) -> anyhow::Result<Option<Vec<u8>>> {
        let conn = self.conn.lock().unwrap();
        let verify: Option<Vec<u8>> = conn.query_row(
            "SELECT value FROM meta WHERE key='master_verify'", [], |r| r.get(0)
        ).optional()?;
        Ok(verify)
    }

    pub fn set_master_credentials(&self, salt: &[u8], verify: &[u8]) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('master_salt', ?1)",
            params![salt],
        )?;
        conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('master_verify', ?1)",
            params![verify],
        )?;
        Ok(())
    }
}

// --- Row types ---

pub struct ProjectRow {
    pub id: String,
    pub source_device_id: String,
    pub name: String,
    pub path: Option<String>,
    pub framework: Option<String>,
    pub active_profile: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub struct ProfileRow {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

pub struct VariableRow {
    pub id: String,
    pub key: String,
    pub value_encrypted: String,
    pub created_at: String,
    pub updated_at: String,
}

pub struct HealthRow {
    pub stale_count: i64,
    pub expiring_count: i64,
    pub exposed_count: i64,
    pub updated_at: String,
}

pub struct PendingActionRow {
    pub id: String,
    pub project_id: String,
    pub action_type: String,
    pub payload: String,
    pub status: String,
    pub created_at: String,
    pub completed_at: Option<String>,
}

// --- Optional extension ---

trait OptionalExt<T> {
    fn optional(self) -> rusqlite::Result<Option<T>>;
}

impl<T> OptionalExt<T> for rusqlite::Result<T> {
    fn optional(self) -> rusqlite::Result<Option<T>> {
        match self {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}

// --- Migrations ---

const MIGRATIONS: &str = r#"
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value BLOB
);

CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    apple_user_id   TEXT UNIQUE,
    email           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_tokens (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    label       TEXT NOT NULL,
    token_hash  TEXT NOT NULL,
    device_type TEXT,
    last_used   TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL REFERENCES users(id),
    source_device_id  TEXT NOT NULL,  -- which Mac pushed this project (workspace)
    name              TEXT NOT NULL,
    path              TEXT,
    framework         TEXT,
    active_profile    TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS variables (
    id              TEXT PRIMARY KEY,
    profile_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    key             TEXT NOT NULL,
    -- JSON blob: { "device_id": "base64_ciphertext", ... }
    -- Each entry is a per-device E2E encrypted value (X25519 + AES-256-GCM).
    encrypted_for   TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS device_keys (
    id          TEXT PRIMARY KEY,   -- device_id (UUID generated by device)
    user_id     TEXT NOT NULL REFERENCES users(id),
    public_key  TEXT NOT NULL,       -- base64-encoded X25519 public key
    device_type TEXT NOT NULL,       -- "watch", "ios", "mac", etc.
    label       TEXT,
    lan_ip      TEXT,
    lan_port    INTEGER,
    lan_updated_at TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS health (
    project_id      TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    stale_count     INTEGER NOT NULL DEFAULT 0,
    expiring_count  INTEGER NOT NULL DEFAULT 0,
    exposed_count   INTEGER NOT NULL DEFAULT 0,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pending_actions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id),
    project_id      TEXT NOT NULL,
    action_type     TEXT NOT NULL,
    payload         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at    TEXT
);

CREATE TABLE IF NOT EXISTS link_codes (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    code        TEXT NOT NULL UNIQUE,
    expires_at  TEXT NOT NULL,
    used        BOOLEAN NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
"#;
