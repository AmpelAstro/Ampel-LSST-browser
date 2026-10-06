<script setup lang="ts">
import LightCurvePlot from "./LightCurvePlot.vue";
import { catalogKeys, lightCurvePoints, longToString } from "./dashboard";
import type { StockResult } from "./dashboard";

const props = withDefaults(
  defineProps<{ stock: StockResult; index?: number; linkToObject?: boolean }>(),
  { linkToObject: true },
);

function brokerLinks() {
  const id = encodeURIComponent(longToString(props.stock.stock));
  return [
    { name: "Lasair", href: `https://lasair.lsst.ac.uk/objects/${id}/` },
    { name: "Fink", href: `https://lsst.fink-portal.org/${id}` },
    {
      name: "Alerce",
      href: `https://lsst.alerce.online/object/${id}?survey=lsst&page=1&page_size=20&count=false&selected_oid=${id}`,
    },
  ];
}
</script>

<template>
  <article class="stock-row">
    <header class="stock-heading">
      <span class="object-label">OBJECT</span>
      <router-link
        v-if="linkToObject"
        class="stock-id"
        :to="`/stock/${encodeURIComponent(longToString(stock.stock))}`"
      >
        {{ longToString(stock.stock) }}
      </router-link>
      <span v-else class="stock-id">{{ longToString(stock.stock) }}</span>
      <div
        class="catalog-chips stock-channel-chips"
        aria-label="Matched channels"
      >
        <span
          v-for="channel in stock.channel ?? []"
          :key="channel"
          class="catalog-chip"
          >{{ channel }}</span
        >
      </div>
      <span v-if="index !== undefined" class="row-index">{{
        String(index + 1).padStart(3, "0")
      }}</span>
    </header>
    <div class="stock-content">
      <div class="link-rail">
        <div class="eyebrow rail-heading">EXPLORE OBJECT</div>
        <div class="broker-links">
          <a
            v-for="link in brokerLinks()"
            :key="link.name"
            :href="link.href"
            target="_blank"
            rel="noreferrer"
            class="broker-link"
            >{{ link.name }}<span aria-hidden="true">↗</span></a
          >
        </div>
        <div class="eyebrow catalog-heading">CATALOG MATCHES</div>
        <div class="catalog-chips">
          <span
            v-for="key in catalogKeys(stock)"
            :key="key"
            class="catalog-chip"
            >{{ key }}</span
          >
          <span v-if="!catalogKeys(stock).length" class="no-catalog"
            >No matches</span
          >
        </div>
      </div>
      <div class="curve-panel">
        <div class="curve-heading">
          <span class="eyebrow">LIGHT CURVE</span>
          <span class="point-count"
            >{{ lightCurvePoints(stock).length }}
            {{
              lightCurvePoints(stock).length === 1 ? "point" : "points"
            }}</span
          >
        </div>
        <LightCurvePlot :points="lightCurvePoints(stock)" />
      </div>
    </div>
  </article>
</template>
