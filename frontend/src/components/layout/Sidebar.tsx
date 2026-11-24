import { Link, useLocation, useNavigate } from "react-router-dom";
import { ThemePicker } from "./ThemePicker";
import { useAuth } from "../../hooks/useAuth";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sendsApi } from "../../api/sends";
import { NotificationBell } from "./NotificationBell";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
}

function NavLink({ to, label, icon, exact }: NavItem) {
  const { pathname } = useLocation();
  const active = exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");
  return (
    // title/aria-label keep icon-only links (collapsed menu) named and give them a tooltip.
    <Link to={to} className={`nav-link ${active ? "active" : ""}`} title={label} aria-label={label}>
      {icon}
      <span className="nav-label">{label}</span>
    </Link>
  );
}

const DocsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="2" y="1.5" width="10" height="13" rx="2" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M5 5.5h5M5 8h5M5 10.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const OrgsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M1 13c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M11 3.5c1.38 0 2.5 1.12 2.5 2.5S12.38 8.5 11 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M13 11c.9.8 1.5 1.9 1.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);
const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="1.5" width="13" height="13" rx="3.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);
const MuxIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M7 1.5v13M7 8h7.5" stroke="currentColor" strokeWidth="1.4"/>
  </svg>
);
// A cog (outline adapted from Feather Icons, MIT), so it isn't mistaken for the theme toggle's sun.
const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>
);
const SavedIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 2h10a1 1 0 011 1v11l-5.5-2.75L3 14V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
  </svg>
);
const SharedIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M2 9h3l1.5 2h3L11 9h3v4a.5.5 0 01-.5.5h-11A.5.5 0 012 13V9z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    <path d="M2 9V4.5A.5.5 0 012.5 4h11a.5.5 0 01.5.5V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8 2v5M6 5l2 2 2-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);




const COLLAPSED_KEY = "clippr-sidebar-collapsed";

/** Desktop menu collapsed to icons only; remembered in this browser. */
function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      // storage unavailable
    }
  }, [collapsed]);
  return [collapsed, setCollapsed] as const;
}

const CollapseIcon = ({ collapsed }: { collapsed: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1.5" y="2" width="13" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
    <path d="M6 2v12" stroke="currentColor" strokeWidth="1.4" />
    <path
      d={collapsed ? "M9 6l2 2-2 2" : "M11 6L9 8l2 2"}
      stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

export function Sidebar() {
  const { user, logoutAsync } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const toggleLabel = collapsed ? "Expand menu" : "Collapse menu";

  return (
    <aside className={`app-sidebar${collapsed ? " collapsed" : ""}`} data-collapsed={collapsed}>
      {/* Logo + theme toggle + notification bell */}
      <div className="sidebar-head">
        <Link to="/new" className="sidebar-logo" title="Clippr" aria-label="Clippr home">
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: "var(--gradient-brand)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" fill="white"/>
              <path d="M10 2l3 3h-2.5A.5.5 0 0110 4.5V2z" fill="rgba(0,128,255,0.4)"/>
              <path d="M5 7h6M5 9.5h6M5 12h4" stroke="rgba(0,128,255,0.7)" strokeWidth="1.1" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="sidebar-brand">Clippr</span>
        </Link>
        <div className="sidebar-head-actions">
          <ThemePicker />
          <NotificationBell />
        </div>
      </div>

      {/* Nav section */}
      <p className="sidebar-section">Menu</p>
      <nav aria-label="Menu" style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 24 }}>
        <NavLink to="/new" label="New Paste" icon={<PlusIcon />} exact />
        <NavLink to="/search" label="Search" icon={<SearchIcon />} />
        <NavLink to={`/${user?.handle}`} label="My Pastes" icon={<DocsIcon />} />
        <NavLink to="/shared" label="Shared" icon={<SharedIcon />} />
        <NavLink to="/saved" label="Saved" icon={<SavedIcon />} />
        <NavLink to="/mux" label="Mux" icon={<MuxIcon />} />
      </nav>

      <p className="sidebar-section">Account</p>
      <nav aria-label="Account" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <NavLink to="/groups" label="Groups" icon={<OrgsIcon />} />
        <NavLink to="/settings" label="Settings" icon={<SettingsIcon />} />
      </nav>

      {/* Bottom: collapse toggle + user card */}
      <div style={{ marginTop: "auto" }}>
        <button
          type="button"
          className="nav-link sidebar-toggle"
          onClick={() => setCollapsed((c) => !c)}
          title={toggleLabel}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
        >
          <CollapseIcon collapsed={collapsed} />
          <span className="nav-label">Collapse</span>
        </button>
        <div className="sidebar-user">
          <div title={user?.display_name ?? user?.handle} style={{
            width: 32, height: 32, borderRadius: 10,
            background: "var(--gradient-brand)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, color: "#0A0A14", flexShrink: 0,
          }}>
            {(user?.handle ?? "?")[0].toUpperCase()}
          </div>
          <div className="sidebar-user-text" style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.display_name ?? user?.handle}
            </p>
            <p style={{ fontSize: 11, color: "var(--color-ink-3)", margin: 0 }}>@{user?.handle}</p>
          </div>
          <button
            onClick={async () => { await logoutAsync(); navigate("/"); }}
            title="Sign out"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--color-ink-3)", padding: 4, borderRadius: 6, transition: "color 150ms",
              display: "flex", alignItems: "center",
            }}
            onMouseOver={e => (e.currentTarget.style.color = "#f87171")}
            onMouseOut={e => (e.currentTarget.style.color = "var(--color-ink-3)")}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9.5 4.5l2.5 2.5-2.5 2.5M12 7H5.5M7 2H2.5A.5.5 0 002 2.5v9a.5.5 0 00.5.5H7"
                stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}

export function MobileTopBar() {
  return (
    <div className="mobile-topbar">
      <Link to="/new" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: "var(--gradient-brand)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" fill="white"/>
            <path d="M10 2l3 3h-2.5A.5.5 0 0110 4.5V2z" fill="rgba(0,128,255,0.4)"/>
            <path d="M5 7h6M5 9.5h6M5 12h4" stroke="rgba(0,128,255,0.7)" strokeWidth="1.1" strokeLinecap="round"/>
          </svg>
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-ink)", letterSpacing: "-0.3px" }}>Clippr</span>
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <ThemePicker />
        <NotificationBell />
      </div>
    </div>
  );
}

const MoreIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
  </svg>
);

/** Pages reached from the phone nav's "More" sheet (the bar itself keeps five items). */
const MORE_ITEMS = [
  { to: "/saved", label: "Saved", icon: <SavedIcon /> },
  { to: "/mux", label: "Mux", icon: <MuxIcon /> },
  { to: "/groups", label: "Groups", icon: <OrgsIcon /> },
  { to: "/settings", label: "Settings", icon: <SettingsIcon /> },
];

export function MobileNav() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const active = useCallback((path: string, exact = false) =>
    exact ? pathname === path : pathname === path || pathname.startsWith(path + "/")
  , [pathname]);

  const { data: countData } = useQuery({
    queryKey: ["unread-count"],
    queryFn: sendsApi.getUnreadCount,
    refetchInterval: 30_000,
  });
  const unreadCount = countData?.count ?? 0;

  // Close the sheet on navigation and on Escape.
  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMoreOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const moreActive = MORE_ITEMS.some((i) => active(i.to));

  return (
    <>
      {moreOpen && (
        <>
          <div className="mobile-more-backdrop" onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <div className="mobile-more-sheet" role="dialog" aria-label="More pages" id="mobile-more-sheet">
            {MORE_ITEMS.map((i) => (
              <Link key={i.to} to={i.to} className={`mobile-more-item ${active(i.to) ? "active" : ""}`}>
                {i.icon}
                {i.label}
              </Link>
            ))}
          </div>
        </>
      )}
      <nav className="mobile-nav">
        <Link to="/new" className={`mobile-nav-item ${active("/new", true) ? "active" : ""}`}>
          <PlusIcon />
          New
        </Link>
        <Link to="/search" className={`mobile-nav-item ${active("/search") ? "active" : ""}`}>
          <SearchIcon />
          Search
        </Link>
        <Link to={`/${user?.handle}`} className={`mobile-nav-item ${active(`/${user?.handle ?? "__"}`) ? "active" : ""}`}>
          <DocsIcon />
          Pastes
        </Link>
        <Link to="/shared" className={`mobile-nav-item ${active("/shared") ? "active" : ""}`}>
          <div style={{ position: "relative", display: "inline-flex" }}>
            <SharedIcon />
            {unreadCount > 0 && (
              <span style={{
                position: "absolute", top: -3, right: -4,
                width: 7, height: 7, borderRadius: "50%", background: "var(--color-blue)",
              }} />
            )}
          </div>
          Shared
        </Link>
        <button
          type="button"
          className={`mobile-nav-item ${moreActive || moreOpen ? "active" : ""}`}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-sheet"
          onClick={() => setMoreOpen((o) => !o)}
        >
          <MoreIcon />
          More
        </button>
      </nav>
    </>
  );
}
