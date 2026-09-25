CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  picture_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  membership_status TEXT NOT NULL DEFAULT 'inactive',
  membership_expires_at TEXT,
  membership_source TEXT NOT NULL DEFAULT 'none',
  access_updated_at TEXT,
  membership_plan_id TEXT,
  account_status TEXT NOT NULL DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_membership_status ON users(membership_status);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  client_state TEXT NOT NULL,
  return_to TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS auth_exchange_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  client_state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_auth_exchange_codes_user_id ON auth_exchange_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_exchange_codes_expires_at ON auth_exchange_codes(expires_at);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);


CREATE TABLE IF NOT EXISTS user_datasets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_datasets_user_updated ON user_datasets(user_id,updated_at);
CREATE INDEX IF NOT EXISTS idx_user_datasets_user_deleted ON user_datasets(user_id,deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_datasets_active_name ON user_datasets(user_id,name) WHERE deleted_at IS NULL;


CREATE TABLE IF NOT EXISTS membership_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  duration_days INTEGER NOT NULL,
  price_idr INTEGER NOT NULL DEFAULT 0,
  dataset_limit INTEGER NOT NULL DEFAULT 30,
  storage_limit_bytes INTEGER NOT NULL DEFAULT 20971520,
  active INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS membership_payments (
  order_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  midtrans_transaction_id TEXT,
  paid_at TEXT,
  applied_at TEXT,
  membership_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(plan_id) REFERENCES membership_plans(id)
);

CREATE INDEX IF NOT EXISTS idx_membership_payments_user ON membership_payments(user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_membership_payments_status ON membership_payments(status);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id,created_at);

CREATE TABLE IF NOT EXISTS backup_runs (
  id TEXT PRIMARY KEY,
  object_key TEXT,
  status TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_backup_runs_created ON backup_runs(created_at);
