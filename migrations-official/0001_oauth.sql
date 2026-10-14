-- Zepp 官方授权中转（D1 zeppbridge-official）。与反馈库分开。
--
-- oauth_pending：一次授权从 /start 到桌面端 /claim 领走之间的暂存，最长 10 分钟。
-- state 只存哈希；令牌用 RELAY_KEY 加密后存，领走即删。
CREATE TABLE oauth_pending (
  state_hash TEXT PRIMARY KEY,
  claim_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'denied', 'failed')),
  error TEXT,
  tokens_enc TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_oauth_pending_created ON oauth_pending (created_at);

-- official_users：完成过授权的 Zepp 账号，只存 user_id 的 SHA-256。
-- 数据中转只收这里有的账号的推送。
CREATE TABLE official_users (
  user_hash TEXT PRIMARY KEY,
  registered_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
