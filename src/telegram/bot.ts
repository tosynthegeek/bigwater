import { Bot, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { sessionStorage, type SessionData } from "@/telegram/session";
import { submitProofConversation } from "@/telegram/conversations/submit-proof";
import type { Context, SessionFlavor } from "grammy";
import type { Conversation, ConversationFlavor } from "@grammyjs/conversations";

export type BotContext = ConversationFlavor<
  Context & SessionFlavor<SessionData>
>;

export type BotConversation = Conversation<BotContext, BotContext>;

const token = Bun.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

export const bot = new Bot<BotContext>(token);

bot.use(
  session({
    initial: (): {} => ({}),
    storage: sessionStorage,
  }),
);
bot.use(conversations());
bot.use(createConversation(submitProofConversation, "submitProof"));
