import mongoose, { Schema, type Model } from "mongoose";
import { connectMongo, isMongoConfigured } from "@/lib/db/mongodb";

interface RateLimitDoc {
  key: string;
  count: number;
  expiresAt: Date;
}

interface RateEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateEntry>();

function getRateLimitModel(): Model<RateLimitDoc> {
  if (mongoose.models.ERPRateLimit) {
    return mongoose.models.ERPRateLimit as Model<RateLimitDoc>;
  }
  const schema = new Schema<RateLimitDoc>(
    {
      key: { type: String, required: true, unique: true, index: true },
      count: { type: Number, default: 1 },
      expiresAt: { type: Date, required: true, index: { expires: 0 } },
    },
    { collection: "rate_limits", versionKey: false }
  );
  return mongoose.model<RateLimitDoc>("ERPRateLimit", schema);
}

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();

  // Prefer distributed MongoDB rate limiting when connected
  if (isMongoConfigured()) {
    try {
      const conn = await connectMongo();
      if (conn) {
        const Model = getRateLimitModel();
        const existing = await Model.findOne({ key }).lean<{
          count: number;
          expiresAt: Date;
        }>();

        if (!existing || new Date(existing.expiresAt).getTime() <= now) {
          const expiresAt = new Date(now + windowMs);
          await Model.updateOne(
            { key },
            { $set: { key, count: 1, expiresAt } },
            { upsert: true }
          );
          return { allowed: true, remaining: maxRequests - 1, resetAt: expiresAt.getTime() };
        }

        if (existing.count >= maxRequests) {
          return {
            allowed: false,
            remaining: 0,
            resetAt: new Date(existing.expiresAt).getTime(),
          };
        }

        const updated = await Model.findOneAndUpdate(
          { key },
          { $inc: { count: 1 } },
          { new: true }
        ).lean<{ count: number; expiresAt: Date }>();

        const newCount = updated?.count ?? existing.count + 1;
        return {
          allowed: newCount <= maxRequests,
          remaining: Math.max(0, maxRequests - newCount),
          resetAt: new Date(existing.expiresAt).getTime(),
        };
      }
    } catch {
      // Fallback to in-memory limiter if rate_limits query temporarily fails
    }
  }

  const existing = memoryStore.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    memoryStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  if (existing.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  memoryStore.set(key, existing);
  return { allowed: true, remaining: maxRequests - existing.count, resetAt: existing.resetAt };
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") || "127.0.0.1";
}
