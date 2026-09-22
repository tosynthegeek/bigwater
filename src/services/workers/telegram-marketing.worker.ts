import { Worker } from "bullmq";
import { InputFile } from "grammy";
import { readFile, unlink } from "node:fs/promises";

import { bot } from "@/telegram/bot";
import { makeConnection } from "@/redis";
import { db } from "@/db";
import { participantProfile } from "@/db/schema/rail2";
import { isNotNull } from "drizzle-orm";
import { wireWorkerAlerts } from "@/utils/alerts";

export const telegramMarketingWorker = new Worker(
  "telegram-marketing",
  async (job) => {
    const {
      message,
      imagePath,
    }: {
      message: string;
      imagePath?: string;
    } = job.data;

    console.log(`[telegram-marketing] starting broadcast job=${job.id}`);

    const users = await db
      .select({
        telegramId: participantProfile.telegramId,
      })
      .from(participantProfile)
      .where(isNotNull(participantProfile.telegramId));

    console.log(
      `[telegram-marketing] sending to ${users.length} Telegram users`,
    );

    let sent = 0;
    let failed = 0;

    let imageBuffer: Buffer | undefined;

    if (imagePath) {
      imageBuffer = await readFile(imagePath);
    }

    for (const user of users) {
      if (!user.telegramId) {
        continue;
      }

      try {
        if (imageBuffer) {
          await bot.api.sendPhoto(user.telegramId, new InputFile(imageBuffer), {
            caption: message,
          });
        } else {
          await bot.api.sendMessage(user.telegramId, message);
        }

        sent++;

        // Keep a conservative sending rate.
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        failed++;

        console.error(
          `[telegram-marketing] failed telegramId=${user.telegramId}`,
          error,
        );
      }
    }

    if (imagePath) {
      try {
        await unlink(imagePath);
      } catch (error) {
        console.error(
          `[telegram-marketing] failed to remove temporary image ${imagePath}`,
          error,
        );
      }
    }

    console.log(
      `[telegram-marketing] completed job=${job.id} sent=${sent} failed=${failed}`,
    );

    return {
      total: users.length,
      sent,
      failed,
    };
  },
  {
    connection: makeConnection(),
  },
);

telegramMarketingWorker.on("ready", () => {
  console.log("[telegram-marketing] worker ready");
});

telegramMarketingWorker.on("active", (job) => {
  console.log(`[telegram-marketing] active job=${job.id}`);
});

telegramMarketingWorker.on("completed", (job) => {
  console.log(`[telegram-marketing] completed job=${job.id}`);
});

telegramMarketingWorker.on("failed", (job, error) => {
  console.error(`[telegram-marketing] failed job=${job?.id}:`, error);
});

telegramMarketingWorker.on("error", (error) => {
  console.error("[telegram-marketing] worker error:", error);
});

wireWorkerAlerts(telegramMarketingWorker, "worker:telegram-marketing");
