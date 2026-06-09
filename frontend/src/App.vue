<template>
  <div id="app">
    <NavBar />
    <main class="container">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import NavBar from './components/NavBar.vue'
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; }
.container { max-width: 1200px; margin: 0 auto; padding: 20px; }
a { color: #58a6ff; text-decoration: none; }
a:hover { text-decoration: underline; }
button, .btn { cursor: pointer; border: none; padding: 8px 16px; border-radius: 6px; font-size: 14px; }
.btn-primary { background: #238636; color: #fff; }
.btn-primary:hover { background: #2ea043; }
.btn-secondary { background: #21262d; color: #c9d1d9; border: 1px solid #30363d; }
.btn-secondary:hover { background: #30363d; }
input, select, textarea { background: #0d1117; border: 1px solid #30363d; color: #c9d1d9; padding: 8px 12px; border-radius: 6px; font-size: 14px; width: 100%; }
input:focus, select:focus, textarea:focus { outline: none; border-color: #58a6ff; }
.text-center { text-align: center; }
.mt-2 { margin-top: 10px; }
.mt-4 { margin-top: 20px; }
.mb-2 { margin-bottom: 10px; }
.flex { display: flex; }
.flex-between { display: flex; justify-content: space-between; align-items: center; }
.gap-2 { gap: 10px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 16px; }
@media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
.card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; background: #1f6feb33; color: #58a6ff; }
.loading { text-align: center; padding: 40px; color: #8b949e; }
.error { color: #f85149; padding: 20px; text-align: center; }
.page-title { font-size: 24px; font-weight: 600; margin-bottom: 20px; }
</style>
