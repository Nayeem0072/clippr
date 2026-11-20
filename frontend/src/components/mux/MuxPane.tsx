import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { docsApi, type Document } from "../../api/documents";
import { ApiError } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";
import { DocViewer } from "../document/DocViewer";
import { CodeEditor } from "../ui/CodeEditor";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { useToast } from "../ui/Toast";
import type { SplitSide } from "../../lib/muxTree";

type DocWithOwner = Document & { owner: { handle: string; display_name: string | null } };

interface MuxPaneProps {
  paneId: string;
  slug: string | null;
  focused: boolean;
  onFocus: () => void;
  onSplit: (side: SplitSide) => void;
  /** Which splits keep both halves above the minimum pane size. */
  canSplit: Record<SplitSide, boolean>;
  onClose: () => void;
  onAddHere: () => void;
  onDirtyChange: (paneId: string, dirty: boolean) => void;
}

/** One pane of the Mux panel: views a paste, and lets its owner edit the content. */
export function MuxPane({ paneId, slug, focused, onFocus, onSplit, canSplit, onClose, onAddHere, onDirtyChange }: MuxPaneProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  // Editing state. `base` is the version the draft started from (for conflict detection).
  const [draft, setDraft] = useState<string | null>(null);
  const [base, setBase] = useState<{ content: string; updated_at: number } | null>(null);
  const [conflict, setConflict] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["doc", slug],
    queryFn: () => docsApi.get(slug!),
    enabled: !!slug,
    // GET counts a view; don't re-fetch every time the window regains focus.
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
  const doc = data?.doc;
  const isOwner = !!doc && !!user && doc.owner_id === user.id;
  const editing = draft !== null;
  const dirty = editing && base !== null && draft !== base.content;

  useEffect(() => {
    onDirtyChange(paneId, dirty);
  }, [paneId, dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(paneId, false), [paneId, onDirtyChange]);

  // If the pane is pointed at a different paste, drop any edit state.
  useEffect(() => {
    setDraft(null);
    setBase(null);
    setConflict(false);
  }, [slug]);

  const save = useMutation({
    mutationFn: (opts: { force?: boolean }) =>
      docsApi.update(slug!, {
        content: draft ?? "",
        ...(opts.force || !base ? {} : { expected_updated_at: base.updated_at }),
      }),
    onSuccess: (res) => {
      qc.setQueryData<{ doc: DocWithOwner }>(["doc", slug], (old) =>
        old ? { doc: { ...old.doc, ...res.doc } } : old
      );
      if (user?.handle) qc.invalidateQueries({ queryKey: ["profile", user.handle] });
      setDraft(null);
      setBase(null);
      setConflict(false);
      toast("Saved", "success");
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        return;
      }
      toast(e instanceof Error ? e.message : "Could not save", "error");
    },
  });

  const startEdit = () => {
    if (!doc) return;
    setBase({ content: doc.content, updated_at: doc.updated_at });
    setDraft(doc.content);
    setConflict(false);
  };

  const cancelEdit = () => {
    if (dirty && !window.confirm("Discard unsaved changes to this paste?")) return;
    setDraft(null);
    setBase(null);
    setConflict(false);
  };

  const reloadAfterConflict = async () => {
    setDraft(null);
    setBase(null);
    setConflict(false);
    await qc.invalidateQueries({ queryKey: ["doc", slug] });
  };

  const requestClose = () => {
    if (dirty && !window.confirm("This pane has unsaved changes. Close it anyway?")) return;
    onClose();
  };

  // Cmd/Ctrl+S saves the focused pane only.
  const saveRef = useRef<() => void>(() => {});
  saveRef.current = () => {
    if (dirty && !save.isPending && !conflict) save.mutate({});
  };
  useEffect(() => {
    if (!focused || !editing) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focused, editing]);

  const iconBtn = (label: string, onClick: () => void, icon: React.ReactNode, disabledReason?: string) => (
    <button
      type="button"
      title={disabledReason ?? label}
      aria-label={label}
      disabled={!!disabledReason}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="mux-icon-btn"
    >
      {icon}
    </button>
  );

  const errStatus = error instanceof ApiError ? error.status : null;

  return (
    <section
      className={`mux-pane ${focused ? "focused" : ""}`}
      onMouseDownCapture={onFocus}
      onFocusCapture={onFocus}
      aria-label={doc ? `Pane: ${doc.title || "Untitled"}` : "Empty pane"}
      data-testid="mux-pane"
      data-slug={slug ?? ""}
    >
      <header className="mux-pane-header">
        <div className="mux-pane-heading">
          {dirty && <span className="mux-dirty-dot" title="Unsaved changes" aria-label="Unsaved changes" />}
          <span className="mux-pane-title" title={doc?.title || slug || ""}>
            {slug ? doc?.title || (isLoading ? "Loading…" : "Untitled") : "Empty pane"}
          </span>
          {doc && (
            <span className="mux-pane-meta">
              @{doc.owner.handle}
            </span>
          )}
          {doc && <Badge>{doc.language}</Badge>}
          {doc && !isOwner && <span className="mux-pane-meta">read-only</span>}
        </div>
        <div className="mux-pane-actions">
          {doc && isOwner && !editing && (
            <Button size="sm" variant="ghost" onClick={startEdit}>Edit</Button>
          )}
          {editing && (
            <>
              <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => save.mutate({})}
                loading={save.isPending}
                disabled={!dirty || conflict}
                title="Save (Ctrl/Cmd+S)"
              >
                Save
              </Button>
            </>
          )}
          {slug && (
            <Link to={`/docs/${slug}`} className="mux-icon-btn" title="Open paste page" aria-label="Open paste page">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3H3.5A1.5 1.5 0 002 4.5v8A1.5 1.5 0 003.5 14h8a1.5 1.5 0 001.5-1.5V10M9 2h5v5M14 2L7.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </Link>
          )}
          <span className="mux-desktop-only" style={{ display: "contents" }}>
            {iconBtn("Split left", () => onSplit("left"),
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M8 2.5v11" stroke="currentColor" strokeWidth="1.4"/><path d="M1.5 4.5a2 2 0 012-2H8v11H3.5a2 2 0 01-2-2z" fill="currentColor" fillOpacity="0.35"/></svg>,
              canSplit.left ? undefined : "Pane is too narrow to split"
            )}
            {iconBtn("Split right", () => onSplit("right"),
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M8 2.5v11" stroke="currentColor" strokeWidth="1.4"/><path d="M8 2.5h4.5a2 2 0 012 2v7a2 2 0 01-2 2H8z" fill="currentColor" fillOpacity="0.35"/></svg>,
              canSplit.right ? undefined : "Pane is too narrow to split"
            )}
            {iconBtn("Split down", () => onSplit("down"),
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M1.5 8h13" stroke="currentColor" strokeWidth="1.4"/><path d="M1.5 8h13v3.5a2 2 0 01-2 2h-9a2 2 0 01-2-2z" fill="currentColor" fillOpacity="0.35"/></svg>,
              canSplit.down ? undefined : "Pane is too short to split"
            )}
          </span>
          {iconBtn("Close pane", requestClose,
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          )}
        </div>
      </header>

      {conflict && (
        <div className="mux-conflict" role="alert">
          <span>This paste was changed elsewhere since you started editing.</span>
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Button size="sm" variant="ghost" onClick={reloadAfterConflict}>Reload (discard mine)</Button>
            <Button size="sm" variant="danger" onClick={() => save.mutate({ force: true })} loading={save.isPending}>
              Overwrite
            </Button>
          </span>
        </div>
      )}

      <div className="mux-pane-body">
        {!slug && (
          <div className="mux-empty">
            <p style={{ margin: 0, color: "var(--color-ink-3)", fontSize: 13 }}>No paste in this pane</p>
            <Button size="sm" onClick={onAddHere}>Add a paste</Button>
          </div>
        )}
        {slug && isLoading && (
          <div className="mux-empty"><Spinner /></div>
        )}
        {slug && !isLoading && !doc && (
          <div className="mux-empty">
            <p style={{ margin: 0, color: "var(--color-ink-2)", fontSize: 13, textAlign: "center" }}>
              {errStatus === 404 ? "This paste no longer exists." : errStatus === 403 ? "You don't have access to this paste." : "Couldn't open this paste."}
            </p>
            <Button size="sm" variant="ghost" onClick={onClose}>Remove pane</Button>
          </div>
        )}
        {doc && editing && (
          <CodeEditor value={draft ?? ""} onChange={setDraft} language={doc.language} minHeight="100%" />
        )}
        {doc && !editing && (
          <DocViewer html={doc.highlighted_html ?? ""} language={doc.language} content={doc.content} />
        )}
      </div>
    </section>
  );
}
