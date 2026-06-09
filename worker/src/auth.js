import { Hono } from 'hono'
import { sign, verify } from 'hono/jwt'
import bcrypt from 'bcryptjs'

const auth = new Hono()

function getJwtSecret(c) {
  const secret = c.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET 环境变量未设置')
  return secret
}

async function generateToken(user, c) {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role || 'user',
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
  }
  return await sign(payload, getJwtSecret(c))
}

async function getOptionalUser(c) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  try {
    const token = authHeader.slice(7)
    return await verify(token, getJwtSecret(c))
  } catch {
    return null
  }
}

async function getAuthUser(c) {
  const user = await getOptionalUser(c)
  if (!user) throw new Error('UNAUTHORIZED')
  return user
}

function validateRequired(fields, body) {
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null) return `${field} 不能为空`
    if (typeof body[field] === 'string' && !body[field].trim()) return `${field} 不能为空`
  }
  return null
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// POST /register
auth.post('/register', async (c) => {
  try {
    const body = await c.req.json()
    const err = validateRequired(['email', 'password'], body)
    if (err) return c.json({ error: err }, 400)
    if (!isValidEmail(body.email)) return c.json({ error: '邮箱格式不正确' }, 400)
    if (body.password.length < 6) return c.json({ error: '密码至少6位' }, 400)

    const { email, password, nickname } = body

    const { results: existing } = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email).all()
    if (existing.length > 0) return c.json({ error: '该邮箱已注册' }, 409)

    const salt = await bcrypt.genSalt(10)
    const passwordHash = await bcrypt.hash(password, salt)
    const nick = (nickname || email.split('@')[0]).trim().slice(0, 50)

    const { meta } = await c.env.DB.prepare(
      'INSERT INTO users (email, password_hash, nickname) VALUES (?, ?, ?)'
    ).bind(email, passwordHash, nick).run()

    const token = await generateToken({ id: meta.last_row_id, email, role: 'user' }, c)
    return c.json({ token, user: { id: meta.last_row_id, email, nickname: nick, role: 'user' } }, 201)
  } catch (e) {
    console.error('Register error:', e)
    return c.json({ error: e.message === 'JWT_SECRET 环境变量未设置' ? '服务器配置错误' : '注册失败' }, 500)
  }
})

// POST /login
auth.post('/login', async (c) => {
  try {
    const body = await c.req.json()
    const err = validateRequired(['email', 'password'], body)
    if (err) return c.json({ error: err }, 400)

    const { email, password } = body
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(email).all()
    if (results.length === 0) return c.json({ error: '邮箱或密码错误' }, 401)

    const user = results[0]
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return c.json({ error: '邮箱或密码错误' }, 401)

    const token = await generateToken(user, c)
    return c.json({
      token,
      user: { id: user.id, email: user.email, nickname: user.nickname, avatar: user.avatar, role: user.role }
    })
  } catch (e) {
    console.error('Login error:', e)
    return c.json({ error: '登录失败' }, 500)
  }
})

// POST /logout
auth.post('/logout', (c) => c.json({ message: '已登出' }))

// PATCH /password
auth.patch('/password', async (c) => {
  try {
    const user = await getAuthUser(c)
    const body = await c.req.json()
    const err = validateRequired(['oldPassword', 'newPassword'], body)
    if (err) return c.json({ error: err }, 400)

    const { results } = await c.env.DB.prepare(
      'SELECT password_hash FROM users WHERE id = ?'
    ).bind(user.userId).all()
    if (results.length === 0) return c.json({ error: '用户不存在' }, 404)

    const valid = await bcrypt.compare(body.oldPassword, results[0].password_hash)
    if (!valid) return c.json({ error: '旧密码错误' }, 400)

    const salt = await bcrypt.genSalt(10)
    const newHash = await bcrypt.hash(body.newPassword, salt)
    await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(newHash, user.userId).run()
    return c.json({ message: '密码修改成功' })
  } catch (e) {
    return c.json({ error: e.message === 'UNAUTHORIZED' ? '未登录' : '修改密码失败' },
      e.message === 'UNAUTHORIZED' ? 401 : 500)
  }
})

// PATCH /email
auth.patch('/email', async (c) => {
  try {
    const user = await getAuthUser(c)
    const body = await c.req.json()
    if (!body.newEmail) return c.json({ error: '新邮箱不能为空' }, 400)
    if (!isValidEmail(body.newEmail)) return c.json({ error: '邮箱格式不正确' }, 400)

    const { results: existing } = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ? AND id != ?'
    ).bind(body.newEmail, user.userId).all()
    if (existing.length > 0) return c.json({ error: '该邮箱已被使用' }, 409)

    await c.env.DB.prepare('UPDATE users SET email = ? WHERE id = ?')
      .bind(body.newEmail, user.userId).run()
    return c.json({ message: '邮箱修改成功', email: body.newEmail })
  } catch (e) {
    return c.json({ error: e.message === 'UNAUTHORIZED' ? '未登录' : '修改邮箱失败' },
      e.message === 'UNAUTHORIZED' ? 401 : 500)
  }
})

// PATCH /subscription
auth.patch('/subscription', async (c) => {
  try {
    const user = await getAuthUser(c)
    const body = await c.req.json()
    const err = validateRequired(['type', 'value'], body)
    if (err) return c.json({ error: err }, 400)
    if (!['daily', 'weekly', 'language'].includes(body.type)) return c.json({ error: '无效的订阅类型' }, 400)

    const { results: existing } = await c.env.DB.prepare(
      'SELECT id FROM subscriptions WHERE user_id = ? AND type = ?'
    ).bind(user.userId, body.type).all()
    if (existing.length > 0) {
      await c.env.DB.prepare('UPDATE subscriptions SET value = ? WHERE id = ?')
        .bind(body.value, existing[0].id).run()
    } else {
      await c.env.DB.prepare('INSERT INTO subscriptions (user_id, type, value) VALUES (?, ?, ?)')
        .bind(user.userId, body.type, body.value).run()
    }
    return c.json({ message: '订阅设置成功' })
  } catch (e) {
    return c.json({ error: e.message === 'UNAUTHORIZED' ? '未登录' : '设置订阅失败' },
      e.message === 'UNAUTHORIZED' ? 401 : 500)
  }
})

// GET /subscription
auth.get('/subscription', async (c) => {
  try {
    const user = await getAuthUser(c)
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM subscriptions WHERE user_id = ?'
    ).bind(user.userId).all()
    return c.json({ subscriptions: results })
  } catch (e) {
    return c.json({ error: e.message === 'UNAUTHORIZED' ? '未登录' : '获取订阅失败' },
      e.message === 'UNAUTHORIZED' ? 401 : 500)
  }
})

export default auth