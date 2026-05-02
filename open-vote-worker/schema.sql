-- Open Vote Edge Database Schema (SQLite dialect for Turso)

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,        -- Internal anonymous ID (e.g., a SHA-256 hash)
    current_challenge TEXT      -- Stores the active WebAuthn challenge for verification
);

CREATE TABLE IF NOT EXISTS authenticators (
    credential_id TEXT PRIMARY KEY,
    credential_public_key TEXT NOT NULL,
    counter INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    transports TEXT,            -- Comma-separated list of transports
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    region TEXT NOT NULL,
    active BOOLEAN DEFAULT 1
);

CREATE TABLE IF NOT EXISTS poll_options (
    id TEXT PRIMARY KEY,        -- Option ID, e.g., 'approve' or 'reject'
    poll_id INTEGER NOT NULL,
    option_text TEXT NOT NULL,
    vote_count INTEGER DEFAULT 0,
    FOREIGN KEY(poll_id) REFERENCES polls(id)
);

CREATE TABLE IF NOT EXISTS open_vote_ledger (
    tx_hash TEXT PRIMARY KEY,
    poll_id INTEGER NOT NULL,
    option_id TEXT NOT NULL,
    user_id TEXT NOT NULL,      -- Used to enforce one-person-one-vote per poll
    timestamp INTEGER NOT NULL,
    FOREIGN KEY(poll_id) REFERENCES polls(id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    UNIQUE(poll_id, user_id)    -- One vote per user per poll
);

-- Seed Data for Global Cannabis Legalization
INSERT INTO polls (id, year, category, title, description, region, active) 
VALUES (1, 2024, 'Political Initiative', 'Global Legalization of Cannabis', 'Should cannabis be legalized for adult use worldwide?', 'Global', 1)
ON CONFLICT DO NOTHING;

INSERT INTO poll_options (id, poll_id, option_text, vote_count) 
VALUES ('opt-approve', 1, 'Approve', 0), ('opt-reject', 1, 'Reject', 0)
ON CONFLICT DO NOTHING;
