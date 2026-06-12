import { BadRequestHttpError, createApp } from "@aklinker1/zeta";
import dedent from "dedent";
import { getKnowledgeFiles } from "../utils/knowledge-files";
import { applySystemPromptTemplateVars } from "../utils/template-vars";
import env from "../utils/env";
import { decorateContextPlugin } from "../plugins/decorate-context-plugin";
import { Conversation, PostChatRequestBody } from "../../shared/types";

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
      responses: Conversation,
    },
    async ({ body, aiService, conversationService }) => {
      const model = aiService.models.find((m) => m.enum === body.model);
      if (!model) {
        throw new BadRequestHttpError("Model not found or not enabled");
      }

      const response = await aiService.replyToConversation(
        model,
        async () => {
          const knowledge = await getKnowledgeFiles(env.DOCS_URL);
          return applySystemPromptTemplateVars(
            env.SYSTEM_PROMPT,
            knowledge.files.join("\n\n"),
          );
        },
        { messages: body.messages },
      );

      return await conversationService.updateConversation({
        id: body.conversationId,
        messages: [...body.messages, response],
      });
    },
  )
  .post(
    "/stream",
    {
      operationId: "chatStream",
      description: dedent`
        Stream an AI response token by token using Server-Sent Events.
        Each event is a plain text token. The stream ends with a final
        JSON event prefixed with "data: [DONE]".
      `,
      body: PostChatRequestBody,
    },
    async ({ body, aiService, conversationService, set }): Promise<any> => {
      const model = aiService.models.find((m) => m.enum === body.model);
      if (!model) {
        throw new BadRequestHttpError("Model not found or not enabled");
      }

      const getSystemPrompt = async () => {
        const knowledge = await getKnowledgeFiles(env.DOCS_URL);
        return applySystemPromptTemplateVars(
          env.SYSTEM_PROMPT,
          knowledge.files.join("\n\n"),
        );
      };

      const tokenStream = aiService.streamReply(
        model,
        getSystemPrompt,
        { messages: body.messages },
      );

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
            // Save completed message to DB
            const conversation = await conversationService.updateConversation({
              id: body.conversationId,
              messages: [
                ...body.messages,
                { role: "assistant", content: fullContent },
              ],
            });
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ done: true, conversation })}\n\n`,
              ),
            );
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Unknown error";
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: message })}\n\n`,
              ),
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
