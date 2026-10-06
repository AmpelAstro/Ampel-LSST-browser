<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import type { Data, Layout } from "plotly.js-dist-min";

const props = defineProps<{
  labels: string[];
  values: number[];
}>();

const chart = ref<HTMLDivElement | null>(null);
type PlotlyRuntime = typeof import("plotly.js-dist-min").default;
let plotly: PlotlyRuntime | undefined;
let resizeObserver: ResizeObserver | undefined;

async function render() {
  const element = chart.value;
  if (!element || !props.labels.length || !props.values.length) return;

  const plotlyModule = await import("plotly.js-dist-min");
  if (chart.value !== element) return;
  plotly = plotlyModule.default;

  const trace: Data = {
    type: "scatterpolar",
    r: [...props.values, props.values[0]!],
    theta: [...props.labels, props.labels[0]!],
    fill: "toself",
    mode: "lines+markers",
    line: { color: "#235b47", width: 2 },
    marker: { color: "#dc684a", size: 5 },
    fillcolor: "rgba(35, 91, 71, 0.16)",
    hovertemplate: "%{theta}: %{r}<extra></extra>",
  };
  const maxValue = Math.max(...props.values.map((value) => Math.abs(value)), 1);
  const layout: Partial<Layout> = {
    autosize: true,
    height: 250,
    margin: { l: 36, r: 36, t: 24, b: 24 },
    paper_bgcolor: "#ffffff",
    showlegend: false,
    font: { family: "IBM Plex Sans, sans-serif", color: "#53645c", size: 10 },
    polar: {
      radialaxis: {
        visible: true,
        range: [0, maxValue * 1.08],
        gridcolor: "#e6ece8",
        linecolor: "#d1dcd5",
        tickfont: { size: 8 },
      },
      angularaxis: { gridcolor: "#e6ece8", linecolor: "#d1dcd5" },
    },
  };

  await plotly.react(element, [trace], layout, {
    responsive: true,
    displayModeBar: false,
    scrollZoom: false,
  });
}

watch(
  () => [props.labels, props.values],
  () => void render(),
  {
    deep: true,
    immediate: true,
  },
);

watch(
  chart,
  (element, previous) => {
    if (previous) resizeObserver?.unobserve(previous);
    if (element) {
      resizeObserver ??= new ResizeObserver(() => {
        if (chart.value && plotly) plotly.Plots.resize(chart.value);
      });
      resizeObserver.observe(element);
      void render();
    }
  },
  { flush: "post" },
);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (chart.value && plotly) plotly.purge(chart.value);
});
</script>

<template>
  <div ref="chart" class="parsnip-radar"></div>
</template>
