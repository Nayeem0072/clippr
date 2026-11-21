import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "../../hooks/useSearch";
import { trendingApi } from "../../api/trending";
import { DocCard } from "../../components/document/DocCard";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { SUPPORTED_LANGUAGES } from "../../lib/constants";

/** The week's most-viewed public pastes, shown under the search results. */
function TrendingSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["trending", 20],
    queryFn: () => trendingApi.list(20, 7),
    staleTime: 60_000,
  });

  return (
    <section className="search-trending" aria-labelledby="trending-heading">
      <div className="search-trending-head">
        <h2 id="trending-heading">Trending this week</h2>
        <p>Most-viewed public pastes in the last {data?.window_days ?? 7} days</p>
      </div>
      {isLoading && <Spinner />}
      {data && data.results.length === 0 && (
        <p className="search-meta">
          Nothing trending yet. <Link to="/new" style={{ color: "var(--color-blue)", textDecoration: "none" }}>Share a paste →</Link>
        </p>
      )}
      {data && data.results.length > 0 && (
        <div className="search-grid">
          {data.results.map((doc) => (
            <DocCard
              key={doc.slug}
              slug={doc.slug}
              title={doc.title}
              language={doc.language}
              privacy={doc.privacy}
              created_at={doc.created_at}
              owner_handle={doc.owner_handle}
              weekly_views={doc.weekly_views}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [lang, setLang] = useState(params.get("lang") ?? "");
  const [page, setPage] = useState(1);

  // Results update as you type (useSearch debounces); the URL follows so searches can be shared.
  useEffect(() => {
    const t = setTimeout(() => {
      const next: Record<string, string> = {};
      if (q.trim()) next.q = q.trim();
      if (lang) next.lang = lang;
      setParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [q, lang, setParams]);

  useEffect(() => setPage(1), [q, lang]);

  const { data, isFetching } = useSearch({ q: q.trim(), lang: lang || undefined, page });
  const searching = q.trim().length >= 2;

  return (
    <div className="search-page">
      <h1>Search</h1>

      <form className="search-form" role="search" onSubmit={(e) => e.preventDefault()}>
        <div className="search-field">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            placeholder="Search for code, configs, notes, diagrams…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pp-input"
            aria-label="Search pastes"
            autoFocus
          />
        </div>
        <select value={lang} onChange={(e) => setLang(e.target.value)} className="pp-input search-lang" aria-label="Language">
          <option value="">All languages</option>
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </form>

      <section className="search-results" aria-label="Search results" aria-busy={isFetching}>
        {!searching ? (
          <p className="search-hint">Type at least 2 characters to search titles, code, diagram labels and to-dos.</p>
        ) : !data ? (
          <div className="search-hint"><Spinner /></div>
        ) : (
          <>
            <p className="search-meta">
              {data.total} result{data.total !== 1 ? "s" : ""} for "<span style={{ color: "var(--color-ink-2)" }}>{q.trim()}</span>"
            </p>
            {data.results.length === 0 ? (
              <p className="search-hint">No pastes match. Try different keywords.</p>
            ) : (
              <div className="search-grid">
                {data.results.map((r) => (
                  <DocCard key={r.slug} {...r} owner_handle={r.owner_handle} excerpt={r.excerpt} />
                ))}
              </div>
            )}
            {(data.has_more || page > 1) && (
              <div className="search-pager">
                {page > 1 && <Button variant="ghost" size="sm" onClick={() => setPage((p) => p - 1)}>Previous</Button>}
                {data.has_more && <Button variant="ghost" size="sm" onClick={() => setPage((p) => p + 1)}>Next</Button>}
              </div>
            )}
          </>
        )}
      </section>

      <TrendingSection />
    </div>
  );
}
