CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  model TEXT,
  width INTEGER,
  height INTEGER,
  seed INTEGER,
  provider TEXT NOT NULL DEFAULT 'bfl-api',
  sample_url TEXT,
  r2_image_key TEXT NOT NULL,
  r2_prompt_key TEXT NOT NULL,
  r2_metadata_key TEXT NOT NULL,
  cost_credits REAL,
  input_mp REAL,
  output_mp REAL,
  credits_before REAL,
  credits_after REAL,
  credit_delta REAL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_model ON assets(model);
