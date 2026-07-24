import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { CacheService } from "../services/redisCacheService";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const BACKUP_DIR = path.join(__dirname, "../../../backups");

export const runRestore = async (backupFolderName?: string) => {
  try {
    const mongoUri = process.env.DB_URL || process.env.MONGO_URI || "mongodb://localhost:27017/kidroo";
    
    if (!fs.existsSync(BACKUP_DIR)) {
      throw new Error(`Backup directory '${BACKUP_DIR}' does not exist. No backups found.`);
    }

    const allBackups = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("backup_") || f.startsWith("realtime_"))
      .sort((a, b) => b.localeCompare(a));

    if (allBackups.length === 0) {
      throw new Error("No backup folders found in backups directory.");
    }

    let targetFolderName = backupFolderName;
    if (!targetFolderName) {
      targetFolderName = allBackups[0];
      console.log("\n📋 Available Backup Snapshots:");
      allBackups.slice(0, 5).forEach((folder, idx) => {
        const metaPath = path.join(BACKUP_DIR, folder, "metadata.json");
        let metaInfo = "";
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
            metaInfo = `(${meta.totalDocuments || 0} docs - ${meta.reason || "Scheduled"})`;
          } catch {}
        }
        console.log(`  ${idx === 0 ? "👉 [LATEST]" : "   "} ${folder} ${metaInfo}`);
      });
      console.log(`\nTo restore a specific earlier backup, run: npm run db:restore <folder_name>\n`);
    }

    const targetFolder = path.join(BACKUP_DIR, targetFolderName);

    if (!fs.existsSync(targetFolder)) {
      throw new Error(`Target backup folder '${targetFolderName}' does not exist.`);
    }

    console.log("🔄 Starting Kidroo Database Restore...");
    console.log(`📂 Restoring from Folder: ${targetFolderName}`);
    console.log(`Connecting to MongoDB...`);

    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    if (!db) throw new Error("Failed to connect to MongoDB.");

    const jsonFiles = fs.readdirSync(targetFolder).filter((f) => f.endsWith(".json") && f !== "metadata.json");
    console.log(`Found ${jsonFiles.length} collection files to restore.`);

    for (const fileName of jsonFiles) {
      const colName = path.basename(fileName, ".json");
      const filePath = path.join(targetFolder, fileName);
      const rawData = fs.readFileSync(filePath, "utf-8");
      const docs = JSON.parse(rawData);

      const parsedDocs = docs.map((doc: any) => {
        if (doc._id && typeof doc._id === "string" && doc._id.length === 24) {
          doc._id = new mongoose.Types.ObjectId(doc._id);
        }
        if (doc.createdAt) doc.createdAt = new Date(doc.createdAt);
        if (doc.updatedAt) doc.updatedAt = new Date(doc.updatedAt);
        return doc;
      });

      console.log(`  └─ Restoring collection '${colName}' (${parsedDocs.length} documents)...`);
      
      // Wipe existing collection and restore
      await db.collection(colName).deleteMany({});
      if (parsedDocs.length > 0) {
        await db.collection(colName).insertMany(parsedDocs);
      }
      console.log(`     ✅ Successfully restored '${colName}'`);
    }

    // Flush Redis Cache so API instantly returns restored MongoDB data
    try {
      await CacheService.delPattern("*");
      console.log("🧹 Flushed Redis cache so restored data is served immediately.");
    } catch {
      // Redis optional
    }

    console.log(`🎉 Database restoration completed cleanly!`);
    await mongoose.disconnect();
    console.log("🔌 Database connection closed.");
  } catch (error) {
    console.error("❌ Restoration Error:", error);
    process.exit(1);
  }
};

if (require.main === module) {
  const args = process.argv.slice(2);
  runRestore(args[0]);
}
