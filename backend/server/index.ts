import app from "./main";
import env from "./utils/env";

Bun.serve({ port: env.PORT, fetch: app.fetch });
console.log(`Server running @ http://localhost:${env.PORT}`);
