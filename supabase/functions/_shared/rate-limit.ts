import { json } from "./http.ts";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitKind = "read" | "mutation";

const LIMITS: Record<RateLimitKind, { limit: number; windowMs: number }> = {
  read: { limit: 120, windowMs: 60_000 },
  mutation: { limit: 30, windowMs: 60_000 },
};

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function checkRateLimit(
  req: Request,
  kind: RateLimitKind,
): Response | null {
  const { limit, windowMs } = LIMITS[kind];
  const bucketKey = `${kind}:${clientIp(req)}`;
  const now = Date.now();

  let bucket = buckets.get(bucketKey);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(bucketKey, bucket);
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return json({ error: "rate limit exceeded" }, 429);
  }

  if (buckets.size > 10_000) {
    for (const [key, entry] of buckets) {
      if (now >= entry.resetAt) buckets.delete(key);
    }
  }

  return null;
}
