import app from "./main";
import env from "./utils/env";
import { createLogger } from "./utils/logger";

Bun.serve({ port: env.PORT, fetch: app.fetch });
createLogger("server").info({ port: env.PORT }, "Server listening");
