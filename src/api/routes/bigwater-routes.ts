import { Hono } from "hono";
import { privyAuth, requireAuth, requireBotSecret } from "@/middleware/auth";
import {
  createTelegramLinkCode,
  login,
} from "@/api/controllers/participants-controllers";

const ApiRouter = new Hono();

ApiRouter.get("/health", async (c) => {
  return c.json({ status: "ok" }, 200);
});

// login
ApiRouter.get("/login", privyAuth, requireAuth, login);
ApiRouter.post(
  "/telegram/link-code",
  privyAuth,
  requireAuth,
  createTelegramLinkCode,
);

export default ApiRouter;
