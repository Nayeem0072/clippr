import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { collectionsApi, type Collection } from "../../api/collections";
import { groupsApi } from "../../api/groups";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageLoader } from "../../components/ui/Spinner";
import { FolderIcon, NewCollectionModal, type CollectionScope } from "../../components/collection";
import { formatRelative } from "../../lib/utils";

export function CollectionGrid({ collections }: { collections: Collection[] }) {
  return (
    <div className="collection-grid">
      {collections.map((c) => (
        <Link key={c.id} to={`/collections/${c.id}`} className="pp-card collection-card">
          <span className="collection-card-icon"><FolderIcon size={18} /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="collection-card-name">{c.name}</span>
            <span className="collection-card-meta">
              {c.doc_count} paste{c.doc_count === 1 ? "" : "s"} · {formatRelative(c.updated_at)}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

export default function CollectionsPage() {
  const [creating, setCreating] = useState<CollectionScope[] | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["collections"], queryFn: () => collectionsApi.list() });
  const { data: groupsData } = useQuery({ queryKey: ["my-groups"], queryFn: () => groupsApi.list() });

  const all = data?.collections ?? [];
  const personal = all.filter((c) => c.group_id === null);
  const groups = groupsData?.groups ?? [];
  // Groups that have collections, plus the rest of the user's groups so they can start one.
  const groupSections = groups
    .map((g) => ({ group: g, collections: all.filter((c) => c.group_id === g.id) }))
    .sort((a, b) => b.collections.length - a.collections.length || a.group.name.localeCompare(b.group.name));

  const allScopes: CollectionScope[] = [
    { groupId: null, label: "Personal" },
    ...groups.map((g) => ({ groupId: g.id, label: `${g.name} (group)` })),
  ];

  if (isLoading) return <PageLoader />;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-ink)", margin: "0 0 4px" }}>Collections</h1>
          <p style={{ fontSize: 13, color: "var(--color-ink-3)", margin: 0 }}>
            Group related pastes into folders, for yourself or your groups
          </p>
        </div>
        <Button onClick={() => setCreating(allScopes)}>+ New collection</Button>
      </div>

      <section className="collection-section">
        <h2 className="collection-section-title">Personal</h2>
        {personal.length === 0 ? (
          <EmptyState
            title="No collections yet"
            description="Create one here, or pick a collection when you save a new paste."
          />
        ) : (
          <CollectionGrid collections={personal} />
        )}
      </section>

      {groupSections.map(({ group, collections }) => (
        <section key={group.id} className="collection-section">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <h2 className="collection-section-title">
              <Link to={`/groups/${group.slug}`} style={{ color: "inherit", textDecoration: "none" }}>{group.name}</Link>
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreating([{ groupId: group.id, label: `${group.name} (group)` }])}
            >
              + New
            </Button>
          </div>
          {collections.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-ink-3)", margin: 0 }}>No group collections yet.</p>
          ) : (
            <CollectionGrid collections={collections} />
          )}
        </section>
      ))}

      <NewCollectionModal open={creating !== null} onClose={() => setCreating(null)} scopes={creating ?? undefined} />
    </div>
  );
}
