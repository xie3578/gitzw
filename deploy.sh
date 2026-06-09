#!/bin/bash
# ==============================================
# Gitzw 部署脚本
# 用法: ./deploy.sh [--env production]
# ==============================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Gitzw 部署脚本 ==="

# 检查必要环境变量
check_env() {
  local var="$1"
  if [ -z "${!var:-}" ]; then
    echo "❌ 环境变量 $var 未设置"
    return 1
  fi
  echo "✅ $var 已设置"
}

echo ""
echo "--- 检查环境变量 ---"
check_env "JWT_SECRET" || true
check_env "RESEND_API_KEY" || true
check_env "OPENAI_API_KEY" || true

echo ""
echo "--- 1. Worker 依赖安装 ---"
cd worker
npm ci || npm install
cd ..

echo ""
echo "--- 2. D1 数据库迁移 ---"
cd worker
npx wrangler d1 migrations apply gitzw-db
cd ..

echo ""
echo "--- 3. Worker 部署 ---"
cd worker
npx wrangler deploy
cd ..

echo ""
echo "--- 4. 前端构建 ---"
cd frontend
npm ci || npm install
npm run build
cd ..

echo ""
echo "--- 5. 前端部署到 Cloudflare Pages ---"
npx wrangler pages deploy frontend/dist --project-name=gitzw

echo ""
echo "=== ✅ 部署完成 ==="
echo ""
echo "🔴 注意：如果这是首次部署，请通过以下命令设置环境变量："
echo "   npx wrangler secret put JWT_SECRET"
echo "   npx wrangler secret put RESEND_API_KEY"
echo "   npx wrangler secret put OPENAI_API_KEY"
echo "   npx wrangler secret put GITHUB_TOKEN"
echo ""
echo "🌐 访问地址: https://gitzw.pages.dev"
