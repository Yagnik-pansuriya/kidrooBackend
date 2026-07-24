import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const BACKUP_DIR = path.join(__dirname, "../../../backups");
const MAX_BACKUPS = 15; // Strictly keep maximum 15 backup folders to save disk space

/**
 * Prunes backup directory so total backup folders never exceed maxCount
 */
export const pruneExcessBackups = (backupDir: string = BACKUP_DIR, maxCount: number = MAX_BACKUPS) => {
  try {
    if (!fs.existsSync(backupDir)) return;
    const allBackups = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("backup_") || f.startsWith("realtime_"))
      .sort((a, b) => b.localeCompare(a)); // Sort newest first

    if (allBackups.length > maxCount) {
      const excessFolders = allBackups.slice(maxCount);
      for (const folder of excessFolders) {
        const fullPath = path.join(backupDir, folder);
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`🧹 Pruned old backup (max ${maxCount} limit): ${folder}`);
      }
    }
  } catch (err) {
    console.error("Error pruning excess backups:", err);
  }
};

export const runBackup = async () => {
  try {
    const mongoUri = process.env.DB_URL || process.env.MONGO_URI || "mongodb://localhost:27017/kidroo";
    console.log("📦 Starting Kidroo Database Backup...");
    console.log(`Connecting to MongoDB...`);
    
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    if (!db) throw new Error("Failed to get MongoDB database connection.");

    const now = new Date();
    const dateStr = now.toISOString().replace(/T/, "_").replace(/:/g, "-").split(".")[0];
    const targetFolder = path.join(BACKUP_DIR, `backup_${dateStr}`);

    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    fs.mkdirSync(targetFolder, { recursive: true });

    const collections = await db.listCollections().toArray();
    console.log(`Found ${collections.length} collections to backup.`);

    let totalDocs = 0;
    const summary: Record<string, number> = {};

    for (const colInfo of collections) {
      const colName = colInfo.name;
      const docs = await db.collection(colName).find({}).toArray();
      const filePath = path.join(targetFolder, `${colName}.json`);
      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), "utf-8");
      summary[colName] = docs.length;
      totalDocs += docs.length;
    }

    if (totalDocs === 0) {
      console.warn("⚠️ Aborted backup: Database has 0 documents. Existing backups preserved.");
      fs.rmSync(targetFolder, { recursive: true, force: true });
      await mongoose.disconnect();
      return;
    }

    // Save backup metadata
    const metadata = {
      timestamp: now.toISOString(),
      databaseName: db.databaseName,
      totalCollections: collections.length,
      totalDocuments: totalDocs,
      summary,
    };
    fs.writeFileSync(path.join(targetFolder, "metadata.json"), JSON.stringify(metadata, null, 2), "utf-8");

    console.log(`✅ Backup completed successfully!`);
    console.log(`📂 Location: ${targetFolder}`);
    console.log(`📊 Summary: ${totalDocs} documents across ${collections.length} collections.`);

    // ── Enforce Strict Max 15 Backups Limit ──
    pruneExcessBackups(BACKUP_DIR, MAX_BACKUPS);

    await mongoose.disconnect();
    console.log("🔌 Database connection closed cleanly.");
  } catch (error) {
    console.error("❌ Backup Error:", error);
    process.exit(1);
  }
};

if (require.main === module) {
  runBackup();
}
