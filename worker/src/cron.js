import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { fetchWithTimeout } from './lib/utils.js'

const MAX_REPOS = 50

// GitHub Trending 抓取（支持中英文）
async function fetchTrending(language = '', since = 'daily') {
  const langParam = language ? `/${language}` : ''
  const url = `https://github.com/trending${langParam}?since=${since}`

  const response = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
  })

  if (!response.ok) {
    throw new Error(`GitHub Trending 返回 ${response.status}`)
  }

  const html = await response.text()
  const repos = parseTrendingHTML(html)
  return repos.slice(0, MAX_REPOS)
}

// 解析 GitHub Trending 页面的 HTML
function parseTrendingHTML(html) {
  const repos = []

  // 匹配每个仓库卡片
  const articleRegex = /<article\s+class="Box-row"[^>]*>([\s\S]*?)<\/article>/g
  let match

  while ((match = articleRegex.exec(html)) !== null) {
    const card = match[1]
    const repo = {}

    // 仓库全名（owner/repo）
    const nameMatch = card.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="\/([^"]+)"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/)
    if (nameMatch) {
      repo.full_name = (nameMatch[2].trim() + '/' + nameMatch[3].trim()).replace(/\s+/g, '')
    } else {
      const altMatch = card.match(/href="\/([^"]+)"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/)
      if (altMatch) {
        repo.full_name = altMatch[1].trim()
      }
    }

    if (!repo.full_name) continue

    const parts = repo.full_name.split('/')
    repo.owner = parts[0]?.trim() || ''
    repo.repo_name = parts[1]?.trim() || ''

    // 描述
    const descMatch = card.match(/<p class="col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/)
    if (descMatch) {
      repo.description_en = descMatch[1].replace(/<[^>]*>/g, '').trim()
    }

    // 编程语言
    const langMatch = card.match(/<span itemprop="programmingLanguage"[^>]*>([\s\S]*?)<\/span>/)
    if (langMatch) {
      repo.language = langMatch[1].trim()
    }

    // Star 数
    const starMatch = card.match(/<a[^>]*href="\/[^"]+\/stargazers"[^>]*>[\s\S]*?<svg[^>]*>[\s\S]*?<\/svg>\s*([\d,]+)/)
    if (starMatch) {
      repo.stars = parseInt(starMatch[1].replace(/,/g, '')) || 0
    }

    // Fork 数
    const forkMatch = card.match(/<a[^>]*href="\/[^"]+\/forks"[^>]*>[\s\S]*?<svg[^>]*>[\s\S]*?<\/svg>\s*([\d,]+)/)
    if (forkMatch) {
      repo.forks = parseInt(forkMatch[1].replace(/,/g, '')) || 0
    }

    // 今日 Star 增长
    const todayMatch = card.match(/<span class="d-inline-block float-sm-right"[^>]*>[\s\S]*?([\d,]+)\s*stars\s*today/)
    if (todayMatch) {
      repo.stars_today = parseInt(todayMatch[1].replace(/,/g, '')) || 0
    }

    // 开发者
    const devMatch = card.match(/href="\/([^"]+)"[^>]*>\s*<img[^>]*class="avatar[^"]*"/)
    if (devMatch) {
      repo.developer_github = devMatch[1]
    }

    repo.github_url = `https://github.com/${repo.full_name}`
    repo.github_id = 0

    repos.push(repo)
  }

  return repos
}
// 通过 GitHub API 补全仓库数据
async function enrichRepoData(repo, env) {
  try {
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'gitzw-crawler',
    }
    // 如果配置了 GITHUB_TOKEN 则使用（提高速率限制）
    if (env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${env.GITHUB_TOKEN}`
    }

    const response = await fetchWithTimeout(`https://api.github.com/repos/${repo.full_name}`, { headers })
    if (!response.ok) return repo

    const data = await response.json()
    repo.github_id = data.id
    repo.stars = data.stargazers_count || repo.stars
    repo.forks = data.forks_count || repo.forks

    // 开发者信息
    if (data.owner) {
      repo.developer_github = data.owner.login
      repo.owner = data.owner.login

      const { results: devs } = await env.DB.prepare(
        'SELECT id FROM developers WHERE github_login = ?'
      ).bind(data.owner.login).all()

      if (devs.length > 0) {
        repo.developer_id = devs[0].id
      } else {
        const devResponse = await fetchWithTimeout(`https://api.github.com/users/${data.owner.login}`, { headers })
        if (devResponse.ok) {
          const devData = await devResponse.json()
          const { meta } = await env.DB.prepare(
            'INSERT INTO developers (github_login, avatar_url, profile_url, bio_en, followers, company, location) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).bind(
            devData.login, devData.avatar_url, devData.html_url,
            devData.bio || '', devData.followers || 0,
            devData.company || '', devData.location || ''
          ).run()
          repo.developer_id = meta.last_row_id
        }
      }
    }

    return repo
  } catch {
    return repo
  }
}
// AI 翻译（使用 OpenAI）
async function aiTranslate(text, apiKey) {
  if (!text || !apiKey) return { translated: '', tags: '', summary: '' }

  try {
    const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{
          role: 'system',
          content: '你是一个帮助中文用户了解GitHub热门项目的助手。请将以下英文仓库描述翻译成中文，提取3-5个中文标签（逗号分隔），并用一句话总结这个仓库的用途。JSON格式返回：{"description_zh":"中文翻译","tags":"标签1,标签2,标签3","summary":"一句话总结"}'
        }, {
          role: 'user',
          content: `仓库描述：${text.slice(0, 500)}`
        }],
        temperature: 0.3,
        max_tokens: 300,
      })
    })

    if (!response.ok) return { translated: '', tags: '', summary: '' }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    try {
      const parsed = JSON.parse(content)
      return {
        translated: parsed.description_zh || '',
        tags: parsed.tags || '',
        summary: parsed.summary || '',
      }
    } catch {
      return { translated: content.slice(0, 200), tags: '', summary: '' }
    }
  } catch {
    return { translated: '', tags: '', summary: '' }
  }
}

// 将仓库数据写入 D1
async function upsertRepo(repo, env) {
  const existing = await env.DB.prepare(
    'SELECT id FROM repositories WHERE full_name = ?'
  ).bind(repo.full_name).all()

  if (existing.results.length > 0) {
    await env.DB.prepare(
      `UPDATE repositories SET 
        stars=?, forks=?, stars_today=?, description_en=?,
        language=?, updated_at=CURRENT_TIMESTAMP
       WHERE full_name=?`
    ).bind(
      repo.stars, repo.forks, repo.stars_today,
      repo.description_en || '', repo.language || '',
      repo.full_name
    ).run()
  } else {
    await env.DB.prepare(
      `INSERT INTO repositories 
       (github_id, full_name, owner, repo_name, description_en,
        description_zh, ai_summary, ai_tags, language, category,
        stars, forks, stars_today, github_url, developer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      repo.github_id || 0, repo.full_name, repo.owner, repo.repo_name,
      repo.description_en || '', repo.description_zh || '',
      repo.ai_summary || '', repo.ai_tags || '',
      repo.language || '', repo.category || '',
      repo.stars || 0, repo.forks || 0, repo.stars_today || 0,
      repo.github_url || '', repo.developer_id || null
    ).run()
  }
}

// ========== 管理员初始化（密码 hash 后落库） ==========
async function ensureAdmin(env) {
  const email = env.ADMIN_EMAIL
  const password = env.ADMIN_PASSWORD
  if (!email || !password) {
    console.warn('⚠️ ADMIN_EMAIL 或 ADMIN_PASSWORD 环境变量未设置，跳过管理员初始化')
    return
  }

  try {
    // 检查是否已有管理员
    const { results } = await env.DB.prepare(
      'SELECT id FROM users WHERE role = ? LIMIT 1'
    ).bind('admin').all()

    if (results.length > 0) {
      // 管理员已存在，无需重复创建
      return
    }

    // 密码 hash 处理（同步 bcrypt 不行，用异步）
    const salt = await bcrypt.genSalt(10)
    const passwordHash = await bcrypt.hash(password, salt)
    const nickname = '管理员'

    const { meta } = await env.DB.prepare(
      'INSERT INTO users (email, password_hash, nickname, role) VALUES (?, ?, ?, ?)'
    ).bind(email, passwordHash, nickname, 'admin').run()

    console.log(`✅ 管理员账号已初始化: ${email} (id=${meta.last_row_id})`)
  } catch (e) {
    console.error('管理员初始化失败:', e)
  }
}

// ========== 抓取日志管理 ==========

async function createFetchLog(env, status) {
  const sql = `INSERT INTO fetch_logs (status, started_at, next_scheduled_at) VALUES (?, datetime('now'), datetime('now', '+3 hours'))`
  const { meta } = await env.DB.prepare(sql).bind(status).run()
  return meta.last_row_id
}

async function updateFetchLog(env, id, updates) {
  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ')
  const vals = Object.values(updates)
  await env.DB.prepare(`UPDATE fetch_logs SET ${sets} WHERE id = ?`).bind(...vals, id).run()
}

async function getLatestFetchLog(env) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM fetch_logs ORDER BY id DESC LIMIT 1'
  ).all()
  return results[0] || null
}

// 执行一次完整抓取（通用函数，供 cron 和 API 共用）
async function executeFetch(env, isNewOnly) {
  // 记录开始
  const logId = await createFetchLog(env, 'running')

  try {
    const repos = await fetchTrending('', 'daily')
    let successCount = 0
    let translateCount = 0

    for (const repo of repos) {
      try {
        const enriched = await enrichRepoData(repo, env)

        // 检查是否已存在（新仓库才调用 AI，避免重复翻译浪费成本）
        const existing = await env.DB.prepare(
          'SELECT id, ai_summary, ai_tags FROM repositories WHERE full_name = ?'
        ).bind(enriched.full_name).all()
        const isNew = existing.results.length === 0

        if (isNew && env.OPENAI_API_KEY && enriched.description_en) {
          const aiResult = await aiTranslate(enriched.description_en, env.OPENAI_API_KEY)
          if (aiResult.translated) {
            enriched.description_zh = aiResult.translated
            enriched.ai_tags = aiResult.tags
            enriched.ai_summary = aiResult.summary
            translateCount++
          }
        } else if (!isNew && existing.results[0]?.ai_summary) {
          // 已有 AI 摘要的仓库保留原数据
          enriched.description_zh = undefined
          enriched.ai_tags = undefined
          enriched.ai_summary = undefined
        }

        await upsertRepo(enriched, env)
        successCount++
      } catch (err) {
        console.error(`处理仓库 ${repo.full_name} 失败:`, err)
      }
    }

    // 更新日志为成功
    await updateFetchLog(env, logId, {
      status: 'success',
      finished_at: new Date().toISOString(),
      repositories_count: successCount,
      next_scheduled_at: new Date(Date.now() + 3 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19)
    })

    console.log(`Cron 完成: 成功处理 ${successCount}/${repos.length} 个仓库，翻译 ${translateCount} 个`)

    return { total: repos.length, success: successCount, translated: translateCount }
  } catch (err) {
    console.error('抓取失败:', err)
    await updateFetchLog(env, logId, {
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_message: err.message,
      next_scheduled_at: new Date(Date.now() + 3 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19)
    })
    throw err
  }
}

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

// Cron 定时触发器入口（每 3 小时）
export async function scheduled(event, env, ctx) {
  console.log('Cron 触发: 开始抓取 GitHub Trending')
  ctx.waitUntil(Promise.all([
    ensureAdmin(env),
    executeFetch(env, false)
  ]))
}

export default cron
