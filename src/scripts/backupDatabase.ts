import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const BACKUP_DIR = path.join(__dirname, "../../../backups");
const RETENTION_DAYS = 14; // Keep last 14 days of backups

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
      console.log(`  └─ Backed up collection '${colName}': ${docs.length} documents`);
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

    // ── Retention Policy Cleanup ──
    const allBackups = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith("backup_"));
    const cutoffTime = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

    for (const bFolder of allBackups) {
      const fullPath = path.join(BACKUP_DIR, bFolder);
      const stat = fs.statSync(fullPath);
      if (stat.ctimeMs < cutoffTime) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`🧹 Cleaned up old backup folder (>14 days old): ${bFolder}`);
      }
    }

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
