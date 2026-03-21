import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import { uploadToCloudinary } from "../src/utils/uploadToCloudinary";

const testCloudinary = async () => {
  try {
    console.log("Testing Cloudinary credentials...");
    console.log("Cloud Name:", process.env.CLOUDINARY_CLOUD_NAME ? "Set" : "Missing");
    console.log("API Key:", process.env.CLOUDINARY_API_KEY ? "Set" : "Missing");
    console.log("API Secret:", process.env.CLOUDINARY_API_SECRET ? "Set" : "Missing");

    // Create a dummy file
    const filePath = "test-image.txt";
    fs.writeFileSync(filePath, "This is a test file for Cloudinary upload.");

    console.log("\nUploading dummy file to Cloudinary...");
    const result = await uploadToCloudinary(filePath, {
      folder: "kidroo/test",
      public_id: "test-upload-" + Date.now(),
      resource_type: "raw", // use raw for text file
    });

    console.log("✅ Cloudinary upload successful!");
    console.log("Result URL:", result.url);

  } catch (error: any) {
    console.error("❌ Cloudinary upload failed!");
    console.error(error.message);
  }
};

testCloudinary();
