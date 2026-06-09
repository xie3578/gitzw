import { Hono } from 'hono'

const FETCH_TIMEOUT_MS = 15000

async function fetchWithTimeout(url, options, timeoutMs) {
  timeoutMs = timeoutMs || FETCH_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(function() { controller.abort() }, timeoutMs)
  try {
    const resp = await fetch(url, Object.assign({}, options, { signal: controller.signal }))
    return resp
  } finally {
    clearTimeout(timer)
  }
}

function buildRepoRows(repos) {
  var rows = ''
  var list = repos.slice(0, 20)
  for (var i = 0; i < list.length; i++) {
    var r = list[i]
    var name = r.full_name || (r.owner + '/' + r.repo_name)
    var desc = r.description_zh || r.description_en || '暂无描述'
    var stars = r.stars_today ? '🔥 +' + r.stars_today + ' today' : '⭐ ' + (r.stars || 0)
    var langHtml = r.language ? '<span style="color:#58a6ff">' + r.language + '</span>' : ''
    rows += '<tr><td style="padding:12px 16px;border-bottom:1px solid #21262d;vertical-align:top">'
    rows += '<a href="' + r.github_url + '" style="color:#58a6ff;font-size:15px;font-weight:600;text-decoration:none">' + name + '</a>'
    rows += '<div style="color:#8b949e;font-size:13px;margin-top:4px">' + desc + '</div>'
    rows += '<div style="margin-top:6px;font-size:12px;color:#8b949e">' + langHtml + ' ' + stars + '</div>'
    rows += '</td></tr>'
  }
  return rows
}

function buildDailyEmailHtml(repos, nickname) {
  var rows = buildRepoRows(repos)
  var greeting = nickname ? 'Hi ' + nickname + ',' : '你好,'
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:20px;text-align:center;margin-bottom:16px}.header h1{color:#f0f6fc;font-size:22px;margin:0}.header p{color:#8b949e;font-size:14px;margin-top:6px}.repo-table{width:100%;border-collapse:collapse;background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden}.footer{text-align:center;padding:16px;color:#8b949e;font-size:12px}.btn{display:inline-block;background:#238636;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px}</style></head><body><div class="container"><div class="header"><h1>🔥 GitHub 热榜日报</h1><p>' + greeting + ' 今日热门仓库已更新</p></div><table class="repo-table">' + rows + '</table><div class="footer"><p>如需取消订阅，请登录 Gitzw 关闭推送设置</p></div></div></body></html>'
}

function buildWeeklyEmailHtml(repos, nickname) {
  var rows = buildRepoRows(repos)
  var greeting = nickname ? 'Hi ' + nickname + ',' : '你好,'
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:20px;text-align:center;margin-bottom:16px}.header h1{color:#f0f6fc;font-size:22px;margin:0}.header p{color:#8b949e;font-size:14px;margin-top:6px}.repo-table{width:100%;border-collapse:collapse;background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden}.footer{text-align:center;padding:16px;color:#8b949e;font-size:12px}</style></head><body><div class="container"><div class="header"><h1>📬 GitHub 热榜周报</h1><p>' + greeting + ' 本周热门仓库汇总</p></div><table class="repo-table">' + rows + '</table><div class="footer"><p>如需取消订阅，请登录 Gitzw 关闭推送设置</p></div></div></body></html>'
}

async function sendEmail(apiKey, to, subject, html) {
  var body = JSON.stringify({
    from: 'GitHub 热榜 <trending@gitzw.workers.dev>',
    to: to,
    subject: subject,
    html: html
  })
  var response = await fetchWithTimeout('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: body
  }, 20000)
  if (!response.ok) {
    var errBody = await response.text()
    throw new Error('Resend API 返回 ' + response.status + ': ' + errBody)
  }
  return await response.json()
}

async function pushDaily(env) {
  var apiKey = env.RESEND_API_KEY
  if (!apiKey) return { sent: 0, error: 'RESEND_API_KEY 未设置' }

  // 获取每日订阅用户
  var { results: subs } = await env.DB.prepare(
    "SELECT u.id, u.email, u.nickname, s2.value as lang_pref FROM subscriptions s JOIN users u ON s.user_id = u.id LEFT JOIN subscriptions s2 ON s2.user_id = u.id AND s2.type = 'language' WHERE s.type = 'daily' AND s.value = 'enabled'"
  ).all()
  if (!subs || subs.length === 0) return { sent: 0, message: '无订阅用户' }

  // 获取热榜仓库
  var { results: repos } = await env.DB.prepare(
    'SELECT * FROM repositories ORDER BY stars_today DESC, stars DESC LIMIT 20'
  ).all()

  var sent = 0
  var errors = []
  for (var i = 0; i < subs.length; i++) {
    var user = subs[i]
    try {
      var html = buildDailyEmailHtml(repos, user.nickname)
      await sendEmail(apiKey, user.email, '🔥 GitHub 热榜日报 - ' + new Date().toLocaleDateString('zh-CN'), html)
      sent++
    } catch (e) {
      errors.push({ email: user.email, error: e.message })
    }
  }
  return { sent: sent, total: subs.length, errors: errors }
}

const email = new Hono()

email.post('/send', async function(c) {
  try {
    var apiKey = c.env.RESEND_API_KEY
    if (!apiKey) return c.json({ error: 'RESEND_API_KEY 未设置' }, 400)

    var body
    try { body = await c.req.json() } catch (_) { body = {} }
    var type = body.type || 'daily'
    if (type !== 'daily' && type !== 'weekly') return c.json({ error: 'type 必须为 daily 或 weekly' }, 400)

    var result
    if (type === 'daily') {
      result = await pushDaily(c.env)
    } else {
      // 每周推送
      var { results: subs } = await env.DB.prepare(
        "SELECT u.id, u.email, u.nickname FROM subscriptions s JOIN users u ON s.user_id = u.id WHERE s.type = 'weekly' AND s.value = 'enabled'"
      ).all()
      if (!subs || subs.length === 0) result = { sent: 0, message: '无订阅用户' }
      var { results: repos } = await env.DB.prepare(
        'SELECT * FROM repositories ORDER BY stars DESC LIMIT 30'
      ).all()
      var sent = 0
      var errors = []
      for (var i = 0; i < subs.length; i++) {
        try {
          var html = buildWeeklyEmailHtml(repos, subs[i].nickname)
          await sendEmail(apiKey, subs[i].email, '📬 GitHub 热榜周报 - ' + new Date().toLocaleDateString('zh-CN'), html)
          sent++
        } catch (e) {
          errors.push({ email: subs[i].email, error: e.message })
        }
      }
      result = { sent: sent, total: subs.length, errors: errors }
    }

    return c.json(result)
  } catch (e) {
    return c.json({ error: '邮件推送失败: ' + e.message }, 500)
  }
})

email.get('/status', async function(c) {
  var apiKey = c.env.RESEND_API_KEY
  return c.json({
    resend_configured: !!apiKey,
    resend_key_prefix: apiKey ? apiKey.substring(0, 4) + '...' : null
  })
})

export default email
