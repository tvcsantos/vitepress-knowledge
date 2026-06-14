import { createLogger } from "./logger";

// LiteLLM

const LITELLM_API_KEY = process.env.LITELLM_API_KEY?.trim();
const LITELLM_BASE_URL =
  process.env.LITELLM_BASE_URL?.trim() || "http://localhost:4000";
const LITELLM_MODELS = process.env.LITELLM_MODELS?.trim() || "";
const LITELLM_MODELS_PARSED = LITELLM_MODELS.split(",")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0)
  .map((entry) => {
    const sep = entry.indexOf(":");
    if (sep === -1) return { enum: entry, name: entry };
    return {
      enum: entry.slice(0, sep).trim(),
      name: entry.slice(sep + 1).trim() || entry.slice(0, sep).trim(),
    };
  });

// Database

const DATABASE_TYPE = process.env.DATABASE_TYPE?.trim() || "sqlite";
const DATABASE_SQLITE_PATH =
  process.env.DATABASE_SQLITE_PATH?.trim() || "data/knowledge.db";

// Server

const PORT = Number(process.env.PORT) || 5174;
const LOG_LEVEL = process.env.LOG_LEVEL?.trim() || "info";

// Admin

const ADMIN_TOKEN = process.env.ADMIN_TOKEN?.trim();

const env = {
  LITELLM_API_KEY,
  LITELLM_BASE_URL,
  LITELLM_MODELS,
  LITELLM_MODELS_PARSED,
  DATABASE_TYPE,
  DATABASE_SQLITE_PATH,
  PORT,
  LOG_LEVEL,
  ADMIN_TOKEN,
};
export default env;

// Log the resolved config at startup, with secrets redacted.
createLogger("env").info(
  {
    LITELLM_BASE_URL,
    LITELLM_MODELS,
    DATABASE_TYPE,
    DATABASE_SQLITE_PATH,
    PORT,
    LOG_LEVEL,
    LITELLM_API_KEY: LITELLM_API_KEY ? "<set>" : "<unset>",
    ADMIN_TOKEN: ADMIN_TOKEN ? "<set>" : "<unset>",
  },
  "Environment resolved",
);
