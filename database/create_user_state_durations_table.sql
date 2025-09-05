CREATE TABLE user_state_durations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    state TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    duration INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Index for efficient queries by user_id
CREATE INDEX idx_user_state_durations_user_id ON user_state_durations(user_id);

-- Index for efficient queries by state
CREATE INDEX idx_user_state_durations_state ON user_state_durations(state);

-- Index for efficient time-based queries
CREATE INDEX idx_user_state_durations_start_time ON user_state_durations(start_time);

-- Trigger to update the updated_at timestamp
CREATE TRIGGER update_user_state_durations_updated_at 
    AFTER UPDATE ON user_state_durations
    FOR EACH ROW
BEGIN
    UPDATE user_state_durations 
    SET updated_at = strftime('%s', 'now') 
    WHERE id = NEW.id;
END;