import { publicRateLimiter } from "@/middleware/rate-limit";
import { Hono } from "hono";
import { linkRailOne } from "../controllers/participants-controllers";

export const PublicRouter = new Hono();

PublicRouter.get("/link-rail1", publicRateLimiter, linkRailOne);

/*
User login
JWT Token -> 
*/
