CREATE TABLE IF NOT EXISTS reference_items (
  id TEXT PRIMARY KEY,
  set_id TEXT NOT NULL,
  set_name TEXT,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  prompt TEXT,
  caption TEXT,
  mime_type TEXT NOT NULL,
  r2_image_key TEXT NOT NULL,
  r2_metadata_key TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reference_items_set_id ON reference_items(set_id);
CREATE INDEX IF NOT EXISTS idx_reference_items_created_at ON reference_items(created_at DESC);
