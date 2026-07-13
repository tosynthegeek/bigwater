// A known, user-facing rejection (cooldown/limit reached, invalid task,
// etc.) — distinct from an unexpected crash, so the controller can return
// the real message instead of a generic 500.
export class SubmissionRejectedError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 429 = 400,
  ) {
    super(message);
    this.name = "SubmissionRejectedError";
  }
}
