import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import User from "../src/models/user";
import { validatePasswordStrength } from "../src/utils/password";

/**
 * Seed script to create an admin user
 * Usage: npm run seed
 *
 * This script creates a default admin user in the database.
 * You can modify the credentials below before running.
 */

interface AdminData {
  name: string;
  userName: string;
  email: string;
  password: string;
  role: "admin";
}

// Default admin credentials (CHANGE THESE!)
const defaultAdmin: AdminData = {
  name: "Kidroo Admin",
  userName: "admin",
  email: "admin@kidroo.com",
  password: "Admin@123", // Must meet password strength requirements: uppercase, lowercase, number, special char
  role: "admin",
};

const seedAdmin = async (): Promise<void> => {
  try {
    const dbUrl = process.env.DB_URL;

    if (!dbUrl) {
      throw new Error("DB_URL environment variable is not set");
    }

    // Connect to MongoDB
    console.log("Connecting to database...");
    await mongoose.connect(dbUrl);
    console.log("✓ Connected to MongoDB");

    // Validate password strength
    const passwordValidation = validatePasswordStrength(defaultAdmin.password);
    if (!passwordValidation.isValid) {
      console.error("❌ Password does not meet strength requirements:");
      passwordValidation.errors.forEach((err) => console.error(`  - ${err}`));
      throw new Error("Invalid admin password");
    }

    // Check if admin already exists
    const existingAdmin = await User.findOne({
      $or: [{ email: defaultAdmin.email }, { userName: defaultAdmin.userName }],
    });

    if (existingAdmin) {
      console.log("⚠️  Admin user already exists:");
      console.log(`  Email: ${existingAdmin.email}`);
      console.log(`  Username: ${existingAdmin.userName}`);
      console.log("  Skipping creation...");
    } else {
      // Create admin user (password will be hashed by pre-save middleware)
      console.log("Creating admin user...");
      const admin = new User({
        name: defaultAdmin.name,
        userName: defaultAdmin.userName,
        email: defaultAdmin.email,
        password: defaultAdmin.password, // Plain password - will be hashed by pre-save hook
        role: defaultAdmin.role,
      });

      await admin.save();

      console.log("✅ Admin user created successfully!");
      console.log("\n📋 Admin Credentials:");
      console.log(`   Email: ${defaultAdmin.email}`);
      console.log(`   Username: ${defaultAdmin.userName}`);
      console.log(`   Password: ${defaultAdmin.password}`);
      console.log(
        "\n⚠️  IMPORTANT: Change the password immediately after first login!",
      );
    }

    console.log("\n✓ Seeding completed!");
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log("✓ Database connection closed");
  }
};

// Run seed
seedAdmin();
