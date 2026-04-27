import { and, asc, count, eq } from "drizzle-orm";
import db, { schema } from "@/database";
import { ApiError } from "@/types";
import type { InsertK8sCluster, K8sCluster } from "@/types";

class K8sClusterModel {
  static async create({
    organizationId,
    name,
    kubeconfig,
  }: InsertK8sCluster): Promise<K8sCluster> {
    const [cluster] = await db
      .insert(schema.k8sClustersTable)
      .values({ organizationId, name, kubeconfig })
      .returning();
    if (!cluster) {
      throw new ApiError(500, "Failed to create K8s cluster");
    }
    return cluster;
  }

  static async findAll(organizationId: string): Promise<K8sCluster[]> {
    return db
      .select()
      .from(schema.k8sClustersTable)
      .where(eq(schema.k8sClustersTable.organizationId, organizationId))
      .orderBy(asc(schema.k8sClustersTable.createdAt));
  }

  static async findById(
    id: string,
    organizationId: string,
  ): Promise<K8sCluster | null> {
    const [cluster] = await db
      .select()
      .from(schema.k8sClustersTable)
      .where(
        and(
          eq(schema.k8sClustersTable.id, id),
          eq(schema.k8sClustersTable.organizationId, organizationId),
        ),
      )
      .limit(1);
    return cluster ?? null;
  }

  static async delete(id: string, organizationId: string): Promise<void> {
    const inUseCount = await countMcpServersByClusterId(id);
    if (inUseCount > 0) {
      throw new ApiError(
        400,
        `Cannot delete cluster: ${inUseCount} MCP server${inUseCount === 1 ? "" : "s"} still use${inUseCount === 1 ? "s" : ""} it`,
      );
    }
    await db
      .delete(schema.k8sClustersTable)
      .where(
        and(
          eq(schema.k8sClustersTable.id, id),
          eq(schema.k8sClustersTable.organizationId, organizationId),
        ),
      );
  }

  // For internal runtime use only — bypasses org scoping since the cluster
  // was already validated at creation time.
  static async findByIdInternal(id: string): Promise<K8sCluster | null> {
    const [cluster] = await db
      .select()
      .from(schema.k8sClustersTable)
      .where(eq(schema.k8sClustersTable.id, id))
      .limit(1);
    return cluster ?? null;
  }
}

export default K8sClusterModel;

async function countMcpServersByClusterId(clusterId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(schema.mcpServersTable)
    .where(eq(schema.mcpServersTable.k8sClusterId, clusterId));
  return row?.total ?? 0;
}
