import { Worker } from "bullmq";
import { InputFile } from "grammy";
import { readFile, unlink } from "node:fs/promises";

import { bot } from "@/telegram/bot";
import { makeConnection } from "@/redis";
import { db } from "@/db";
import { participantProfile } from "@/db/schema/rail2";
import { isNotNull } from "drizzle-orm";
import { wireWorkerAlerts } from "@/utils/alerts";
import { logger } from "@/utils/logger";

const log = logger.child({ source: "worker:telegram-marketing" });

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

    log.info("starting broadcast", { jobId: job.id });

    const users = await db
      .select({
        telegramId: participantProfile.telegramId,
      })
      .from(participantProfile)
      .where(isNotNull(participantProfile.telegramId));

    log.info("broadcasting to Telegram users", { recipients: users.length });

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

        log.error("failed to send to Telegram user", {
          telegramId: user.telegramId,
          err: error,
        });
      }
    }

    if (imagePath) {
      try {
        await unlink(imagePath);
      } catch (error) {
        log.error("failed to remove temporary image", {
          imagePath,
          err: error,
        });
      }
    }

    log.info("broadcast complete", { jobId: job.id, sent, failed });

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
  log.info("worker ready");
});

telegramMarketingWorker.on("active", (job) => {
  log.debug("job active", { jobId: job.id });
});

telegramMarketingWorker.on("completed", (job) => {
  log.info("job completed", { jobId: job.id });
});

telegramMarketingWorker.on("failed", (job, error) => {
  log.error("job failed", { jobId: job?.id, err: error });
});

telegramMarketingWorker.on("error", (error) => {
  log.error("worker-level error", { err: error });
});

wireWorkerAlerts(telegramMarketingWorker, "worker:telegram-marketing");
