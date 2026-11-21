import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { docsApi } from "../../api/documents";
import { groupsApi } from "../../api/groups";
import { DocEditor, type EditorMode } from "../../components/document/DocEditor";
import { StickyEditorHeader } from "../../components/document/StickyEditorHeader";
import { DIAGRAM_LANGUAGE, isDiagramEmpty, type DiagramCanvasHandle } from "../../components/diagram";
import { buildDiagramPayload } from "../../lib/diagramExport";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../hooks/useAuth";
import { getDefaultLanguage, getDefaultPrivacy, getDefaultGroupId, setDefaultLanguage, setDefaultPrivacy } from "../../lib/pasteDefaults";
import { formatRelative } from "../../lib/utils";

export default function NewDocPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [form, setForm] = useState({
    title: "",
    content: "",
    language: getDefaultLanguage(),
    privacy: getDefaultPrivacy(),
    groupId: getDefaultGroupId(),
  });

  // Text and diagram drafts are kept separately, so switching modes never loses either.
  const [mode, setMode] = useState<EditorMode>("code");
  const [diagram, setDiagram] = useState<string | null>(null);
  const diagramRef = useRef<DiagramCanvasHandle>(null);

  const canSave = mode === "diagram" ? !isDiagramEmpty(diagram) : !!form.content.trim();

  const { data: groupsData } = useQuery({
    queryKey: ["my-groups"],
    queryFn: () => groupsApi.list(),
  });

  const { data: recentData } = useQuery({
    queryKey: ["my-docs-recent"],
    queryFn: () => docsApi.list(1, 5),
    enabled: !!user,
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: async () => {
      const common = {
        title: form.title || undefined,
        privacy: form.privacy,
        group_id: form.privacy === "group" ? form.groupId ?? undefined : undefined,
      };
      if (mode === "diagram") {
        const json = diagramRef.current?.getJSON() ?? diagram ?? "";
        if (isDiagramEmpty(json)) throw new Error("Draw something first");
        return docsApi.create({ ...common, language: DIAGRAM_LANGUAGE, ...(await buildDiagramPayload(json)) });
      }
      return docsApi.create({ ...common, content: form.content, language: form.language });
    },
    onSuccess: (data) => {
      if (user?.handle) qc.invalidateQueries({ queryKey: ["profile", user.handle] });
      navigate(`/docs/${data.slug}`);
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        // The canvas may hold strokes its debounced onChange hasn't reported yet.
        const ready = mode === "diagram" ? !(diagramRef.current?.isEmpty() ?? true) : canSave;
        if (ready && !create.isPending) create.mutate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canSave, mode, create.isPending]);

  return (
    <div>
      <StickyEditorHeader
        title="New Paste"
        subtitle={mode === "diagram" ? "Draw shapes, arrows and diagrams" : "Share code, configs, or notes"}
      >
        <Button
          onClick={() => create.mutate()}
          loading={create.isPending}
          disabled={!canSave}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 6.5L5.5 10L11 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Save Paste
        </Button>
      </StickyEditorHeader>

      <div className="pp-card editor-card">
        <DocEditor
          {...form}
          groupId={form.groupId}
          userGroups={groupsData?.groups ?? []}
          showSetDefault
          onSetDefault={() => {
            setDefaultLanguage(form.language);
            setDefaultPrivacy(form.privacy);
            toast("Defaults saved", "success");
          }}
          onChange={(f, v) => setForm((prev) => ({ ...prev, [f]: v }))}
          mode={mode}
          onModeChange={(m) => {
            // Keep the latest strokes when leaving the canvas.
            if (mode === "diagram" && diagramRef.current) setDiagram(diagramRef.current.getJSON());
            setMode(m);
          }}
          diagram={diagram}
          onDiagramChange={setDiagram}
          diagramRef={diagramRef}
        />
      </div>

      {recentData?.docs && recentData.docs.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 12, color: "var(--color-ink-3)", marginBottom: 8, fontWeight: 500, margin: "0 0 8px 2px" }}>Recent</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {recentData.docs.map(doc => (
              <Link
                key={doc.slug}
                to={`/docs/${doc.slug}`}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
                  borderRadius: 8, color: "var(--color-ink-2)", textDecoration: "none",
                  fontSize: 13, transition: "background 150ms",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--color-hover-overlay)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {doc.title || "Untitled"}
                </span>
                <span style={{ fontSize: 11, color: "var(--color-ink-3)", fontFamily: "monospace", flexShrink: 0 }}>
                  {doc.language}
                </span>
                <span style={{ fontSize: 11, color: "var(--color-ink-3)", flexShrink: 0 }}>
                  {formatRelative(doc.created_at)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
