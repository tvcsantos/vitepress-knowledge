import { HTTPException } from "hono/http-exception";
import type { AiModelDefinition, AiService } from ".";
import env from "../../utils/env";
import { aiModelRows, aiServiceRow, logStartupInfo } from "../../utils/log";

export function createLiteLlmAiService(): AiService {
  const models: AiModelDefinition[] = env.LITELLM_MODELS_PARSED.map((m) => ({
    name: m.name,
    enum: m.enum,
    env: "LITELLM_API_KEY",
    enabled: true,
  }));

  logStartupInfo("LiteLLM AI Service", [
    aiServiceRow("LITELLM_API_KEY"),
    ...aiModelRows(models),
  ]);

  return {
    enabled: !!env.LITELLM_API_KEY && models.length > 0,
    models,

    replyToConversation: async (model, getSystemPrompt, conversation) => {
      const res = await fetch(`${env.LITELLM_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.LITELLM_API_KEY!}`,
        },
        body: JSON.stringify({
          model: model.enum,
          //max_tokens: 1024,
          messages: [
            { role: "system", content: await getSystemPrompt() },
            ...conversation.messages,
          ],
        }),
      });
      if (res.status !== 200) {
        throw new HTTPException(500, {
          message: `LiteLLM API responded with ${res.status} ${res.statusText}`,
        });
      }
      const json = await res.json();
      return {
        role: "assistant",
        content: json.choices[0].message.content,
      };
    },

    streamReply: async function* (model, getSystemPrompt, conversation) {
      const res = await fetch(`${env.LITELLM_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.LITELLM_API_KEY!}`,
        },
        body: JSON.stringify({
          model: model.enum,
          stream: true,
          messages: [
            { role: "system", content: await getSystemPrompt() },
            ...conversation.messages,
          ],
        }),
      });
      if (res.status !== 200) {
        throw new HTTPException(500, {
          message: `LiteLLM API responded with ${res.status} ${res.statusText}`,
        });
      }
      yield* parseSseStream(res, (data) => {
        const json = JSON.parse(data);
        return json.choices?.[0]?.delta?.content ?? "";
      });
    },
  };
}

async function* parseSseStream(
  res: Response,
  extractToken: (data: string) => string,
): AsyncIterable<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      const token = extractToken(data);
      if (token) yield token;
    }
  }
}
