-- The Seed registry — an INDEX of what Seed Bible agents released on their public shelves (hard-problems §12).
-- If this store were wiped the loss is a rebuild: `POST /admin/reindex` reads the same shelves again and produces
-- the same rows (ADR-0004 / ADR-0055). Nothing here is authored here; no document body is stored.
--
-- The one table that is not derived is `shelves`: configuration, the list of where to look.
CREATE TABLE IF NOT EXISTS shelves (
  name          TEXT PRIMARY KEY,   -- the agent's typed name (seedreader.me, seed-reader.org)
  endpoint      TEXT NOT NULL,      -- its public door (the card's interface url)
  kind          TEXT NOT NULL,      -- person | organization
  registered_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS offerings (
  owner         TEXT NOT NULL,      -- the shelf owner's agent address (lowercase), as the shelf reports it
  entry_id      TEXT NOT NULL,      -- the Library entry id of the JSON-LD descriptor
  shelf         TEXT NOT NULL,      -- = shelves.name
  version       INTEGER NOT NULL,   -- the Library's version of the descriptor
  release_id    TEXT NOT NULL,      -- the signed release the owner minted for this version
  release_signed INTEGER NOT NULL,  -- 1 when the shelf reported the release as signed
  passage       TEXT NOT NULL,      -- OSIS chapter (JHN.3) — what Discover queries
  passage_ref   TEXT NOT NULL,      -- the descriptor's own seed:offeredForPassage
  kind          TEXT NOT NULL,      -- seed:OfferingKind notation (note, study, …)
  title         TEXT NOT NULL,
  descriptor_id TEXT NOT NULL,      -- the descriptor's @id
  descriptor_json TEXT NOT NULL,    -- the descriptor as read (small; never a body)
  markdown_path TEXT,               -- the rendering beside it on the shelf, when there is one
  indexed_at    TEXT NOT NULL,
  withdrawn_at  TEXT,               -- set when a crawl no longer finds it on the shelf (a tombstone)
  PRIMARY KEY (owner, entry_id)
);
CREATE INDEX IF NOT EXISTS offerings_passage ON offerings (passage, withdrawn_at);

-- One row per shelf per crawl: what was read and what failed. Append-only; safe to truncate.
CREATE TABLE IF NOT EXISTS crawl_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at    TEXT NOT NULL,
  shelf     TEXT NOT NULL,
  ok        INTEGER NOT NULL,
  error     TEXT,
  listed    INTEGER NOT NULL DEFAULT 0,
  indexed   INTEGER NOT NULL DEFAULT 0,
  withdrawn INTEGER NOT NULL DEFAULT 0,
  skipped   TEXT
);
