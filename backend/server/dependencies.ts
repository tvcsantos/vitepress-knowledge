import { openKnowledgeDatabase } from "./utils/open-knowledge-database";
import { createLiteLlmAiService } from "./services/ai-service/litellm";

// App-wide singletons. ES modules are cached, so these are created once and
// shared across all importers (the previous IoC container did the same thing).
export const db = await openKnowledgeDatabase();
export const aiService = createLiteLlmAiService();

// Bundle injected into the request context via Zeta's `.decorate(...)`.
export const deps = { db, aiService };
