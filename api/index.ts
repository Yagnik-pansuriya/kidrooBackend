/**
 * Vercel Serverless Entry Point
 * This file exports the Express app as a Vercel serverless function.
 * Vercel will route all requests to this handler via vercel.json rewrites.
 * 
 * Note: @vercel/node compiles this file separately from tsconfig.json,
 * so we use direct relative imports to the source files.
 */
import dotenv from "dotenv";
dotenv.config();

// Set NODE_ENV default for Vercel
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

import { connectDB } from "../src/config/db";
import { connectRedis } from "../src/config/redis";
import app from "../src/app";

// Cache the initialization promise across warm invocations
let initialized = false;

// Ensure DB + Redis connection before handling any request
// The connectDB function caches the connection for serverless reuse
const handler = async (req: any, res: any) => {
  if (!initialized) {
    await connectDB();
    // Redis is best-effort — server continues even if Redis fails
    try { await connectRedis(); } catch { /* logged inside connectRedis */ }
    initialized = true;
  }
  return app(req, res);
};

export default handler;
