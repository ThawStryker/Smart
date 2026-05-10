import { relations } from "drizzle-orm";
import {
  projects,
  tools,
  executionSteps,
  conversations,
  versions,
  marketListings,
  toolData,
  domains,
} from "./db_schema";

export const projectsRelations = relations(projects, ({ many }) => ({
  tools: many(tools),
  conversations: many(conversations),
  domains: many(domains),
}));

export const toolsRelations = relations(tools, ({ one, many }) => ({
  project: one(projects, {
    fields: [tools.projectId],
    references: [projects.id],
  }),
  executionSteps: many(executionSteps),
  versions: many(versions),
  domains: many(domains),
  marketListing: one(marketListings, {
    fields: [tools.id],
    references: [marketListings.toolId],
  }),
}));

export const executionStepsRelations = relations(executionSteps, ({ one }) => ({
  tool: one(tools, {
    fields: [executionSteps.toolId],
    references: [tools.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one }) => ({
  project: one(projects, {
    fields: [conversations.projectId],
    references: [projects.id],
  }),
}));

export const versionsRelations = relations(versions, ({ one }) => ({
  tool: one(tools, {
    fields: [versions.toolId],
    references: [tools.id],
  }),
}));

export const marketListingsRelations = relations(marketListings, ({ one }) => ({
  tool: one(tools, {
    fields: [marketListings.toolId],
    references: [tools.id],
  }),
}));

export const toolDataRelations = relations(toolData, ({ one }) => ({
  project: one(projects, { fields: [toolData.projectId], references: [projects.id] }),
}));

export const domainsRelations = relations(domains, ({ one }) => ({
  tool: one(tools, { fields: [domains.toolId], references: [tools.id] }),
  project: one(projects, { fields: [domains.projectId], references: [projects.id] }),
}));
