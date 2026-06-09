import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { jwt } from 'hono/jwt'
import auth from './auth'
import repos from './repos'
import favorites from './favorites'
import ads from './ads'
import admin from './admin'
import cron from './cron'

function getJwtSecret(c) {
  const secret = c.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET 环境变量未设置')
  return secret
}

const app = new Hono()

// CORS 中间件 — 建议生产环境设置 c.env.CORS_ORIGIN 为实际域名
app.use('*', cors({
  origin: (c) => c.env.CORS_ORIGIN || '*',
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

// JWT 中间件（需要登录的路由）
const authMiddleware = jwt({
  secret: getJwtSecret,
})

// 健康检查
app.get('/api/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }))

// 注册路由模块
app.route('/api/auth', auth)
app.route('/api/repos', repos)
app.route('/api/favorites', favorites)
app.route('/api/ads', ads)
app.route('/api/admin', admin)
app.route('/api/cron', cron)

// 用户信息路由（需要JWT）
app.get('/api/user', authMiddleware, async (c) => {
  try {
    const payload = c.get('jwtPayload')
    if (!payload || !payload.userId) return c.json({ error: '未登录' }, 401)

    const { results } = await c.env.DB.prepare(
      'SELECT id, email, nickname, avatar, role, created_at FROM users WHERE id = ?'
    ).bind(payload.userId).all()
    if (results.length === 0) return c.json({ error: '用户不存在' }, 404)
    return c.json({ user: results[0] })
  } catch (e) {
    return c.json({ error: e.message || '获取用户信息失败' }, 500)
  }
})

// 全局错误处理
app.onError((err, c) => {
  console.error('Error:', err)
  const msg = err.message || ''
  if (msg.includes('JWT') || msg.includes('UNAUTHORIZED')) {
    return c.json({ error: '未授权或登录已过期' }, 401)
  }
  if (msg.includes('JWT_SECRET 环境变量未设置')) {
    return c.json({ error: '服务器配置错误：JWT_SECRET 未设置' }, 500)
  }
  return c.json({ error: msg || '服务器内部错误' }, 500)
})

// 404
app.notFound((c) => c.json({ error: '接口不存在' }, 404))

export default app