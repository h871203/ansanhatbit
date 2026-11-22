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

-- 앱 사용 인원: 휴대폰마다 이름 없는 번호표(device), 하루에 화면(view)별로 한 줄
CREATE TABLE IF NOT EXISTS visits (
    day TEXT NOT NULL,           -- 한국 날짜 YYYY-MM-DD
    device TEXT NOT NULL,        -- 이름 없는 무작위 번호
    view TEXT NOT NULL,          -- app | home | bible | sermon | ...
    PRIMARY KEY (day, device, view)
);
CREATE INDEX IF NOT EXISTS visits_view_day ON visits (view, day);
