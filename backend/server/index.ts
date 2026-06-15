import { publicApp, managementApp } from "./main";
import env from "./utils/env";
import { createLogger } from "./utils/logger";

const log = createLogger("server");

Bun.serve({ port: env.PORT, fetch: publicApp.fetch });
log.info({ port: env.PORT }, "Public server listening");

Bun.serve({ port: env.MANAGEMENT_PORT, fetch: managementApp.fetch });
log.info({ port: env.MANAGEMENT_PORT }, "Management server listening");
