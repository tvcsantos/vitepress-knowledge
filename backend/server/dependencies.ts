import { createIocContainer } from "@aklinker1/zero-ioc";
import { openKnowledgeDatabase } from "./utils/open-knowledge-database";
import { createGenericAiService } from "./services/ai-service/generic";
import { seedDefaultSite } from "./utils/seed-default-site";

const db = await openKnowledgeDatabase();

await seedDefaultSite(db);

export const container = createIocContainer()
  .register("db", () => db)
  .register("aiService", createGenericAiService);
