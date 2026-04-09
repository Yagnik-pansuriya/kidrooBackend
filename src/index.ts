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









// Act as a senior backend architect and code auditor.

// Your task is to deeply analyze my existing backend project and verify that the entire system is logically correct, fully utilized, and production-ready.

// Do NOT give surface-level feedback. Perform strict validation.

// Focus on the following:

// 1. FULL FLOW VERIFICATION
// - Trace every API from entry (route) → controller → service → database → response
// - Ensure request → processing → response cycle is complete and consistent
// - Identify broken, unused, or partially implemented flows
// - Detect missing validations or inconsistent logic between layers

// 2. UNUSED & DEAD CODE DETECTION
// - Find unused functions, variables, files, and routes
// - Detect redundant logic or duplicate implementations
// - Highlight code that is written but never executed

// 3. API CONTRACT VALIDATION
// - Verify request body, params, query handling
// - Check response structure consistency across APIs
// - Ensure proper status codes and error handling

// 4. DATA FLOW & DATABASE INTEGRITY
// - Validate schema usage and relationships
// - Check if all DB queries are necessary and optimized
// - Detect over-fetching, under-fetching, or missing indexes

// 5. AUTHENTICATION & SECURITY
// - Verify token handling, middleware flow
// - Check protected routes are actually protected
// - Detect security vulnerabilities (JWT misuse, missing validation, etc.)

// 6. EDGE CASE & FAILURE HANDLING
// - Identify missing try/catch or error boundaries
// - Check how system behaves on invalid input, DB failure, or network issues

// 7. PERFORMANCE & SCALABILITY
// - Detect blocking operations
// - Check async handling correctness
// - Identify potential bottlenecks

// 8. CODE CONSISTENCY & STRUCTURE
// - Ensure proper separation of concerns (controller/service/repo)
// - Detect tight coupling or poor modularization

// 9. FINAL OUTPUT FORMAT (STRICT)
// - List CRITICAL issues (must fix)
// - List LOGICAL flaws
// - List UNUSED / DEAD code
// - List PERFORMANCE issues
// - Provide EXACT fixes (code-level suggestions, not theory)

// Important:
// - Do NOT explain basics
// - Do NOT praise anything
// - Only point out flaws, risks, and improvements
// - Be brutally strict and precise