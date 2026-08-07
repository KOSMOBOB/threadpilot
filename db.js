'use strict';
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'threadpilot.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ext_id      TEXT,
    nick        TEXT NOT NULL,
    text        TEXT NOT NULL,
    media       INTEGER DEFAULT 0,
    niche_hit   TEXT,
    outcome     TEXT NOT NULL DEFAULT 'queued',
    skip_reason TEXT,
    style_kind  TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS comments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    human_score REAL,
    via_llm     INTEGER DEFAULT 0,
    published_at INTEGER NOT NULL,
    likes       INTEGER DEFAULT 0,
    replies     INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at  INTEGER NOT NULL,
    finished_at INTEGER,
    scanned     INTEGER DEFAULT 0,
    published   INTEGER DEFAULT 0,
    skipped     INTEGER DEFAULT 0,
    status      TEXT DEFAULT 'running'
  );
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);
  CREATE INDEX IF NOT EXISTS idx_comments_pub ON comments(published_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_ext_id ON posts(ext_id) WHERE ext_id IS NOT NULL;
`);

module.exports = db;
