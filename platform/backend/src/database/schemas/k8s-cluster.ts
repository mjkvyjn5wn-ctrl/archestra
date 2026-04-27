import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import organizationsTable from "./organization";

const k8sClustersTable = pgTable("k8s_cluster", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // TODO: Replace raw kubeconfig storage with KMS-based encryption at rest
  // (e.g., AWS KMS, GCP Cloud KMS). Currently storing raw kubeconfig YAML
  // which contains sensitive credentials.
  kubeconfig: text("kubeconfig").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export default k8sClustersTable;
