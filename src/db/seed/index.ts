import { seedSubmissionLimits } from "./submission-limits";
import { seedBands } from "./bands";
import { seedAdmins } from "./admins";

export async function runSeeds() {
  await seedSubmissionLimits();
  await seedBands();
  await seedAdmins();
}
