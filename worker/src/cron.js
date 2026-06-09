import { Hono } from 'hono'
import {
  executeFetch,
  getLatestFetchLog,
  ensureAdmin,
  PRIVATE_REPOS
} from './cron_fns.js'

const cron = new Hono()

// GET /status 获取抓取状态信息
cron.get('/status', async (c) => {
  try {
    const log = await getLatestFetchLog(c.env)
    if (!log) {
      return c.json({
        lastFetch: null,
        nextFetch: null,
        interval: '3 hours',
        status: 'never'
      })
    }
    const nextFetch = log.next_scheduled_at ||
      new Date(Date.now() + 3 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19)
    return c.json({
      lastFetch: log.finished_at || log.started_at,
      nextFetch,
      interval: '3 hours',
      status: log.status,
      repositoriesCount: log.repositories_count,
      errorMessage: log.error_message || null
    })
  } catch (e) {
    return c.json({ error: '获取抓取状态失败' }, 500)
  }
})

// POST /fetch 手动触发抓取
cron.post('/fetch', async (c) => {
  try {
    const result = await executeFetch(c.env, false)
    return c.json({
      message: `抓取完成，成功处理 ${result.success}/${result.total} 个仓库`,
      ...result
    })
  } catch (err) {
    return c.json({ error: `抓取失败: ${err.message}` }, 500)
  }
})

export default cron
