import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { collectionsApi } from "../../api/collections";
import { DocCard } from "../../components/document/DocCard";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { PageLoader } from "../../components/ui/Spinner";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../hooks/useAuth";
import { FolderIcon } from "../../components/collection";

export default function CollectionPage() {
  const id = Number(useParams<{ id: string }>().id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["collection", id],
    queryFn: () => collectionsApi.get(id),
    enabled: Number.isInteger(id),
  });
  const col = data?.collection;

  useEffect(() => {
    if (col) {
      document.title = `${col.name} — clippr`;
      return () => { document.title = "Clippr"; };
    }
  }, [col?.name]);

  const rename = useMutation({
    mutationFn: () => collectionsApi.rename(id, name.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collection", id] });
      qc.invalidateQueries({ queryKey: ["collections"] });
      setRenaming(false);
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  const remove = useMutation({
    mutationFn: () => collectionsApi.remove(id),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["collection", id] });
      qc.invalidateQueries({ queryKey: ["collections"] });
      qc.invalidateQueries({ queryKey: ["doc"] });
      toast("Collection deleted", "success");
      navigate(col?.group_slug ? `/groups/${col.group_slug}` : "/collections");
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  if (isLoading) return <PageLoader />;
  if (error || !col) {
    return (
      <EmptyState
        title="Collection not found"
        description="It may have been deleted, or you don't have access."
        action={<Link to="/collections" style={{ color: "var(--color-blue)", fontSize: 14 }}>← All collections</Link>}
      />
    );
  }

  const docs = data!.documents;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginBottom: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Link to="/collections" style={{ color: "inherit", textDecoration: "none" }}>Collections</Link>
          <span>/</span>
          {col.group_slug ? (
            <Link to={`/groups/${col.group_slug}`} style={{ color: "inherit", textDecoration: "none" }}>{col.group_name}</Link>
          ) : (
            <span>Personal</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ color: "var(--color-blue)", display: "inline-flex" }}><FolderIcon size={20} /></span>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-ink)", margin: 0, overflowWrap: "anywhere" }}>
              {col.name}
            </h1>
          </div>
          {col.can_manage && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant="ghost" size="sm" onClick={() => { setName(col.name); setRenaming(true); }}>Rename</Button>
              <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>Delete</Button>
            </div>
          )}
        </div>
        <p style={{ fontSize: 13, color: "var(--color-ink-3)", margin: "6px 0 0" }}>
          {docs.length} paste{docs.length === 1 ? "" : "s"}
        </p>
      </div>

      {docs.length === 0 ? (
        <EmptyState
          title="This collection is empty"
          description={
            col.group_id
              ? "Members can add their group pastes from a paste's page, or when creating one."
              : "Add pastes from a paste's page, or pick this collection when creating one."
          }
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {docs.map((d) => (
            <div key={d.slug}>
              {d.owner_id !== user?.id && (
                <div style={{ fontSize: 11, color: "var(--color-ink-3)", marginBottom: 4, paddingLeft: 2, fontFamily: "monospace" }}>
                  by @{d.owner_handle}
                </div>
              )}
              <DocCard slug={d.slug} title={d.title} language={d.language} privacy={d.privacy} created_at={d.created_at} />
            </div>
          ))}
        </div>
      )}

      <Modal open={renaming} onClose={() => setRenaming(false)} title="Rename collection" width={400}>
        <form
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) rename.mutate(); }}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <Input label="Name" autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRenaming(false)}>Cancel</Button>
            <Button type="submit" size="sm" loading={rename.isPending} disabled={!name.trim()}>Save</Button>
          </div>
        </form>
      </Modal>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete collection?">
        <p style={{ fontSize: 14, color: "var(--color-ink-2)", margin: "0 0 16px" }}>
          "{col.name}" will be deleted. The pastes in it are kept; they just won't be in a collection.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="danger" size="sm" loading={remove.isPending} onClick={() => remove.mutate()}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
