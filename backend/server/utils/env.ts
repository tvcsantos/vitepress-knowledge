import { envRow, logStartupInfo } from "./log";

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
  ADMIN_TOKEN,
};
export default env;

logStartupInfo(
  "Resolved Environment Variables",
  Object.keys(env).map((key) => envRow(key as any)),
);
