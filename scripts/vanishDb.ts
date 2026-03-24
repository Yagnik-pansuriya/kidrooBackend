import mongoose from "mongoose";
import * as dotenv from "dotenv";

dotenv.config();

const DB_URL = process.env.DB_URL;
console.log(DB_URL);

if (!DB_URL) {
  console.error("Please define the DB_URL environment variable inside .env");
  process.exit(1);
}

const vanishDatabase = async () => {
  try {
    console.log("Connecting to Database...");
    await mongoose.connect(DB_URL);
    console.log("Connected Successfully.");

    console.log("WARN: Dropping the entire database...");
    
    // This will drop the currently connected database entirely.
    if (mongoose.connection.db) {
        await mongoose.connection.db.dropDatabase();
        console.log("Database successfully dropped and vanished.");
    } else {
        console.warn("Could not retrieve connection.db object.");
    }

    process.exit(0);
  } catch (error) {
    console.error("Error vanishing database:", error);
    process.exit(1);
  }
};

vanishDatabase();
