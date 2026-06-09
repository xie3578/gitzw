import { sign, verify } from 'hono/jwt'

/**
 * 认证相关共享工具函数
 */

/**
 * 从请求环境变量中安全获取 JWT_SECRET
 * @param {Object} c - Hono 请求上下文
 * @returns {string} JWT_SECRET 值
 * @throws {Error} 如果环境变量未设置
 */
export function getJwtSecret(c) {
  const secret = c.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET 环境变量未设置')
  return secret
}

/**
 * 验证请求体中必填字段是否存在
 * @param {string[]} fields - 必填字段名列表
 * @param {Object} body - 请求体对象
 * @returns {string|null} 错误信息或 null
 */
export function validateRequired(fields, body) {
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null) return `${field} 不能为空`
    if (typeof body[field] === 'string' && !body[field].trim()) return `${field} 不能为空`
  }
  return null
}

/**
 * 验证邮箱格式是否有效
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * 生成 JWT Token（有效期7天）
 * @param {Object} user - 用户对象 { id, email, role }
 * @param {Object} c - Hono 请求上下文
 * @returns {Promise<string>} JWT Token
 */
export async function generateToken(user, c) {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role || 'user',
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
  }
  return await sign(payload, getJwtSecret(c))
}

/**
 * 从请求头解析 JWT Token 获取用户（可选登录）
 * @param {Object} c - Hono 请求上下文
 * @returns {Promise<Object|null>} 用户 payload 或 null
 */
export async function getOptionalUser(c) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  try {
    const token = authHeader.slice(7)
    return await verify(token, getJwtSecret(c))
  } catch {
    return null
  }
}

/**
 * 强制获取已认证用户，未登录时抛错
 * @param {Object} c - Hono 请求上下文
 * @returns {Promise<Object>} 用户 payload
 * @throws {Error} 'UNAUTHORIZED'
 */
export async function getAuthUser(c) {
  const user = await getOptionalUser(c)
  if (!user) throw new Error('UNAUTHORIZED')
  return user
}
