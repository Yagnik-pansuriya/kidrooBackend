import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Category from "../src/models/categories";
import Product from "../src/models/products";

/**
 * Seed script to populate mock Categories and Products
 * Usage: npm run seed:data
 */

const seedData = async (): Promise<void> => {
  try {
    const dbUrl = process.env.DB_URL;

    if (!dbUrl) {
      throw new Error("DB_URL environment variable is not set");
    }

    // Connect to MongoDB
    console.log("[INFO] Connecting to database...");
    await mongoose.connect(dbUrl);
    console.log("[INFO] Connected to MongoDB");

    // Seed Categories
    console.log("[INFO] Inserting Mock Categories...");
    const mockCategories = [
      {
        catagoryName: "Wooden Toys",
        slug: "wooden-toys",
        icon: "https://example.com/wooden-icon.png",
        image: "https://example.com/wooden-category.png",
        count: 5,
      },
      {
        catagoryName: "Educational & STEM",
        slug: "educational-stem",
        icon: "https://example.com/edu-icon.png",
        image: "https://example.com/edu-category.png",
        count: 10,
      },
      {
        catagoryName: "Action Figures",
        slug: "action-figures",
        icon: "https://example.com/action-icon.png",
        image: "https://example.com/action-category.png",
        count: 8,
      },
    ];

    const createdCategories = [];
    for (const catData of mockCategories) {
      // Check if it exists to avoid duplicate unique key errors on slug/name
      let category = await Category.findOne({ slug: catData.slug });
      if (!category) {
        category = new Category(catData);
        await category.save();
        console.log(`[SUCCESS] Created Category: ${catData.catagoryName}`);
      } else {
        console.log(`[INFO] Category already exists: ${catData.catagoryName}`);
      }
      createdCategories.push(category);
    }

    // Seed Products
    console.log("[INFO] Inserting Mock Products...");
    const mockProducts = [
      {
        productName: "Classic Wooden Train Set",
        slug: `classic-wooden-train-set-${Date.now()}`,
        description: "A beautifully crafted wooden locomotive and railway set.",
        price: 45.99,
        originalPrice: 55.99,
        discountPercentage: 18,
        stock: 50,
        category: createdCategories[0]._id, // Wooden Toys
        image: "https://example.com/train.png",
        images: ["https://example.com/train1.png", "https://example.com/train2.png"],
        ratings: 4.5,
        numReviews: 12,
        featured: true,
        newArrival: false,
        bestSeller: true,
        ageRange: { from: 3, to: 8 },
        tags: ["wooden", "train", "classic", "vehicle"],
        isActive: true,
      },
      {
        productName: "STEM Robotics Kit",
        slug: `stem-robotics-kit-${Date.now()}`,
        description: "Build-your-own robot with basic coding principles.",
        price: 89.99,
        originalPrice: 99.99,
        discountPercentage: 10,
        stock: 25,
        category: createdCategories[1]._id, // Educational
        image: "https://example.com/robot-kit.png",
        images: ["https://example.com/robot-kit1.png"],
        ratings: 4.9,
        numReviews: 45,
        featured: true,
        newArrival: true,
        bestSeller: true,
        ageRange: { from: 8, to: 14 },
        tags: ["robotics", "stem", "educational", "coding"],
        isActive: true,
      },
      {
        productName: "Galactic Space Trooper",
        slug: `galactic-space-trooper-${Date.now()}`,
        description: "Highly articulated action figure with intergalactic accessories.",
        price: 24.99,
        originalPrice: 24.99,
        discountPercentage: 0,
        stock: 120,
        category: createdCategories[2]._id, // Action Figures
        image: "https://example.com/trooper.png",
        images: ["https://example.com/trooper1.png"],
        ratings: 4.2,
        numReviews: 89,
        featured: false,
        newArrival: true,
        bestSeller: false,
        ageRange: { from: 5, to: 12 },
        tags: ["action figure", "space", "trooper"],
        isActive: true,
      },
    ];

    for (const prodData of mockProducts) {
      const product = new Product(prodData);
      await product.save();
      console.log(`[SUCCESS] Created Product: ${prodData.productName}`);
    }

    console.log("[SUCCESS] Database seeding completed successfully!");
  } catch (error) {
    console.error("[ERROR] Failed to seed database:", error);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log("[INFO] Database connection closed");
  }
};

// Execute seed
seedData();
