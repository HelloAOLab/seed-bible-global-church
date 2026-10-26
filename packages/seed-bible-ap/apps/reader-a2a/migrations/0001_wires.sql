-- The ask-as-me wires readers hand this workspace at sign-in (one per person; replaced on re-connect).
-- Serving-plane state: a wire is the person's to revoke at their Home, and this row is rebuildable from a
-- new sign-in. Never a custody key, never the person's records.
CREATE TABLE IF NOT EXISTS wires (
  reader TEXT PRIMARY KEY,
  wire_json TEXT NOT NULL,
  connected_at INTEGER NOT NULL
);
