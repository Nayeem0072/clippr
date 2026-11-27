-- Collections: folders of pastes. A paste is in at most one collection (documents.collection_id).
-- group_id NULL = a personal collection (owner_id's); otherwise a group collection, and
-- owner_id is the member who created it.

CREATE TABLE IF NOT EXISTS collections (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id   INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_collections_owner ON collections(owner_id);
CREATE INDEX IF NOT EXISTS idx_collections_group ON collections(group_id);

ALTER TABLE documents ADD COLUMN collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_docs_collection ON documents(collection_id);
