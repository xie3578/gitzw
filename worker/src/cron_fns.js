import bcrypt from 'bcryptjs'
import { fetchWithTimeout } from './lib/utils.js'

// ========== 私有仓库列表（可改为从环境变量读取） ==========
export const PRIVATE_REPOS = [
  "xie3578/gitzw"
  // 未来可在此追加更多私有仓库
]

// ========== 通过 GitHub API 获取单个私有仓库数据 ==========
export async function fetchPrivateRepo(fullName, token) {
  const url = `https://api.github.com/repos/${fullName}`
  const response = await fetchWithTimeout(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'gitzw-crawler',
    }
  })
  if (!response.ok) {
    throw new Error(`GitHub API 返回 ${response.status} for ${fullName}`)
  }
  const data = await response.json()
  return {
    full_name: data.full_name,
    owner: data.owner.login,
    repo_name: data.name,
    description_en: data.description || '',
    language: data.language || '',
    stars: data.stargazers_count || 0,
    forks: data.forks_count || 0,
    stars_today: 0,
    github_id: data.id,
    github_url: data.html_url,
    developer_github: data.owner.login,
  }
}

// AI 翻译（使用 OpenAI）
export async function aiTranslate(text, apiKey) {
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
          content: '你是一个帮助中文用户了解GitHub项目的助手。请将以下英文仓库描述翻译成中文，提取3-5个中文标签（逗号分隔），并用一句话总结这个仓库的用途。JSON格式返回：{"description_zh":"中文翻译","tags":"标签1,标签2,标签3","summary":"一句话总结"}'
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
export async function upsertRepo(repo, env) {
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
export async function ensureAdmin(env) {
  const email = env.ADMIN_EMAIL
  const password = env.ADMIN_PASSWORD
  if (!email || !password) {
    console.warn('⚠️ ADMIN_EMAIL 或 ADMIN_PASSWORD 环境变量未设置，跳过管理员初始化')
    return
  }

  try {
    const { results } = await env.DB.prepare(
      'SELECT id FROM users WHERE role = ? LIMIT 1'
    ).bind('admin').all()

    if (results.length > 0) return

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

export async function createFetchLog(env, status) {
  const sql = `INSERT INTO fetch_logs (status, started_at, next_scheduled_at) VALUES (?, datetime('now'), datetime('now', '+3 hours'))`
  const { meta } = await env.DB.prepare(sql).bind(status).run()
  return meta.last_row_id
}

export async function updateFetchLog(env, id, updates) {
  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ')
  const vals = Object.values(updates)
  await env.DB.prepare(`UPDATE fetch_logs SET ${sets} WHERE id = ?`).bind(...vals, id).run()
}

export async function getLatestFetchLog(env) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM fetch_logs ORDER BY id DESC LIMIT 1'
  ).all()
  return results[0] || null
}

// 执行一次完整抓取（通用函数，供 cron 和 API 共用）
export async function executeFetch(env, isNewOnly) {
  const logId = await createFetchLog(env, 'running')

  try {
    const token = env.GITHUB_TOKEN
    if (!token) {
      throw new Error('环境变量 GITHUB_TOKEN 未设置，无法抓取私有仓库')
    }

    let successCount = 0
    let translateCount = 0

    for (const fullName of PRIVATE_REPOS) {
      try {
        const repo = await fetchPrivateRepo(fullName, token)

        const existing = await env.DB.prepare(
          'SELECT id, ai_summary, ai_tags FROM repositories WHERE full_name = ?'
        ).bind(repo.full_name).all()
        const isNew = existing.results.length === 0

        if (isNew && env.OPENAI_API_KEY && repo.description_en) {
          const aiResult = await aiTranslate(repo.description_en, env.OPENAI_API_KEY)
          if (aiResult.translated) {
            repo.description_zh = aiResult.translated
            repo.ai_tags = aiResult.tags
            repo.ai_summary = aiResult.summary
            translateCount++
          }
        } else if (!isNew && existing.results[0]?.ai_summary) {
          repo.ai_summary = existing.results[0].ai_summary
          repo.ai_tags = existing.results[0].ai_tags
        }

        await upsertRepo(repo, env)
        successCount++
      } catch (err) {
        console.error(`处理仓库 ${fullName} 失败:`, err)
      }
    }

    await updateFetchLog(env, logId, {
      status: 'success',
      finished_at: new Date().toISOString(),
      repositories_count: successCount,
      next_scheduled_at: new Date(Date.now() + 3 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19)
    })

    console.log(`Cron 完成: 成功处理 ${successCount}/${PRIVATE_REPOS.length} 个仓库，翻译 ${translateCount} 个`)

    return { total: PRIVATE_REPOS.length, success: successCount, translated: translateCount }
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
