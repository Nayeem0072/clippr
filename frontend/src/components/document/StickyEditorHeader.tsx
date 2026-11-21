import { useEffect, useRef, useState, type ReactNode } from "react";

interface StickyEditorHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Buttons on the right (Save, Cancel, ...). */
  children: ReactNode;
}

/**
 * Page header for the paste editors (New / Edit). It sticks to the top while scrolling so
 * Save stays reachable on long pastes; once stuck it compacts and shows a divider.
 */
export function StickyEditorHeader({ title, subtitle, children }: StickyEditorHeaderProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      {/* Zero-height marker: once it scrolls out of view, the header below is stuck. */}
      <div ref={sentinelRef} aria-hidden="true" />
      <div className={`editor-header${stuck ? " stuck" : ""}`} data-testid="editor-header">
        <div style={{ minWidth: 0 }}>
          <h1 className="editor-header-title">{title}</h1>
          {subtitle && <p className="editor-header-sub">{subtitle}</p>}
        </div>
        <div className="editor-header-actions">{children}</div>
      </div>
    </>
  );
}
