-- Browsers signed in to the UI, so a daemon restart does not sign them out. Only a SHA-256 hash of the cookie
-- value is kept: the database never holds a usable cookie. Rows past expires_at (ms since epoch) are ignored.
CREATE TABLE ui_sessions (
  hash        TEXT PRIMARY KEY,
  expires_at  INTEGER NOT NULL
);
