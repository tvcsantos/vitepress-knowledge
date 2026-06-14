import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { getKnowledgeFiles } from "../utils/knowledge-files";
import { applySystemPromptTemplateVars } from "../utils/template-vars";
import { PostChatRequestBody } from "../../shared/types";
import { siteToConfig } from "../utils/site-config";
import { db, aiService } from "../dependencies";

export const chatApis = new Hono()
  // Send messages to an AI model and return with the response.
  .post("/", zValidator("json", PostChatRequestBody), async (c) => {
    const body = c.req.valid("json");
    const site = await db.sites.get(body.siteId);
    if (!site)
      throw new HTTPException(404, {
        message: `Site '${body.siteId}' not found`,
      });
    const siteConfig = siteToConfig(site);

    const model = aiService.models.find((m) => m.enum === body.model);
    if (!model)
      throw new HTTPException(400, {
        message: "Model not found or not enabled",
      });

    const response = await aiService.replyToConversation(
      model,
      async () => {
        const knowledge = await getKnowledgeFiles(
          site.id,
          siteConfig.docsUrl,
          db,
        );
        return applySystemPromptTemplateVars(
          siteConfig.systemPrompt,
          knowledge.files.join("\n\n"),
          siteConfig,
        );
      },
      { messages: body.messages },
    );

    return c.json([...body.messages, response]);
  })
  // Stream an AI response token by token using Server-Sent Events.
  // Each event is a JSON string token. The stream ends with a final
  // JSON event `{ done: true, messages: ChatMessage[] }`.
  .post("/stream", zValidator("json", PostChatRequestBody), async (c) => {
    const body = c.req.valid("json");
    const site = await db.sites.get(body.siteId);
    if (!site)
      throw new HTTPException(404, {
        message: `Site '${body.siteId}' not found`,
      });
    const siteConfig = siteToConfig(site);

    const model = aiService.models.find((m) => m.enum === body.model);
    if (!model)
      throw new HTTPException(400, {
        message: "Model not found or not enabled",
      });

    const getSystemPrompt = async () => {
      const knowledge = await getKnowledgeFiles(
        site.id,
        siteConfig.docsUrl,
        db,
      );
      return applySystemPromptTemplateVars(
        siteConfig.systemPrompt,
        knowledge.files.join("\n\n"),
        siteConfig,
      );
    };

    const tokenStream = aiService.streamReply(model, getSystemPrompt, {
      messages: body.messages,
    });

    return streamSSE(c, async (stream) => {
      let fullContent = "";
      try {
        for await (const token of tokenStream) {
          fullContent += token;
          await stream.writeSSE({ data: JSON.stringify(token) });
        }
        const messages = [
          ...body.messages,
          { role: "assistant" as const, content: fullContent },
        ];
        await stream.writeSSE({
          data: JSON.stringify({ done: true, messages }),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        await stream.writeSSE({ data: JSON.stringify({ error: message }) });
      }
    });
  });
