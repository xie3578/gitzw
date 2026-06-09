import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { jwt } from 'hono/jwt'
import auth from './auth'
import repos from './repos'
import favorites from './favorites'
import ads from './ads'
import admin from './admin'
import cron from './cron'

const app = new Hono()

// CORS 中间件
app.use('*', cors({
  origin: '*',
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

// JWT 中间件（需要登录的路由）
const authMiddleware = jwt({
  secret: (c) => c.env.JWT_SECRET || 'secret',
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
  const payload = c.get('jwtPayload')
  const { results } = await c.env.DB.prepare(
    'SELECT id, email, nickname, avatar, role, created_at FROM users WHERE id = ?'
  ).bind(payload.userId).all()
  if (results.length === 0) return c.json({ error: '用户不存在' }, 404)
  return c.json({ user: results[0] })
})

// 全局错误处理
app.onError((err, c) => {
  console.error('Error:', err)
  if (err.message?.includes('JWT')) {
    return c.json({ error: '未授权或登录已过期' }, 401)
  }
  return c.json({ error: err.message || '服务器内部错误' }, 500)
})

// 404
app.notFound((c) => c.json({ error: '接口不存在' }, 404))

export default app
