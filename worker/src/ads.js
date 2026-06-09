import { Hono } from 'hono'
import { jwt } from 'hono/jwt'

const ads = new Hono()

// GET / 广告查询
ads.get('/', async (c) => {
  const placement = c.req.query('placement')
  const now = new Date().toISOString()

  let sql = `SELECT * FROM ads WHERE enabled = 1 AND start_time <= ? AND (end_time IS NULL OR end_time >= ?)`
  const params = [now, now]

  if (placement) {
    sql += ' AND placement = ?'
    params.push(placement)
  }

  sql += ' ORDER BY priority DESC'

  const { results } = await c.env.DB.prepare(sql).bind(...params).all()
  return c.json({ ads: results })
})

// POST /devurl/unlock 广告解锁开发者地址（需要登录）
ads.post('/devurl/unlock', jwt({ secret: (c) => c.env.JWT_SECRET || 'secret' }), async (c) => {
  const payload = c.get('jwtPayload')
  const { adId, repoId } = await c.req.json()

  if (!adId || !repoId) return c.json({ error: 'adId 和 repoId 不能为空' }, 400)

  // 验证广告是否存在且启用
  const { results: ad } = await c.env.DB.prepare(
    'SELECT * FROM ads WHERE id = ? AND enabled = 1'
  ).bind(adId).all()
  if (ad.length === 0) return c.json({ error: '广告不存在或未启用' }, 404)

  // 记录广告解锁日志
  await c.env.DB.prepare(
    'INSERT INTO ad_logs (ad_id, action) VALUES (?, ?)'
  ).bind(adId, `unlock_devurl:repo=${repoId}:user=${payload.userId}`).run()

  // 临时将该仓库的 dev_url_visible_for_guests 设为 1（持续一段时间）
  // 更完善的做法是设置一个解锁过期时间，这里简化处理
  await c.env.DB.prepare(
    'UPDATE repositories SET dev_url_visible_for_guests = 1 WHERE id = ?'
  ).bind(repoId).run()

  // 返回开发者地址
  const { results: repo } = await c.env.DB.prepare(`
    SELECT r.id, d.profile_url as dev_url
    FROM repositories r
    LEFT JOIN developers d ON r.developer_id = d.id
    WHERE r.id = ?
  `).bind(repoId).all()

  return c.json({
    message: '解锁成功，感谢观看广告',
    devUrl: repo[0]?.dev_url || null
  })
})

// GET /logs 获取当前用户广告解锁日志（需登录）
ads.get('/logs', jwt({ secret: (c) => c.env.JWT_SECRET || 'secret' }), async (c) => {
  const payload = c.get('jwtPayload')
  const { results } = await c.env.DB.prepare(
    'SELECT al.*, a.title as ad_title FROM ad_logs al LEFT JOIN ads a ON al.ad_id = a.id WHERE al.action LIKE ? ORDER BY al.created_at DESC LIMIT 50'
  ).bind(`%user=${payload.userId}%`).all()
  return c.json({ logs: results })
})

export default ads
