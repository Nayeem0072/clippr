// Checklist pastes: `language = "checklist"`, `content` = Markdown task lines, one per item:
//   - [ ] Buy milk
//   - [x] Done thing

export const CHECKLIST_LANGUAGE = "checklist";
export const MAX_CHECKLIST_ITEMS = 500;
export const MAX_CHECKLIST_ITEM_LENGTH = 500;
export const MAX_CHECKLIST_BYTES = 100_000;

export interface ChecklistItem {
  checked: boolean;
  text: string;
}

const LINE = /^- \[( |x|X)\] (.*)$/;

export function isChecklist(language: string | null | undefined): boolean {
  return language === CHECKLIST_LANGUAGE;
}

/** The items in `content`, or null if any non-blank line isn't a task line. */
export function parseChecklist(content: string): ChecklistItem[] | null {
  const items: ChecklistItem[] = [];
  for (const raw of content.replace(/\r\n?/g, "\n").split("\n")) {
    if (!raw.trim()) continue;
    const m = LINE.exec(raw);
    if (!m) return null;
    items.push({ checked: m[1] !== " ", text: m[2].trim() });
  }
  return items;
}

export function serializeChecklist(items: ChecklistItem[]): string {
  return items.map((i) => `- [${i.checked ? "x" : " "}] ${i.text}`).join("\n");
}

export type ChecklistResult =
  | { ok: true; items: ChecklistItem[]; content: string; text: string }
  | { ok: false; error: string };

/** Validates a checklist and returns its normalised content and searchable text. */
export function validateChecklist(content: unknown): ChecklistResult {
  if (typeof content !== "string" || !content.trim()) return { ok: false, error: "content is required" };
  if (Buffer.byteLength(content, "utf8") > MAX_CHECKLIST_BYTES) {
    return { ok: false, error: "Checklist is too large (max 100 KB)" };
  }
  const items = parseChecklist(content);
  if (!items) return { ok: false, error: "Each line of a checklist must look like \"- [ ] item\" or \"- [x] item\"" };
  if (items.length === 0) return { ok: false, error: "A checklist needs at least one item" };
  if (items.length > MAX_CHECKLIST_ITEMS) {
    return { ok: false, error: `A checklist can have at most ${MAX_CHECKLIST_ITEMS} items` };
  }
  for (const i of items) {
    if (!i.text) return { ok: false, error: "Checklist items can't be empty" };
    if (i.text.length > MAX_CHECKLIST_ITEM_LENGTH) {
      return { ok: false, error: `Checklist items can be at most ${MAX_CHECKLIST_ITEM_LENGTH} characters` };
    }
  }
  return { ok: true, items, content: serializeChecklist(items), text: items.map((i) => i.text).join("\n") };
}
