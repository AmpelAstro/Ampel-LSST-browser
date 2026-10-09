<script setup lang="ts">
import { nextTick, ref } from "vue";
import LightCurvePlot from "./LightCurvePlot.vue";
import JournalBody from "./JournalBody.vue";
import { catalogKeys, lightCurvePoints, longToString } from "./dashboard";
import type { StockResult } from "./dashboard";

const props = withDefaults(
  defineProps<{ stock: StockResult; index?: number; linkToObject?: boolean }>(),
  { linkToObject: true },
);
const activeCatalogPopover = ref<string | null>(null);
const catalogPopoverOffset = ref(0);
const catalogPopover = ref<HTMLElement | null>(null);

async function toggleCatalogPopover(key: string, event: MouseEvent) {
  if (activeCatalogPopover.value === key) {
    activeCatalogPopover.value = null;
    return;
  }

  const trigger = event.currentTarget as HTMLElement;
  const triggerLeft = trigger.getBoundingClientRect().left;
  activeCatalogPopover.value = key;
  await nextTick();

  const popoverWidth = catalogPopover.value?.getBoundingClientRect().width ?? 0;
  const viewportLeft = Math.min(
    Math.max(triggerLeft, 16),
    Math.max(16, window.innerWidth - popoverWidth - 16),
  );
  catalogPopoverOffset.value = viewportLeft - triggerLeft;
}

function catalogMatchBodies(key: string): Array<Record<string, unknown>> {
  const bodies: Array<Record<string, unknown>> = [];
  for (const match of props.stock.catalogMatches ?? []) {
    const body = match.doc?.body;
    if (!body || !Object.hasOwn(body, key) || body[key] === null) continue;
    bodies.push({ [key]: body[key] });
  }
  return bodies;
}

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
  <article
    class="stock-row"
    :class="{ 'stock-row-popover-open': activeCatalogPopover !== null }"
    @click="activeCatalogPopover = null"
    @keydown.esc="activeCatalogPopover = null"
  >
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
            class="catalog-chip-popover-wrap"
          >
            <button
              type="button"
              class="catalog-chip filter-channel-button"
              :aria-expanded="activeCatalogPopover === key"
              @click.stop="toggleCatalogPopover(key, $event)"
            >
              {{ key }}
            </button>
            <div
              v-if="activeCatalogPopover === key"
              ref="catalogPopover"
              class="filter-popover catalog-match-popover"
              :style="{ left: `${catalogPopoverOffset}px` }"
              role="tooltip"
              @click.stop
            >
              <JournalBody
                v-for="(body, index) in catalogMatchBodies(key)"
                :key="index"
                unit="T2CatalogMatch"
                :body="body"
              />
            </div>
          </span>
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
