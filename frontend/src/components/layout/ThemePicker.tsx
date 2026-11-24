import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useTheme } from "../../hooks/useTheme";
import { THEMES, type ThemeInfo } from "../../lib/themes";

const PaletteIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3a9 9 0 100 18c.9 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16a5 5 0 005-5c0-4.4-4-7.9-9-7.9z" />
    <circle cx="7.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="10.5" cy="7" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="7.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const MENU_W = 248;

function Swatch({ t }: { t: ThemeInfo }) {
  return (
    <span className="theme-swatch" style={{ background: t.swatch.bg }} aria-hidden="true">
      <span style={{ background: t.swatch.card }} />
      <span style={{ background: t.swatch.accent }} />
    </span>
  );
}

/**
 * The colour-theme button in the menu. Opens a small menu of every palette; picking one
 * applies it at once (the menu stays open so you can try others).
 */
export function ThemePicker({ className = "theme-picker-btn" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Placed from the button, kept inside the window (portalled so no parent can clip it).
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const left = Math.min(Math.max(8, r.left), window.innerWidth - MENU_W - 8);
      setPos({ top: r.bottom + 6, left: Math.max(8, left) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Focus the current theme when the menu opens.
  useEffect(() => {
    if (open && pos) menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => setOpen(false), [location.pathname]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const move = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (move) {
      e.preventDefault();
      items[(i + move + items.length) % items.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      items[e.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const current = THEMES.find((t) => t.id === theme);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={className}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? "theme-menu" : undefined}
        aria-label="Colour theme"
        title={`Colour theme: ${current?.name ?? "Dark"}`}
      >
        <PaletteIcon />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            id="theme-menu"
            className="theme-menu"
            role="menu"
            aria-label="Colour theme"
            style={{ top: pos.top, left: pos.left, width: MENU_W }}
            onKeyDown={onMenuKey}
          >
            {(["dark", "light"] as const).map((mode) => (
              <div key={mode} role="group" aria-label={mode === "dark" ? "Dark themes" : "Light themes"}>
                <p className="theme-menu-label" aria-hidden="true">{mode === "dark" ? "Dark" : "Light"}</p>
                <div className="theme-menu-grid">
                  {THEMES.filter((t) => t.mode === mode).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={t.id === theme}
                      className={`theme-option${t.id === theme ? " active" : ""}`}
                      onClick={() => setTheme(t.id)}
                      tabIndex={t.id === theme ? 0 : -1}
                    >
                      <Swatch t={t} />
                      <span className="theme-option-name">{t.name}</span>
                      {t.id === theme && (
                        <svg className="theme-option-check" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
