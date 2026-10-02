import { Queue } from "bullmq";

import { makeConnection } from "@/redis";

export enum AppTimezone {
  Lagos = "Africa/Lagos",
  London = "Europe/London",
  Berlin = "Europe/Berlin",
  Paris = "Europe/Paris",
  NewYork = "America/New_York",
  LosAngeles = "America/Los_Angeles",
  Chicago = "America/Chicago",
  SaoPaulo = "America/Sao_Paulo",
  Nairobi = "Africa/Nairobi",
  Johannesburg = "Africa/Johannesburg",
  Cairo = "Africa/Cairo",
  Dubai = "Asia/Dubai",
  Mumbai = "Asia/Kolkata",
  Singapore = "Asia/Singapore",
  HongKong = "Asia/Hong_Kong",
  Tokyo = "Asia/Tokyo",
  Sydney = "Australia/Sydney",
  UTC = "UTC",
}

export type MorningNotificationJobData = Record<string, never>;

export const morningNotificationQueue = new Queue<MorningNotificationJobData>(
  "morning-notification",
  {
    connection: makeConnection(),
  },
);

export async function scheduleMorningNotification() {
  await morningNotificationQueue.add(
    "morning-message",
    {},
    {
      repeat: {
        pattern: "0 8 * * *",
        tz: process.env.APP_TIMEZONE ?? AppTimezone.UTC,
      },
      jobId: "morning-notification",
    },
  );
}
