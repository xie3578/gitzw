import { Hono } from 'hono'
import { verify } from 'hono/jwt'
import { getJwtSecret } from './lib/auth.js'
import { parsePage, parseLimit } from './lib/utils.js'

// 工具：从请求头解析 token 获取用户（可选登录）
async function getOptionalUser(c) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  try {
    const token = authHeader.slice(7)
    const secret = getJwtSecret(c)
    const payload = await verify(token, secret)
    return payload
  } catch {
    return null
  }
}

const repos = new Hono()

// GET / 仓库列表（支持分页、语言筛选、关键词搜索）
repos.get('/', async (c) => {
  try {
    const page = parsePage(c.req.query('page'))
    const limit = parseLimit(c.req.query('limit'), 100)
    const language = c.req.query('language')
    const keyword = c.req.query('keyword')
    const offset = (page - 1) * limit

    // keyword 长度限制
    if (keyword && typeof keyword === 'string' && keyword.length > 200) {
      return c.json({ error: '关键词长度不能超过 200 字符' }, 400)
    }

    let where = 'WHERE 1=1'
    const params = []

    if (language) {
      if (typeof language !== 'string' || language.length > 50) {
        return c.json({ error: 'language 参数格式不正确' }, 400)
      }
      where += ' AND r.language = ?'
      params.push(language.trim())
    }
    if (keyword && typeof keyword === 'string') {
      where += ' AND (r.full_name LIKE ? OR r.description_en LIKE ? OR r.description_zh LIKE ? OR r.ai_summary LIKE ?)'
      const kw = `%${keyword.trim()}%`
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
  } catch (e) {
    return c.json({ error: e.message || '获取仓库列表失败' }, 500)
  }
})

// GET /languages 获取所有语言列表（用于筛选）
repos.get('/languages', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT DISTINCT language FROM repositories WHERE language IS NOT NULL AND language != \'\' ORDER BY language'
    ).all()
    return c.json({ languages: results.map(r => r.language) })
  } catch (e) {
    return c.json({ error: e.message || '获取语言列表失败' }, 500)
  }
})

// GET /:id 仓库详情
repos.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    if (!id || id.length > 50) return c.json({ error: '无效的仓库 ID' }, 400)

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
    if (user && user.userId) {
      const { results: fav } = await c.env.DB.prepare(
        'SELECT id FROM favorites WHERE user_id = ? AND repo_id = ?'
      ).bind(user.userId, repo.id).all()
      isFavorited = fav.length > 0
    }

    // 开发者地址可见性
    const devUrlVisible = repo.dev_url_visible_for_guests === 1

    // 移除敏感字段
    delete repo.dev_url_visible_for_guests

    return c.json({
      repo: {
        ...repo,
        isFavorited,
        devUrlVisible,
        devUrl: (user || devUrlVisible) ? repo.profile_url : null
      }
    })
  } catch (e) {
    return c.json({ error: e.message || '获取仓库详情失败' }, 500)
  }
})

export default repos