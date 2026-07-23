import { db } from "@/db";
import { bands } from "@/db/schema/rail2";

export async function seedBands() {
  const existing = await db.query.bands.findFirst();

  if (existing) {
    return;
  }

  await db.insert(bands).values([
    {
      name: "Seedling",
      minPoints: 0,
      maxPoints: 399,
      multiplier: 50, // 0.5x
      order: 1,
    },
    {
      name: "Growing",
      minPoints: 400,
      maxPoints: 599,
      multiplier: 100, // 1.0x
      order: 2,
    },
    {
      name: "Thriving",
      minPoints: 600,
      maxPoints: 799,
      multiplier: 150, // 1.5x
      order: 3,
    },
    {
      name: "Flourishing",
      minPoints: 800,
      maxPoints: 949,
      multiplier: 200, // 2.0x
      order: 4,
    },
    {
      name: "Regenerative",
      minPoints: 950,
      maxPoints: 1000,
      multiplier: 300, // 3.0x
      order: 5,
    },
  ]);

  console.log("✓ Seeded default bands");
}
