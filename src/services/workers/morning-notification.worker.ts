import { Worker } from "bullmq";
import { isNotNull } from "drizzle-orm";

import { bot } from "@/telegram/bot";
import { db } from "@/db";
import { participantProfile } from "@/db/schema/rail2";
import { makeConnection } from "@/redis";
import { wireWorkerAlerts } from "@/utils/alerts";
import { logger } from "@/utils/logger";

import type { MorningNotificationJobData } from "../queues/morning-notification.queue";

const log = logger.child({ source: "worker:morning-notification" });

const MORNING_MESSAGE =
  `🌞 Welcome to a new day and new beginning!!\n\n` +
  `Today's mission is 5 good deeds. No cape required, just kindness. 🔥\n\n` +
  `Don't break the streak! Every action adds up — keep the momentum going!\n\n` +
  `Let's go! 💚`;

export const morningNotificationWorker = new Worker<MorningNotificationJobData>(
  "morning-notification",
  async (job) => {
    log.info("starting morning notification", { jobId: job.id });

    const users = await db
      .select({
        telegramId: participantProfile.telegramId,
      })
      .from(participantProfile)
      .where(isNotNull(participantProfile.telegramId));

    log.info("sending morning notifications", {
      recipients: users.length,
    });

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      if (!user.telegramId) continue;

      try {
        await bot.api.sendMessage(user.telegramId, MORNING_MESSAGE);

        sent++;

        // Keep a conservative sending rate.
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        failed++;

        log.error("failed to send morning notification", {
          telegramId: user.telegramId,
          err: error,
        });
      }
    }

    log.info("morning notification complete", {
      jobId: job.id,
      total: users.length,
      sent,
      failed,
    });

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

morningNotificationWorker.on("ready", () => {
  log.info("worker ready");
});

morningNotificationWorker.on("active", (job) => {
  log.debug("job active", { jobId: job.id });
});

morningNotificationWorker.on("completed", (job) => {
  log.info("job completed", { jobId: job.id });
});

morningNotificationWorker.on("failed", (job, error) => {
  log.error("job failed", {
    jobId: job?.id,
    err: error,
  });
});

morningNotificationWorker.on("error", (error) => {
  log.error("worker-level error", { err: error });
});

wireWorkerAlerts(morningNotificationWorker, "worker:morning-notification");
