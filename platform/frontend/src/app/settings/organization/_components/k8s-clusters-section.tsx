"use client";

import { format } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { FormDialog } from "@/components/form-dialog";
import { SettingsBlock } from "@/components/settings/settings-block";
import { Button } from "@/components/ui/button";
import { DialogForm, DialogStickyFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateK8sCluster,
  useDeleteK8sCluster,
  useK8sClusters,
} from "@/lib/k8s/k8s-cluster.query";

export function K8sClustersSection() {
  const { data } = useK8sClusters();
  const clusters = data?.clusters.filter((c) => c.id !== null) ?? [];

  const createMutation = useCreateK8sCluster();
  const deleteMutation = useDeleteK8sCluster();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [clusterName, setClusterName] = useState("");
  const [kubeconfig, setKubeconfig] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const handleAdd = async () => {
    const result = await createMutation.mutateAsync({
      name: clusterName.trim(),
      kubeconfig: kubeconfig.trim(),
    });
    if (result) {
      setShowAddDialog(false);
      setClusterName("");
      setKubeconfig("");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteMutation.mutateAsync(deleteTarget.id);
    if (result) {
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <SettingsBlock
        title="Kubernetes Clusters"
        description="Register custom Kubernetes clusters for MCP server deployments."
        control={
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add cluster
          </Button>
        }
      >
        {clusters.length > 0 ? (
          <div className="space-y-2">
            {clusters.map((cluster) => {
              if (!cluster.id) return null;
              const id = cluster.id;
              return (
                <div
                  key={id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium">{cluster.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Added{" "}
                      {format(new Date(cluster.createdAt), "MMM d, yyyy")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setDeleteTarget({ id, name: cluster.name })
                    }
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No custom clusters registered. MCP servers will use the default
            platform cluster.
          </p>
        )}
      </SettingsBlock>

      <FormDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        title="Add Kubernetes Cluster"
        description="Provide a name and kubeconfig to register a custom cluster."
        size="medium"
      >
        <DialogForm
          className="flex min-h-0 flex-1 flex-col gap-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleAdd();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="cluster-name">Name</Label>
            <Input
              id="cluster-name"
              placeholder="Production cluster"
              value={clusterName}
              onChange={(e) => setClusterName(e.target.value)}
            />
          </div>
          <div className="space-y-2 flex-1">
            <Label htmlFor="kubeconfig">Kubeconfig</Label>
            <Textarea
              id="kubeconfig"
              placeholder="Paste kubeconfig YAML here..."
              value={kubeconfig}
              onChange={(e) => setKubeconfig(e.target.value)}
              className="font-mono text-xs min-h-[200px]"
            />
            <p className="text-xs text-muted-foreground">
              The kubeconfig is stored securely and used to authenticate with
              the cluster.
            </p>
          </div>
          <DialogStickyFooter className="border-t-0 shadow-none">
            <Button
              type="submit"
              disabled={
                !clusterName.trim() ||
                !kubeconfig.trim() ||
                createMutation.isPending
              }
            >
              {createMutation.isPending ? "Adding..." : "Add cluster"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
          </DialogStickyFooter>
        </DialogForm>
      </FormDialog>

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remove Kubernetes Cluster"
        description={`Are you sure you want to remove "${deleteTarget?.name}"? MCP servers using this cluster will fall back to the default platform cluster.`}
        isPending={deleteMutation.isPending}
        onConfirm={handleDelete}
        confirmLabel="Remove"
        pendingLabel="Removing..."
      />
    </>
  );
}
