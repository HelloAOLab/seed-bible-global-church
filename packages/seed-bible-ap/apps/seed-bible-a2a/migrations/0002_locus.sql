-- THE CANONICAL LOCUS beside each offering (lib/locus): its ap-locus-id-v1 id and the ordinal span (bbcccvvv) of the
-- verses it covers, so a query by any verse, range, chapter or book finds what overlaps it — a study of John 3:1-8 is
-- found at John 3:5. Filled by the crawl; a reindex fills rows indexed before this column existed.
ALTER TABLE offerings ADD COLUMN locus_id TEXT;
ALTER TABLE offerings ADD COLUMN span_start INTEGER;
ALTER TABLE offerings ADD COLUMN span_end INTEGER;
CREATE INDEX IF NOT EXISTS offerings_span ON offerings (span_start, span_end, withdrawn_at);
CREATE INDEX IF NOT EXISTS offerings_locus ON offerings (locus_id, withdrawn_at);
