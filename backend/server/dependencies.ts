import { createIocContainer } from "@aklinker1/zero-ioc";
import { openKnowledgeDatabase } from "./utils/open-knowledge-database";
import { createGenericAiService } from "./services/ai-service/generic";

const db = await openKnowledgeDatabase();

export const container = createIocContainer()
  .register("db", () => db)
  .register("aiService", createGenericAiService);
