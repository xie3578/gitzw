CREATE TABLE repositories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id INTEGER UNIQUE,
  full_name TEXT,
  owner TEXT,
  repo_name TEXT,
  description_en TEXT,
  description_zh TEXT,
  ai_summary TEXT,
  ai_tags TEXT,
  language TEXT,
  category TEXT,
  stars INTEGER,
  forks INTEGER,
  stars_today INTEGER,
  github_url TEXT,
  dev_url_visible_for_guests INTEGER DEFAULT 1,
  developer_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE developers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_login TEXT,
  avatar_url TEXT,
  profile_url TEXT,
  bio_en TEXT,
  bio_zh TEXT,
  followers INTEGER,
  company TEXT,
  location TEXT
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  password_hash TEXT,
  nickname TEXT,
  avatar TEXT,
  role TEXT DEFAULT 'user',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  repo_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  type TEXT,
  value TEXT
);

CREATE TABLE ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  description TEXT,
  image_url TEXT,
  target_url TEXT,
  placement TEXT,
  priority INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  start_time DATETIME,
  end_time DATETIME,
  duration INTEGER DEFAULT 6,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ad_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_id INTEGER,
  action TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
