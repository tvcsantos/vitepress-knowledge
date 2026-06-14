import { consola } from "consola";
import { createMiddleware } from "hono/factory";
import pc from "picocolors";

export const requestLoggerMiddleware = createMiddleware(async (c, next) => {
  const { method, url } = c.req;
  consola.info(
    `${pc.cyan("[http]")} <-- ${getRequestColor(method)(method)} ${url}`,
  );
  await next();
  consola.info(
    `${pc.cyan("[http]")} --> ${getRequestColor(method)(method)} ${url} ${c.res.status}`,
  );
});

function getRequestColor(method: string) {
  switch (method.toUpperCase()) {
    case "GET":
      return pc.blue;
    case "POST":
      return pc.green;
    case "PUT":
      return pc.yellow;
    case "DELETE":
      return pc.red;
    default:
      return pc.dim;
  }
}
