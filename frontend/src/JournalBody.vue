<script setup lang="ts">
import { computed } from "vue";
import VueJsonPretty from "vue-json-pretty";
import RadarPlot from "./RadarPlot.vue";
import "vue-json-pretty/lib/styles.css";
import "./vjs-tree-style.css";

type JsonRecord = Record<string, unknown>;

const props = defineProps<{
  unit: string | null;
  body: JsonRecord | null;
}>();

function asRecord(value: unknown): JsonRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return String(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value) ?? String(value);
}

function firstParsnip(value: unknown): JsonRecord | null {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function numericSeries(value: unknown): { labels: string[]; values: number[] } {
  if (Array.isArray(value)) {
    const pairs = value
      .map((item, index) => [String(index + 1), item] as const)
      .filter(
        (pair): pair is readonly [string, number] =>
          typeof pair[1] === "number" && Number.isFinite(pair[1]),
      );
    return {
      labels: pairs.map(([label]) => label),
      values: pairs.map(([, item]) => item),
    };
  }

  const record = asRecord(value);
  const pairs = Object.entries(record ?? {}).filter(
    (pair): pair is [string, number] =>
      typeof pair[1] === "number" && Number.isFinite(pair[1]),
  );
  return {
    labels: pairs.map(([label]) => label),
    values: pairs.map(([, item]) => item),
  };
}

const catalogEntries = computed(() =>
  Object.entries(props.body ?? {}).filter(([, value]) => value !== null),
);
const tabulatorEntries = computed(() => Object.entries(props.body ?? {}));

const classifications = computed(() => {
  const value = props.body?.classifications;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    const classification = asRecord(item);
    if (!classification) return [];

    const parsnip = firstParsnip(classification.parsnip);
    const scores = parsnip?.classification;
    const series = numericSeries(Array.isArray(scores) ? scores[0] : scores);
    console.log(series);

    return [
      {
        key: `${String(classification.name ?? "classification")}-${index}`,
        name: String(classification.name ?? `Classification ${index + 1}`),
        version: classification.version,
        prediction: asRecord(parsnip?.prediction),
        ...series,
      },
    ];
  });
});

const predictionMetrics = [
  ["REDSHIFT", "redshift"],
  ["DOF", "model_dof"],
] as const;
</script>

<template>
  <div
    v-if="unit === 'T2CatalogMatch' || unit === 'T2LSPhotoZTap'"
    class="catalog-match-grid"
  >
    <article
      v-for="[name, rawValue] in catalogEntries"
      :key="name"
      class="catalog-match-card"
    >
      <header class="catalog-match-title">
        <strong>{{ name }}</strong>
        <span v-if="asRecord(rawValue)?.dist2transient != null">
          {{ Number(asRecord(rawValue)?.dist2transient).toFixed(1) }}"
        </span>
      </header>
      <table class="catalog-value-table">
        <tbody>
          <template v-if="asRecord(rawValue)">
            <tr
              v-for="[key, value] in Object.entries(
                asRecord(rawValue) ?? {},
              ).filter(([key]) => key !== 'dist2transient')"
              :key="key"
            >
              <th scope="row">{{ key }}</th>
              <td>{{ formatValue(value) }}</td>
            </tr>
          </template>
          <tr v-else>
            <th scope="row">Value</th>
            <td>{{ formatValue(rawValue) }}</td>
          </tr>
        </tbody>
      </table>
    </article>
    <span v-if="!catalogEntries.length" class="no-catalog">No matches</span>
  </div>

  <div v-else-if="unit === 'T2TabulatorRiseDecline'" class="journal-body">
    <table class="catalog-value-table tabulator-value-table">
      <tbody>
        <tr v-for="[key, value] in tabulatorEntries" :key="key">
          <th scope="row">{{ key }}</th>
          <td>{{ formatValue(value) }}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div v-else-if="unit === 'T2RunParsnipRiseDecline'" class="parsnip-body">
    <article
      v-for="classification in classifications"
      :key="classification.key"
      class="parsnip-classification"
    >
      <header class="parsnip-classification-title">
        <strong>{{ classification.name }}</strong>
        <span v-if="classification.version != null" class="result-count">
          {{ classification.version }}
        </span>
      </header>
      <RadarPlot
        v-if="classification.labels.length"
        :labels="classification.labels"
        :values="classification.values"
      />
      <span v-else class="no-catalog"
        >No numeric Parsnip classification values</span
      >
      <div class="data-chips">
        <span
          v-for="[label, key] in predictionMetrics.filter(
            ([, key]) => classification.prediction?.[key] != null,
          )"
          :key="key"
          class="data-chip"
        >
          <span>{{ label }}</span>
          <strong>{{ formatValue(classification.prediction?.[key]) }}</strong>
        </span>
        <span
          v-if="
            Number(classification.prediction?.model_dof) > 0 &&
            classification.prediction?.model_chisq != null
          "
          class="data-chip"
        >
          <span>CHI²/DOF</span>
          <strong>{{
            (
              Number(classification.prediction?.model_chisq) /
              Number(classification.prediction?.model_dof)
            ).toFixed(2)
          }}</strong>
        </span>
      </div>
    </article>
    <details class="raw-body-disclosure">
      <summary>Raw body</summary>
      <div class="journal-body">
        <VueJsonPretty
          :data="body ?? {}"
          :show-double-quotes="false"
          :show-length="true"
          :deep="1"
        />
      </div>
    </details>
    <span v-if="!classifications.length" class="no-catalog"
      >No classifications</span
    >
  </div>

  <div v-else class="journal-body">
    <VueJsonPretty
      v-if="body"
      :data="body"
      :show-double-quotes="false"
      :show-length="true"
      :deep="1"
    />
    <span v-else class="no-catalog">No body</span>
  </div>
</template>
