import { redis } from "../config/redis"


export class CacheService {

  static async get(key: string) {

    const data = await redis.get(key)

    if (!data) return null

    return JSON.parse(data)
  }

  static async set(key: string, value: any, ttl = 300) {

    await redis.set(
      key,
      JSON.stringify(value),
      "EX",
      ttl
    )
  }

  static async del(key: string) {
    await redis.del(key)
  }

  static async delPattern(pattern: string) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

}