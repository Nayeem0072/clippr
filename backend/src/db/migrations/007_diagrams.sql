-- Diagram pastes (language = 'diagram', content = Excalidraw scene JSON).
-- search_text: what full-text search indexes (content for code pastes, label text for diagrams),
--   so diagram JSON never shows up in search matches or excerpts.
-- preview_svg: a browser-made SVG snapshot of a diagram, used only for link-preview images.

ALTER TABLE documents ADD COLUMN search_text TEXT;
ALTER TABLE documents ADD COLUMN preview_svg TEXT;

UPDATE documents SET search_text = content;

DROP TRIGGER IF EXISTS docs_fts_insert;
DROP TRIGGER IF EXISTS docs_fts_update;
DROP TRIGGER IF EXISTS docs_fts_delete;
DROP TABLE IF EXISTS documents_fts;

CREATE VIRTUAL TABLE documents_fts USING fts5(
  slug        UNINDEXED,
  title,
  search_text,
  owner_id    UNINDEXED,
  group_id    UNINDEXED,
  privacy     UNINDEXED,
  content='documents',
  content_rowid='id',
  tokenize='porter unicode61'
);

INSERT INTO documents_fts(rowid, slug, title, search_text, owner_id, group_id, privacy)
  SELECT id, slug, title, COALESCE(search_text, content), owner_id, group_id, privacy FROM documents;

CREATE TRIGGER docs_fts_insert AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts(rowid, slug, title, search_text, owner_id, group_id, privacy)
  VALUES (new.id, new.slug, new.title, COALESCE(new.search_text, new.content), new.owner_id, new.group_id, new.privacy);
END;

CREATE TRIGGER docs_fts_update AFTER UPDATE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, slug, title, search_text, owner_id, group_id, privacy)
  VALUES ('delete', old.id, old.slug, old.title, COALESCE(old.search_text, old.content), old.owner_id, old.group_id, old.privacy);
  INSERT INTO documents_fts(rowid, slug, title, search_text, owner_id, group_id, privacy)
  VALUES (new.id, new.slug, new.title, COALESCE(new.search_text, new.content), new.owner_id, new.group_id, new.privacy);
END;

CREATE TRIGGER docs_fts_delete AFTER DELETE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, slug, title, search_text, owner_id, group_id, privacy)
  VALUES ('delete', old.id, old.slug, old.title, COALESCE(old.search_text, old.content), old.owner_id, old.group_id, old.privacy);
END;
