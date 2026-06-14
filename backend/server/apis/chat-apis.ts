import {
  BadRequestHttpError,
  NotFoundHttpError,
  createApp,
} from "@aklinker1/zeta";
import dedent from "dedent";
import { getKnowledgeFiles } from "../utils/knowledge-files";
import { applySystemPromptTemplateVars } from "../utils/template-vars";
import { ChatMessage, PostChatRequestBody } from "../../shared/types";
import { decorateContextPlugin } from "../plugins/decorate-context-plugin";
import { siteToConfig } from "../utils/site-config";
import z from "zod";

export const chatApis = createApp({ prefix: "/chat" })
  .use(decorateContextPlugin)
  .post(
    "/",
    {
      operationId: "chat",
      description: dedent`
        Send messages to an AI model and return with the response.
      `,
      body: PostChatRequestBody,
      responses: z.array(ChatMessage),
    },
    async ({ body, aiService, db }) => {
      const site = await db.sites.get(body.siteId);
      if (!site) throw new NotFoundHttpError(`Site '${body.siteId}' not found`);
      const siteConfig = siteToConfig(site);

      const model = aiService.models.find((m) => m.enum === body.model);
      if (!model) {
        throw new BadRequestHttpError("Model not found or not enabled");
      }

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

      return [...body.messages, response];
    },
  )
  .post(
    "/stream",
    {
      operationId: "chatStream",
      description: dedent`
        Stream an AI response token by token using Server-Sent Events.
        Each event is a JSON string token. The stream ends with a final
        JSON event \`{ done: true, messages: ChatMessage[] }\`.
      `,
      body: PostChatRequestBody,
    },
    async ({ body, aiService, db, set }): Promise<any> => {
      const site = await db.sites.get(body.siteId);
      if (!site) throw new NotFoundHttpError(`Site '${body.siteId}' not found`);
      const siteConfig = siteToConfig(site);

      const model = aiService.models.find((m) => m.enum === body.model);
      if (!model) {
        throw new BadRequestHttpError("Model not found or not enabled");
      }

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

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          let fullContent = "";
          try {
            for await (const token of tokenStream) {
              fullContent += token;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(token)}\n\n`),
              );
            }
            const messages = [
              ...body.messages,
              { role: "assistant" as const, content: fullContent },
            ];
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ done: true, messages })}\n\n`,
              ),
            );
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Unknown error";
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`),
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          ...set.headers,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    },
  );
