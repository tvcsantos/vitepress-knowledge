// Auth

import { envRow, logStartupInfo } from "./log";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY?.trim();
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim();
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

// Models

const GEMINI_2_0_FLASH = process.env.GEMINI_2_0_FLASH === "true";
const GEMINI_2_5_FLASH = process.env.GEMINI_2_5_FLASH === "true";
const GEMINI_3_FLASH_PREVIEW = process.env.GEMINI_3_FLASH_PREVIEW === "true";
const GEMINI_3_PRO_PREVIEW = process.env.GEMINI_3_PRO_PREVIEW === "true";
const GEMINI_3_1_PRO_PREVIEW = process.env.GEMINI_3_1_PRO_PREVIEW === "true";
const GEMINI_FLASH_LATEST = process.env.GEMINI_FLASH_LATEST === "true";
const GEMINI_PRO_LATEST = process.env.GEMINI_PRO_LATEST === "true";
const CLAUDE_3_5_SONNET = process.env.CLAUDE_3_5_SONNET === "true";
const CLAUDE_3_5_HAIKU = process.env.CLAUDE_3_5_HAIKU === "true";

// Database

const DATABASE_TYPE = process.env.DATABASE_TYPE?.trim() || "sqlite";
const DATABASE_SQLITE_PATH =
  process.env.DATABASE_SQLITE_PATH?.trim() || "data/knowledge.db";

// Server

const PORT = Number(process.env.PORT) || 5174;

// Admin

const ADMIN_TOKEN = process.env.ADMIN_TOKEN?.trim();

// Rate limiting

/** Global default RPM per (IP, siteId). Overridable per site via rateLimitRpm DB field. */
const RATE_LIMIT_RPM = Number(process.env.RATE_LIMIT_RPM) || 20;

const env = {
  GOOGLE_API_KEY,
  ANTHROPIC_API_KEY,
  LITELLM_API_KEY,
  LITELLM_BASE_URL,
  LITELLM_MODELS,
  LITELLM_MODELS_PARSED,
  GEMINI_2_0_FLASH,
  GEMINI_2_5_FLASH,
  GEMINI_3_FLASH_PREVIEW,
  GEMINI_3_PRO_PREVIEW,
  GEMINI_3_1_PRO_PREVIEW,
  GEMINI_FLASH_LATEST,
  GEMINI_PRO_LATEST,
  CLAUDE_3_5_SONNET,
  CLAUDE_3_5_HAIKU,
  DATABASE_TYPE,
  DATABASE_SQLITE_PATH,
  PORT,
  ADMIN_TOKEN,
  RATE_LIMIT_RPM,
};
export default env;

logStartupInfo(
  "Resolved Environment Variables",
  Object.keys(env).map((key) => envRow(key as any)),
);
