<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import LightCurvePlot from "./LightCurvePlot.vue";
import { catalogKeys, lightCurvePoints, longToString } from "./dashboard";
import type { StockResult } from "./dashboard";

const GRAPHQL_URL =
  import.meta.env.VITE_GRAPHQL_URL ?? "http://localhost:4000/";
const PAGE_SIZE = 20;
const HOUR_MS = 3_600_000;
const initialNow = Date.now();

const channelQuery = `query ChannelChoices($after: DateTime, $before: DateTime) {
  channels(after: $after, before: $before)
}`;

const stockPageQuery = `query RecentStocks(
  $channels: [String!]
  $after: DateTime
  $before: DateTime
  $within: Cone
  $cursor: String
  $limit: Int
) {
  stocksPage(
    channels: $channels
    after: $after
    before: $before
    within: $within
    cursor: $cursor
    limit: $limit
  ) {
    items {
      stock
      photometry: journal(tier: 2) {
        doc {
          link {
            __typename
            ... on T0Document {
              tag
              body
            }
            ... on T1Document {
              dps {
                tag
                body
              }
            }
          }
        }
      }
      catalogMatches: journal(unit: "T2CatalogMatch") {
        doc {
          body
        }
      }
    }
    nextCursor
  }
}`;

interface GraphQLErrorItem {
  message: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLErrorItem[];
}

interface StockPageData {
  stocksPage: {
    items: StockResult[];
    nextCursor: string | null;
  };
}

interface ChannelData {
  channels: string[];
}

const afterMs = ref(initialNow - 7 * 24 * HOUR_MS);
const beforeMs = ref(initialNow);
const nowMs = ref(initialNow);
const coordinateText = ref("");
const arcsecondsText = ref("10");
const channels = ref<string[]>([]);
const selectedChannels = ref<string[]>([]);
const stocks = ref<StockResult[]>([]);
const nextCursor = ref<string | null>(null);
const hasMore = ref(true);
const isLoading = ref(false);
const isLoadingMore = ref(false);
const isLoadingChannels = ref(false);
const errorMessage = ref("");
const appliedSignature = ref("");
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | undefined;
let channelTimer: ReturnType<typeof setTimeout> | undefined;

const selectedRange = computed(() =>
  Math.max(HOUR_MS, beforeMs.value - afterMs.value),
);
const afterDomainMin = computed(() => afterMs.value - selectedRange.value);
const afterLabel = computed(() => formatUtc(afterMs.value));
const beforeLabel = computed(() => formatUtc(beforeMs.value));
const loadedCount = computed(() => stocks.value.length);

const locationValidation = computed(() => {
  const rawCoordinates = coordinateText.value.trim();
  const arcseconds = Number(arcsecondsText.value);
  if (!Number.isFinite(arcseconds) || arcseconds <= 0 || arcseconds >= 100) {
    return { error: "Radius must be greater than 0 and less than 100 arcsec." };
  }
  if (!rawCoordinates) return { cone: undefined };

  const values = rawCoordinates.split(/[\s,]+/).filter(Boolean);
  if (values.length !== 2) {
    return { error: "Enter RA and Dec separated by a comma or whitespace." };
  }
  const [ra, dec] = values.map(Number);
  if (
    ra === undefined ||
    dec === undefined ||
    !Number.isFinite(ra) ||
    !Number.isFinite(dec)
  ) {
    return { error: "RA and Dec must be numeric values." };
  }
  if (ra < 0 || ra > 360 || dec < -90 || dec > 90) {
    return { error: "RA must be 0–360° and Dec must be −90–90°." };
  }
  return { cone: { ra, dec, arcsec: arcseconds } };
});

const filterSignature = computed(() =>
  JSON.stringify({
    after: afterMs.value,
    before: beforeMs.value,
    channels: [...selectedChannels.value].sort(),
    coordinates: coordinateText.value.trim(),
    arcseconds: arcsecondsText.value,
  }),
);

const isDirty = computed(
  () => filterSignature.value !== appliedSignature.value,
);

function formatUtc(value: number): string {
  return new Intl.DateTimeFormat("en", {
    timeZone: "UTC",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

async function requestGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok)
    throw new Error(`GraphQL request failed (${response.status}).`);
  const result = (await response.json()) as GraphQLResponse<T>;
  if (result.errors?.length) {
    throw new Error(result.errors.map((item) => item.message).join("; "));
  }
  if (!result.data)
    throw new Error("The GraphQL response did not contain data.");
  return result.data;
}

function dateVariables() {
  return {
    after: new Date(afterMs.value).toISOString(),
    before: new Date(beforeMs.value).toISOString(),
  };
}

async function loadChannelChoices() {
  isLoadingChannels.value = true;
  try {
    const result = await requestGraphQL<ChannelData>(
      channelQuery,
      dateVariables(),
    );
    channels.value = result.channels;
    selectedChannels.value = selectedChannels.value.filter((channel) =>
      channels.value.includes(channel),
    );
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "Could not load channels.";
  } finally {
    isLoadingChannels.value = false;
  }
}

function stockVariables(cursor: string | null) {
  const location = locationValidation.value;
  return {
    ...dateVariables(),
    channels: selectedChannels.value.length ? selectedChannels.value : null,
    within: location.cone ?? null,
    cursor,
    limit: PAGE_SIZE,
  };
}

async function loadStocks(reset = false) {
  if (reset) {
    isLoading.value = true;
    stocks.value = [];
    nextCursor.value = null;
    hasMore.value = true;
    errorMessage.value = "";
    appliedSignature.value = filterSignature.value;
  } else {
    if (isLoading.value || isLoadingMore.value || !hasMore.value) return;
    isLoadingMore.value = true;
  }

  try {
    const result = await requestGraphQL<StockPageData>(
      stockPageQuery,
      stockVariables(reset ? null : nextCursor.value),
    );
    stocks.value = reset
      ? result.stocksPage.items
      : [...stocks.value, ...result.stocksPage.items];
    nextCursor.value = result.stocksPage.nextCursor;
    hasMore.value = nextCursor.value !== null;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "Could not load recent stocks.";
  } finally {
    isLoading.value = false;
    isLoadingMore.value = false;
  }
}

function applyFilters() {
  if (locationValidation.value.error) return;
  void loadStocks(true);
}

function changeAfter(event: Event) {
  const target = event.target as HTMLInputElement;
  const next = Number(target.value);
  afterMs.value = next <= afterDomainMin.value ? afterDomainMin.value : next;
}

function changeBefore(event: Event) {
  const target = event.target as HTMLInputElement;
  beforeMs.value = Math.min(
    nowMs.value,
    Math.max(afterMs.value, Number(target.value)),
  );
}

function toggleChannel(channel: string, checked: boolean) {
  selectedChannels.value = checked
    ? [...selectedChannels.value, channel]
    : selectedChannels.value.filter((selected) => selected !== channel);
}

function handleChannelChange(channel: string, event: Event) {
  if (event.target instanceof HTMLInputElement) {
    toggleChannel(channel, event.target.checked);
  }
}

function brokerLinks(stock: StockResult) {
  const id = encodeURIComponent(longToString(stock.stock));
  return [
    { name: "Lasair", href: `https://lasair.lsst.ac.uk/objects/${id}/` },
    { name: "Fink", href: `https://lsst.fink-portal.org/${id}` },
    {
      name: "Alerce",
      href: `https://lsst.alerce.online/object/${id}?survey=lsst&page=1&page_size=20&count=false&selected_oid=${id}`,
    },
  ];
}

function scheduleChannelChoices() {
  if (channelTimer) clearTimeout(channelTimer);
  channelTimer = setTimeout(() => {
    channelTimer = undefined;
    void loadChannelChoices();
  }, 250);
}

onMounted(() => {
  void loadChannelChoices();
  void loadStocks(true);
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadStocks();
    },
    { rootMargin: "720px 0px" },
  );
  if (sentinel.value) observer.observe(sentinel.value);
});

watch(sentinel, (element, previous) => {
  if (previous) observer?.unobserve(previous);
  if (element) observer?.observe(element);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  if (channelTimer) clearTimeout(channelTimer);
});
</script>

<template>
  <div class="app-frame">
    <header class="topbar">
      <a class="wordmark" href="#top" aria-label="Ampel dashboard home">
        <span class="wordmark-icon" aria-hidden="true">A</span>
        <span>AMPEL<span class="wordmark-divider">/</span>SKY</span>
      </a>
      <div class="topbar-meta">
        <span class="live-indicator" aria-hidden="true"></span>
        <span>PUBLIC DATA</span>
        <span class="meta-divider"></span>
        <span>READ ONLY</span>
      </div>
    </header>

    <main id="top" class="dashboard-layout">
      <aside class="filter-panel">
        <div class="panel-index"><span>SEARCH</span><span>01 / 03</span></div>
        <h1>Recent <br /><span>transients</span></h1>
        <p class="panel-intro">
          Filter the alert stream by update time, channel, or sky position.
        </p>

        <form class="filter-form" @submit.prevent="applyFilters">
          <section class="filter-section">
            <div class="section-heading">
              <label for="after-slider">Time window</label>
              <span class="unit-label">UTC</span>
            </div>
            <div class="time-labels">
              <div>
                <span>AFTER</span><strong>{{ afterLabel }}</strong>
              </div>
              <div>
                <span>BEFORE</span><strong>{{ beforeLabel }}</strong>
              </div>
            </div>
            <div class="range-control" aria-label="Select update time range">
              <input
                id="after-slider"
                class="range-slider range-after"
                type="range"
                :min="afterDomainMin"
                :max="beforeMs"
                :step="HOUR_MS"
                :value="afterMs"
                aria-label="After date; extend earlier by dragging to the left edge"
                @input="changeAfter"
                @change="scheduleChannelChoices"
              />
              <input
                class="range-slider range-before"
                type="range"
                :min="afterMs"
                :max="nowMs"
                :step="HOUR_MS"
                :value="beforeMs"
                aria-label="Before date"
                @input="changeBefore"
                @change="scheduleChannelChoices"
              />
            </div>
            <div class="range-ends"><span>EARLIER</span><span>NOW</span></div>
          </section>

          <section class="filter-section">
            <div class="section-heading">
              <span>Channels</span>
              <span class="unit-label">{{
                selectedChannels.length ? selectedChannels.length : "ALL"
              }}</span>
            </div>
            <div
              class="channel-list"
              :class="{ 'channel-list-loading': isLoadingChannels }"
            >
              <label class="channel-option channel-all">
                <input
                  type="checkbox"
                  :checked="selectedChannels.length === 0"
                  @change="selectedChannels = []"
                />
                <span class="checkmark"></span>
                <span>All channels</span>
              </label>
              <label
                v-for="channel in channels"
                :key="channel"
                class="channel-option"
              >
                <input
                  type="checkbox"
                  :checked="selectedChannels.includes(channel)"
                  @change="handleChannelChange(channel, $event)"
                />
                <span class="checkmark"></span>
                <span>{{ channel }}</span>
              </label>
              <span v-if="isLoadingChannels" class="channel-loading"
                >Updating channels…</span
              >
              <span v-else-if="!channels.length" class="channel-loading"
                >No channels in this range</span
              >
            </div>
            <p class="field-note">
              Multiple selections include matches from any selected channel.
            </p>
          </section>

          <section class="filter-section location-section">
            <div class="section-heading">
              <label for="coordinates">Sky position</label>
              <span class="unit-label">ICRS</span>
            </div>
            <label class="input-label" for="coordinates"
              >Right ascension, declination</label
            >
            <input
              id="coordinates"
              v-model="coordinateText"
              class="form-control coordinate-input"
              type="text"
              placeholder="e.g. 283.77, −20.71"
              autocomplete="off"
              spellcheck="false"
            />
            <div class="radius-row">
              <label class="input-label" for="radius">Radius</label>
              <div class="radius-control">
                <input
                  id="radius"
                  v-model="arcsecondsText"
                  class="form-control"
                  type="number"
                  min="0.0001"
                  max="99.9999"
                  step="any"
                />
                <span>arcsec</span>
              </div>
            </div>
            <p
              v-if="locationValidation.error"
              class="validation-message"
              role="alert"
            >
              {{ locationValidation.error }}
            </p>
            <p v-else class="field-note">
              Leave coordinates blank to search all positions.
            </p>
          </section>

          <button
            class="apply-button"
            type="submit"
            :disabled="!!locationValidation.error"
          >
            <span>Apply filters</span><span aria-hidden="true">↗</span>
          </button>
          <p v-if="isDirty" class="pending-note">
            Filters changed. Apply to refresh results.
          </p>
        </form>

        <div class="sidebar-footer">
          <span>AMPEL TRANSIENT VIEWER</span><span>v 01</span>
        </div>
      </aside>

      <section class="results-panel" aria-label="Recent transient results">
        <div class="results-toolbar">
          <div>
            <div class="eyebrow">LIVE CATALOGUE / RECENT</div>
            <h2>
              Objects
              <span class="result-count"
                >{{ loadedCount.toLocaleString() }} loaded</span
              >
            </h2>
          </div>
          <div
            class="result-state"
            :class="{ 'state-loading': isLoading || isLoadingMore }"
          >
            <span class="state-dot"></span>
            <span>{{
              isLoading
                ? "QUERYING"
                : isLoadingMore
                  ? "FETCHING NEXT PAGE"
                  : "FILTERED VIEW"
            }}</span>
          </div>
        </div>

        <div v-if="errorMessage" class="query-error" role="alert">
          <span class="error-mark">!</span>
          <div>
            <strong>Could not update the catalogue</strong
            ><span>{{ errorMessage }}</span>
          </div>
          <button type="button" class="retry-button" @click="applyFilters">
            Retry
          </button>
        </div>

        <div
          v-if="isLoading && !stocks.length"
          class="loading-state"
          aria-live="polite"
        >
          <span class="loading-bar"></span
          ><span>Retrieving recent objects…</span>
        </div>

        <div v-else-if="!stocks.length && !errorMessage" class="empty-state">
          <span class="empty-orbit" aria-hidden="true"><i></i><b></b></span>
          <div class="eyebrow">NO MATCHES IN THIS WINDOW</div>
          <h3>Nothing in view yet.</h3>
          <p>
            Try widening the time range or clearing a channel or location
            filter.
          </p>
        </div>

        <div v-else class="stock-list">
          <article
            v-for="stock in stocks"
            :key="longToString(stock.stock)"
            class="stock-row"
          >
            <header class="stock-heading">
              <span class="object-label">OBJECT</span>
              <a
                class="stock-id"
                :href="`https://lasair.lsst.ac.uk/objects/${encodeURIComponent(
                  longToString(stock.stock),
                )}/`"
                target="_blank"
                rel="noreferrer"
              >
                {{ longToString(stock.stock) }}
              </a>
              <span class="row-index">{{
                String(stocks.indexOf(stock) + 1).padStart(3, "0")
              }}</span>
            </header>
            <div class="stock-content">
              <div class="link-rail">
                <div class="eyebrow rail-heading">EXPLORE OBJECT</div>
                <div class="broker-links">
                  <a
                    v-for="link in brokerLinks(stock)"
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
        </div>

        <div ref="sentinel" class="page-sentinel" aria-live="polite">
          <span v-if="isLoadingMore" class="sentinel-status"
            ><span class="mini-spinner"></span>Loading next 20</span
          >
          <span v-else-if="!hasMore && stocks.length" class="sentinel-status"
            >END OF CURRENT RESULTS</span
          >
        </div>
      </section>
    </main>
  </div>
</template>
