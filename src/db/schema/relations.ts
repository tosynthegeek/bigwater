import { relations } from "drizzle-orm";
import { authUsers, participantProfile } from "./rail2";

export const authUsersRelations = relations(authUsers, ({ one }) => ({
  participantProfile: one(participantProfile, {
    fields: [authUsers.id],
    references: [participantProfile.userId],
  }),
}));
