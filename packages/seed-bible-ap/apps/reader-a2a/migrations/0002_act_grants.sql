-- The act-as-me standing wires a reader hands this workspace (spec 397 §11): one row per person, replaced when they
-- consent again. Each wire covers ONE act (adding or removing a contact) for 30 days, names this workspace's act key,
-- and is revocable at their Home. Serving-plane state, rebuildable from a new consent; never a custody key.
CREATE TABLE IF NOT EXISTS act_grants (
  reader TEXT PRIMARY KEY,
  standing_json TEXT NOT NULL,
  granted_at INTEGER NOT NULL
);
