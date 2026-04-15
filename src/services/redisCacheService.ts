import { redis } from "../config/redis";

export class CacheService {
  // ── Generic cache operations ──────────────────────────────────────────────

  static async get(key: string) {
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data);
  }

  static async set(key: string, value: any, ttl = 300) {
    await redis.set(key, JSON.stringify(value), "EX", ttl);
  }

  static async del(key: string) {
    await redis.del(key);
  }

  /**
   * HIGH-5 fix: Use cursor-based SCAN instead of blocking KEYS command.
   * KEYS is O(N) and blocks the entire Redis event loop.
   */
  static async delPattern(pattern: string) {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  }

  // ── Refresh token rotation store ─────────────────────────────────────────
  // Implements single-session refresh token rotation for HIGH-1.
  // Key: rt:{userId}, Value: raw refresh token string, TTL: 7 days.

  static async setRefreshToken(userId: string, token: string): Promise<void> {
    await redis.set(`rt:${userId}`, token, "EX", 7 * 24 * 60 * 60);
  }

  static async getRefreshToken(userId: string): Promise<string | null> {
    return await redis.get(`rt:${userId}`);
  }

  static async deleteRefreshToken(userId: string): Promise<void> {
    await redis.del(`rt:${userId}`);
  }
}