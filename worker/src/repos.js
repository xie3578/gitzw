import { Hono } from 'hono'
import { verify } from 'hono/jwt'

const repos = new Hono()

// 工具：从请求头解析 token 获取用户（可选登录）
async function getOptionalUser(c) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  try {
    const token = authHeader.slice(7)
    const payload = await verify(token, c.env.JWT_SECRET || 'secret')
    return payload
  } catch {
    return null
  }
}

// GET / 仓库列表（支持分页、语言筛选、关键词搜索）
repos.get('/', async (c) => {
  const page = parseInt(c.req.query('page')) || 1
  const limit = parseInt(c.req.query('limit')) || 20
  const language = c.req.query('language')
  const keyword = c.req.query('keyword')
  const offset = (page - 1) * limit

  let where = 'WHERE 1=1'
  const params = []

  if (language) {
    where += ' AND r.language = ?'
    params.push(language)
  }
  if (keyword) {
    where += ' AND (r.full_name LIKE ? OR r.description_en LIKE ? OR r.description_zh LIKE ? OR r.ai_summary LIKE ?)'
    const kw = `%${keyword}%`
    params.push(kw, kw, kw, kw)
  }

  // 求总数
  const countSql = `SELECT COUNT(*) as total FROM repositories r ${where}`
  const { results: countResult } = await c.env.DB.prepare(countSql).bind(...params).all()
  const total = countResult[0]?.total || 0

  // 查询列表（带 developer 信息）
  const sql = `
    SELECT r.*, d.github_login, d.avatar_url, d.profile_url, d.bio_zh as dev_bio
    FROM repositories r
    LEFT JOIN developers d ON r.developer_id = d.id
    ${where}
    ORDER BY r.stars_today DESC, r.stars DESC
    LIMIT ? OFFSET ?
  `
  const { results } = await c.env.DB.prepare(sql).bind(...params, limit, offset).all()

  return c.json({
    repos: results,
    pagination: {
      page, limit, total,
      totalPages: Math.ceil(total / limit)
    }
  })
})

// GET /languages 获取所有语言列表（用于筛选）
repos.get('/languages', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT DISTINCT language FROM repositories WHERE language IS NOT NULL AND language != \'\' ORDER BY language'
  ).all()
  return c.json({ languages: results.map(r => r.language) })
})

// GET /:id 仓库详情
repos.get('/:id', async (c) => {
  const id = c.req.param('id')
  const user = await getOptionalUser(c)

  const { results } = await c.env.DB.prepare(`
    SELECT r.*, d.github_login, d.avatar_url, d.profile_url,
           d.bio_en, d.bio_zh, d.followers, d.company, d.location
    FROM repositories r
    LEFT JOIN developers d ON r.developer_id = d.id
    WHERE r.id = ? OR r.github_id = ?
  `).bind(id, id).all()

  if (results.length === 0) return c.json({ error: '仓库不存在' }, 404)

  const repo = results[0]

  // 判断是否已收藏
  let isFavorited = false
  if (user) {
    const { results: fav } = await c.env.DB.prepare(
      'SELECT id FROM favorites WHERE user_id = ? AND repo_id = ?'
    ).bind(user.userId, repo.id).all()
    isFavorited = fav.length > 0
  }

  // 开发者地址可见性：已登录用户直接可见，游客需要检查 dev_url_visible_for_guests
  const devUrlVisible = repo.dev_url_visible_for_guests === 1

  // 移除敏感字段
  delete repo.dev_url_visible_for_guests

  return c.json({
    repo: {
      ...repo,
      isFavorited,
      devUrlVisible,
      // 如果不可见且游客，隐藏开发者的profile_url
      devUrl: (user || devUrlVisible) ? repo.profile_url : null
    }
  })
})

export default repos
