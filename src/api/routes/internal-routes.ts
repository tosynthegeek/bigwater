import { Hono } from "hono";
import { updateSubmissionAiConfidence } from "../controllers/submissions-controllers";

const InternalRouter = new Hono();

InternalRouter.patch("/submissions/:id/review", updateSubmissionAiConfidence);

export default InternalRouter;
