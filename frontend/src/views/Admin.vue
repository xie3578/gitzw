<template>
  <div class="admin-page">
    <h1 class="page-title">后台管理</h1>

    <!-- 标签页 -->
    <div class="tabs">
      <button v-for="tab in tabs" :key="tab.key" class="tab-btn" :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key">{{ tab.label }}</button>
    </div>

    <!-- 仪表盘 -->
    <div v-if="activeTab === 'dashboard'">
      <div v-if="dashboardLoading" class="loading">加载中...</div>
      <div v-else class="dashboard-grid">
        <div class="card stat-card"><h3>仓库总数</h3><p class="stat-num">{{ dashboard.repoCount || 0 }}</p></div>
        <div class="card stat-card"><h3>用户总数</h3><p class="stat-num">{{ dashboard.userCount || 0 }}</p></div>
        <div class="card stat-card"><h3>收藏总数</h3><p class="stat-num">{{ dashboard.favCount || 0 }}</p></div>
        <div class="card stat-card"><h3>广告总数</h3><p class="stat-num">{{ dashboard.adCount || 0 }}</p></div>
      </div>
    </div>

    <!-- 仓库管理 -->
    <div v-if="activeTab === 'repos'">
      <div class="admin-toolbar"><input v-model="repoKeyword" placeholder="搜索仓库..." @keyup.enter="fetchRepos" />
        <button class="btn btn-primary" @click="fetchRepos">搜索</button></div>
      <table v-if="repoList.length" class="admin-table">
        <thead><tr><th>ID</th><th>仓库名</th><th>Star</th><th>语言</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="r in repoList" :key="r.id">
            <td>{{ r.id }}</td><td>{{ r.full_name }}</td><td>{{ r.stars }}</td><td>{{ r.language }}</td>
            <td><button class="btn btn-secondary btn-sm" @click="deleteRepo(r.id)">删除</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-tip">暂无仓库数据</p>
    </div>

    <!-- 广告管理 -->
    <div v-if="activeTab === 'ads'">
      <div class="admin-toolbar"><button class="btn btn-primary" @click="showAdForm = true">新建广告</button></div>
      <table v-if="adList.length" class="admin-table">
        <thead><tr><th>ID</th><th>标题</th><th>位置</th><th>启用</th><th>优先级</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="ad in adList" :key="ad.id">
            <td>{{ ad.id }}</td><td>{{ ad.title }}</td><td>{{ ad.placement }}</td>
            <td>{{ ad.enabled ? '✅' : '❌' }}</td><td>{{ ad.priority }}</td>
            <td>
              <button class="btn btn-secondary btn-sm" @click="editAd(ad)">编辑</button>
              <button class="btn btn-secondary btn-sm" @click="deleteAd(ad.id)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-tip">暂无广告</p>

      <!-- 广告表单弹窗 -->
      <div v-if="showAdForm" class="modal-overlay" @click.self="showAdForm = false">
        <div class="modal card">
          <h3>{{ editingAd ? '编辑广告' : '新建广告' }}</h3>
          <div class="form-group"><label>标题</label><input v-model="adForm.title" /></div>
          <div class="form-group"><label>描述</label><textarea v-model="adForm.description" rows="2"></textarea></div>
          <div class="form-group"><label>图片URL</label><input v-model="adForm.image_url" /></div>
          <div class="form-group"><label>目标链接</label><input v-model="adForm.target_url" /></div>
          <div class="form-group"><label>广告位</label><select v-model="adForm.placement"><option>home_top</option><option>home_sidebar</option><option>detail_top</option></select></div>
          <div class="form-group"><label>优先级</label><input v-model.number="adForm.priority" type="number" /></div>
          <div class="form-group"><label>启用</label><select v-model.number="adForm.enabled"><option :value="1">是</option><option :value="0">否</option></select></div>
          <div class="form-actions">
            <button class="btn btn-primary" @click="saveAd">{{ editingAd ? '更新' : '创建' }}</button>
            <button class="btn btn-secondary" @click="showAdForm = false">取消</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 抓取状态 -->
    <div v-if="activeTab === 'fetch'">
      <div v-if="fetchLoading" class="loading">加载中...</div>
      <div v-else class="fetch-status-grid">
        <div class="card fetch-card">
          <h3>最近抓取</h3>
          <p class="fetch-time">{{ fetchStatus.lastFetchedAt || '从未抓取' }}</p>
        </div>
        <div class="card fetch-card">
          <h3>下次抓取</h3>
          <p class="fetch-time">{{ fetchStatus.nextScheduledAt || '—' }}</p>
        </div>
        <div class="card fetch-card">
          <h3>抓取间隔</h3>
          <p class="fetch-time">3 小时</p>
        </div>
        <div class="card fetch-card">
          <h3>状态</h3>
          <p class="fetch-status" :class="statusClass">{{ fetchStatus.statusLabel || '未知' }}</p>
        </div>
        <div class="card fetch-card full-width">
          <h3>上次抓取详情</h3>
          <div v-if="fetchStatus.lastFetch">
            <p><strong>开始时间：</strong>{{ fetchStatus.lastFetch.started_at || '—' }}</p>
            <p><strong>结束时间：</strong>{{ fetchStatus.lastFetch.finished_at || '—' }}</p>
            <p><strong>仓库数：</strong>{{ fetchStatus.lastFetch.repositories_count || 0 }}</p>
            <p v-if="fetchStatus.lastFetch.error_message"><strong>错误信息：</strong><span class="error-text">{{ fetchStatus.lastFetch.error_message }}</span></p>
          </div>
          <p v-else class="empty-tip">暂无抓取记录</p>
        </div>
        <div class="card fetch-card actions-card full-width">
          <button class="btn btn-primary" :disabled="fetchingNow" @click="triggerFetch">
            {{ fetchingNow ? '抓取中...' : '🔄 手动触发抓取' }}
          </button>
          <p v-if="fetchMsg" class="fetch-msg">{{ fetchMsg }}</p>
        </div>
      </div>
    </div>

    <!-- 用户管理 -->
    <div v-if="activeTab === 'users'">
      <table v-if="userList.length" class="admin-table">
        <thead><tr><th>ID</th><th>邮箱</th><th>昵称</th><th>角色</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="u in userList" :key="u.id">
            <td>{{ u.id }}</td><td>{{ u.email }}</td><td>{{ u.nickname }}</td><td>{{ u.role }}</td>
            <td>
              <select v-model="u.role" @change="updateUserRole(u)" class="role-select">
                <option value="user">user</option><option value="admin">admin</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-tip">暂无用户</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../api.js'

const activeTab = ref('dashboard')
const tabs = [
  { key: 'dashboard', label: '仪表盘' },
  { key: 'repos', label: '仓库管理' },
  { key: 'ads', label: '广告管理' },
  { key: 'fetch', label: '抓取状态' },
  { key: 'users', label: '用户管理' }
]

// 仪表盘
const dashboard = ref({})
const dashboardLoading = ref(true)
onMounted(() => {
  fetchDashboard()
  loadFetchStatus()
})
async function fetchDashboard() {
  try {
    dashboardLoading.value = true
    const res = await api.get('/admin/dashboard')
    dashboard.value = res.data || {}
  } catch (e) { console.error(e) }
  finally { dashboardLoading.value = false }
}

// 仓库管理
const repoList = ref([])
const repoKeyword = ref('')
async function fetchRepos() {
  try {
    const params = { page: 1, limit: 50 }
    if (repoKeyword.value) params.keyword = repoKeyword.value
    const res = await api.get('/admin/repos', { params })
    repoList.value = res.data.repos || res.data.data || []
  } catch (e) { console.error(e) }
}
async function deleteRepo(id) {
  if (!confirm('确定删除此仓库？')) return
  await api.delete(`/admin/repos/${id}`)
  fetchRepos()
}

// 广告管理
const adList = ref([])
const showAdForm = ref(false)
const editingAd = ref(null)
const adForm = ref({ title: '', description: '', image_url: '', target_url: '', placement: 'home_top', priority: 0, enabled: 1 })

onMounted(fetchAds)
async function fetchAds() {
  try {
    const res = await api.get('/admin/ads')
    adList.value = res.data.ads || res.data.data || []
  } catch (e) { console.error(e) }
}
function editAd(ad) {
  editingAd.value = ad
  adForm.value = { ...ad }
  showAdForm.value = true
}
async function saveAd() {
  try {
    if (editingAd.value) {
      await api.patch(`/admin/ads/${editingAd.value.id}`, adForm.value)
    } else {
      await api.post('/admin/ads', adForm.value)
    }
    showAdForm.value = false
    editingAd.value = null
    fetchAds()
  } catch (e) { console.error(e) }
}
async function deleteAd(id) {
  if (!confirm('确定删除此广告？')) return
  await api.delete(`/admin/ads/${id}`)
  fetchAds()
}

// 抓取状态
const fetchStatus = ref({ lastFetch: null })
const fetchLoading = ref(false)
const fetchingNow = ref(false)
const fetchMsg = ref('')
const statusClass = ref('')

async function loadFetchStatus() {
  fetchLoading.value = true
  try {
    const res = await api.get('/cron/status')
    const data = res.data || {}
    fetchStatus.value = data

    // 更新状态标签和样式
    if (data.statusLabel === '成功') statusClass.value = 'status-ok'
    else if (data.statusLabel === '失败' || data.statusLabel === '错误') statusClass.value = 'status-err'
    else if (data.statusLabel === '抓取中') statusClass.value = 'status-running'
    else statusClass.value = 'status-unknown'
  } catch (e) {
    fetchStatus.value = { statusLabel: '无法连接', lastFetch: null }
    statusClass.value = 'status-err'
  } finally {
    fetchLoading.value = false
  }
}
async function triggerFetch() {
  if (fetchingNow.value) return
  fetchingNow.value = true
  fetchMsg.value = ''
  try {
    const res = await api.post('/cron/fetch')
    fetchMsg.value = res.data?.message || '抓取任务已触发'
    await loadFetchStatus()
  } catch (e) {
    fetchMsg.value = e.response?.data?.error || '触发抓取失败'
  } finally {
    fetchingNow.value = false
  }
}

// 用户管理
const userList = ref([])
onMounted(fetchUsers)
async function fetchUsers() {
  try {
    const res = await api.get('/admin/users')
    userList.value = res.data.users || res.data.data || []
  } catch (e) { console.error(e) }
}
async function updateUserRole(user) {
  await api.patch(`/admin/users/${user.id}`, { role: user.role })
}
</script>

<style scoped>
.tabs { display: flex; gap: 4px; margin-bottom: 24px; background: #161b22; border-radius: 8px; padding: 4px; }
.tab-btn { flex: 1; padding: 10px; border: none; background: transparent; color: #8b949e; cursor: pointer; border-radius: 6px; font-size: 14px; }
.tab-btn:hover { color: #c9d1d9; }
.tab-btn.active { background: #238636; color: #fff; }
.dashboard-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
.stat-card { text-align: center; }
.stat-card h3 { font-size: 14px; color: #8b949e; margin-bottom: 8px; }
.stat-num { font-size: 36px; font-weight: 700; color: #f0f6fc; }
.admin-toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
.admin-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.admin-table th, .admin-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #21262d; }
.admin-table th { color: #8b949e; font-weight: 500; background: #161b22; }
.admin-table tr:hover { background: #161b22; }
.btn-sm { padding: 4px 10px; font-size: 12px; margin-right: 4px; }
.role-select { background: #0d1117; border: 1px solid #30363d; color: #c9d1d9; padding: 4px; border-radius: 4px; font-size: 12px; }
.empty-tip { text-align: center; padding: 40px; color: #8b949e; }
.fetch-status-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
.fetch-card { text-align: center; }
.fetch-card h3 { font-size: 14px; color: #8b949e; margin-bottom: 8px; }
.fetch-time { font-size: 18px; font-weight: 600; color: #f0f6fc; }
.fetch-status { font-size: 24px; font-weight: 700; padding: 8px 0; }
.status-ok { color: #3fb950; }
.status-err { color: #f85149; }
.status-running { color: #d29922; }
.status-unknown { color: #8b949e; }
.actions-card { grid-column: 1 / -1; padding: 20px; }
.full-width { grid-column: 1 / -1; }
.fetch-msg { margin-top: 12px; font-size: 13px; color: #8b949e; }
.error-text { color: #f85149; font-size: 13px; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { width: 480px; max-width: 90vw; padding: 24px; max-height: 80vh; overflow-y: auto; }
.modal h3 { margin-bottom: 16px; }
.form-group { margin-bottom: 12px; }
.form-group label { display: block; margin-bottom: 4px; font-size: 13px; color: #8b949e; }
.form-actions { display: flex; gap: 8px; margin-top: 16px; justify-content: flex-end; }
</style>
