// Markdown pastes: language "markdown", content = plain Markdown text, rendered with marked + DOMPurify.
export const MARKDOWN_LANGUAGE = "markdown";

export const isMarkdownDoc = (language: string | null | undefined) => language === MARKDOWN_LANGUAGE;

/** Wraps each table so a wide one scrolls sideways in its own box instead of being cut off. */
export const wrapTables = (html: string) =>
  html
    .replace(/<table>/g, '<div class="md-table-wrap" tabindex="0"><table>')
    .replace(/<\/table>/g, "</table></div>");
