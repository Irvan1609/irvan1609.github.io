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


CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  picture_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);

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
