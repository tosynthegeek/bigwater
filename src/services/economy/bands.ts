import { db } from "@/db";
import { asc } from "drizzle-orm";
import { bands } from "@/db/schema/bigwater";

export async function getBands() {
  return db.query.bands.findMany({
    orderBy: asc(bands.minPoints),
  });
}

export async function getBandForMonthlyTally(points: number) {
  const allBands = await getBands();

  const band = allBands.find(
    (band) => points >= band.minPoints && points <= band.maxPoints,
  );

  if (!band) {
    throw new Error("No matching band");
  }

  return band;
}
