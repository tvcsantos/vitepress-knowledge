import { createApp } from "@aklinker1/zeta";
import { container } from "../dependencies";
import env from "../utils/env";

/**
 * Extract the most-specific client IP from the request.
 * Trusts X-Forwarded-For when present (set by reverse proxies / ingress).
 */
function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

/**
 * Read siteId from the JSON body (POST chat requests).
 * Returns null if the body cannot be parsed or has no siteId.
 */
async function getSiteId(request: Request): Promise<string | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  try {
    const body = await request.clone().json();
    return typeof body?.siteId === "string" ? body.siteId : null;
  } catch {
    return null;
  }
}

/**
 * Sliding-window rate limiter applied to chat endpoints via onBeforeHandle
 * (which is properly awaited by the framework, unlike onGlobalRequest).
 * Keyed per (IP, siteId). Limit: site.rateLimitRpm ?? RATE_LIMIT_RPM env var.
 * Returns HTTP 429 with Retry-After + X-RateLimit-* headers when bucket is full.
 */
export const rateLimitPlugin = createApp()
  .onBeforeHandle(async ({ request, set }) => {
    const siteId = await getSiteId(request);
    if (!siteId) return; // No site context — skip

    const ip = getClientIp(request);
    const { db } = container.resolveAll();

    const site = await db.sites.get(siteId);
    const limitRpm = site?.rateLimitRpm ?? env.RATE_LIMIT_RPM;

    const result = await db.rateLimits.check(ip, siteId, limitRpm);

    set.headers["X-RateLimit-Limit"] = String(limitRpm);
    set.headers["X-RateLimit-Remaining"] = String(result.remaining);

    if (!result.allowed) {
      const retryAfter = String(Math.ceil(result.resetInMs / 1000));
      return new Response(
        JSON.stringify({ error: "Too Many Requests", retryAfter: Number(retryAfter) }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": retryAfter,
            "X-RateLimit-Limit": String(limitRpm),
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    }
  })
  .export();
