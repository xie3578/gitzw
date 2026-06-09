<template>
  <div class="subscription-page">
    <h1 class="page-title">订阅设置</h1>
    <p class="page-desc">设置订阅后，系统将定时推送热门仓库到你的邮箱（需配置 RESEND_API_KEY）</p>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else>
      <!-- 每日推送 -->
      <div class="card setting-card">
        <div class="setting-header">
          <div>
            <h3>📧 每日仓库推送</h3>
<p class="setting-desc">每天自动推送当天仓库更新到你的邮箱</p>
          </div>
          <label class="toggle">
            <input type="checkbox" v-model="subs.daily" @change="saveSub('daily', subs.daily ? 'enabled' : 'disabled')" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <!-- 每周汇总 -->
      <div class="card setting-card">
        <div class="setting-header">
          <div>
            <h3>📬 每周仓库汇总</h3>
<p class="setting-desc">每周一推送本周仓库更新汇总</p>
          </div>
          <label class="toggle">
            <input type="checkbox" v-model="subs.weekly" @change="saveSub('weekly', subs.weekly ? 'enabled' : 'disabled')" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <!-- 语言偏好 -->
      <div class="card setting-card">
        <div class="setting-header">
          <div>
            <h3>🔤 语言偏好</h3>
            <p class="setting-desc">只关注特定语言的仓库（留空则关注全部）</p>
          </div>
        </div>
        <div class="setting-body">
          <div class="input-row">
            <input v-model="subs.language" placeholder="如: python, javascript, rust" @change="saveSub('language', subs.language)" />
            <button class="btn btn-primary btn-sm" @click="saveSub('language', subs.language)">保存</button>
          </div>
        </div>
      </div>

      <div v-if="message" class="toast" :class="messageType">{{ message }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue'
import api from '../api.js'

const loading = ref(true)
const message = ref('')
const messageType = ref('success')

const subs = reactive({
  daily: false,
  weekly: false,
  language: ''
})

onMounted(async () => {
  try {
    const res = await api.get('/auth/subscription')
    const list = res.data.subscriptions || []
    for (const s of list) {
      if (s.type === 'daily') subs.daily = s.value === 'enabled'
      else if (s.type === 'weekly') subs.weekly = s.value === 'enabled'
      else if (s.type === 'language') subs.language = s.value
    }
  } catch (e) {
    // 静默
  } finally {
    loading.value = false
  }
})

async function saveSub(type, value) {
  try {
    await api.patch('/auth/subscription', { type, value })
    showMessage('订阅设置已保存', 'success')
  } catch (e) {
    showMessage(e.response?.data?.error || '保存失败', 'error')
  }
}

function showMessage(msg, type) {
  message.value = msg
  messageType.value = type
  setTimeout(() => { message.value = '' }, 3000)
}
</script>

<style scoped>
.subscription-page { max-width: 600px; margin: 0 auto; }
.page-desc { color: #8b949e; margin-bottom: 24px; font-size: 14px; }
.setting-card { margin-bottom: 16px; }
.setting-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.setting-header h3 { font-size: 16px; margin-bottom: 4px; }
.setting-desc { font-size: 13px; color: #8b949e; }
.setting-body { margin-top: 12px; }
.input-row { display: flex; gap: 8px; }
.input-row input { flex: 1; }
.btn-sm { padding: 6px 14px; font-size: 13px; white-space: nowrap; }

/* Toggle switch */
.toggle { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle-slider { position: absolute; cursor: pointer; inset: 0; background: #30363d; border-radius: 24px; transition: 0.3s; }
.toggle-slider::before { content: ''; position: absolute; height: 18px; width: 18px; left: 3px; bottom: 3px; background: #8b949e; border-radius: 50%; transition: 0.3s; }
.toggle input:checked + .toggle-slider { background: #238636; }
.toggle input:checked + .toggle-slider::before { transform: translateX(20px); background: #fff; }

.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); padding: 10px 24px; border-radius: 8px; font-size: 14px; z-index: 200; }
.toast.success { background: #238636; color: #fff; }
.toast.error { background: #da3633; color: #fff; }
</style>
