<template>
  <div class="home-page">
    <!-- 筛选栏 -->
    <div class="filter-bar">
      <select v-model="language" @change="fetchRepos(1)" class="lang-select">
        <option value="">所有语言</option>
        <option v-for="lang in languages" :key="lang" :value="lang">{{ lang }}</option>
      </select>
      <div class="search-box">
        <input v-model="keyword" placeholder="搜索仓库..." @keyup.enter="fetchRepos(1)" />
        <button class="btn btn-secondary" @click="fetchRepos(1)">搜索</button>
      </div>
    </div>

    <!-- 加载 / 错误 / 空状态 -->
    <div v-if="loading" class="loading">正在加载热榜数据...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="repos.length === 0" class="empty-state">
      <p>暂无数据，请稍后再来</p>
      <button class="btn btn-primary mt-2" @click="fetchRepos(1)">刷新</button>
    </div>

    <!-- 仓库网格 -->
    <div v-else class="grid">
      <RepoCard
        v-for="repo in repos"
        :key="repo.id"
        :repo="repo"
        :initialFavorited="favoritedIds.has(repo.id)"
      />
    </div>

    <!-- 分页 -->
    <div v-if="totalPages > 1" class="pagination">
      <button class="btn btn-secondary" :disabled="page <= 1" @click="fetchRepos(page - 1)">上一页</button>
      <span class="page-info">{{ page }} / {{ totalPages }}</span>
      <button class="btn btn-secondary" :disabled="page >= totalPages" @click="fetchRepos(page + 1)">下一页</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../api.js'
import RepoCard from '../components/RepoCard.vue'

const repos = ref([])
const languages = ref([])
const loading = ref(true)
const error = ref('')
const page = ref(1)
const totalPages = ref(1)
const language = ref('')
const keyword = ref('')
const favoritedIds = ref(new Set())

const title = 'GitHub 中文热榜'

onMounted(async () => {
  await Promise.all([
    fetchLanguages(),
    fetchRepos(1),
    fetchFavoritedIds()
  ])
})

async function fetchLanguages() {
  try {
    const res = await api.get('/repos/languages')
    languages.value = res.data.languages || []
  } catch (e) {
    // 非关键请求，静默失败
  }
}

async function fetchRepos(p) {
  page.value = p
  loading.value = true
  error.value = ''
  try {
    const params = { page: p, limit: 20 }
    if (language.value) params.language = language.value
    if (keyword.value) params.keyword = keyword.value
    const res = await api.get('/repos', { params })
    repos.value = res.data.repos || res.data.data || []
    totalPages.value = res.data.totalPages || Math.ceil((res.data.total || 0) / 20) || 1
  } catch (err) {
    error.value = err.response?.data?.error || '加载热榜失败'
  } finally {
    loading.value = false
  }
}

async function fetchFavoritedIds() {
  const token = localStorage.getItem('token')
  if (!token) return
  try {
    const res = await api.get('/favorites')
    const list = res.data.favorites || res.data || []
    favoritedIds.value = new Set(list.map(r => r.id))
  } catch (e) {
    // 非关键
  }
}
</script>

<style scoped>
.filter-bar { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.lang-select { width: 180px; }
.search-box { display: flex; gap: 8px; flex: 1; min-width: 250px; }
.empty-state { text-align: center; padding: 60px; color: #8b949e; }
.pagination { display: flex; justify-content: center; align-items: center; gap: 16px; margin-top: 24px; padding: 16px 0; }
.page-info { color: #8b949e; font-size: 14px; }
</style>
