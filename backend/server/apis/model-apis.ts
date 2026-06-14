import { Hono } from "hono";
import { aiService } from "../dependencies";

// List models available to chat with.
export const modelApis = new Hono().get("/", (c) => c.json(aiService.models));
