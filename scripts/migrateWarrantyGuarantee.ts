import mongoose from "mongoose";
import * as dotenv from "dotenv";
import Product from "../src/models/products";

dotenv.config();

const DB_URL = process.env.DB_URL;

if (!DB_URL) {
  console.error("Please define the DB_URL environment variable inside .env");
  process.exit(1);
}

const migrate = async () => {
  try {
    console.log("Connecting to Database...");
    await mongoose.connect(DB_URL);
    console.log("Connected Successfully.");

    console.log("Updating existing products with default warranty/guarantee values...");
    
    // Bulk update all products that don't have these fields yet
    const result = await Product.updateMany(
      {
        $or: [
          { hasWarranty: { $exists: false } },
          { hasGuarantee: { $exists: false } }
        ]
      },
      {
        $set: {
          hasWarranty: false,
          hasGuarantee: false
        }
      }
    );

    console.log(`Successfully migrated ${result.modifiedCount} products.`);
    process.exit(0);
  } catch (error) {
    console.error("Error during migration:", error);
    process.exit(1);
  }
};

migrate();
