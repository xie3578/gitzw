<template>
  <div class="card repo-card">
    <div class="card-header">
      <div class="repo-info">
        <h3 class="repo-name">
          <a :href="repo.html_url" target="_blank" rel="noopener">{{ repo.full_name }}</a>
        </h3>
        <p v-if="repo.name_zh" class="repo-name-zh">{{ repo.name_zh }}</p>
      </div>
      <button v-if="showFavorite" class="fav-btn" :class="{ favorited: isFavorited }" @click="toggleFavorite">
        {{ isFavorited ? '★' : '☆' }}
      </button>
    </div>

    <p class="repo-desc">{{ repo.description_zh || repo.description_en || '暂无描述' }}</p>
    <p v-if="repo.summary_zh" class="repo-summary">{{ repo.summary_zh }}</p>

    <div class="card-meta">
      <span v-if="repo.language" class="badge lang-badge">{{ repo.language }}</span>
      <span class="meta-item">⭐ {{ formatNumber(repo.stars) }}</span>
      <span class="meta-item">⑂ {{ formatNumber(repo.forks) }}</span>
      <span v-if="repo.stars_today" class="meta-item today-stars">🔥 +{{ repo.stars_today }}</span>
    </div>

    <div v-if="repo.tags && repo.tags.length" class="tags">
      <span v-for="tag in repo.tags" :key="tag" class="tag">{{ tag }}</span>
    </div>

    <div class="card-footer">
      <a v-if="repo.developer" :href="repo.developer.profile_url" target="_blank" class="dev-link">
        <img v-if="repo.developer.avatar_url" :src="repo.developer.avatar_url" class="dev-avatar" />
        {{ repo.developer.github_login }}
      </a>
      <span v-if="repo.dev_url_visible_for_guests && repo.developer?.profile_url" class="dev-contact">👁 联系方式可见</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import api from '../api.js'

const props = defineProps({
  repo: { type: Object, required: true },
  showFavorite: { type: Boolean, default: true },
  initialFavorited: { type: Boolean, default: false }
})

const emit = defineEmits(['favorited', 'unfavorited'])
const isFavorited = ref(props.initialFavorited)

function formatNumber(n) {
  if (!n) return '0'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toString()
}

async function toggleFavorite() {
  const token = localStorage.getItem('token')
  if (!token) return

  try {
    if (isFavorited.value) {
      await api.delete(`/favorites/${props.repo.id}`)
      isFavorited.value = false
      emit('unfavorited', props.repo.id)
    } else {
      await api.post('/favorites', { repo_id: props.repo.id })
      isFavorited.value = true
      emit('favorited', props.repo.id)
    }
  } catch (err) {
    console.error('收藏操作失败:', err)
  }
}
</script>

<style scoped>
.repo-card { display: flex; flex-direction: column; gap: 10px; }
.card-header { display: flex; justify-content: space-between; align-items: flex-start; }
.repo-info { flex: 1; }
.repo-name { font-size: 16px; font-weight: 600; }
.repo-name a { color: #58a6ff; }
.repo-name-zh { font-size: 13px; color: #8b949e; margin-top: 2px; }
.repo-desc { font-size: 14px; color: #8b949e; line-height: 1.5; }
.repo-summary { font-size: 13px; color: #7ee787; background: #1b3320; padding: 8px; border-radius: 6px; border-left: 3px solid #238636; }
.repo-summary::before { content: '💡 '; }
.card-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.lang-badge { background: #1f6feb33; color: #58a6ff; }
.meta-item { font-size: 13px; color: #8b949e; }
.today-stars { color: #d29922; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; }
.tag { font-size: 11px; padding: 2px 8px; background: #21262d; border: 1px solid #30363d; border-radius: 12px; color: #8b949e; }
.card-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #21262d; padding-top: 10px; }
.dev-link { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #8b949e; }
.dev-avatar { width: 20px; height: 20px; border-radius: 50%; }
.dev-contact { font-size: 12px; color: #3fb950; }
.fav-btn { background: none; border: 1px solid #30363d; border-radius: 6px; padding: 4px 10px; font-size: 18px; cursor: pointer; color: #8b949e; line-height: 1; }
.fav-btn:hover { border-color: #58a6ff; }
.fav-btn.favorited { color: #d29922; border-color: #d29922; }
</style>
