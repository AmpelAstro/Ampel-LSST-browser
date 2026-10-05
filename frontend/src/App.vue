<template>
  <div class="app-frame">
    <header class="topbar">
      <router-link class="wordmark" to="/" aria-label="Ampel dashboard home">
        <span class="wordmark-icon" aria-hidden="true">A</span>
        <span>AMPEL<span class="wordmark-divider">/</span>LSST</span>
      </router-link>
      <div class="topbar-meta">
        <span class="live-indicator" aria-hidden="true"></span>
        <span>PUBLIC DATA</span>
        <span class="meta-divider"></span>
        <span>READ ONLY</span>
      </div>
    </header>
    <router-view v-slot="{ Component }">
      <keep-alive include="RecentView">
        <component :is="Component" />
      </keep-alive>
    </router-view>
  </div>
</template>
