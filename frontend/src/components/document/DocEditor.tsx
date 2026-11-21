import { useState, type Ref } from "react";
import { CodeEditor } from "../ui/CodeEditor";
import { detectLanguage } from "../../lib/detectLanguage";
import { Select } from "../ui/Select";
import { Input } from "../ui/Input";
import { SUPPORTED_LANGUAGES, PRIVACY_OPTIONS } from "../../lib/constants";
import { setDefaultLanguage, setDefaultPrivacy, setDefaultGroupId } from "../../lib/pasteDefaults";
import type { Group } from "../../api/groups";
import { LazyDiagramCanvas, type DiagramCanvasHandle } from "../diagram";

export type EditorMode = "code" | "diagram";

interface DocEditorProps {
  title: string;
  content: string;
  language: string;
  privacy: string;
  groupId: number | null;
  userGroups: Group[];
  showSetDefault?: boolean;
  onSetDefault?: () => void;
  onChange: (field: string, value: string | number | null) => void;
  /** "diagram" swaps the code editor and language picker for a drawing canvas. */
  mode?: EditorMode;
  /** When given, a small icon in the top-right corner switches between text and diagram. */
  onModeChange?: (mode: EditorMode) => void;
  diagram?: string | null;
  onDiagramChange?: (json: string) => void;
  diagramRef?: Ref<DiagramCanvasHandle>;
}

const DiagramIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1.5" y="1.5" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="11.5" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.3" />
    <path d="M4 5.5v3.5a3 3 0 003 3h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

const WriteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M10.5 2.5l3 3L6 13H3v-3l7.5-7.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 4l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

export function DocEditor({
  title, content, language, privacy, groupId, userGroups, showSetDefault, onSetDefault, onChange,
  mode = "code", onModeChange, diagram = null, onDiagramChange, diagramRef,
}: DocEditorProps) {
  const isDiagram = mode === "diagram";
  const [defaultSaved, setDefaultSaved] = useState(false);

  function handleSetDefault() {
    setDefaultLanguage(language);
    setDefaultPrivacy(privacy);
    setDefaultGroupId(privacy === "group" ? groupId : null);
    setDefaultSaved(true);
    setTimeout(() => setDefaultSaved(false), 2000);
    onSetDefault?.();
  }

  return (
    <div className="space-y-4">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Input
            placeholder={isDiagram ? "Untitled diagram" : "Untitled paste"}
            value={title}
            onChange={(e) => onChange("title", e.target.value)}
            className="text-[15px] font-medium bg-transparent border-transparent hover:border-border focus:!border-blue/40 px-0 rounded-none border-b"
          />
        </div>
        {onModeChange && (
          <button
            type="button"
            className="mux-icon-btn editor-mode-btn"
            onClick={() => onModeChange(isDiagram ? "code" : "diagram")}
            title={isDiagram ? "Switch to text" : "Switch to diagram"}
            aria-label={isDiagram ? "Switch to text" : "Switch to diagram"}
          >
            {isDiagram ? <WriteIcon /> : <DiagramIcon />}
          </button>
        )}
      </div>

      {isDiagram ? (
        <LazyDiagramCanvas
          ref={diagramRef}
          value={diagram}
          editable
          onChange={(json) => onDiagramChange?.(json)}
          height="var(--diagram-editor-h)"
        />
      ) : (
      <CodeEditor
        value={content}
        onChange={(v) => onChange("content", v)}
        language={language}
        placeholder="// Paste your code, config, or text here..."
        minHeight="260px"
        onPaste={(text) => {
          if (language === "plaintext") {
            const detected = detectLanguage(text);
            if (detected) onChange("language", detected);
          }
        }}
      />
      )}

      <div className="flex flex-wrap gap-3 items-center">
        {!isDiagram && (
          <div className="w-40">
            <Select
              value={language}
              options={SUPPORTED_LANGUAGES}
              onChange={(e) => onChange("language", e.target.value)}
              aria-label="Language"
            />
          </div>
        )}
        <div className="w-36">
          <Select
            value={privacy}
            options={PRIVACY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(e) => onChange("privacy", e.target.value)}
          />
        </div>
        {privacy === "group" && (
          <div className="w-44">
            <Select
              value={groupId?.toString() ?? ""}
              options={[
                { value: "", label: "Select group..." },
                ...userGroups.map((g) => ({ value: String(g.id), label: g.name })),
              ]}
              onChange={(e) => onChange("groupId", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
        )}
        {showSetDefault && (
          <button
            type="button"
            onClick={handleSetDefault}
            style={{
              background: "none",
              border: "none",
              padding: "0 4px",
              cursor: "pointer",
              fontSize: 12,
              color: defaultSaved ? "#4ade80" : "#555568",
              transition: "color 0.2s",
            }}
          >
            {defaultSaved ? "✓ Defaults saved" : "Set as default"}
          </button>
        )}
      </div>
    </div>
  );
}
