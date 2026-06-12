import { z } from "zod";

export const Site = z
  .object({
    id: z.string(),
    name: z.string().describe("Human-readable label for this site."),
    docsUrl: z.string().url().describe("URL to the VitePress site hosting /knowledge/* files."),
    appName: z.string().describe("Application name used throughout the UI."),
    brandColor: z.string().describe("Brand color (any valid CSS color)."),
    brandContentColor: z.string().describe("Text/icon color on top of brand color."),
    serverUrl: z.string().describe("Public URL where this server is hosted."),
    corsOrigin: z.string().describe("Comma-separated allowed CORS origins."),
    assistantIconUrl: z.string().describe("URL to the assistant avatar icon."),
    systemPrompt: z.string().describe("System prompt template sent to the AI."),
    welcomeMessage: z.string().describe("Welcome message shown before first user message."),
    rateLimitRpm: z.number().int().positive().nullable().describe(
      "Max chat requests per minute per (IP, site). null = use server-wide RATE_LIMIT_RPM default.",
    ),
    createdAt: z.string().datetime().describe("ISO 8601 creation timestamp."),
  })
  .meta({ ref: "Site" });
export type Site = z.infer<typeof Site>;

export const SiteInsert = Site.omit({ id: true, createdAt: true });
export type SiteInsert = z.infer<typeof SiteInsert>;

export const SitePatch = SiteInsert.partial();
export type SitePatch = z.infer<typeof SitePatch>;

export const AiModel = z
  .object({
    name: z.string().describe("Display name of LLM Model"),
    enum: z.string().describe("Enum value to be used with the API."),
  })
  .meta({ ref: "AiModel" });
export type AiModel = z.infer<typeof AiModel>;

export const ChatMessage = z
  .object({
    id: z.string().optional(),
    role: z.enum(["user", "assistant"]).describe("Who sent the message."),
    content: z.string().describe("The message contents being sent."),
  })
  .meta({ ref: "ChatMessage" });
export type ChatMessage = z.infer<typeof ChatMessage>;

export const PostChatRequestBody = z.object({
  siteId: z.string().describe("ID of the site this chat belongs to."),
  model: z.string(),
  messages: z.array(ChatMessage),
});
export type PostChatRequestBody = z.infer<typeof PostChatRequestBody>;
