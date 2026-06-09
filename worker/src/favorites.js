import { Hono } from 'hono'
import { jwt } from 'hono/jwt'

function getJwtSecret(c) {
  const secret = c.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET 环境变量未设置')
  return secret
}

const favorites = new Hono()

// 所有收藏接口都需要登录
favorites.use('*', jwt({ secret: getJwtSecret }))

// GET / 获取用户收藏列表
favorites.get('/', async (c) => {
  try {
    const payload = c.get('jwtPayload')
    if (!payload || !payload.userId) return c.json({ error: '未登录' }, 401)

    const { results } = await c.env.DB.prepare(`
      SELECT f.id as favorite_id, f.created_at as favorited_at,
             r.*, d.github_login, d.avatar_url, d.bio_zh as dev_bio
      FROM favorites f
      JOIN repositories r ON f.repo_id = r.id
      LEFT JOIN developers d ON r.developer_id = d.id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `).bind(payload.userId).all()
    return c.json({ favorites: results })
  } catch (e) {
    return c.json({ error: e.message || '获取收藏列表失败' }, 500)
  }
})

// POST / 收藏仓库
favorites.post('/', async (c) => {
  try {
    const payload = c.get('jwtPayload')
    if (!payload || !payload.userId) return c.json({ error: '未登录' }, 401)

    let repoId
    try {
      const body = await c.req.json()
      repoId = body.repoId
    } catch (_) {
      return c.json({ error: '请求体格式错误，需要有效的 JSON' }, 400)
    }

    // 类型校验
    if (!repoId || typeof repoId !== 'number' || !Number.isInteger(repoId) || repoId <= 0) {
      return c.json({ error: 'repoId 必须为正整数' }, 400)
    }

    // 检查是否已收藏
    const { results: existing } = await c.env.DB.prepare(
      'SELECT id FROM favorites WHERE user_id = ? AND repo_id = ?'
    ).bind(payload.userId, repoId).all()
    if (existing.length > 0) return c.json({ message: '已收藏', id: existing[0].id })

    // 检查仓库是否存在
    const { results: repo } = await c.env.DB.prepare(
      'SELECT id FROM repositories WHERE id = ?'
    ).bind(repoId).all()
    if (repo.length === 0) return c.json({ error: '仓库不存在' }, 404)

    const { meta } = await c.env.DB.prepare(
      'INSERT INTO favorites (user_id, repo_id) VALUES (?, ?)'
    ).bind(payload.userId, repoId).run()

    return c.json({ message: '收藏成功', id: meta.last_row_id }, 201)
  } catch (e) {
    return c.json({ error: e.message || '收藏失败' }, 500)
  }
})

// DELETE /:id 取消收藏
favorites.delete('/:id', async (c) => {
  try {
    const payload = c.get('jwtPayload')
    if (!payload || !payload.userId) return c.json({ error: '未登录' }, 401)

    const idStr = c.req.param('id')
    const id = parseInt(idStr, 10)
    if (isNaN(id) || id <= 0) return c.json({ error: '无效的收藏 ID' }, 400)

    const { results } = await c.env.DB.prepare(
      'SELECT id FROM favorites WHERE id = ? AND user_id = ?'
    ).bind(id, payload.userId).all()
    if (results.length === 0) return c.json({ error: '收藏记录不存在或无权操作' }, 404)

    await c.env.DB.prepare('DELETE FROM favorites WHERE id = ?').bind(id).run()
    return c.json({ message: '已取消收藏' })
  } catch (e) {
    return c.json({ error: e.message || '取消收藏失败' }, 500)
  }
})

export default favorites