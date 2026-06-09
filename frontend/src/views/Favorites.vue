<template>
  <div class="favorites-page">
    <div class="flex-between">
      <h1 class="page-title">我的收藏</h1>
      <span class="count-badge">{{ repos.length }} 个仓库</span>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="repos.length === 0" class="empty-state">
      <p>暂无收藏的仓库</p>
      <router-link to="/" class="btn btn-primary mt-2">去仓库看看</router-link>
    </div>
    <div v-else class="grid">
      <RepoCard v-for="repo in repos" :key="repo.id" :repo="repo" :initialFavorited="true" @unfavorited="removeRepo" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../api.js'
import RepoCard from '../components/RepoCard.vue'

const repos = ref([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const res = await api.get('/favorites')
    repos.value = res.data.favorites || res.data
  } catch (err) {
    error.value = err.response?.data?.error || '加载失败'
  } finally {
    loading.value = false
  }
})

function removeRepo(id) {
  repos.value = repos.value.filter(r => r.id !== id)
}
</script>

<style scoped>
.count-badge { background: #21262d; padding: 4px 12px; border-radius: 12px; font-size: 14px; color: #8b949e; }
.empty-state { text-align: center; padding: 60px 20px; color: #8b949e; font-size: 16px; }
</style>
