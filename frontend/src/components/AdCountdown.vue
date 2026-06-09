<template>
  <div class="ad-countdown" :class="{ 'dismissed': isDismissed }">
    <!-- 广告内容 -->
    <div class="ad-content">
      <img v-if="ad.image_url" :src="ad.image_url" :alt="ad.title" class="ad-img" @error="ad.image_url = ''" />
      <div class="ad-body">
        <h4 class="ad-title">{{ ad.title }}</h4>
        <p v-if="ad.description" class="ad-desc">{{ ad.description }}</p>
        <a v-if="ad.target_url" :href="ad.target_url" target="_blank" rel="noopener" class="ad-link">了解更多 →</a>
      </div>
    </div>

    <!-- 倒计时条 -->
    <div class="countdown-bar">
      <div class="countdown-fill" :style="{ width: progressPercent + '%' }" :class="progressClass"></div>
    </div>

    <!-- 控制区 -->
    <div class="ad-controls">
      <span class="countdown-text">{{ remainingText }}</span>
      <button class="dismiss-btn" @click="dismiss" title="关闭广告">✕</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  ad: { type: Object, required: true },
  autoDismiss: { type: Boolean, default: true }
})

const emit = defineEmits(['dismissed'])

const isDismissed = ref(false)
const remaining = ref(props.ad.duration || 6) // 默认 6 秒

const progressPercent = computed(() => {
  const duration = props.ad.duration || 6
  if (duration <= 0) return 100
  return ((duration - remaining.value) / duration) * 100
})

const progressClass = computed(() => {
  const pct = progressPercent.value
  if (pct < 50) return 'progress-green'
  if (pct < 80) return 'progress-yellow'
  return 'progress-red'
})

const remainingText = computed(() => {
  if (remaining.value <= 0) return '可关闭'
  return `${remaining.value}s 后可关闭`
})

let timer = null

onMounted(() => {
  if (!props.autoDismiss) return
  timer = setInterval(() => {
    if (remaining.value > 0) {
      remaining.value--
    } else {
      clearInterval(timer)
      timer = null
    }
  }, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

function dismiss() {
  isDismissed.value = true
  emit('dismissed', props.ad.id)
}
</script>

<style scoped>
.ad-countdown {
  background: linear-gradient(135deg, #1c2333 0%, #161b22 100%);
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  transition: all 0.3s ease;
  position: relative;
}
.ad-countdown.dismissed {
  display: none;
}
.ad-content {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.ad-img {
  width: 60px;
  height: 60px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}
.ad-body { flex: 1; min-width: 0; }
.ad-title { font-size: 14px; font-weight: 600; color: #f0f6fc; margin-bottom: 4px; }
.ad-desc { font-size: 13px; color: #8b949e; line-height: 1.4; margin-bottom: 6px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ad-link { font-size: 13px; color: #58a6ff; }
.ad-link:hover { text-decoration: underline; }
.countdown-bar { height: 3px; background: #21262d; border-radius: 2px; margin: 10px 0 6px; overflow: hidden; }
.countdown-fill { height: 100%; border-radius: 2px; transition: width 1s linear; }
.progress-green { background: #238636; }
.progress-yellow { background: #d29922; }
.progress-red { background: #da3633; }
.ad-controls { display: flex; justify-content: space-between; align-items: center; }
.countdown-text { font-size: 11px; color: #8b949e; }
.dismiss-btn { background: none; border: none; color: #8b949e; cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: 4px; line-height: 1; }
.dismiss-btn:hover { background: #21262d; color: #f0f6fc; }
</style>
