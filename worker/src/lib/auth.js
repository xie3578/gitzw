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
