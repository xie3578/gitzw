import { Hono } from 'hono'
import { jwt } from 'hono/jwt'

const admin = new Hono()

// 管理员验证中间件
async function adminAuth(c, next) {
  const payload = c.get('jwtPayload')
  if (payload.role !== 'admin') {
    return c.json({ error: '需要管理员权限' }, 403)
  }
  await next()
}

admin.use('*', jwt({ secret: (c) => c.env.JWT_SECRET || 'secret' }), adminAuth)

// ===== 广告管理 =====
// GET /ads 广告列表
admin.get('/ads', async (c) => {
  const page = parseInt(c.req.query('page')) || 1
  const limit = parseInt(c.req.query('limit')) || 20
  const offset = (page - 1) * limit

  const { results: totalResult } = await c.env.DB.prepare('SELECT COUNT(*) as total FROM ads').all()
  const total = totalResult[0]?.total || 0

  const { results } = await c.env.DB.prepare('SELECT * FROM ads ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(limit, offset).all()
  return c.json({ ads: results, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
})

// POST /ads 创建广告
admin.post('/ads', async (c) => {
  const body = await c.req.json()
  const { title, description, image_url, target_url, placement, priority, duration } = body

  if (!title) return c.json({ error: '广告标题不能为空' }, 400)

  const { meta } = await c.env.DB.prepare(
    'INSERT INTO ads (title, description, image_url, target_url, placement, priority, duration) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(title || '', description || '', image_url || '', target_url || '', placement || 'home', priority || 0, duration || 6).run()

  return c.json({ message: '广告创建成功', id: meta.last_row_id }, 201)
})

// PUT /ads/:id 更新广告
admin.put('/ads/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { title, description, image_url, target_url, placement, priority, enabled, start_time, end_time, duration } = body

  const { results } = await c.env.DB.prepare('SELECT id FROM ads WHERE id = ?').bind(id).all()
  if (results.length === 0) return c.json({ error: '广告不存在' }, 404)

  await c.env.DB.prepare(
    'UPDATE ads SET title=?, description=?, image_url=?, target_url=?, placement=?, priority=?, enabled=?, start_time=?, end_time=?, duration=? WHERE id=?'
  ).bind(title, description, image_url, target_url, placement, priority, enabled ?? 1, start_time || null, end_time || null, duration || 6, id).run()

  return c.json({ message: '广告更新成功' })
})

// DELETE /ads/:id 删除广告
admin.delete('/ads/:id', async (c) => {
  const id = c.req.param('id')
  const { results } = await c.env.DB.prepare('SELECT id FROM ads WHERE id = ?').bind(id).all()
  if (results.length === 0) return c.json({ error: '广告不存在' }, 404)

  await c.env.DB.prepare('DELETE FROM ads WHERE id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM ad_logs WHERE ad_id = ?').bind(id).run()
  return c.json({ message: '广告已删除' })
})

// GET /ads/stats 广告统计
admin.get('/ads/stats', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT a.id, a.title, a.placement, a.enabled,
           (SELECT COUNT(*) FROM ad_logs WHERE ad_id = a.id) as view_count
    FROM ads a ORDER BY view_count DESC
  `).all()
  return c.json({ stats: results })
})

// ===== 分类管理 =====
// GET /categories 分类列表
admin.get('/categories', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT DISTINCT category FROM repositories WHERE category IS NOT NULL AND category != \'\' ORDER BY category'
  ).all()
  return c.json({ categories: results.map(r => r.category) })
})

// POST /categories 添加分类
admin.post('/categories', async (c) => {
  const { name } = await c.req.json()
  if (!name) return c.json({ error: '分类名称不能为空' }, 400)
  // 分类存储在 repositories 表的 category 字段中
  return c.json({ message: `分类 ${name} 已添加，将在下次抓取时生效` })
})

// ===== 项目管理 =====
// GET /repos 仓库列表（管理端，显示所有数据）
admin.get('/repos', async (c) => {
  const page = parseInt(c.req.query('page')) || 1
  const limit = parseInt(c.req.query('limit')) || 50
  const offset = (page - 1) * limit

  const { results: totalResult } = await c.env.DB.prepare('SELECT COUNT(*) as total FROM repositories').all()
  const total = totalResult[0]?.total || 0

  const { results } = await c.env.DB.prepare(`
    SELECT r.*, d.github_login
    FROM repositories r
    LEFT JOIN developers d ON r.developer_id = d.id
    ORDER BY r.stars DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all()

  return c.json({ repos: results, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
})

// PUT /repos/:id 更新仓库
admin.put('/repos/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { category, description_zh, ai_summary, ai_tags, language } = body

  const { results } = await c.env.DB.prepare('SELECT id FROM repositories WHERE id = ?').bind(id).all()
  if (results.length === 0) return c.json({ error: '仓库不存在' }, 404)

  await c.env.DB.prepare(
    'UPDATE repositories SET category=COALESCE(?,category), description_zh=COALESCE(?,description_zh), ai_summary=COALESCE(?,ai_summary), ai_tags=COALESCE(?,ai_tags), language=COALESCE(?,language) WHERE id=?'
  ).bind(category || null, description_zh || null, ai_summary || null, ai_tags || null, language || null, id).run()

  return c.json({ message: '仓库更新成功' })
})

// DELETE /repos/:id 删除仓库
admin.delete('/repos/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM favorites WHERE repo_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM repositories WHERE id = ?').bind(id).run()
  return c.json({ message: '仓库已删除' })
})

// GET /users 用户列表
admin.get('/users', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, email, nickname, role, created_at FROM users ORDER BY created_at DESC'
  ).all()
  return c.json({ users: results })
})

// PUT /users/:id 更新用户角色
admin.put('/users/:id', async (c) => {
  const id = c.req.param('id')
  const { role } = await c.req.json()
  if (!['user', 'admin'].includes(role)) return c.json({ error: '无效的角色' }, 400)

  await c.env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, id).run()
  return c.json({ message: '用户角色更新成功' })
})

// GET /dashboard 仪表盘数据
admin.get('/dashboard', async (c) => {
  const [reposCount, usersCount, adsCount, todayTrending] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as total FROM repositories').all(),
    c.env.DB.prepare('SELECT COUNT(*) as total FROM users').all(),
    c.env.DB.prepare('SELECT COUNT(*) as total FROM ads').all(),
    c.env.DB.prepare('SELECT COUNT(*) as total FROM repositories WHERE stars_today > 0').all(),
  ])

  return c.json({
    reposCount: reposCount.results[0]?.total || 0,
    usersCount: usersCount.results[0]?.total || 0,
    adsCount: adsCount.results[0]?.total || 0,
    todayTrending: todayTrending.results[0]?.total || 0,
  })
})

export default admin
