import { InternalServerErrorHttpError } from "@aklinker1/zeta";
import type { AiModelDefinition, AiService } from ".";
import env from "../../utils/env";
import { aiModelRows, aiServiceRow, logStartupInfo } from "../../utils/log";

const MODELS: AiModelDefinition[] = [
  {
    name: "Gemini 2.0 Flash",
    env: "GEMINI_2_0_FLASH" as const,
    enum: "gemini-2.0-flash",
    enabled: env.GEMINI_2_0_FLASH,
  },
  {
    name: "Gemini 2.5 Flash",
    env: "GEMINI_2_5_FLASH" as const,
    enum: "gemini-2.5-flash",
    enabled: env.GEMINI_2_5_FLASH,
  },
  // 3
  {
    name: "Gemini 3 Flash",
    env: "GEMINI_3_FLASH_PREVIEW" as const,
    enum: "gemini-3-flash-preview",
    enabled: env.GEMINI_2_0_FLASH,
  },
  {
    name: "Gemini 3 Pro",
    env: "GEMINI_3_PRO_PREVIEW" as const,
    enum: "gemini-3-pro-preview",
    enabled: env.GEMINI_3_PRO_PREVIEW,
  },
  // 3.1
  {
    name: "Gemini 3.1 Pro",
    env: "GEMINI_3_1_PRO_PREVIEW" as const,
    enum: "gemini-3.1-pro-preview",
    enabled: env.GEMINI_3_1_PRO_PREVIEW,
  },
  // LATEST
  {
    name: "Gemini Flash Latest",
    env: "GEMINI_FLASH_LATEST" as const,
    enum: "gemini-flash-latest",
    enabled: env.GEMINI_FLASH_LATEST,
  },
  {
    name: "Gemini Pro Latest",
    env: "GEMINI_PRO_LATEST" as const,
    enum: "gemini-pro-latest",
    enabled: env.GEMINI_PRO_LATEST,
  },
];

export function createGoogleAiService(): AiService {
  logStartupInfo("Google AI Service", [
    aiServiceRow("GOOGLE_API_KEY"),
    ...aiModelRows(MODELS),
  ]);

  return {
    enabled: !!env.GOOGLE_API_KEY,
    models: MODELS.filter((model) => model.enabled),

    replyToConversation: async (model, getSystemPrompt, conversation) => {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model.enum}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GOOGLE_API_KEY!,
          },
          body: JSON.stringify({
            generationConfig: {
              temperature: 1,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 8192,
              responseMimeType: "text/plain",
              thinkingConfig: {
                thinkingLevel: "minimal",
              },
            },
            systemInstruction: {
              role: "user",
              parts: [{ text: await getSystemPrompt() }],
            },
            contents: conversation.messages.map((message) => ({
              role: message.role === "user" ? "user" : "model",
              parts: [{ text: message.content }],
            })),
          }),
        },
      );
      if (res.status !== 200) {
        throw new InternalServerErrorHttpError(
          `Google API responded with ${res.status} ${res.statusText}`,
        );
      }
      const json = await res.json();
      console.log(json);

      return {
        role: "assistant",
        content: json.candidates[0].content.parts[0].text,
      };
    },
  };
}
