import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const BACKUP_DIR = path.join(__dirname, "../../../backups");

export const runRestore = async (backupFolderName?: string) => {
  try {
    const mongoUri = process.env.DB_URL || process.env.MONGO_URI || "mongodb://localhost:27017/kidroo";
    
    if (!fs.existsSync(BACKUP_DIR)) {
      throw new Error(`Backup directory '${BACKUP_DIR}' does not exist. No backups found.`);
    }

    let targetFolder = "";
    if (backupFolderName) {
      targetFolder = path.join(BACKUP_DIR, backupFolderName);
    } else {
      // Find latest backup folder
      const allBackups = fs
        .readdirSync(BACKUP_DIR)
        .filter((f) => f.startsWith("backup_"))
        .sort((a, b) => b.localeCompare(a));

      if (allBackups.length === 0) {
        throw new Error("No backup folders starting with 'backup_' found in backups directory.");
      }
      targetFolder = path.join(BACKUP_DIR, allBackups[0]);
    }

    if (!fs.existsSync(targetFolder)) {
      throw new Error(`Target backup folder '${targetFolder}' does not exist.`);
    }

    console.log("🔄 Starting Kidroo Database Restore...");
    console.log(`📂 Using Backup Folder: ${targetFolder}`);
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

      // Convert String _id and BSON types if necessary
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
