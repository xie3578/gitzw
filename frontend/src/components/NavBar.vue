<template>
  <nav class="navbar">
    <div class="nav-inner">
      <router-link to="/" class="nav-brand">
        <span class="brand-icon">🔥</span> Gitzw
      </router-link>
      <div class="nav-links">
        <router-link to="/" class="nav-link">仓库</router-link>
        <router-link v-if="token" to="/favorites" class="nav-link">收藏</router-link>
        <router-link v-if="token" to="/subscription" class="nav-link">订阅</router-link>
        <router-link v-if="isAdmin" to="/admin" class="nav-link">管理</router-link>
        <template v-if="token">
          <span class="nav-user">{{ user.nickname || user.email }}</span>
          <button class="btn btn-secondary" @click="handleLogout">退出</button>
        </template>
        <router-link v-else to="/login" class="btn btn-primary">登录</router-link>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const token = ref(localStorage.getItem('token'))
const user = ref(JSON.parse(localStorage.getItem('user') || '{}'))
const isAdmin = computed(() => user.value.role === 'admin')

onMounted(() => {
  window.addEventListener('storage', () => {
    token.value = localStorage.getItem('token')
    user.value = JSON.parse(localStorage.getItem('user') || '{}')
  })
})

function handleLogout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  token.value = null
  user.value = {}
  router.push('/')
}
</script>

<style scoped>
.navbar { background: #161b22; border-bottom: 1px solid #30363d; padding: 0 20px; }
.nav-inner { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; height: 56px; }
.nav-brand { font-size: 20px; font-weight: 700; color: #f0f6fc; text-decoration: none; display: flex; align-items: center; gap: 6px; }
.brand-icon { font-size: 24px; }
.nav-links { display: flex; align-items: center; gap: 16px; }
.nav-link { color: #8b949e; font-size: 14px; text-decoration: none; }
.nav-link:hover { color: #c9d1d9; text-decoration: none; }
.nav-link.router-link-active { color: #f0f6fc; }
.nav-user { color: #8b949e; font-size: 14px; }
</style>
