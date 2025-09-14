import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile = process.env.SQLITE_FILE || path.join(__dirname, 'data.sqlite');

sqlite3.verbose();
export const db = new sqlite3.Database(dbFile);

export function initDb(){
  db.serialize(()=>{
    db.run(`CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      pass TEXT,
      nickname TEXT UNIQUE,
      verified INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_score INTEGER DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS rooms(
      id TEXT PRIMARY KEY,
      name TEXT,
      owner INTEGER,
      invite TEXT,
      is_private INTEGER DEFAULT 0,
      pass TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS scores(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      delta INTEGER,
      when_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS friends(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      friend_id INTEGER
    )`);
  });
}
