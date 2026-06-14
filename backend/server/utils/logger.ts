import { pino } from "pino";

// Read the level straight from the environment (not ./env) to avoid an import
// cycle - env.ts logs via this module at load time.
const level = process.env.LOG_LEVEL?.trim() || "info";

/**
 * Application logger. Emits structured JSON to stdout (one object per line),
 * which is ideal for container log aggregation. In development the `dev` script
 * pipes this through `pino-pretty` for human-friendly output.
 */
export const logger = pino({ level });

/** Create a child logger tagged with a module name. */
export function createLogger(module: string) {
  return logger.child({ module });
}
