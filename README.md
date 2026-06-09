# Gitzw - GitHub 热榜中文站

基于 Cloudflare Workers + D1 + Pages 的全栈 GitHub Trending 中文展示站。

## 功能特点

- 📊 每 3 小时自动抓取 GitHub Trending 仓库
- 🌐 AI 自动翻译仓库名、描述为中文，生成摘要和标签
- 👤 用户注册/登录，收藏仓库
- 📧 邮件订阅每日热门仓库推送
- 📺 广告系统（前端广告位 + 观看广告解锁开发者联系方式）
- 🔧 完整后台管理（广告/分类/用户管理 + 数据统计仪表盘）

## 技术栈

- **前端**: Vue 3 + Vite + Cloudflare Pages
- **后端**: Hono.js + Cloudflare Workers
- **数据库**: Cloudflare D1 (SQLite)
- **定时任务**: Workers Cron Triggers
- **AI**: OpenAI GPT-3.5-turbo (翻译 + 标签)
- **邮件**: Resend API

## 目录结构

```
gitzw/
├── migrations/         # D1 数据库迁移文件
│   └── 001_create_tables.sql
├── worker/             # Worker API 后端
│   ├── src/
│   │   ├── index.js    # Hono 入口 + 路由
│   │   ├── auth.js     # 用户认证
│   │   ├── repos.js    # 仓库列表/详情
│   │   ├── favorites.js# 收藏管理
│   │   ├── ads.js      # 广告查询/解锁
│   │   ├── admin.js    # 后台管理
│   │   └── cron.js     # GitHub Trending 定时抓取
│   ├── wrangler.toml   # Worker 配置
│   └── package.json
├── frontend/           # Pages 前端
│   ├── src/
│   │   ├── components/ # NavBar, RepoCard
│   │   ├── views/      # Home, Login, Favorites, Admin
│   │   ├── router/     # Vue Router
│   │   └── api/        # Axios 封装
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── .gitignore
└── README.md
```

## 部署步骤

### 1. 创建 D1 数据库

```bash
cd worker
npx wrangler d1 create gitzw
# 将输出的 database_id 填入 wrangler.toml
npx wrangler d1 migrations apply gitzw --local  # 本地测试
```

### 2. 配置环境变量

在 Cloudflare Dashboard → Workers → gitzw → 设置 → 变量中添加：

| 变量名 | 说明 |
|--------|------|
| `ADMIN_EMAIL` | 管理员邮箱 |
| `ADMIN_PASSWORD` | 管理员密码 |
| `JWT_SECRET` | JWT 密钥（随机字符串） |
| `OPENAI_API_KEY` | OpenAI API Key |
| `RESEND_API_KEY` | Resend API Key |
| `SITE_URL` | 网站域名（例如 `https://gitzw.com`） |

> **⚠️ 安全警告**：`JWT_SECRET`、`ADMIN_PASSWORD`、`OPENAI_API_KEY`、`RESEND_API_KEY`、`GITHUB_TOKEN` 等敏感变量**绝对不能通过 `wrangler.toml` 提交到 GitHub**。请始终使用 `npx wrangler secret put <变量名>` 或 Cloudflare Dashboard → Workers → 设置 → 变量 来配置生产环境密钥。`wrangler.toml` 中的 `[vars]` 仅用于本地开发测试。

### 3. 部署 Worker

```bash
cd worker
npm install
npx wrangler deploy
```

### 4. 部署前端

```bash
cd frontend
npm install
npm run build
# 在 Cloudflare Pages 中连接 git 仓库或手动上传 dist/
```

### 5. 设置 Cron 定时任务

Worker 中的 `wrangler.toml` 已配置每 3 小时触发（`"0 */3 * * *"`），
也可手动访问 `https://your-worker.workers.dev/api/cron/fetch` 触发抓取。

### 6. 绑定域名

在 Cloudflare Dashboard 中为 Worker 和 Pages 绑定自定义域名。

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/user` | 获取用户信息 |
| PATCH | `/api/user/password` | 修改密码 |
| PATCH | `/api/user/email` | 修改邮箱 |
| PATCH | `/api/user/subscription` | 设置订阅 |
| GET | `/api/repos` | 仓库列表（分页） |
| GET | `/api/repos/:id` | 仓库详情 |
| GET | `/api/repos/languages` | 语言列表 |
| GET | `/api/favorites` | 收藏列表 |
| POST | `/api/favorites` | 添加收藏 |
| DELETE | `/api/favorites/:id` | 取消收藏 |
| GET | `/api/ads` | 广告查询 |
| POST | `/api/ads/unlock` | 广告解锁 |
| GET | `/api/admin/*` | 后台管理 |
| POST | `/api/cron/fetch` | 手动触发抓取 |
| GET | `/api/health` | 健康检查 |

## License

MIT
