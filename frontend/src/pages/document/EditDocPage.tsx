import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { docsApi } from "../../api/documents";
import { groupsApi } from "../../api/groups";
import { useAuth } from "../../hooks/useAuth";
import { DocEditor } from "../../components/document/DocEditor";
import { StickyEditorHeader } from "../../components/document/StickyEditorHeader";
import { isDiagramDoc, isDiagramEmpty, type DiagramCanvasHandle } from "../../components/diagram";
import { buildDiagramPayload } from "../../lib/diagramExport";
import { Button } from "../../components/ui/Button";
import { PageLoader } from "../../components/ui/Spinner";
import { useToast } from "../../components/ui/Toast";

export default function EditDocPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["doc", slug],
    queryFn: () => docsApi.get(slug!),
  });

  const { data: groupsData } = useQuery({
    queryKey: ["my-groups"],
    queryFn: () => groupsApi.list(),
  });

  const [form, setForm] = useState({
    title: "",
    content: "",
    language: "plaintext",
    privacy: "public",
    groupId: null as number | null,
  });

  const isDiagram = isDiagramDoc(data?.doc.language);
  const diagramRef = useRef<DiagramCanvasHandle>(null);

  useEffect(() => {
    if (data?.doc) {
      const d = data.doc;
      setForm({
        title: d.title,
        content: d.content,
        language: d.language,
        privacy: d.privacy,
        groupId: d.group_id,
      });
    }
  }, [data]);

  const update = useMutation({
    mutationFn: async () => {
      const common = {
        title: form.title,
        privacy: form.privacy as any,
        group_id: form.privacy === "group" ? form.groupId ?? undefined : undefined,
      };
      if (isDiagram) {
        // A diagram stays a diagram: send the live scene, never a language change.
        const json = diagramRef.current?.getJSON() ?? form.content;
        if (isDiagramEmpty(json)) throw new Error("A diagram can't be empty");
        return docsApi.update(slug!, { ...common, ...(await buildDiagramPayload(json)) });
      }
      return docsApi.update(slug!, { ...common, content: form.content, language: form.language });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doc", slug] });
      if (user?.handle) qc.invalidateQueries({ queryKey: ["profile", user.handle] });
      navigate(`/docs/${slug}`);
      toast("Saved", "success");
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (!update.isPending) update.mutate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [update.isPending]);

  if (isLoading) return <PageLoader />;
  if (!data || data.doc.owner_id !== user?.id) {
    navigate(`/docs/${slug}`);
    return null;
  }

  return (
    <div>
      <StickyEditorHeader title={isDiagram ? "Edit Diagram" : "Edit Paste"}>
        <Button variant="ghost" onClick={() => navigate(`/docs/${slug}`)}>Cancel</Button>
        <Button onClick={() => update.mutate()} loading={update.isPending}>Save Changes</Button>
      </StickyEditorHeader>

      <div className="pp-card editor-card">
        <DocEditor
          {...form}
          groupId={form.groupId}
          userGroups={groupsData?.groups ?? []}
          onChange={(f, v) => setForm((prev) => ({ ...prev, [f]: v }))}
          mode={isDiagram ? "diagram" : "code"}
          diagram={isDiagram ? data.doc.content : null}
          diagramRef={diagramRef}
        />
      </div>
    </div>
  );
}
