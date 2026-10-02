<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import type { Data, Layout } from "plotly.js-dist-min";
import type { PhotometryPoint } from "./dashboard";

const props = defineProps<{ points: PhotometryPoint[] }>();
const chart = ref<HTMLDivElement | null>(null);
let resizeObserver: ResizeObserver | undefined;
type PlotlyRuntime = typeof import("plotly.js-dist-min").default;
let plotly: PlotlyRuntime | undefined;

const bands = [
  { name: "u", color: "#1f77b4", symbol: "circle" },
  { name: "g", color: "#2ca02c", symbol: "square" },
  { name: "r", color: "#d62728", symbol: "diamond" },
  { name: "i", color: "#ff7f0e", symbol: "triangle-up" },
  { name: "z", color: "#8c564b", symbol: "cross" },
  { name: "y", color: "#e377c2", symbol: "star" },
] as const;

function magnitudeTicks(points: PhotometryPoint[]) {
  const positiveFluxes = points
    .map((point) => point.flux)
    .filter((flux) => flux > 0 && Number.isFinite(flux));
  if (!positiveFluxes.length) return [];

  const minFlux = Math.min(...positiveFluxes);
  const maxFlux = Math.max(...positiveFluxes);
  const minMagnitude = 31.4 - 2.5 * Math.log10(maxFlux);
  const maxMagnitude = 31.4 - 2.5 * Math.log10(minFlux);
  const firstMagnitude = Math.ceil(minMagnitude);
  const lastMagnitude = Math.floor(maxMagnitude);
  const magnitudes =
    firstMagnitude <= lastMagnitude
      ? Array.from(
          { length: lastMagnitude - firstMagnitude + 1 },
          (_, index) => firstMagnitude + index,
        )
      : [(minMagnitude + maxMagnitude) / 2];

  return magnitudes
    .map((magnitude) => ({
      magnitude,
      flux: 10 ** ((31.4 - magnitude) / 2.5),
    }))
    .sort((left, right) => left.flux - right.flux);
}

async function renderChart(points: PhotometryPoint[]) {
  const element = chart.value;
  if (!element || !points.length) return;

  const plotlyModule = await import("plotly.js-dist-min");
  if (chart.value !== element) return;
  plotly = plotlyModule.default;

  const traces: Data[] = bands.flatMap((band) => {
    const matches = points.filter((point) => point.band === band.name);
    if (!matches.length) return [];
    return [
      {
        type: "scatter",
        mode: "markers",
        name: band.name,
        x: matches.map((point) => new Date(point.utcTime)),
        y: matches.map((point) => point.flux),
        marker: { color: band.color, symbol: band.symbol, size: 5 },
        error_y: {
          type: "data",
          array: matches.map((point) => point.fluxError),
          visible: true,
          color: band.color,
          thickness: 1,
          width: 0,
        },
        hovertemplate:
          "%{x|%Y-%m-%d %H:%M:%S UTC}<br>%{y:.2f} nJy<extra>%{fullData.name}</extra>",
      },
    ];
  });
  if (points.some((point) => point.flux > 0)) {
    traces.push({
      type: "scatter",
      mode: "markers",
      name: "AB magnitude scale",
      x: points.map((point) => new Date(point.utcTime)),
      y: points.map((point) => point.flux),
      yaxis: "y2",
      marker: { opacity: 0, size: 0 },
      showlegend: false,
      hoverinfo: "skip",
    });
  }

  const layout: Partial<Layout> = {
    autosize: true,
    margin: { l: 58, r: 64, t: 12, b: 46 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    font: { family: "IBM Plex Sans, sans-serif", color: "#53645c", size: 11 },
    xaxis: {
      type: "date",
      title: { text: "Observation time (UTC)" },
      gridcolor: "#e6ece8",
      linecolor: "#d1dcd5",
      tickfont: { family: "IBM Plex Mono, monospace", size: 10 },
    },
    yaxis: {
      title: { text: "Flux (nJy)" },
      gridcolor: "#e6ece8",
      zerolinecolor: "#aebbb3",
      linecolor: "#d1dcd5",
    },
    yaxis2: {
      title: { text: "Magnitude (AB)" },
      overlaying: "y",
      matches: "y",
      side: "right",
      tickmode: "array",
      tickvals: magnitudeTicks(points).map((tick) => tick.flux),
      ticktext: magnitudeTicks(points).map((tick) => tick.magnitude.toFixed(1)),
      showgrid: false,
      zeroline: false,
      linecolor: "#d1dcd5",
    },
    legend: { orientation: "h", y: 1.16, x: 0, font: { size: 10 } },
    hoverlabel: { bgcolor: "#14251e", font: { color: "#ffffff" } },
  };

  await plotly.react(element, traces, layout, {
    responsive: true,
    displayModeBar: false,
    scrollZoom: false,
  });
}

watch(
  () => props.points,
  (points) => void renderChart(points),
  { deep: true, immediate: true },
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
      void renderChart(props.points);
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
  <div class="plot-frame">
    <div v-if="!points.length" class="plot-empty">No photometry points</div>
    <div
      ref="chart"
      class="light-curve-chart"
      :class="{ 'is-empty': !points.length }"
    ></div>
  </div>
</template>
