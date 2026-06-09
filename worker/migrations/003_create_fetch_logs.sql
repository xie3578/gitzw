-- 抓取日志表：记录每次抓取执行的状态
CREATE TABLE IF NOT EXISTS fetch_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'pending',      -- pending / running / success / failed
  started_at TEXT,
  finished_at TEXT,
  repositories_count INTEGER DEFAULT 0,
  error_message TEXT,
  next_scheduled_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 插入初始化记录，表示从未抓取过
INSERT INTO fetch_logs (status, started_at, finished_at, repositories_count, next_scheduled_at)
VALUES ('never', NULL, NULL, 0, datetime('now', '+3 hours'));
