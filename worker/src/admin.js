import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import { getJwtSecret } from './lib/auth.js'
import { parsePositiveInt, parseNonEmptyString, parseOptionalString, parseOptionalInt } from './lib/utils.js'

const admin = new Hono()

// 管理员验证中间件
async function adminAuth(c, next) {
  try {
    const secret = getJwtSecret(c)
    // 手动校验 JWT（因为默认中间件可能已挂载，这里再做角色检查）
    const payload = c.get('jwtPayload')
    if (!payload || payload.role !== 'admin') {
      return c.json({ error: '需要管理员权限' }, 403)
    }
    await next()
  } catch (e) {
    return c.json({ error: e.message || '权限认证失败' }, 500)
  }
}

admin.use('*', jwt({ secret: getJwtSecret }), adminAuth)

// ===== 广告管理 =====
// GET /ads 广告列表
admin.get('/ads', async (c) => {
  try {
    const page = Math.max(1, parsePositiveInt(c.req.query('page') || '1', 'page'))
    const limit = Math.min(100, Math.max(1, parsePositiveInt(c.req.query('limit') || '20', 'limit')))
    const offset = (page - 1) * limit

    const { results: totalResult } = await c.env.DB.prepare('SELECT COUNT(*) as total FROM ads').all()
    const total = totalResult[0]?.total || 0

    const { results } = await c.env.DB.prepare('SELECT * FROM ads ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(limit, offset).all()
    return c.json({ ads: results, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
  } catch (e) {
    return c.json({ error: e.message || '获取广告列表失败' }, 500)
  }
})

// POST /ads 创建广告
admin.post('/ads', async (c) => {
  try {
    const body = await c.req.json()
    const title = parseNonEmptyString(body.title, '广告标题')
    const description = parseOptionalString(body.description) || ''
    const image_url = parseOptionalString(body.image_url) || ''
    const target_url = parseOptionalString(body.target_url) || ''
    const placement = parseOptionalString(body.placement) || 'home'
    const priority = body.priority !== undefined ? parsePositiveInt(body.priority, 'priority') : 0
    const duration = body.duration !== undefined ? parsePositiveInt(body.duration, 'duration') : 6

    const { meta } = await c.env.DB.prepare(
      'INSERT INTO ads (title, description, image_url, target_url, placement, priority, duration) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(title, description, image_url, target_url, placement, priority, duration).run()

    return c.json({ message: '广告创建成功', id: meta.last_row_id }, 201)
  } catch (e) {
    return c.json({ error: e.message || '创建广告失败' }, 400)
  }
})

// PUT /ads/:id 更新广告
admin.put('/ads/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()

    const { results: existing } = await c.env.DB.prepare('SELECT id FROM ads WHERE id = ?').bind(id).all()
    if (existing.length === 0) return c.json({ error: '广告不存在' }, 404)

    const title = parseNonEmptyString(body.title, '广告标题')
    const description = parseOptionalString(body.description) || ''
    const image_url = parseOptionalString(body.image_url) || ''
    const target_url = parseOptionalString(body.target_url) || ''
    const placement = parseOptionalString(body.placement) || 'home'
    const priority = body.priority !== undefined ? parsePositiveInt(body.priority, 'priority') : 0
    const enabled = body.enabled !== undefined ? (body.enabled ? 1 : 0) : 1
    const start_time = body.start_time || null
    const end_time = body.end_time || null
    const duration = body.duration !== undefined ? parsePositiveInt(body.duration, 'duration') : 6

    await c.env.DB.prepare(
      'UPDATE ads SET title=?, description=?, image_url=?, target_url=?, placement=?, priority=?, enabled=?, start_time=?, end_time=?, duration=? WHERE id=?'
    ).bind(title, description, image_url, target_url, placement, priority, enabled, start_time, end_time, duration, id).run()

    return c.json({ message: '广告更新成功' })
  } catch (e) {
    return c.json({ error: e.message || '更新广告失败' }, 400)
  }
})

// DELETE /ads/:id 删除广告
admin.delete('/ads/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { results: existing } = await c.env.DB.prepare('SELECT id FROM ads WHERE id = ?').bind(id).all()
    if (existing.length === 0) return c.json({ error: '广告不存在' }, 404)

    await c.env.DB.prepare('DELETE FROM ads WHERE id = ?').bind(id).run()
    await c.env.DB.prepare('DELETE FROM ad_logs WHERE ad_id = ?').bind(id).run()
    return c.json({ message: '广告已删除' })
  } catch (e) {
    return c.json({ error: e.message || '删除广告失败' }, 500)
  }
})

// GET /ads/stats 广告统计
admin.get('/ads/stats', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT a.id, a.title, a.placement, a.enabled,
             (SELECT COUNT(*) FROM ad_logs WHERE ad_id = a.id) as view_count
      FROM ads a ORDER BY view_count DESC
    `).all()
    return c.json({ stats: results })
  } catch (e) {
    return c.json({ error: e.message || '获取广告统计失败' }, 500)
  }
})

// ===== 分类管理 =====
// GET /categories 分类列表
admin.get('/categories', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT DISTINCT category FROM repositories WHERE category IS NOT NULL AND category != \'\' ORDER BY category'
    ).all()
    return c.json({ categories: results.map(r => r.category) })
  } catch (e) {
    return c.json({ error: e.message || '获取分类列表失败' }, 500)
  }
})

// POST /categories 添加分类
admin.post('/categories', async (c) => {
  try {
    const { name } = await c.req.json()
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return c.json({ error: '分类名称不能为空' }, 400)
    }
    return c.json({ message: `分类 ${name.trim()} 已添加，将在下次抓取时生效` })
  } catch (e) {
    return c.json({ error: e.message || '添加分类失败' }, 400)
  }
})

// ===== 项目管理 =====
// GET /repos 仓库列表（管理端）
admin.get('/repos', async (c) => {
  try {
    const page = Math.max(1, parsePositiveInt(c.req.query('page') || '1', 'page'))
    const limit = Math.min(200, Math.max(1, parsePositiveInt(c.req.query('limit') || '50', 'limit')))
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
  } catch (e) {
    return c.json({ error: e.message || '获取仓库列表失败' }, 500)
  }
})

// PUT /repos/:id 更新仓库
admin.put('/repos/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()

    const { results: existing } = await c.env.DB.prepare('SELECT id FROM repositories WHERE id = ?').bind(id).all()
    if (existing.length === 0) return c.json({ error: '仓库不存在' }, 404)

    const category = body.category !== undefined ? parseOptionalString(body.category) : undefined
    const description_zh = body.description_zh !== undefined ? parseOptionalString(body.description_zh) : undefined
    const ai_summary = body.ai_summary !== undefined ? parseOptionalString(body.ai_summary) : undefined
    const ai_tags = body.ai_tags !== undefined ? parseOptionalString(body.ai_tags) : undefined
    const language = body.language !== undefined ? parseOptionalString(body.language) : undefined

    await c.env.DB.prepare(
      'UPDATE repositories SET category=COALESCE(?,category), description_zh=COALESCE(?,description_zh), ai_summary=COALESCE(?,ai_summary), ai_tags=COALESCE(?,ai_tags), language=COALESCE(?,language) WHERE id=?'
    ).bind(category || null, description_zh || null, ai_summary || null, ai_tags || null, language || null, id).run()

    return c.json({ message: '仓库更新成功' })
  } catch (e) {
    return c.json({ error: e.message || '更新仓库失败' }, 400)
  }
})

// DELETE /repos/:id 删除仓库
admin.delete('/repos/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { results: existing } = await c.env.DB.prepare('SELECT id FROM repositories WHERE id = ?').bind(id).all()
    if (existing.length === 0) return c.json({ error: '仓库不存在' }, 404)

    await c.env.DB.prepare('DELETE FROM favorites WHERE repo_id = ?').bind(id).run()
    await c.env.DB.prepare('DELETE FROM repositories WHERE id = ?').bind(id).run()
    return c.json({ message: '仓库已删除' })
  } catch (e) {
    return c.json({ error: e.message || '删除仓库失败' }, 500)
  }
})

// ===== 用户管理 =====
// GET /users 用户列表
admin.get('/users', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, email, nickname, role, created_at FROM users ORDER BY created_at DESC'
    ).all()
    return c.json({ users: results })
  } catch (e) {
    return c.json({ error: e.message || '获取用户列表失败' }, 500)
  }
})

// PUT /users/:id 更新用户角色
admin.put('/users/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { role } = await c.req.json()
    if (!role || !['user', 'admin'].includes(role)) return c.json({ error: '无效的角色，仅支持 user 或 admin' }, 400)

    await c.env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, id).run()
    return c.json({ message: '用户角色更新成功' })
  } catch (e) {
    return c.json({ error: e.message || '更新用户角色失败' }, 400)
  }
})

// ===== 仪表盘 =====
// GET /dashboard 仪表盘数据
admin.get('/dashboard', async (c) => {
  try {
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
  } catch (e) {
    return c.json({ error: e.message || '获取仪表盘数据失败' }, 500)
  }
})

export default admin