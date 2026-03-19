import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import User from "./src/models/user";

async function deleteOldAdmin() {
  try {
    const dbUrl = process.env.DB_URL;
    if (!dbUrl) {
      throw new Error("DB_URL environment variable is not set");
    }

    await mongoose.connect(dbUrl);
    console.log("✓ Connected to MongoDB");

    // Delete the old admin user with wrong password
    const result = await User.deleteOne({
      email: "admin@kidroo.com",
    });

    if (result.deletedCount > 0) {
      console.log("✅ Old admin user deleted");
    } else {
      console.log("ℹ️  No admin user found to delete");
    }
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("✓ Database connection closed");
  }
}

deleteOldAdmin();
