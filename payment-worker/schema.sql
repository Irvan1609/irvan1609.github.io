CREATE TABLE IF NOT EXISTS payments (
  order_id TEXT PRIMARY KEY,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  credit_hash TEXT,
  used_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
