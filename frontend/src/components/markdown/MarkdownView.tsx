import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { wrapTables } from "../../lib/markdown";

export function renderMarkdown(content: string): string {
  return wrapTables(DOMPurify.sanitize(marked.parse(content) as string));
}

export function MarkdownView({ content, style }: { content: string; style?: React.CSSProperties }) {
  const html = useMemo(() => renderMarkdown(content), [content]);
  return (
    <div
      className="md-body"
      style={{ color: "var(--color-ink)", ...style }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
