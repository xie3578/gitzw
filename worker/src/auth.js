import { Hono } from 'hono'
import { sign, verify } from 'hono/jwt'
import bcrypt from 'bcryptjs'

const auth = new Hono()

// 工具：生成 JWT
async function generateToken(user, env) {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role || 'user',
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600, // 7天过期
  }
  return await sign(payload, env.JWT_SECRET || 'secret')
}

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

// POST /register - 注册
auth.post('/register', async (c) => {
  const { email, password, nickname } = await c.req.json()
  if (!email || !password) return c.json({ error: '邮箱和密码不能为空' }, 400)
  if (password.length < 6) return c.json({ error: '密码至少6位' }, 400)

  // 检查邮箱是否已注册
  const { results: existing } = await c.env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email).all()
  if (existing.length > 0) return c.json({ error: '该邮箱已注册' }, 409)

  // 加密密码
  const salt = bcrypt.genSaltSync(10)
  const passwordHash = bcrypt.hashSync(password, salt)
  const nick = nickname || email.split('@')[0]

  // 插入用户
  const { meta } = await c.env.DB.prepare(
    'INSERT INTO users (email, password_hash, nickname) VALUES (?, ?, ?)'
  ).bind(email, passwordHash, nick).run()

  const token = await generateToken({ id: meta.last_row_id, email, role: 'user' }, c.env)
  return c.json({ token, user: { id: meta.last_row_id, email, nickname: nick, role: 'user' } }, 201)
})

// POST /login - 登录
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json()
  if (!email || !password) return c.json({ error: '邮箱和密码不能为空' }, 400)

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM users WHERE email = ?'
  ).bind(email).all()
  if (results.length === 0) return c.json({ error: '邮箱或密码错误' }, 401)

  const user = results[0]
  const valid = bcrypt.compareSync(password, user.password_hash)
  if (!valid) return c.json({ error: '邮箱或密码错误' }, 401)

  const token = await generateToken(user, c.env)
  return c.json({
    token,
    user: { id: user.id, email: user.email, nickname: user.nickname, avatar: user.avatar, role: user.role }
  })
})

// POST /logout - 登出（前端清除 token 即可）
auth.post('/logout', (c) => {
  return c.json({ message: '已登出' })
})

// PATCH /password - 修改密码（需登录）
auth.patch('/password', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ error: '未登录' }, 401)
  try {
    const token = authHeader.slice(7)
    const payload = await verify(token, c.env.JWT_SECRET || 'secret')
    const { oldPassword, newPassword } = await c.req.json()
    if (!oldPassword || !newPassword) return c.json({ error: '旧密码和新密码不能为空' }, 400)
    if (newPassword.length < 6) return c.json({ error: '新密码至少6位' }, 400)

    const { results } = await c.env.DB.prepare(
      'SELECT password_hash FROM users WHERE id = ?'
    ).bind(payload.userId).all()
    if (results.length === 0) return c.json({ error: '用户不存在' }, 404)

    const valid = bcrypt.compareSync(oldPassword, results[0].password_hash)
    if (!valid) return c.json({ error: '旧密码错误' }, 400)

    const salt = bcrypt.genSaltSync(10)
    const newHash = bcrypt.hashSync(newPassword, salt)
    await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(newHash, payload.userId).run()
    return c.json({ message: '密码修改成功' })
  } catch (e) {
    return c.json({ error: '未授权或登录已过期' }, 401)
  }
})

// PATCH /email - 绑定/修改邮箱（需登录）
auth.patch('/email', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ error: '未登录' }, 401)
  try {
    const token = authHeader.slice(7)
    const payload = await verify(token, c.env.JWT_SECRET || 'secret')
    const { newEmail } = await c.req.json()
    if (!newEmail) return c.json({ error: '新邮箱不能为空' }, 400)

    // 检查新邮箱是否已被使用
    const { results: existing } = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ? AND id != ?'
    ).bind(newEmail, payload.userId).all()
    if (existing.length > 0) return c.json({ error: '该邮箱已被使用' }, 409)

    await c.env.DB.prepare('UPDATE users SET email = ? WHERE id = ?')
      .bind(newEmail, payload.userId).run()
    return c.json({ message: '邮箱修改成功', email: newEmail })
  } catch (e) {
    return c.json({ error: '未授权或登录已过期' }, 401)
  }
})

// PATCH /subscription - 设置订阅（需登录）
auth.patch('/subscription', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ error: '未登录' }, 401)
  try {
    const token = authHeader.slice(7)
    const payload = await verify(token, c.env.JWT_SECRET || 'secret')
    const { type, value } = await c.req.json()
    if (!type || !value) return c.json({ error: '订阅类型和值不能为空' }, 400)

    // 先检查是否已有同类型订阅
    const { results: existing } = await c.env.DB.prepare(
      'SELECT id FROM subscriptions WHERE user_id = ? AND type = ?'
    ).bind(payload.userId, type).all()
    if (existing.length > 0) {
      await c.env.DB.prepare('UPDATE subscriptions SET value = ? WHERE id = ?')
        .bind(value, existing[0].id).run()
    } else {
      await c.env.DB.prepare('INSERT INTO subscriptions (user_id, type, value) VALUES (?, ?, ?)')
        .bind(payload.userId, type, value).run()
    }
    return c.json({ message: '订阅设置成功' })
  } catch (e) {
    return c.json({ error: '未授权或登录已过期' }, 401)
  }
})

// GET /subscription - 获取用户订阅列表（需登录）
auth.get('/subscription', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ error: '未登录' }, 401)
  try {
    const token = authHeader.slice(7)
    const payload = await verify(token, c.env.JWT_SECRET || 'secret')
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM subscriptions WHERE user_id = ?'
    ).bind(payload.userId).all()
    return c.json({ subscriptions: results })
  } catch (e) {
    return c.json({ error: '未授权或登录已过期' }, 401)
  }
})

export default auth
