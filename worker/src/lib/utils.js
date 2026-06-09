/**
 * 通用工具函数共享模块
 */

export const FETCH_TIMEOUT_MS = 15000

/**
 * 带超时控制的 fetch 请求
 * @param {string} url
 * @param {Object} options
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal })
    return resp
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 解析正整数（含0）
 * @param {*} val
 * @param {string} fieldName
 * @returns {number}
 */
export function parsePositiveInt(val, fieldName) {
  const n = parseInt(val, 10)
  if (isNaN(n) || n < 0) throw new Error(`${fieldName} 必须是非负整数`)
  return n
}

/**
 * 解析非空字符串
 * @param {*} val
 * @param {string} fieldName
 * @returns {string}
 */
export function parseNonEmptyString(val, fieldName) {
  if (typeof val !== 'string' || val.trim().length === 0) throw new Error(`${fieldName} 不能为空`)
  return val.trim()
}

/**
 * 可选字符串解析
 * @param {*} val
 * @returns {string|null}
 */
export function parseOptionalString(val) {
  if (!val || typeof val !== 'string') return null
  return val.trim()
}

/**
 * 可选数字解析
 * @param {*} val
 * @returns {number|undefined}
 */
export function parseOptionalInt(val) {
  if (val === undefined || val === null) return undefined
  const n = parseInt(val, 10)
  if (isNaN(n)) throw new Error('字段格式不正确')
  return n
}

/**
 * 解析分页 page 参数
 * @param {*} val
 * @returns {number}
 */
export function parsePage(val) {
  const n = parseInt(val, 10)
  if (isNaN(n) || n < 1) return 1
  return n
}

/**
 * 解析分页 limit 参数
 * @param {*} val
 * @param {number} max
 * @returns {number}
 */
export function parseLimit(val, max = 100) {
  const n = parseInt(val, 10)
  if (isNaN(n) || n < 1) return 20
  return Math.min(n, max)
}
