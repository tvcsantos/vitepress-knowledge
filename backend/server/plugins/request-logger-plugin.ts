import { createMiddleware } from "hono/factory";
import { createLogger } from "../utils/logger";

const log = createLogger("http");

// Requests slower than this are logged at info even on success.
const SLOW_REQUEST_MS = 1_000;

export const requestLoggerMiddleware = createMiddleware(async (c, next) => {
  const start = performance.now();
  await next();
  const durationMs = Math.round(performance.now() - start);
  const status = c.res.status;
  const fields = {
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    status,
    durationMs,
  };

  // Errors and slow requests are always logged; everything else is debug-only.
  if (status >= 500) log.error(fields, "request");
  else if (status >= 400) log.warn(fields, "request");
  else if (durationMs >= SLOW_REQUEST_MS) log.warn(fields, "slow request");
  else log.debug(fields, "request");
});
