// Checklist pastes: language "checklist", content = Markdown task lines ("- [ ] item" / "- [x] item").
// Mirrors backend/src/lib/checklist.ts.

export const CHECKLIST_LANGUAGE = "checklist";

export const isChecklistDoc = (language: string | null | undefined) => language === CHECKLIST_LANGUAGE;

export interface ChecklistItem {
  checked: boolean;
  text: string;
}

const LINE = /^- \[( |x|X)\] ?(.*)$/;

/** Items in `content`. Lenient: a line that isn't a task line becomes an unticked item. */
export function parseChecklist(content: string | null | undefined): ChecklistItem[] {
  if (!content) return [];
  return content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const m = LINE.exec(l);
      return m ? { checked: m[1] !== " ", text: m[2].trim() } : { checked: false, text: l.trim() };
    });
}

/** Markdown task lines; items with no text are dropped. */
export function serializeChecklist(items: ChecklistItem[]): string {
  return items
    .filter((i) => i.text.trim())
    .map((i) => `- [${i.checked ? "x" : " "}] ${i.text.trim().replace(/\s*\n\s*/g, " ")}`)
    .join("\n");
}

export function checklistProgress(items: ChecklistItem[]) {
  return { done: items.filter((i) => i.checked).length, total: items.length };
}

/** True when there's no item with any text. */
export const isChecklistEmpty = (content: string | null | undefined) =>
  !parseChecklist(content).some((i) => i.text.trim());
