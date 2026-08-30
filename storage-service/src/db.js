// SQLite via better-sqlite3: synchronous (no callback/promise plumbing for what's a tiny,
// single-process service), and plain SQL rather than an ORM — D-021 calls for "essentially
// CRUD... nothing more," and an ORM would be one more abstraction to learn for no benefit
// at this size, especially given the schema is two small tables.
const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    text TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_plans_user ON plans(user_id);
`);

module.exports = db;
