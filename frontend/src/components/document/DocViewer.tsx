import { useTheme } from "../../hooks/useTheme";
import { isMarkdownDoc } from "../../lib/markdown";
import { MarkdownView } from "../markdown/MarkdownView";

interface DocViewerProps {
  html: string;
  language?: string;
  content?: string;
}

export function DocViewer({ html, language, content }: DocViewerProps) {
  const { mode } = useTheme();
  const isLight = mode === "light";

  if (isMarkdownDoc(language) && content) return <MarkdownView content={content} />;

  // Strip Shiki's inline background-color so the app background shows through.
  // In light mode, also strip token color styles (Shiki uses github-dark theme
  // which emits light-colored text — invisible on a light background).
  let cleanHtml = html.replace(/background-color\s*:[^;"']+;?/gi, "");
  if (isLight) {
    cleanHtml = cleanHtml.replace(/\bcolor\s*:[^;"']+;?/gi, "");
  }

  return (
    <div
      style={{
        background: "var(--color-paste-bg)",
        overflowX: "auto",
        padding: "1.5rem",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 13,
        lineHeight: 1.75,
        color: isLight ? "var(--color-ink)" : undefined,
      }}
      dangerouslySetInnerHTML={{ __html: cleanHtml }}
    />
  );
}
