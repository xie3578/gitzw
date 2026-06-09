-- 性能优化：添加常用查询索引
-- 适用于 D1 数据库

-- repositories 表：加速语言筛选和排序
CREATE INDEX IF NOT EXISTS idx_repositories_language ON repositories(language);
CREATE INDEX IF NOT EXISTS idx_repositories_stars_today ON repositories(stars_today DESC);
CREATE INDEX IF NOT EXISTS idx_repositories_category ON repositories(category);
CREATE INDEX IF NOT EXISTS idx_repositories_developer_id ON repositories(developer_id);

-- favorites 表：加速用户收藏查询（最频繁）
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_repo_id ON favorites(repo_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_repo ON favorites(user_id, repo_id);

-- subscriptions 表：加速订阅查询
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_type ON subscriptions(user_id, type);

-- ads 表：加速广告展示查询
CREATE INDEX IF NOT EXISTS idx_ads_placement_enabled ON ads(placement, enabled, priority DESC);
CREATE INDEX IF NOT EXISTS idx_ads_start_end ON ads(start_time, end_time);

-- ad_logs 表：加速广告日志查询
CREATE INDEX IF NOT EXISTS idx_ad_logs_ad_id ON ad_logs(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_logs_created ON ad_logs(created_at);
