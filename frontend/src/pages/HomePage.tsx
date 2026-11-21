import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { trendingApi } from "../api/trending";
import { DocCard } from "../components/document/DocCard";

function TrendingPublicDocs() {
  const { data } = useQuery({
    queryKey: ["trending"],
    queryFn: () => trendingApi.list(6, 7).catch(() => ({ results: [], window_days: 7 })),
    staleTime: 5 * 60_000,
  });

  if (!data?.results.length) return null;

  return (
    <section className="home-trending">
      <div className="home-section-head">
        <h2 className="home-eyebrow">Trending this week</h2>
        <Link to="/search" className="home-link">See all →</Link>
      </div>
      <div className="home-trending-grid">
        {data.results.map((r) => (
          <DocCard key={r.slug} slug={r.slug} title={r.title} language={r.language}
            privacy={r.privacy} created_at={r.created_at} owner_handle={r.owner_handle}
            weekly_views={r.weekly_views} />
        ))}
      </div>
    </section>
  );
}

const Check = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="home-check-icon">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

function Tile({ title, text, wide, children }: { title: string; text: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`home-tile${wide ? " home-tile--wide" : ""}`}>
      <div className="home-tile-head">
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      {children}
    </div>
  );
}

const PRIVACY = [
  { label: "Public", note: "Anyone with the link" },
  { label: "Group", note: "Members only", active: true },
  { label: "Private", note: "People you pick" },
];

const TODOS = [
  { text: "Rotate the staging API keys", done: true },
  { text: "Update the deploy runbook", done: false },
  { text: "Review Ana's migration", done: false },
];

/** A small working checklist: the boxes really tick, like they do on a checklist paste. */
function TodoDemo() {
  const [done, setDone] = useState(() => TODOS.map((t) => t.done));
  const count = done.filter(Boolean).length;
  return (
    <div className="home-well home-todo">
      <span className="home-todo-progress">
        <span>{count} of {TODOS.length} done</span>
        <span className="home-todo-bar" aria-hidden="true">
          <span style={{ width: `${(count / TODOS.length) * 100}%` }} />
        </span>
      </span>
      {TODOS.map((t, i) => (
        <label key={t.text} className={`home-todo-item${done[i] ? " done" : ""}`}>
          <input
            type="checkbox"
            checked={done[i]}
            onChange={(e) => setDone((d) => d.map((v, j) => (j === i ? e.target.checked : v)))}
          />
          <span>{t.text}</span>
        </label>
      ))}
    </div>
  );
}

const MEMBERS = [
  { initial: "M", color: "var(--home-c1)" },
  { initial: "A", color: "var(--home-c2)" },
  { initial: "K", color: "var(--home-c3)" },
];

export default function HomePage() {
  return (
    <div className="home">
      <div className="home-split">
        <section className="home-intro">
          <h1>One place for the <span className="home-accent">bits</span> your team keeps sharing</h1>
          <p className="home-lede">
            Stop digging through chat history for that one config. Put it in Clippr, share the link, and find it again later.
          </p>
          <ul className="home-checks">
            <li><Check />Search every paste by title, code, diagram label or to-do</li>
            <li><Check />Send a paste straight to a teammate</li>
            <li><Check />Save the ones you keep coming back to</li>
          </ul>
          <div className="home-ctas">
            <Link to="/signup" className="btn-primary btn-lg">Get started free</Link>
            <Link to="/search" className="btn-ghost btn-lg">Search pastes</Link>
          </div>
        </section>

        <section className="home-tiles" aria-label="Features">
          <Tile title="Code that reads well" text="Highlighted when you save, in 30 languages." wide>
            <pre className="home-code" aria-label="Example TypeScript paste">
              <span className="k">export function</span> <span className="f">useDebounce</span>{"<T>(value: T, ms = "}<span className="n">300</span>{") {\n"}
              {"  "}<span className="k">const</span>{" [v, setV] = useState(value);\n"}
              {"  useEffect(() => {\n"}
              {"    "}<span className="k">const</span>{" t = setTimeout(() => setV(value), ms);\n"}
              {"    "}<span className="k">return</span>{" () => clearTimeout(t);\n"}
              {"  }, [value, ms]);\n"}
              {"  "}<span className="k">return</span>{" v;\n}"}
            </pre>
          </Tile>

          <Tile title="Diagrams" text="Sketch boxes and arrows right in a paste.">
            <div className="home-well home-diagram" aria-hidden="true">
              <span className="home-node">Browser</span>
              <span className="home-edge" />
              <span className="home-node home-node--accent">API</span>
              <span className="home-edge" />
              <span className="home-node home-node--db">DB</span>
            </div>
          </Tile>

          <Tile title="To-do lists" text="Tick items off right on the paste. On group lists, your teammates can too.">
            <TodoDemo />
          </Tile>

          <Tile title="Mux: pastes side by side" text="Split your screen into panes and edit several pastes at once." wide>
            <div className="home-well home-mux" aria-hidden="true">
              <div className="home-pane home-pane--tall">
                <b>schema.sql</b>
                {"CREATE TABLE documents (\n  id TEXT PRIMARY KEY,\n  title TEXT,\n  privacy TEXT …"}
              </div>
              <div className="home-pane"><b>routes.ts</b>{'app.get("/api/…'}</div>
              <div className="home-pane"><b>notes.md</b>## TODO</div>
            </div>
          </Tile>

          <Tile title="You decide who sees it" text="Set it per paste.">
            <div className="home-privacy">
              {PRIVACY.map((p) => (
                <span key={p.label} className={`home-privacy-row${p.active ? " active" : ""}`}>
                  <span>{p.label}</span>
                  <span className="home-muted">{p.note}</span>
                </span>
              ))}
            </div>
          </Tile>

          <Tile title="Groups and organizations" text="Invite with a link. Members, admins and owners.">
            <div className="home-members">
              <span className="home-avatars" aria-hidden="true">
                {MEMBERS.map((m) => (
                  <span key={m.initial} style={{ background: m.color }}>{m.initial}</span>
                ))}
              </span>
              <span className="home-muted">Platform team · 3 members</span>
            </div>
          </Tile>

          <Tile title="Links that preview" text="Paste a link in chat and the code shows up." wide>
            <div className="home-well home-preview" aria-hidden="true">
              <span className="home-preview-bar" />
              <span className="home-preview-text">
                <b>deploy.yml · Clippr</b>
                <span>name: deploy on: push jobs: build …</span>
              </span>
            </div>
          </Tile>
        </section>
      </div>

      <TrendingPublicDocs />
    </div>
  );
}
