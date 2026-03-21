import mongoose from "mongoose";

const dbURL = process.env.DB_URL as string;
if (!dbURL) {
  throw new Error("DB_URL is not defined in environment variables");
}

// ─── Serverless Connection Caching ─────────────────────────────────────────────
// In serverless environments (Vercel), we cache the connection promise
// to reuse across invocations within the same container.
let cached: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } = {
  conn: null,
  promise: null,
};

// For traditional server environments
let retries = 5;

// MongoDB event listeners
mongoose.connection.on("connected", () => {
  console.log("MongoDB connection established");
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected");
});

export const connectDB = async (): Promise<typeof mongoose> => {
  // If already connected, return the cached connection
  if (cached.conn) {
    return cached.conn;
  }

  // If a connection is already in progress, wait for it
  if (cached.promise) {
    cached.conn = await cached.promise;
    return cached.conn;
  }

  const isServerless = process.env.VERCEL === "1";

  try {
    cached.promise = mongoose.connect(dbURL, {
      maxPoolSize: isServerless ? 5 : 20,
      minPoolSize: isServerless ? 1 : 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    cached.conn = await cached.promise;
    return cached.conn;
  } catch (error) {
    cached.promise = null;
    console.error("MongoDB connection ERROR! ==> ", error);

    // Only retry in traditional server mode (not serverless)
    if (!isServerless && retries > 0) {
      retries--;
      console.log(`Retrying MongoDB connection... attempts left: ${retries}`);
      await new Promise((resolve) => setTimeout(resolve, 6000));
      return connectDB();
    } else {
      throw error;
    }
  }
};

export const gracefulShutdown = async () => {
  try {
    console.log("Mongo readyState:", mongoose.connection.readyState);
    console.log("Closing MongoDB connection...");
    await mongoose.connection.close();
    cached.conn = null;
    cached.promise = null;
    console.log("MongoDB connection closed due to app termination");
  } catch (error) {
    console.error("Error closing MongoDB connection", error);
  }
};
