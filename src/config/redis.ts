import Redis from "ioredis";

const redisURL = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(redisURL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redis.on("error", (err) => {
  console.error("Redis error:", err);
});

redis.on("end", () => {
  console.warn("Redis connection ended");
});

export const connectRedis = async () => {
  try {
    await redis.connect();
    console.log("Redis connection established");
  } catch (err) {
    console.error("Redis connection ERROR! ==> ", err);
    process.exit(1);
  }
};

export const disconnectRedis = async () => {
  try {
    console.log("Closing Redis connection...");
    await redis.quit();
    console.log("Redis connection closed");
  } catch (error) {
    console.error("Error closing Redis connection", error);
  }
};
