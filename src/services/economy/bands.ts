import { db } from "@/db";
import { asc } from "drizzle-orm";
import { bands } from "@/db/schema/bigwater";

export async function getBands() {
  return db.query.bands.findMany({
    orderBy: asc(bands.minPoints),
  });
}

export async function getBandForMonthlyTally(points: number) {
  const bands = await getBands();

  if (bands.length === 0) {
    throw new Error("No bands configured");
  }

  const match = bands.find(
    (band) => points >= band.minPoints && points <= band.maxPoints,
  );

  if (match) {
    return match;
  }

  return bands[bands.length - 1]!;
}
