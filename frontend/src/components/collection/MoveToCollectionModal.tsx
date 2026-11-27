import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { collectionsApi, collectionsFor, type Collection } from "../../api/collections";
import { docsApi } from "../../api/documents";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { useToast } from "../ui/Toast";
import { NewCollectionModal, type CollectionScope } from "./NewCollectionModal";
import { FolderIcon } from "./FolderIcon";

interface Props {
  open: boolean;
  onClose: () => void;
  slug: string;
  privacy: string;
  groupId: number | null;
  currentId: number | null;
}

/** Move one of your pastes into a collection (existing or new), or out of its current one. */
export function MoveToCollectionModal({ open, onClose, slug, privacy, groupId, currentId }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["collections"],
    queryFn: () => collectionsApi.list(),
    enabled: open,
  });
  const options = collectionsFor(data?.collections ?? [], privacy, groupId);
  const groupName = data?.collections.find((c) => c.group_id === groupId)?.group_name ?? null;

  const move = useMutation({
    mutationFn: (id: number | null) => docsApi.setCollection(slug, id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["doc", slug] });
      qc.invalidateQueries({ queryKey: ["collections"] });
      qc.invalidateQueries({ queryKey: ["collection"] });
      toast(r.collection ? `Moved to "${r.collection.name}"` : "Removed from collection", "success");
      onClose();
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  const scopes: CollectionScope[] =
    privacy === "group" && groupId !== null
      ? [{ groupId, label: groupName ? `${groupName} (group)` : "This group" }, { groupId: null, label: "Personal" }]
      : [{ groupId: null, label: "Personal" }];

  const row = (c: Collection) => {
    const current = c.id === currentId;
    return (
      <button
        key={c.id}
        type="button"
        className="collection-pick"
        disabled={current || move.isPending}
        onClick={() => move.mutate(c.id)}
        aria-current={current || undefined}
      >
        <FolderIcon />
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {c.name}
        </span>
        {c.group_name && <span className="collection-pick-meta">{c.group_name}</span>}
        <span className="collection-pick-meta">{current ? "Current" : c.doc_count}</span>
      </button>
    );
  };

  return (
    <>
      <Modal open={open && !creating} onClose={onClose} title="Move to collection" width={420}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {isLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 16 }}><Spinner /></div>
          ) : options.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-ink-3)", margin: 0 }}>
              No collections yet. Create one to file this paste in.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 320, overflowY: "auto" }}>
              {options.map(row)}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
            <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>+ New collection</Button>
            {currentId !== null && (
              <Button variant="ghost" size="sm" loading={move.isPending} onClick={() => move.mutate(null)}>
                Remove from collection
              </Button>
            )}
          </div>
        </div>
      </Modal>
      <NewCollectionModal
        open={creating}
        onClose={() => setCreating(false)}
        scopes={scopes}
        onCreated={(c) => move.mutate(c.id)}
      />
    </>
  );
}
