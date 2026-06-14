import { createIocContainer } from "@aklinker1/zero-ioc";
import { openKnowledgeDatabase } from "./utils/open-knowledge-database";
import { createLiteLlmAiService } from "./services/ai-service/litellm";

const db = await openKnowledgeDatabase();

export const container = createIocContainer()
  .register("db", () => db)
  .register("aiService", createLiteLlmAiService);
