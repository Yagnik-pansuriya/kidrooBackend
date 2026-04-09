import dotenv from "dotenv";
dotenv.config();

// Validate critical environment variables
const requiredEnvVars = ["DB_URL", "JWT_SECRET"];
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}`,
  );
  process.exit(1);
}

// Set NODE_ENV default
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "development";
  console.warn("NODE_ENV not set, defaulting to 'development'");
}

const NODE_ENV = process.env.NODE_ENV;
const isProduction = NODE_ENV === "production";

console.log(`Starting server in ${NODE_ENV} mode...`);

import { connectDB, gracefulShutdown } from "./config/db";
import { connectRedis, disconnectRedis } from "./config/redis";
import app, { getActiveRequests } from "./app";
import http from "http";

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const startServer = async () => {
  await connectDB();
  await connectRedis();

  // ── Startup migration: drop the legacy { product, attributes } unique index ──
  // This index was removed from the schema but MongoDB doesn't auto-drop it.
  // It was blocking creation of more than one variant per product.
  try {
    const mongoose = await import("mongoose");
    const db = mongoose.default.connection.db;
    if (db) {
      await db.collection("productvariants").dropIndex("product_1_attributes_1");
      console.log("✅ Dropped legacy variant compound index (product_1_attributes_1)");
    }
  } catch (err: any) {
    // Index might not exist (already dropped or never created) — that's fine
    if (err?.codeName !== "IndexNotFound" && err?.code !== 27) {
      console.warn("⚠️  Could not drop legacy variant index:", err?.message);
    }
  }

  server.listen(PORT, () => {
    console.log(`\nServer running on port ${PORT}`);
    // if (!isProduction) {
      console.log(`\nSwagger UI Documentation:`);
      console.log(`http://localhost:${PORT}/docs\n`);
    // }
  });
};


startServer();

const shutdown = (signal: string) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  console.log(`Active requests: ${getActiveRequests()}`);

  // Force shutdown after 30 seconds
  const shutdownTimeout = setTimeout(() => {
    console.error("Forced shutdown due to timeout");
    process.exit(1);
  }, 30000);

  server.close(async () => {
    clearTimeout(shutdownTimeout);
    console.log("HTTP server closed");

    try {
      await disconnectRedis();
      await gracefulShutdown();
      console.log("Shutdown complete");
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  });
};

// Handle shutdown signals
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGUSR2", () => shutdown("SIGUSR2"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});
