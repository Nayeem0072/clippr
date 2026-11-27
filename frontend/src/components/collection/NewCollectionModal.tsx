import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { collectionsApi, type Collection } from "../../api/collections";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";

export interface CollectionScope {
  /** null = personal. */
  groupId: number | null;
  label: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Where the new collection may live. More than one shows a picker; the first is the default. */
  scopes?: CollectionScope[];
  onCreated?: (c: Collection) => void;
}

const PERSONAL: CollectionScope[] = [{ groupId: null, label: "Personal" }];

export function NewCollectionModal({ open, onClose, scopes = PERSONAL, onCreated }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [scope, setScope] = useState(0);

  useEffect(() => {
    if (open) {
      setName("");
      setScope(0);
    }
  }, [open]);

  const create = useMutation({
    mutationFn: () => collectionsApi.create(name.trim(), scopes[scope]?.groupId ?? null),
    onSuccess: ({ collection }) => {
      // Add it to the cached list now, so pickers that select it don't see an unknown id before the refetch.
      qc.setQueryData<{ collections: Collection[] }>(["collections"], (old) =>
        old ? { collections: [...old.collections, collection] } : old
      );
      qc.invalidateQueries({ queryKey: ["collections"] });
      toast(`Created "${collection.name}"`, "success");
      onCreated?.(collection);
      onClose();
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  return (
    <Modal open={open} onClose={onClose} title="New collection" width={400}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && !create.isPending) create.mutate();
        }}
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
      >
        <Input
          label="Name"
          autoFocus
          maxLength={60}
          placeholder="e.g. Shell snippets"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {scopes.length > 1 && (
          <Select
            label="Belongs to"
            value={String(scope)}
            options={scopes.map((s, i) => ({ value: String(i), label: s.label }))}
            onChange={(e) => setScope(Number(e.target.value))}
          />
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" loading={create.isPending} disabled={!name.trim()}>Create</Button>
        </div>
      </form>
    </Modal>
  );
}
