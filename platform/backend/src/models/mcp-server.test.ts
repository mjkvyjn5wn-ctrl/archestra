import db, { schema } from "@/database";
import { describe, expect, test } from "@/test";
import K8sClusterModel from "./k8s-cluster";
import McpServerModel from "./mcp-server";
import McpServerUserModel from "./mcp-server-user";

const VALID_KUBECONFIG = `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://test-cluster.example.com
  name: test-cluster
contexts:
- context:
    cluster: test-cluster
    user: test-user
  name: test-context
current-context: test-context
users:
- name: test-user
  user:
    token: test-token
`;

describe("McpServerModel", () => {
  describe("serverType field", () => {
    test("MCP servers store serverType correctly including builtin", async ({
      makeInternalMcpCatalog,
    }) => {
      // Create catalogs for each server type
      const localCatalog = await makeInternalMcpCatalog({
        name: "Local Test Catalog",
        serverType: "local",
        localConfig: { command: "node", arguments: ["server.js"] },
      });

      const remoteCatalog = await makeInternalMcpCatalog({
        name: "Remote Test Catalog",
        serverType: "remote",
        serverUrl: "https://example.com/mcp",
      });

      const builtinCatalog = await makeInternalMcpCatalog({
        name: "Builtin Test Catalog",
        serverType: "builtin",
      });

      // Create MCP server instances with different types
      const [localServer] = await db
        .insert(schema.mcpServersTable)
        .values({
          name: "Local Server",
          serverType: "local",
          catalogId: localCatalog.id,
        })
        .returning();

      const [remoteServer] = await db
        .insert(schema.mcpServersTable)
        .values({
          name: "Remote Server",
          serverType: "remote",
          catalogId: remoteCatalog.id,
        })
        .returning();

      const [builtinServer] = await db
        .insert(schema.mcpServersTable)
        .values({
          name: "Builtin Server",
          serverType: "builtin",
          catalogId: builtinCatalog.id,
        })
        .returning();

      // Verify serverTypes are stored correctly
      expect(localServer.serverType).toBe("local");
      expect(remoteServer.serverType).toBe("remote");
      expect(builtinServer.serverType).toBe("builtin");

      // Verify we can find them by ID
      const foundLocal = await McpServerModel.findById(localServer.id);
      const foundRemote = await McpServerModel.findById(remoteServer.id);
      const foundBuiltin = await McpServerModel.findById(builtinServer.id);

      expect(foundLocal?.serverType).toBe("local");
      expect(foundRemote?.serverType).toBe("remote");
      expect(foundBuiltin?.serverType).toBe("builtin");
    });
  });

  describe("findByIdsBasic", () => {
    test("returns basic MCP server records for given IDs", async ({
      makeMcpServer,
    }) => {
      const server1 = await makeMcpServer();
      const server2 = await makeMcpServer();
      await makeMcpServer(); // not requested

      const results = await McpServerModel.findByIdsBasic([
        server1.id,
        server2.id,
      ]);

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id).sort()).toEqual(
        [server1.id, server2.id].sort(),
      );
    });

    test("returns empty array for empty input", async () => {
      const results = await McpServerModel.findByIdsBasic([]);
      expect(results).toEqual([]);
    });

    test("returns empty array for non-existent IDs", async () => {
      const results = await McpServerModel.findByIdsBasic([
        crypto.randomUUID(),
      ]);
      expect(results).toEqual([]);
    });
  });

  describe("resolveOrganizationId", () => {
    test("resolves organizationId via team", async ({
      makeOrganization,
      makeTeam,
      makeUser,
      makeMcpServer,
    }) => {
      const org = await makeOrganization();
      const user = await makeUser();
      const team = await makeTeam(org.id, user.id);
      const server = await makeMcpServer({ teamId: team.id });

      const result = await McpServerModel.resolveOrganizationId(server.id);
      expect(result).toBe(org.id);
    });

    test("resolves organizationId via member for personal server", async ({
      makeOrganization,
      makeUser,
      makeMember,
      makeMcpServer,
    }) => {
      const org = await makeOrganization();
      const user = await makeUser();
      await makeMember(user.id, org.id);
      const server = await makeMcpServer({ ownerId: user.id });

      const result = await McpServerModel.resolveOrganizationId(server.id);
      expect(result).toBe(org.id);
    });

    test("returns null for server with no team or member", async ({
      makeMcpServer,
    }) => {
      const server = await makeMcpServer();
      const result = await McpServerModel.resolveOrganizationId(server.id);
      expect(result).toBeNull();
    });
  });

  describe("findWithClusterContext", () => {
    test("returns server with null cluster when no k8sClusterId", async ({
      makeOrganization,
      makeMcpServer,
    }) => {
      await makeOrganization();
      const server = await makeMcpServer();

      const result = await McpServerModel.findWithClusterContext(server.id);
      expect(result).not.toBeNull();
      expect(result?.server.id).toBe(server.id);
      expect(result?.cluster).toBeNull();
    });

    test("returns server with cluster when k8sClusterId is set", async ({
      makeOrganization,
      makeMcpServer,
    }) => {
      const org = await makeOrganization();
      const cluster = await K8sClusterModel.create({
        organizationId: org.id,
        name: "Test Cluster",
        kubeconfig: VALID_KUBECONFIG,
      });
      const server = await makeMcpServer({ k8sClusterId: cluster.id } as Parameters<typeof makeMcpServer>[0] & { k8sClusterId?: string });

      const result = await McpServerModel.findWithClusterContext(server.id);
      expect(result).not.toBeNull();
      expect(result?.cluster?.id).toBe(cluster.id);
    });

    test("returns null for non-existent server", async () => {
      const result = await McpServerModel.findWithClusterContext(
        crypto.randomUUID(),
      );
      expect(result).toBeNull();
    });
  });

  describe("findAll", () => {
    test("returns servers with user details from combined query", async ({
      makeMcpServer,
      makeUser,
    }) => {
      const user1 = await makeUser();
      const user2 = await makeUser();
      const server = await makeMcpServer();

      // Assign users to the server
      await McpServerUserModel.assignUserToMcpServer(server.id, user1.id);
      await McpServerUserModel.assignUserToMcpServer(server.id, user2.id);

      // findAll as admin (no access control)
      const allServers = await McpServerModel.findAll(undefined, true);
      const found = allServers.find((s) => s.id === server.id);

      expect(found).toBeDefined();
      if (!found) return;
      expect(found.users).toHaveLength(2);
      expect(found.users).toContain(user1.id);
      expect(found.users).toContain(user2.id);
      expect(found.userDetails).toHaveLength(2);
      expect(found.userDetails?.map((u) => u.userId).sort()).toEqual(
        [user1.id, user2.id].sort(),
      );
    });

    test("returns servers with no users correctly", async ({
      makeMcpServer,
    }) => {
      const server = await makeMcpServer();

      const allServers = await McpServerModel.findAll(undefined, true);
      const found = allServers.find((s) => s.id === server.id);

      expect(found).toBeDefined();
      if (!found) return;
      expect(found.users).toHaveLength(0);
      expect(found.userDetails).toHaveLength(0);
    });

    test("does not duplicate servers when multiple users assigned", async ({
      makeMcpServer,
      makeUser,
    }) => {
      const user1 = await makeUser();
      const user2 = await makeUser();
      const user3 = await makeUser();
      const server = await makeMcpServer();

      await McpServerUserModel.assignUserToMcpServer(server.id, user1.id);
      await McpServerUserModel.assignUserToMcpServer(server.id, user2.id);
      await McpServerUserModel.assignUserToMcpServer(server.id, user3.id);

      const allServers = await McpServerModel.findAll(undefined, true);
      // Ensure the server only appears once despite 3 users (LEFT JOIN dedup)
      const matching = allServers.filter((s) => s.id === server.id);
      expect(matching).toHaveLength(1);
      expect(matching[0].users).toHaveLength(3);
    });
  });
});
