CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,          -- thanks | prayer
    name TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL,
    status TEXT NOT NULL,        -- approved | hidden
    amen INTEGER NOT NULL DEFAULT 0,
    created TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_status_created ON posts (status, created);
