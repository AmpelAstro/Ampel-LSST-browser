<script setup lang="ts">
import { computed, ref, watch } from "vue";
import VueJsonPretty from "vue-json-pretty";
import "vue-json-pretty/lib/styles.css";
// harmonize font family with the rest of the app
import "./vjs-tree-style.css";
import StockRow from "./StockRow.vue";
import { decodeActionFlags, formatTimeDelta } from "./actions";
import type { JournalRecord, StockResult } from "./dashboard";
import { PHOTOMETRY_LINK_FIELDS, requestGraphQL } from "./graphql";

const props = defineProps<{ id: string }>();

const stockQuery = `query Stock($stock: Long!) {
  stock(stock: $stock) {
    stock
    channel
    journal {
      tier
      ts
      unit
      channel
      action
      alert
      target_name
      observation_reason
      doc {
        body
        ${PHOTOMETRY_LINK_FIELDS}
      }
    }
  }
}`;

type JournalDoc = NonNullable<JournalRecord["doc"]> | null;

interface JournalEntry {
  tier: number | null;
  ts: string | null;
  unit: string | null;
  channel: string[];
  action: number | null;
  alert: string | null;
  target_name: string | null;
  observation_reason: string | null;
  doc: JournalDoc;
}

interface StockData {
  stock: {
    stock: StockResult["stock"];
    channel: string[] | null;
    journal: JournalEntry[] | null;
  } | null;
}

const data = ref<StockData["stock"]>(null);
const isLoading = ref(false);
const errorMessage = ref("");
const loadedAt = ref(Date.now());

const entries = computed(() => [...(data.value?.journal ?? [])].reverse());

const stockRow = computed<StockResult | null>(() => {
  if (!data.value) return null;
  const journal = data.value.journal ?? [];
  return {
    stock: data.value.stock,
    channel: data.value.channel,
    photometry: journal.filter((entry) => entry.tier === 2),
    catalogMatches: journal.filter((entry) => entry.unit === "T2CatalogMatch"),
  };
});

async function load(id: string) {
  isLoading.value = true;
  errorMessage.value = "";
  data.value = null;
  try {
    if (!/^-?\d+$/.test(id))
      throw new Error(`"${id}" is not a valid stock id.`);
    const result = await requestGraphQL<StockData>(stockQuery, { stock: id });
    data.value = result.stock;
    loadedAt.value = Date.now();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "Could not load the object.";
  } finally {
    isLoading.value = false;
  }
}

watch(() => props.id, load, { immediate: true });
</script>

<template>
  <main class="object-layout">
    <router-link class="back-link" to="/">← Recent objects</router-link>

    <div v-if="errorMessage" class="query-error" role="alert">
      <span class="error-mark">!</span>
      <div>
        <strong>Could not load the object</strong
        ><span>{{ errorMessage }}</span>
      </div>
      <button type="button" class="retry-button" @click="load(props.id)">
        Retry
      </button>
    </div>

    <div v-else-if="isLoading" class="loading-state" aria-live="polite">
      <span class="loading-bar"></span><span>Retrieving object…</span>
    </div>

    <div v-else-if="!stockRow" class="empty-state">
      <div class="eyebrow">NOT FOUND</div>
      <h3>No object with id {{ id }}.</h3>
    </div>

    <template v-else>
      <StockRow :stock="stockRow" :link-to-object="false" />

      <section class="journal" aria-label="Journal">
        <h2>
          Journal
          <span class="result-count">{{ entries.length }} entries</span>
        </h2>
        <ol class="journal-list">
          <li
            v-for="(entry, index) in entries"
            :key="index"
            class="journal-entry"
          >
            <header class="journal-heading">
              <span class="tier-badge">T{{ entry.tier ?? "?" }}</span>
              <template v-if="entry.tier === 2">
                <strong class="journal-unit">{{ entry.unit }}</strong>
                <span class="catalog-chips">
                  <span
                    v-for="channel in entry.channel"
                    :key="channel"
                    class="catalog-chip"
                    >{{ channel }}</span
                  >
                </span>
              </template>
              <span class="journal-time">{{
                formatTimeDelta(entry.ts, loadedAt)
              }}</span>
            </header>

            <dl v-if="entry.tier !== 2" class="journal-fields">
              <div v-if="entry.alert">
                <dt>ALERT</dt>
                <dd>{{ entry.alert }}</dd>
              </div>
              <div v-if="entry.target_name">
                <dt>TARGET</dt>
                <dd>{{ entry.target_name }}</dd>
              </div>
              <div v-if="entry.observation_reason">
                <dt>REASON</dt>
                <dd>{{ entry.observation_reason }}</dd>
              </div>
              <div v-if="entry.channel.length">
                <dt>CHANNELS</dt>
                <dd class="catalog-chips">
                  <span
                    v-for="channel in entry.channel"
                    :key="channel"
                    class="catalog-chip"
                    >{{ channel }}</span
                  >
                </dd>
              </div>
            </dl>

            <div class="flag-chips" aria-label="Action flags">
              <span
                v-for="flag in decodeActionFlags(entry.action)"
                :key="flag"
                class="flag-chip"
                >{{ flag }}</span
              >
            </div>

            <div v-if="entry.tier === 2" class="journal-body">
              <VueJsonPretty
                v-if="entry.doc?.body"
                :data="entry.doc.body"
                :show-double-quotes="false"
                :show-length="true"
                :deep="1"
              />
              <span v-else class="no-catalog">No body</span>
            </div>
          </li>
        </ol>
      </section>
    </template>
  </main>
</template>
