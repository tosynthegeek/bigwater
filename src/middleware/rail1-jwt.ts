import { jwtVerify } from "jose";

const RAIL1_JWT_SECRET = new TextEncoder().encode(Bun.env.RAIL1_JWT_SECRET);
export const JWT_ALGORITHM = "HS256";

export async function verifyRail1Token(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, RAIL1_JWT_SECRET, {
    algorithms: [JWT_ALGORITHM],
  });

  // Mirror rail1's own check: a member token must never carry `scope`.
  // Rejecting this here, not just relying on rail1 to never send one,
  // matters if this token is ever passed straight through by the frontend
  // without rail1 being the only thing that could have issued it.
  if (payload.scope !== undefined) {
    throw new Error(
      "scoped (non-member) token is not a valid rail1 identity assertion",
    );
  }

  const sub = payload.sub;
  if (typeof sub !== "string") {
    throw new Error("rail1 token missing 'sub' claim");
  }

  // sanity check it's actually a uuid, matching rail1's own decode() validation
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(sub)) {
    throw new Error("rail1 token 'sub' is not a valid UUID");
  }

  return sub;
}
