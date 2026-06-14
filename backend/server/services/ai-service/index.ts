import type { ChatMessage } from "../../../shared/types";

export interface AiService {
  /** List of available models. */
  models: AiModelDefinition[];

  /** Have the AI send a reply to a conversation. */
  replyToConversation(
    model: AiModelDefinition,
    getSystemPrompt: () => Promise<string>,
    conversation: { messages: ChatMessage[] },
  ): Promise<ChatMessage>;

  /** Stream the AI reply token by token. */
  streamReply(
    model: AiModelDefinition,
    getSystemPrompt: () => Promise<string>,
    conversation: { messages: ChatMessage[] },
  ): AsyncIterable<string>;
}

export interface AiModelDefinition {
  name: string;
  enum: string;
}
