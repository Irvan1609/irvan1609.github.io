CREATE TABLE IF NOT EXISTS contributions (
  id TEXT PRIMARY KEY,
  sample TEXT NOT NULL,
  image BLOB NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  boxes_json TEXT NOT NULL,
  predicted_boxes_json TEXT NOT NULL,
  predicted_count INTEGER NOT NULL,
  final_count INTEGER NOT NULL,
  prediction_method TEXT NOT NULL,
  model_version TEXT NOT NULL,
  correction_count INTEGER NOT NULL,
  quality_score REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contributions_created_at ON contributions(created_at);
CREATE INDEX IF NOT EXISTS idx_contributions_status ON contributions(status);
