import { Hono } from 'hono'

const FETCH_TIMEOUT_MS = 15000
const MAX_REPOS = 50

// 带超时的 fetch 封装
async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal })
    return resp
  } finally {
    clearTimeout(timer)
  }
}

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

const cron = new Hono()

// POST /fetch 手动触发抓取
cron.post('/fetch', async (c) => {
  try {
    let body = {}
    try {
      body = await c.req.json()
    } catch (_) {}

    const language = typeof body.language === 'string' ? body.language.trim() : ''
    const since = typeof body.since === 'string' && ['daily', 'weekly', 'monthly'].includes(body.since) ? body.since : 'daily'

    if (language.length > 50) return c.json({ error: 'language 参数过长' }, 400)

    const repos = await fetchTrending(language, since)
    let successCount = 0
    let translateCount = 0

    for (const repo of repos) {
      try {
        const enriched = await enrichRepoData(repo, c.env)
        if (c.env.OPENAI_API_KEY && enriched.description_en) {
          const aiResult = await aiTranslate(enriched.description_en, c.env.OPENAI_API_KEY)
          if (aiResult.translated) {
            enriched.description_zh = aiResult.translated
            enriched.ai_tags = aiResult.tags
            enriched.ai_summary = aiResult.summary
            translateCount++
          }
        }
        await upsertRepo(enriched, c.env)
        successCount++
      } catch (err) {
        console.error(`处理仓库 ${repo.full_name} 失败:`, err)
      }
    }

    return c.json({
      message: `抓取完成，成功处理 ${successCount}/${repos.length} 个仓库，翻译 ${translateCount} 个`,
      total: repos.length,
      success: successCount,
      translated: translateCount,
    })
  } catch (err) {
    return c.json({ error: `抓取失败: ${err.message}` }, 500)
  }
})

// Cron 定时触发器入口
export async function scheduled(event, env, ctx) {
  console.log('Cron 触发: 开始抓取 GitHub Trending')
  try {
    const repos = await fetchTrending('', 'daily')
    let successCount = 0
    for (const repo of repos) {
      try {
        const enriched = await enrichRepoData(repo, env)
        if (env.OPENAI_API_KEY && enriched.description_en) {
          const aiResult = await aiTranslate(enriched.description_en, env.OPENAI_API_KEY)
          if (aiResult.translated) {
            enriched.description_zh = aiResult.translated
            enriched.ai_tags = aiResult.tags
            enriched.ai_summary = aiResult.summary
          }
        }
        await upsertRepo(enriched, env)
        successCount++
      } catch (err) {
        console.error(`Cron 处理 ${repo.full_name} 失败:`, err)
      }
    }
    console.log(`Cron 完成: 成功处理 ${successCount}/${repos.length} 个仓库`)
  } catch (err) {
    console.error('Cron 抓取失败:', err)
  }
}

export default cron
