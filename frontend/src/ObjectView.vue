<script setup lang="ts">
import { computed, ref, watch } from "vue";
import JournalBody from "./JournalBody.vue";
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
      filterConfigs
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
  filterConfigs: Record<string, unknown> | null;
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
const showTier0 = ref(true);
const showTier2 = ref(true);
const selectedUnit = ref("all");
const activeFilterPopover = ref<{ entryIndex: number; channel: string } | null>(
  null,
);

const entries = computed(() => [...(data.value?.journal ?? [])].reverse());
const t2Units = computed(() =>
  [
    ...new Set(
      entries.value.flatMap((entry) =>
        entry.tier === 2 && entry.unit ? [entry.unit] : [],
      ),
    ),
  ].sort(),
);
const filteredEntries = computed(() =>
  entries.value.filter((entry) => {
    if (entry.tier === 0) return showTier0.value;
    if (entry.tier === 2) {
      return (
        showTier2.value &&
        (selectedUnit.value === "all" || entry.unit === selectedUnit.value)
      );
    }
    return true;
  }),
);

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

function toggleFilterPopover(entryIndex: number, channel: string) {
  if (
    activeFilterPopover.value?.entryIndex === entryIndex &&
    activeFilterPopover.value.channel === channel
  ) {
    activeFilterPopover.value = null;
  } else {
    activeFilterPopover.value = { entryIndex, channel };
  }
}

function filterConfigurationText(entry: JournalEntry, channel: string) {
  const config = entry.filterConfigs?.[channel];
  return config === undefined
    ? "No filter configuration for this channel."
    : JSON.stringify(config, null, 2) ?? String(config);
}

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

      <section
        class="journal"
        aria-label="Journal"
        @click="activeFilterPopover = null"
        @keydown.esc="activeFilterPopover = null"
      >
        <div class="journal-toolbar">
          <h2>
            Journal
            <span class="result-count"
              >{{ filteredEntries.length }} / {{ entries.length }} entries</span
            >
          </h2>
          <div class="journal-filters" aria-label="Filter journal entries">
            <label class="channel-option">
              <input v-model="showTier0" type="checkbox" />
              <span class="checkmark"></span>
              <span>T0</span>
            </label>
            <label class="channel-option">
              <input v-model="showTier2" type="checkbox" />
              <span class="checkmark"></span>
              <span>T2</span>
            </label>
            <label
              class="unit-filter"
              :class="{ 'unit-filter-disabled': !showTier2 }"
            >
              <select
                v-model="selectedUnit"
                class="form-select"
                aria-label="Filter T2 entries by unit"
                :disabled="!showTier2"
              >
                <option value="all">All units</option>
                <option v-for="unit in t2Units" :key="unit" :value="unit">
                  {{ unit }}
                </option>
              </select>
            </label>
          </div>
        </div>
        <ol class="journal-list">
          <li
            v-for="(entry, index) in filteredEntries"
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
                    class="filter-chip-wrap"
                  >
                    <button
                      type="button"
                      class="catalog-chip filter-channel-button"
                      :aria-expanded="
                        activeFilterPopover?.entryIndex === index &&
                        activeFilterPopover.channel === channel
                      "
                      @click.stop="toggleFilterPopover(index, channel)"
                    >
                      {{ channel }}
                    </button>
                    <div
                      v-if="
                        activeFilterPopover?.entryIndex === index &&
                        activeFilterPopover.channel === channel
                      "
                      class="filter-popover"
                      role="tooltip"
                      @click.stop
                    >
                      <header class="filter-popover-heading">
                        <strong>{{ channel }} filter</strong>
                        <button
                          type="button"
                          class="filter-popover-close"
                          :aria-label="`Close ${channel} filter`"
                          @click="activeFilterPopover = null"
                        >
                          ×
                        </button>
                      </header>
                      <pre>{{ filterConfigurationText(entry, channel) }}</pre>
                    </div>
                  </span>
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

            <JournalBody
              v-if="entry.tier === 2"
              :unit="entry.unit"
              :body="entry.doc?.body ?? null"
            />
          </li>
        </ol>
      </section>
    </template>
  </main>
</template>
