import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { collectionsApi, collectionsFor } from "../../api/collections";
import { Select } from "../ui/Select";
import { NewCollectionModal, type CollectionScope } from "./NewCollectionModal";

const NEW = "__new";

interface Props {
  value: number | null;
  onChange: (id: number | null) => void;
  privacy: string;
  groupId: number | null;
  groupName?: string;
}

/** Collection picker for a new paste: personal collections, plus the chosen group's for group pastes. */
export function CollectionSelect({ value, onChange, privacy, groupId, groupName }: Props) {
  const [creating, setCreating] = useState(false);
  const { data } = useQuery({ queryKey: ["collections"], queryFn: () => collectionsApi.list() });
  const options = collectionsFor(data?.collections ?? [], privacy, groupId);

  // Privacy or group changed so the chosen collection no longer fits: drop it.
  useEffect(() => {
    if (value !== null && data && !options.some((c) => c.id === value)) onChange(null);
  }, [value, data, privacy, groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  const scopes: CollectionScope[] =
    privacy === "group" && groupId !== null
      ? [{ groupId, label: groupName ? `${groupName} (group)` : "This group" }, { groupId: null, label: "Personal" }]
      : [{ groupId: null, label: "Personal" }];

  return (
    <>
      <Select
        aria-label="Collection"
        value={value === null ? "" : String(value)}
        options={[
          { value: "", label: "No collection" },
          ...options.map((c) => ({ value: String(c.id), label: c.group_id ? `${c.name} · ${c.group_name}` : c.name })),
          { value: NEW, label: "+ New collection…" },
        ]}
        onChange={(e) => {
          if (e.target.value === NEW) setCreating(true);
          else onChange(e.target.value ? Number(e.target.value) : null);
        }}
      />
      <NewCollectionModal
        open={creating}
        onClose={() => setCreating(false)}
        scopes={scopes}
        onCreated={(c) => onChange(c.id)}
      />
    </>
  );
}
