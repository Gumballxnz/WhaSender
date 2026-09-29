const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/whasender.db');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 1000');

function initializeDatabase() {
  db.exec(`
    -- Contatos e mapeamento arquivo → número
    CREATE TABLE IF NOT EXISTS contacts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      phone       TEXT NOT NULL UNIQUE,
      file_name   TEXT NOT NULL,
      active      INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- Configurações do sistema (chave-valor)
    CREATE TABLE IF NOT EXISTS settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL
    );

    -- Inserir configurações padrão
    INSERT OR IGNORE INTO settings VALUES ('delay_ms', '30000');
    INSERT OR IGNORE INTO settings VALUES ('schedule_time', '15:00');
    INSERT OR IGNORE INTO settings VALUES ('schedule_enabled', 'false');
    INSERT OR IGNORE INTO settings VALUES ('max_per_dispatch', '104');
    INSERT OR IGNORE INTO settings VALUES ('batch_size', '0');
    INSERT OR IGNORE INTO settings VALUES ('batch_pause_minutes', '10');
    INSERT OR IGNORE INTO settings VALUES ('max_pauses', '0');

    -- Histórico de disparos
    CREATE TABLE IF NOT EXISTS dispatch_sessions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at    TEXT DEFAULT (datetime('now')),
      finished_at   TEXT,
      total         INTEGER DEFAULT 0,
      sent          INTEGER DEFAULT 0,
      errors        INTEGER DEFAULT 0,
      status        TEXT DEFAULT 'RUNNING'
    );

    -- Log individual por envio
    CREATE TABLE IF NOT EXISTS dispatch_logs (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id          INTEGER REFERENCES dispatch_sessions(id),
      contact_id          INTEGER REFERENCES contacts(id),
      file_name           TEXT,
      status              TEXT,
      error_message       TEXT,
      sent_at             TEXT DEFAULT (datetime('now'))
    );

    -- Todos os números já gerados (unicidade global permanente)
    CREATE TABLE IF NOT EXISTS generated_phones (
      phone       TEXT PRIMARY KEY,
      prefix      TEXT NOT NULL,
      session_id  INTEGER NOT NULL,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- Sessões de geração (histórico completo)
    CREATE TABLE IF NOT EXISTS generation_sessions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      prefix           TEXT NOT NULL,
      total_numbers    INTEGER NOT NULL,
      total_parts      INTEGER NOT NULL,
      numbers_per_part INTEGER NOT NULL,
      status           TEXT DEFAULT 'RUNNING',
      started_at       TEXT DEFAULT (datetime('now')),
      finished_at      TEXT,
      error_message    TEXT
    );

    -- Índices para consultas rápidas de métricas
    CREATE INDEX IF NOT EXISTS idx_generated_phones_prefix ON generated_phones(prefix);
    CREATE INDEX IF NOT EXISTS idx_generated_phones_session ON generated_phones(session_id);

    -- Tabela de cache de estatísticas de prefixo
    CREATE TABLE IF NOT EXISTS phone_stats (
      prefix TEXT PRIMARY KEY,
      count INTEGER DEFAULT 0
    );

    -- Trigger de Inserção
    CREATE TRIGGER IF NOT EXISTS trg_phone_insert AFTER INSERT ON generated_phones
    BEGIN
      INSERT INTO phone_stats (prefix, count)
      VALUES (new.prefix, 1)
      ON CONFLICT(prefix) DO UPDATE SET count = count + 1;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_phone_delete AFTER DELETE ON generated_phones
    BEGIN
      UPDATE phone_stats SET count = count - 1 WHERE prefix = old.prefix;
    END;

    CREATE TABLE IF NOT EXISTS validation_sessions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT,
      started_at    TEXT DEFAULT (datetime('now')),
      finished_at   TEXT,
      total         INTEGER DEFAULT 0,
      valid_count   INTEGER DEFAULT 0,
      invalid_count INTEGER DEFAULT 0,
      status        TEXT DEFAULT 'RUNNING'
    );

    CREATE TABLE IF NOT EXISTS validation_numbers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  INTEGER REFERENCES validation_sessions(id) ON DELETE CASCADE,
      phone       TEXT NOT NULL,
      exists_wa   INTEGER NOT NULL,
      jid         TEXT,
      checked_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_val_session ON validation_numbers(session_id);
    CREATE INDEX IF NOT EXISTS idx_val_phone ON validation_numbers(phone);

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS organizations (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      slug          TEXT NOT NULL UNIQUE,
      owner_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS organization_members (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role            TEXT NOT NULL DEFAULT 'member',
      joined_at       TEXT DEFAULT (datetime('now')),
      UNIQUE(organization_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS organization_invites (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      code            TEXT NOT NULL UNIQUE,
      role            TEXT NOT NULL DEFAULT 'member',
      created_by      INTEGER NOT NULL REFERENCES users(id),
      created_at      TEXT DEFAULT (datetime('now')),
      expires_at      TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
    CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_invites_code ON organization_invites(code);
  `);

  const crypto = require('crypto');
  const existingJwt = db.prepare('SELECT value FROM settings WHERE key = ?').get('jwt_secret');
  if (!existingJwt) {
    const secret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('jwt_secret', secret);
  }

  const existingRefreshJwt = db.prepare('SELECT value FROM settings WHERE key = ?').get('jwt_refresh_secret');
  if (!existingRefreshJwt) {
    const refreshSecret = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('jwt_refresh_secret', refreshSecret);
  }

  const statsCount = db.prepare('SELECT COUNT(*) as count FROM phone_stats').get().count;
  if (statsCount === 0) {
    console.log('[DB] Inicializando tabela de cache phone_stats...');
    db.exec(`
      INSERT OR REPLACE INTO phone_stats (prefix, count)
      SELECT prefix, COUNT(*) FROM generated_phones GROUP BY prefix;
    `);
    console.log('[DB] Tabela phone_stats inicializada com sucesso.');
  }

  console.log('[DB] ✅ Banco de dados inicializado');
}

db.getJwtSecret = function () {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('jwt_secret');
  return row ? row.value : process.env.JWT_SECRET;
};

db.getJwtRefreshSecret = function () {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('jwt_refresh_secret');
  return row ? row.value : process.env.JWT_REFRESH_SECRET;
};

initializeDatabase();

module.exports = db;
