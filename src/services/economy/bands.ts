import { db } from "@/db";
import { asc } from "drizzle-orm";
import { bands as bandsTable } from "@/db/schema/rail2";

let cache: {
  data: Awaited<ReturnType<typeof fetchBands>>;
  expiresAt: number;
} | null = null;
const CACHE_TTL_MS = 60_000;

async function fetchBands() {
  return db.query.bands.findMany({ orderBy: asc(bandsTable.minPoints) });
}

export async function getBands() {
  if (cache && cache.expiresAt > Date.now()) return cache.data;
  const data = await fetchBands();
  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}

export async function getBandForMonthlyTally(points: number) {
  const bands = await getBands();

  if (bands.length === 0) {
    throw new Error("No bands configured");
  }

  const match = bands.find(
    (band) => points >= band.minPoints && points <= band.maxPoints,
  );

  return match ?? bands[bands.length - 1]!;
}
