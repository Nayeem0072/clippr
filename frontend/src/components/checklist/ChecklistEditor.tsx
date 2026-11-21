import { useEffect, useRef, useState } from "react";
import { parseChecklist, serializeChecklist } from "../../lib/checklist";

interface Row {
  id: number;
  checked: boolean;
  text: string;
}

interface Props {
  /** Read on mount only; remount (key) to load a different list. */
  value: string;
  onChange: (content: string) => void;
}

let nextId = 1;
const row = (text = "", checked = false): Row => ({ id: nextId++, checked, text });

/**
 * Editing a checklist: one row per item. Enter adds an item below, Backspace in an empty item
 * removes it, and pasting several lines makes one item per line.
 */
export function ChecklistEditor({ value, onChange }: Props) {
  const [rows, setRows] = useState<Row[]>(() => {
    const items = parseChecklist(value);
    return items.length ? items.map((i) => row(i.text, i.checked)) : [row()];
  });
  const inputs = useRef(new Map<number, HTMLInputElement>());
  const [focusId, setFocusId] = useState<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (focusId == null) return;
    const el = inputs.current.get(focusId);
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
    setFocusId(null);
  }, [focusId, rows]);

  const update = (next: Row[]) => {
    setRows(next);
    onChangeRef.current(serializeChecklist(next));
  };

  const insertAfter = (index: number, newRows: Row[]) => {
    const next = [...rows.slice(0, index + 1), ...newRows, ...rows.slice(index + 1)];
    update(next);
    setFocusId(newRows[newRows.length - 1].id);
  };

  return (
    <div className="checklist-editor" data-testid="checklist-editor">
      <ul className="checklist-list">
        {rows.map((r, i) => (
          <li key={r.id} className="checklist-row">
            <input
              type="checkbox"
              className="checklist-box"
              checked={r.checked}
              onChange={(e) => update(rows.map((x) => (x.id === r.id ? { ...x, checked: e.target.checked } : x)))}
              aria-label={`Done: ${r.text || "empty item"}`}
            />
            <input
              ref={(el) => {
                if (el) inputs.current.set(r.id, el);
                else inputs.current.delete(r.id);
              }}
              className="checklist-input"
              value={r.text}
              placeholder={i === 0 && rows.length === 1 ? "Add a to-do…" : "To-do"}
              aria-label={`Item ${i + 1}`}
              maxLength={500}
              onChange={(e) => update(rows.map((x) => (x.id === r.id ? { ...x, text: e.target.value } : x)))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  insertAfter(i, [row()]);
                } else if (e.key === "Backspace" && r.text === "" && rows.length > 1) {
                  e.preventDefault();
                  const next = rows.filter((x) => x.id !== r.id);
                  update(next);
                  setFocusId(next[Math.max(0, i - 1)].id);
                } else if (e.key === "ArrowUp" && i > 0) {
                  e.preventDefault();
                  setFocusId(rows[i - 1].id);
                } else if (e.key === "ArrowDown" && i < rows.length - 1) {
                  e.preventDefault();
                  setFocusId(rows[i + 1].id);
                }
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (!text.includes("\n")) return;
                e.preventDefault();
                const pasted = parseChecklist(text);
                if (!pasted.length) return;
                // The first pasted line fills this item (after any text already in it).
                const [first, ...rest] = pasted;
                const merged = rows.map((x) =>
                  x.id === r.id ? { ...x, text: (x.text + first.text).slice(0, 500), checked: x.checked || first.checked } : x
                );
                const added = rest.map((p) => row(p.text.slice(0, 500), p.checked));
                const next = [...merged.slice(0, i + 1), ...added, ...merged.slice(i + 1)];
                update(next);
                setFocusId((added[added.length - 1] ?? r).id);
              }}
            />
            <button
              type="button"
              className="mux-icon-btn checklist-remove"
              aria-label={`Remove item ${i + 1}`}
              title="Remove"
              onClick={() => {
                const next = rows.length > 1 ? rows.filter((x) => x.id !== r.id) : [row()];
                update(next);
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="checklist-add" onClick={() => insertAfter(rows.length - 1, [row()])}>
        + Add item
      </button>
    </div>
  );
}
