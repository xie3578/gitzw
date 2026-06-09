import { Hono } from 'hono'
import { jwt } from 'hono/jwt'

const favorites = new Hono()

// 所有收藏接口都需要登录
favorites.use('*', jwt({ secret: (c) => c.env.JWT_SECRET || 'secret' }))

// GET / 获取用户收藏列表
favorites.get('/', async (c) => {
  const payload = c.get('jwtPayload')
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
})

// POST / 收藏仓库
favorites.post('/', async (c) => {
  const payload = c.get('jwtPayload')
  const { repoId } = await c.req.json()
  if (!repoId) return c.json({ error: 'repoId 不能为空' }, 400)

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
})

// DELETE /:id 取消收藏
favorites.delete('/:id', async (c) => {
  const payload = c.get('jwtPayload')
  const id = c.req.param('id')

  const { results } = await c.env.DB.prepare(
    'SELECT id FROM favorites WHERE id = ? AND user_id = ?'
  ).bind(id, payload.userId).all()
  if (results.length === 0) return c.json({ error: '收藏记录不存在或无权操作' }, 404)

  await c.env.DB.prepare('DELETE FROM favorites WHERE id = ?').bind(id).run()
  return c.json({ message: '已取消收藏' })
})

export default favorites
