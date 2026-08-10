import fs from 'fs';
import path from 'path';
import db, { initDb } from './db';

const jsonPath = path.resolve(process.cwd(), '../../data/thirukkural.json');

async function runMigration() {
  await initDb();
  
  if (!fs.existsSync(jsonPath)) {
    console.error('thirukkural.json not found at', jsonPath);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const kurals = data.kural || [];

  console.log(`Found ${kurals.length} kurals in JSON. Migrating...`);

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO Kurals (
        Number, Line1, Line2, Translation, mv, sp, mk, explanation, couplet, 
        transliteration1, transliteration2, title, tdk, tdk_explanation, split, mood
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const k of kurals) {
      stmt.run([
        k.Number,
        k.Line1,
        k.Line2,
        k.Translation,
        k.mv,
        k.sp,
        k.mk,
        k.explanation,
        k.couplet,
        k.transliteration1,
        k.transliteration2,
        k.title,
        k.tdk,
        k.tdk_explanation,
        k.split ? JSON.stringify(k.split) : null,
        k.mood || null
      ]);
    }

    stmt.finalize();
    db.run("COMMIT", (err) => {
      if (err) {
        console.error("Error committing transaction", err);
      } else {
        console.log("Migration complete.");
      }
      process.exit(0);
    });
  });
}

runMigration().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
