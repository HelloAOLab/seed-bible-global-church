-- THE PUBLISHERS THE REGISTRY FOLLOWS (the scripture-indexed publishing spec): beside the shelves, publishers that
-- answer the publisher contract are read by `publisher.changes` from the cursor the last crawl ended on. `publishers`
-- is configuration (where to look), like `shelves`; `works` is derived — the catalog of what each publisher has
-- published or withdrawn, one row per work, never a work's content — and a cursor of '0' rebuilds it.
CREATE TABLE IF NOT EXISTS publishers (
  name          TEXT PRIMARY KEY,   -- the publisher's host (publishing.faithnet.io)
  endpoint      TEXT NOT NULL,      -- its contract door: POST <endpoint>/publisher/<skill>
  kind          TEXT NOT NULL,      -- content | scripture
  cursor        TEXT NOT NULL DEFAULT '0',  -- where the next publisher.changes read starts
  registered_at TEXT NOT NULL,
  last_crawl_at TEXT,
  last_error    TEXT
);

CREATE TABLE IF NOT EXISTS works (
  publisher   TEXT NOT NULL,        -- = publishers.name
  work        TEXT NOT NULL,        -- handle/slug, as the publisher names it
  title       TEXT NOT NULL,
  kind        TEXT NOT NULL,        -- the work's content type (text, map, features, edition, …)
  version     INTEGER NOT NULL,
  change      TEXT NOT NULL,        -- published | withdrawn (the latest the publisher reported)
  changed_at  INTEGER NOT NULL,     -- ms since the epoch, as the publisher says
  indexed_at  TEXT NOT NULL,
  PRIMARY KEY (publisher, work)
);
CREATE INDEX IF NOT EXISTS works_changed ON works (change, changed_at);
