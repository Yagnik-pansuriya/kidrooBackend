import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { pruneExcessBackups } from "../scripts/backupDatabase";

const BACKUP_DIR = path.join(__dirname, "../../../backups");
let lastBackupTime = 0;
const DEBOUNCE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes buffer to avoid excessive disk I/O

/**
 * Non-blocking real-time background backup trigger.
 * Called whenever products, categories, offers, orders, or accounts are mutated.
 * Strictly maintains MAX 15 total backup folders.
 */
export const triggerRealtimeBackup = (reason: string): void => {
  const now = Date.now();
  if (now - lastBackupTime < DEBOUNCE_INTERVAL_MS) {
    // A backup was taken within the last 5 minutes; skip to optimize performance
    return;
  }
  lastBackupTime = now;

  // Run asynchronously in background without delaying HTTP request/response
  setImmediate(async () => {
    try {
      const db = mongoose.connection.db;
      if (!db) return;

      const dateStr = new Date().toISOString().replace(/T/, "_").replace(/:/g, "-").split(".")[0];
      const targetFolder = path.join(BACKUP_DIR, `realtime_${dateStr}`);

      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }
      fs.mkdirSync(targetFolder, { recursive: true });

      const collections = await db.listCollections().toArray();
      let totalDocs = 0;
      const summary: Record<string, number> = {};

      for (const colInfo of collections) {
        const colName = colInfo.name;
        const docs = await db.collection(colName).find({}).toArray();
        fs.writeFileSync(path.join(targetFolder, `${colName}.json`), JSON.stringify(docs, null, 2), "utf-8");
        summary[colName] = docs.length;
        totalDocs += docs.length;
      }

      if (totalDocs === 0) {
        fs.rmSync(targetFolder, { recursive: true, force: true });
        console.log(`[RealtimeBackup] Skipped empty backup (0 docs). Existing backups preserved.`);
        return;
      }

      fs.writeFileSync(
        path.join(targetFolder, "metadata.json"),
        JSON.stringify({ timestamp: new Date().toISOString(), reason, totalDocuments: totalDocs, summary }, null, 2),
        "utf-8"
      );

      console.log(`[RealtimeBackup] Saved instant backup triggered by '${reason}' (${totalDocs} docs).`);

      // Enforce strict 15 backups max limit
      pruneExcessBackups(BACKUP_DIR, 15);
    } catch (err) {
      console.error("[RealtimeBackup] Failed real-time background backup:", err);
    }
  });
};
