import { useState } from "react";
import { CodeEditor } from "../ui/CodeEditor";
import { MarkdownView } from "./MarkdownView";

const MIN_HEIGHT = "260px";

/** Markdown source with GitHub-style Write / Preview tabs. */
export function MarkdownEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const tabs = [
    { id: "write", label: "Write" },
    { id: "preview", label: "Preview" },
  ] as const;

  return (
    <div className="md-editor">
      <div className="md-editor-tabs" role="tablist" aria-label="Markdown editor">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`md-editor-tab${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "write" ? (
        <CodeEditor
          value={value}
          onChange={onChange}
          language="markdown"
          placeholder="# Write Markdown here…"
          minHeight={MIN_HEIGHT}
        />
      ) : value.trim() ? (
        <MarkdownView content={value} style={{ minHeight: MIN_HEIGHT, borderRadius: 10 }} />
      ) : (
        <div className="md-editor-empty" style={{ minHeight: MIN_HEIGHT }}>Nothing to preview</div>
      )}
    </div>
  );
}
