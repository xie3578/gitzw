<template>
  <div class="login-page">
    <div class="login-card card">
      <h2 class="page-title text-center">{{ isRegister ? '注册' : '登录' }}</h2>
      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label>邮箱</label>
          <input v-model="email" type="email" placeholder="请输入邮箱" required />
        </div>
        <div class="form-group">
          <label>{{ isRegister ? '昵称' : '密码' }}</label>
          <input v-if="isRegister" v-model="nickname" placeholder="请输入昵称" />
          <input v-else v-model="password" type="password" placeholder="请输入密码" required />
        </div>
        <div v-if="isRegister" class="form-group">
          <label>密码</label>
          <input v-model="password" type="password" placeholder="请设置密码" required />
        </div>
        <p v-if="error" class="error-msg">{{ error }}</p>
        <button type="submit" class="btn btn-primary submit-btn" :disabled="loading">
          {{ loading ? '处理中...' : (isRegister ? '注册' : '登录') }}
        </button>
      </form>
      <p class="switch-mode">
        {{ isRegister ? '已有账号？' : '没有账号？' }}
        <a href="#" @click.prevent="isRegister = !isRegister">
          {{ isRegister ? '去登录' : '去注册' }}
        </a>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api.js'

const router = useRouter()
const isRegister = ref(false)
const email = ref('')
const password = ref('')
const nickname = ref('')
const error = ref('')
const loading = ref(false)

async function handleSubmit() {
  error.value = ''
  loading.value = true
  try {
    let res
    if (isRegister.value) {
      res = await api.post('/auth/register', { email: email.value, password: password.value, nickname: nickname.value })
    } else {
      res = await api.post('/auth/login', { email: email.value, password: password.value })
    }
    const { token, user } = res.data
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    window.dispatchEvent(new Event('storage'))
    router.push('/')
  } catch (err) {
    error.value = err.response?.data?.error || '操作失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page { display: flex; justify-content: center; padding-top: 60px; }
.login-card { width: 400px; max-width: 100%; padding: 32px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; margin-bottom: 6px; font-size: 14px; color: #c9d1d9; }
.submit-btn { width: 100%; padding: 10px; margin-top: 8px; }
.error-msg { color: #f85149; font-size: 14px; margin-bottom: 8px; }
.switch-mode { text-align: center; margin-top: 16px; font-size: 14px; color: #8b949e; }
</style>
