import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { docsApi } from "../../api/documents";
import { savedApi } from "../../api/saved";
import { searchApi } from "../../api/search";
import { parseSlugInput } from "../../lib/muxTree";
import { formatRelative } from "../../lib/utils";

type Tab = "mine" | "saved" | "search";

interface Item {
  slug: string;
  title: string;
  language: string;
  owner?: string;
  created_at: number;
}

interface PastePickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (slug: string) => void;
  openSlugs: Set<string>;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function PastePicker({ open, onClose, onPick, openSlugs }: PastePickerProps) {
  const [tab, setTab] = useState<Tab>("mine");
  const [query, setQuery] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const q = useDebounced(query.trim(), 250);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSlugInput("");
    }
  }, [open]);

  const mine = useQuery({
    queryKey: ["mux-picker", "mine"],
    queryFn: () => docsApi.list(1, 50),
    enabled: open && tab === "mine",
  });
  const saved = useQuery({
    queryKey: ["mux-picker", "saved"],
    queryFn: () => savedApi.list(1, 50),
    enabled: open && tab === "saved",
  });
  const search = useQuery({
    queryKey: ["mux-picker", "search", q],
    queryFn: () => searchApi.search({ q, limit: 30 }),
    enabled: open && tab === "search" && q.length > 0,
  });

  let items: Item[] = [];
  let loading = false;
  let error: unknown = null;
  if (tab === "mine") {
    items = (mine.data?.docs ?? []).map((d) => ({ slug: d.slug, title: d.title, language: d.language, created_at: d.created_at }));
    loading = mine.isLoading;
    error = mine.error;
  } else if (tab === "saved") {
    items = (saved.data?.pastes ?? []).map((d) => ({
      slug: d.slug, title: d.title, language: d.language, owner: d.owner_handle, created_at: d.created_at,
    }));
    loading = saved.isLoading;
    error = saved.error;
  } else {
    items = (search.data?.results ?? []).map((d) => ({
      slug: d.slug, title: d.title, language: d.language, owner: d.owner_handle, created_at: d.created_at,
    }));
    loading = search.isLoading && q.length > 0;
    error = search.error;
  }
  // Local filter for Mine/Saved (search is filtered server-side).
  if (tab !== "search" && query.trim()) {
    const needle = query.trim().toLowerCase();
    items = items.filter((i) => (i.title || i.slug).toLowerCase().includes(needle));
  }

  const parsedSlug = parseSlugInput(slugInput);
  const pick = (slug: string) => {
    onPick(slug);
    onClose();
  };

  const tabBtn = (t: Tab, label: string) => (
    <button
      key={t}
      type="button"
      role="tab"
      aria-selected={tab === t}
      onClick={() => setTab(t)}
      style={{
        padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
        background: tab === t ? "var(--color-hover-overlay)" : "transparent",
        color: tab === t ? "var(--color-ink)" : "var(--color-ink-3)",
      }}
    >
      {label}
    </button>
  );

  return (
    <Modal open={open} onClose={onClose} title="Add a paste" width={560}>
      <div role="tablist" style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
        {tabBtn("mine", "My pastes")}
        {tabBtn("saved", "Saved")}
        {tabBtn("search", "Search")}
      </div>

      <input
        className="pp-input"
        autoFocus
        placeholder={tab === "search" ? "Search pastes…" : "Filter by title…"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: "100%", marginBottom: 12 }}
        aria-label={tab === "search" ? "Search pastes" : "Filter pastes"}
      />

      <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }} data-testid="mux-picker-list">
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 24 }}><Spinner /></div>
        )}
        {!loading && error != null && (
          <p style={{ color: "var(--color-red, #f87171)", fontSize: 13, padding: 8 }}>Couldn't load pastes.</p>
        )}
        {!loading && !error && items.length === 0 && (
          <p style={{ color: "var(--color-ink-3)", fontSize: 13, padding: 8 }}>
            {tab === "search" && !q ? "Type to search public pastes and ones shared with you." : "No pastes found."}
          </p>
        )}
        {!loading && items.map((i) => {
          const isOpen = openSlugs.has(i.slug);
          return (
            <button
              key={i.slug}
              type="button"
              onClick={() => pick(i.slug)}
              className="mux-picker-item"
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                padding: "8px 10px", borderRadius: 8, border: "1px solid var(--color-border-subtle)",
                background: "transparent", cursor: "pointer", textAlign: "left", color: "var(--color-ink)",
              }}
            >
              <span style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {i.title || "Untitled"}
                </span>
                <span style={{ fontSize: 12, color: "var(--color-ink-3)" }}>
                  {i.owner ? `@${i.owner} · ` : ""}{i.language} · {formatRelative(i.created_at)}
                </span>
              </span>
              {isOpen && <span style={{ fontSize: 11, color: "var(--color-blue)", flexShrink: 0 }}>Open</span>}
            </button>
          );
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (parsedSlug) pick(parsedSlug);
        }}
        style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}
      >
        <input
          className="pp-input"
          placeholder="…or paste a link or slug"
          value={slugInput}
          onChange={(e) => setSlugInput(e.target.value)}
          style={{ flex: "1 1 200px", minWidth: 0 }}
          aria-label="Paste link or slug"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={!parsedSlug}>Add</Button>
      </form>
    </Modal>
  );
}
