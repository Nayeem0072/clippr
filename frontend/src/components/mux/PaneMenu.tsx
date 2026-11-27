import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { docsApi, type Document } from "../../api/documents";
import { savedApi } from "../../api/saved";
import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../hooks/useTheme";
import { downloadDiagramPng, downloadDiagramSvg } from "../../lib/diagramExport";
import { isDiagramDoc } from "../diagram";
import { SendPanel } from "../document/SendPanel";
import { FolderIcon, MoveToCollectionModal } from "../collection";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";

const MENU_W = 220;

interface PaneMenuProps {
  doc: Document;
  isOwner: boolean;
  /** Delete is hidden while the pane has an edit in progress. */
  editing: boolean;
  /** Called after the paste is deleted, so the pane can close itself. */
  onDeleted: () => void;
}

const icon = (d: React.ReactNode) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);
const ICONS = {
  open: icon(<path d="M6 3H3.5A1.5 1.5 0 002 4.5v8A1.5 1.5 0 003.5 14h8a1.5 1.5 0 001.5-1.5V10M9 2h5v5M14 2L7.5 8.5" />),
  link: icon(<><path d="M6.5 9.5a3 3 0 004.2 0l2.3-2.3a3 3 0 00-4.2-4.2l-.8.8" /><path d="M9.5 6.5a3 3 0 00-4.2 0L3 8.8a3 3 0 004.2 4.2l.8-.8" /></>),
  copy: icon(<><rect x="2" y="4.5" width="8.5" height="9.5" rx="1.5" /><path d="M5.5 4.5V3.5A1.5 1.5 0 017 2h5.5A1.5 1.5 0 0114 3.5v6.5a1.5 1.5 0 01-1.5 1.5h-2" /></>),
  download: icon(<path d="M8 2v8M5 7.5L8 10.5 11 7.5M2.5 12.5v.5a1 1 0 001 1h9a1 1 0 001-1v-.5" />),
  send: icon(<><path d="M14 2L2 6.7l4.7 2 2 4.7L14 2z" /><path d="M6.7 8.7L10 5.3" /></>),
  bookmark: (filled: boolean) => (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M3.5 2.5h9a1 1 0 011 1v10.5L8 11l-5.5 3V3.5a1 1 0 011-1z" />
    </svg>
  ),
  trash: icon(<path d="M2.5 4h11M6 4V2.8a.8.8 0 01.8-.8h2.4a.8.8 0 01.8.8V4m2 0l-.6 9.2a1 1 0 01-1 .8H5.6a1 1 0 01-1-.8L4 4" />),
};

/** "More actions" menu in a Mux pane header: the paste-page toolbar actions without leaving Mux. */
export function PaneMenu({ doc, isOwner, editing, onDeleted }: PaneMenuProps) {
  const { user } = useAuth();
  const { mode } = useTheme();
  const qc = useQueryClient();
  const { toast } = useToast();
  const slug = doc.slug;
  const isDiagram = isDiagramDoc(doc.language);

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const [modal, setModal] = useState<"send" | "move" | "delete" | null>(null);
  const [wasOpened, setWasOpened] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { data: savedData } = useQuery({
    queryKey: ["saved-check", slug],
    queryFn: () => savedApi.checkSaved(slug),
    enabled: !!user && wasOpened,
    staleTime: 30_000,
  });
  const isSaved = savedData?.is_saved ?? false;

  const saveDoc = useMutation({
    mutationFn: () => (isSaved ? savedApi.unsave(slug) : savedApi.save(slug)),
    onSuccess: () => {
      qc.setQueryData(["saved-check", slug], { is_saved: !isSaved });
      qc.invalidateQueries({ queryKey: ["saved"] });
      toast(isSaved ? "Removed from saved" : "Paste saved", "success");
    },
    onError: (e: unknown) => toast(e instanceof Error ? e.message : "Could not save", "error"),
  });

  const deleteDoc = useMutation({
    mutationFn: () => docsApi.delete(slug),
    onSuccess: () => {
      setModal(null);
      qc.removeQueries({ queryKey: ["doc", slug] });
      if (user?.handle) qc.invalidateQueries({ queryKey: ["profile", user.handle] });
      toast("Paste deleted", "success");
      onDeleted();
    },
    onError: (e: unknown) => toast(e instanceof Error ? e.message : "Could not delete", "error"),
  });

  // Placed under the button, right-aligned to it, flipped up if there's no room below.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8));
      const menuH = menuRef.current?.offsetHeight ?? 320;
      const below = window.innerHeight - r.bottom;
      setPos(below < menuH + 12 && r.top > below
        ? { bottom: window.innerHeight - r.top + 6, left }
        : { top: r.bottom + 6, left });
    };
    place();
    // Re-place once the menu has rendered and its real height is known.
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (open && pos) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    // Only on open: re-placing shouldn't steal focus back to the first item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, !!pos]);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const move = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (move) {
      e.preventDefault();
      items[(i + move + items.length) % items.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      items[e.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(done, "success");
    } catch {
      toast("Couldn't copy to the clipboard", "error");
    }
  };

  const exportDiagram = async (kind: "png" | "svg") => {
    try {
      const fn = kind === "png" ? downloadDiagramPng : downloadDiagramSvg;
      await fn(doc.content, doc.title || doc.slug, mode === "dark");
    } catch {
      toast("Couldn't export this diagram", "error");
    }
  };

  /** Runs an action and closes the menu. */
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const item = (label: string, ic: React.ReactNode, onClick: () => void, danger = false) => (
    <button type="button" role="menuitem" tabIndex={-1} className={`pane-menu-item${danger ? " danger" : ""}`} onClick={run(onClick)}>
      {ic}
      <span>{label}</span>
    </button>
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="mux-icon-btn"
        aria-label="More actions"
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setWasOpened(true);
          setOpen((o) => !o);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="3.5" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="12.5" cy="8" r="1.3" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="pane-menu"
            role="menu"
            aria-label={`Actions for ${doc.title || "Untitled"}`}
            style={{ ...pos, width: MENU_W, visibility: pos ? "visible" : "hidden" }}
            onKeyDown={onMenuKey}
          >
            <Link to={`/docs/${slug}`} role="menuitem" tabIndex={-1} className="pane-menu-item" onClick={() => setOpen(false)}>
              {ICONS.open}
              <span>Open paste page</span>
            </Link>
            {item("Copy link", ICONS.link, () => copy(`${window.location.origin}/docs/${slug}`, "Link copied"))}
            {isDiagram ? (
              <>
                {item("Export PNG", ICONS.download, () => exportDiagram("png"))}
                {item("Export SVG", ICONS.download, () => exportDiagram("svg"))}
              </>
            ) : (
              item("Copy content", ICONS.copy, () => copy(doc.content, "Content copied"))
            )}
            {user && doc.privacy !== "private" && item("Send…", ICONS.send, () => setModal("send"))}
            {user && item(isSaved ? "Unsave" : "Save", ICONS.bookmark(isSaved), () => saveDoc.mutate())}
            {isOwner && (
              <>
                <div className="pane-menu-sep" role="separator" />
                {item(doc.collection ? "Move to collection…" : "Add to collection…", <FolderIcon size={14} />, () => setModal("move"))}
                {!editing && item("Delete…", ICONS.trash, () => setModal("delete"), true)}
              </>
            )}
          </div>,
          document.body
        )}

      {modal === "send" && (
        <Modal open onClose={() => setModal(null)} title="Send Paste">
          <SendPanel slug={slug} privacy={doc.privacy} />
        </Modal>
      )}
      {isOwner && (
        <MoveToCollectionModal
          open={modal === "move"}
          onClose={() => setModal(null)}
          slug={slug}
          privacy={doc.privacy}
          groupId={doc.group_id}
          currentId={doc.collection?.id ?? null}
        />
      )}
      {modal === "delete" && (
        <Modal open onClose={() => setModal(null)} title="Delete paste?">
          <p className="text-[13px] text-ink-3 mb-5 leading-relaxed">
            <strong className="text-ink">"{doc.title || "Untitled"}"</strong> will be permanently deleted. This cannot be undone.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setModal(null)}>Cancel</Button>
            <Button variant="danger" size="sm" loading={deleteDoc.isPending} onClick={() => deleteDoc.mutate()}>
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
