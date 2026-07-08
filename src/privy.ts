import { PrivyClient } from "@privy-io/node";

const appId = Bun.env.PRIVY_APP_ID;
const appSecret = Bun.env.PRIVY_APP_SECRET;

if (!appId || !appSecret) {
  throw new Error("PRIVY_APP_ID / PRIVY_APP_SECRET are not set");
}

export const privy = new PrivyClient({ appId, appSecret });
