import { HTTPException } from "hono/http-exception";
import env from "./env";

/**
 * Throws 401 unless the request carries the configured admin token.
 * No-op when ADMIN_TOKEN is unset (open access).
 */
export function requireAdmin(request: Request): void {
  if (!env.ADMIN_TOKEN) return;
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (token !== env.ADMIN_TOKEN) {
    throw new HTTPException(401, { message: "Invalid or missing ADMIN_TOKEN" });
  }
}
