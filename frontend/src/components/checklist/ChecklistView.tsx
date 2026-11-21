import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { docsApi, type Document } from "../../api/documents";
import { ApiError } from "../../api/client";
import { checklistProgress, parseChecklist, serializeChecklist } from "../../lib/checklist";
import { useToast } from "../ui/Toast";

interface Props {
  slug: string;
  content: string;
  /** The viewer may tick items (owner, or a group member on a group paste). */
  canCheck: boolean;
  /** Called with the saved doc after a tick, e.g. so a Mux pane can refresh its base. */
  onSaved?: (doc: Document) => void;
}

type DocQuery = { doc: Document & Record<string, unknown> };

/** A checklist in view mode. Ticking saves straight away; no edit mode needed. */
export function ChecklistView({ slug, content, canCheck, onSaved }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  // Local copy so a tick shows on the same render as the click (the cache update lands a tick later).
  const [items, setItems] = useState(() => parseChecklist(content));
  useEffect(() => setItems(parseChecklist(content)), [content]);
  const { done, total } = checklistProgress(items);
  const pending = useRef(0);

  const setContent = (next: string, updated_at?: number) =>
    qc.setQueryData<DocQuery>(["doc", slug], (old) =>
      old ? { ...old, doc: { ...old.doc, content: next, ...(updated_at ? { updated_at } : {}) } } : old
    );

  async function toggle(index: number, checked: boolean) {
    const item = items[index];
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, checked } : it)));
    const before = qc.getQueryData<DocQuery>(["doc", slug])?.doc.content ?? content;
    // Show the tick at once; the server changes only this item.
    const optimistic = parseChecklist(before);
    if (optimistic[index]) optimistic[index] = { ...optimistic[index], checked };
    setContent(serializeChecklist(optimistic));
    pending.current++;
    try {
      const { doc } = await docsApi.check(slug, { index, checked, text: item.text });
      pending.current--;
      // Later ticks still in flight will bring their own, newer copy.
      if (pending.current === 0) setContent(doc.content, doc.updated_at);
      onSaved?.(doc);
    } catch (e) {
      pending.current--;
      if (e instanceof ApiError && e.status === 409) {
        toast("This list changed elsewhere, so it was reloaded", "error");
        await qc.invalidateQueries({ queryKey: ["doc", slug] });
      } else {
        setContent(before);
        setItems(parseChecklist(before));
        toast(e instanceof Error ? e.message : "Couldn't save that tick", "error");
      }
    }
  }

  return (
    <div className="checklist-view" data-testid="checklist-view">
      <div className="checklist-progress" aria-live="polite">
        <span>
          {done} of {total} done
        </span>
        <span className="checklist-progress-bar" aria-hidden="true">
          <span style={{ width: total ? `${(done / total) * 100}%` : 0 }} />
        </span>
      </div>
      <ul className="checklist-list">
        {items.map((item, i) => (
          <li key={i} className="checklist-row">
            <label className={`checklist-item${item.checked ? " checked" : ""}${canCheck ? "" : " readonly"}`}>
              <input
                type="checkbox"
                className="checklist-box"
                checked={item.checked}
                disabled={!canCheck}
                onChange={(e) => toggle(i, e.target.checked)}
              />
              <span className="checklist-text">{item.text}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
