import { marked } from "marked";
import DOMPurify from "dompurify";
import { useTheme } from "../../hooks/useTheme";

interface DocViewerProps {
  html: string;
  language?: string;
  content?: string;
}

export function DocViewer({ html, language, content }: DocViewerProps) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  if (language === "markdown" && content) {
    // Wide tables scroll sideways in their own box instead of being cut off by the card.
    const rendered = DOMPurify.sanitize(marked.parse(content) as string)
      .replace(/<table>/g, '<div class="md-table-wrap" tabindex="0"><table>')
      .replace(/<\/table>/g, "</table></div>");
    return (
      <div
        className="md-body"
        style={{ color: "var(--color-ink)" }}
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
    );
  }

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
