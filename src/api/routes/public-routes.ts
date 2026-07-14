import { loginRateLimiter } from "@/middleware/rate-limit";
import { Hono } from "hono";
import { createTelegramLinkCode, login } from "../controllers/participants-controllers";

export const PublicRouter = new Hono();

PublicRouter.get("/login", loginRateLimiter, login);
PublicRouter.post(
  "/telegram/link-code",
  loginRateLimiter,
  createTelegramLinkCode,
);
