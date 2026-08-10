import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), '../../data/thirukkural.db');
const db = new sqlite3.Database(dbPath);

import fs from 'fs';

export function syncExistingVideosToDb() {
  const dailyVideosDir = path.resolve(process.cwd(), '../../data/Daily_Videos');
  const statePath = path.resolve(process.cwd(), '../../data/state.json');

  if (!fs.existsSync(dailyVideosDir)) return;

  let stateHistory: any[] = [];
  if (fs.existsSync(statePath)) {
    try {
      const stateData = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      stateHistory = stateData.history || [];
    } catch (e) {}
  }

  try {
    const monthDirs = fs.readdirSync(dailyVideosDir);
    for (const monthFolder of monthDirs) {
      const monthFolderPath = path.join(dailyVideosDir, monthFolder);
      if (!fs.statSync(monthFolderPath).isDirectory()) continue;

      const files = fs.readdirSync(monthFolderPath);
      for (const file of files) {
        if (!file.endsWith('_final_video.mp4')) continue;

        const match = file.match(/^(\d{4}-\d{2}-\d{2})_(\d+)_final_video\.mp4$/);
        if (!match) continue;

        const tamilDate = match[1];
        const kuralNum = parseInt(match[2], 10);
        const videoRelPath = `/videos/${monthFolder}/${file}`;

        const matchedState = stateHistory.find(h => h.kuralNumber === kuralNum);
        const gregorianDate = matchedState ? matchedState.date : tamilDate;

        db.get(
          `SELECT id FROM DailySchedule WHERE kural_number = ? AND video_path = ?`,
          [kuralNum, videoRelPath],
          (err, row) => {
            if (!err && !row) {
              db.run(
                `INSERT INTO DailySchedule (kural_number, date, tamil_date, video_path, status) VALUES (?, ?, ?, ?, 'video_ready')`,
                [kuralNum, gregorianDate, tamilDate, videoRelPath]
              );
            }
          }
        );
      }
    }
  } catch (err) {
    console.error('Error syncing existing videos to DB:', err);
  }
}

export function initDb() {
  return new Promise<void>((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS Kurals (
          Number INTEGER PRIMARY KEY,
          Line1 TEXT,
          Line2 TEXT,
          Translation TEXT,
          mv TEXT,
          sp TEXT,
          mk TEXT,
          explanation TEXT,
          couplet TEXT,
          transliteration1 TEXT,
          transliteration2 TEXT,
          title TEXT,
          tdk TEXT,
          tdk_explanation TEXT,
          split TEXT,
          mood TEXT,
          kural_audio_path TEXT,
          meaning_audio_path TEXT,
          image_path TEXT
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS DailySchedule (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          kural_number INTEGER,
          date TEXT, -- Gregorian Date YYYY-MM-DD
          tamil_date TEXT, -- Tamil Date YYYY-MM-DD
          video_path TEXT,
          youtube_url TEXT,
          status TEXT, -- e.g. 'video_ready', 'published'
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (kural_number) REFERENCES Kurals (Number)
        )
      `, () => {
        db.run(`ALTER TABLE DailySchedule ADD COLUMN tamil_date TEXT`, () => {});
        db.run(`ALTER TABLE DailySchedule ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`, () => {});
        syncExistingVideosToDb();
        resolve();
      });
    });
  });
}

export default db;
