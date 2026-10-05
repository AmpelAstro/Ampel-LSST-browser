export type LongValue =
  | string
  | number
  | { $numberLong?: string; $numberInt?: string };

export interface PhotometryPoint {
  visit: string;
  band: string;
  utcTime: number;
  flux: number;
  fluxError: number;
}

interface DataPoint {
  id?: LongValue;
  tag?: string[] | null;
  body?: Record<string, unknown> | null;
}

interface LinkedDocument {
  __typename?: string;
  body?: Record<string, unknown> | null;
  dps?: DataPoint[] | null;
}

export interface JournalRecord {
  doc?: {
    body?: Record<string, unknown> | null;
    link?: LinkedDocument | null;
  } | null;
}

export interface StockResult {
  stock: LongValue;
  channel?: string[] | null;
  photometry?: JournalRecord[] | null;
  catalogMatches?: JournalRecord[] | null;
}

const DAY_MS = 86_400_000;
const MJD_EPOCH_MS = Date.UTC(1858, 10, 17);

const TAI_UTC_STEPS: Array<[number, number]> = [
  [Date.UTC(1972, 0, 1), 10],
  [Date.UTC(1972, 6, 1), 11],
  [Date.UTC(1973, 0, 1), 12],
  [Date.UTC(1974, 0, 1), 13],
  [Date.UTC(1975, 0, 1), 14],
  [Date.UTC(1976, 0, 1), 15],
  [Date.UTC(1977, 0, 1), 16],
  [Date.UTC(1978, 0, 1), 17],
  [Date.UTC(1979, 0, 1), 18],
  [Date.UTC(1980, 0, 1), 19],
  [Date.UTC(1981, 6, 1), 20],
  [Date.UTC(1982, 6, 1), 21],
  [Date.UTC(1983, 6, 1), 22],
  [Date.UTC(1985, 6, 1), 23],
  [Date.UTC(1988, 0, 1), 24],
  [Date.UTC(1990, 0, 1), 25],
  [Date.UTC(1991, 0, 1), 26],
  [Date.UTC(1992, 6, 1), 27],
  [Date.UTC(1993, 6, 1), 28],
  [Date.UTC(1994, 6, 1), 29],
  [Date.UTC(1996, 0, 1), 30],
  [Date.UTC(1997, 6, 1), 31],
  [Date.UTC(1999, 0, 1), 32],
  [Date.UTC(2006, 0, 1), 33],
  [Date.UTC(2009, 0, 1), 34],
  [Date.UTC(2012, 6, 1), 35],
  [Date.UTC(2015, 6, 1), 36],
  [Date.UTC(2017, 0, 1), 37],
];

export function longToString(value: LongValue): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return value.$numberLong ?? value.$numberInt ?? "";
}

function mjdTaiToUtcMilliseconds(mjdTai: number): number {
  const taiMilliseconds = MJD_EPOCH_MS + mjdTai * DAY_MS;
  let utcMilliseconds = taiMilliseconds - 37_000;
  for (let step = 0; step < 2; step += 1) {
    let offset = 10;
    for (const [effectiveUtc, nextOffset] of TAI_UTC_STEPS) {
      if (utcMilliseconds < effectiveUtc) break;
      offset = nextOffset;
    }
    utcMilliseconds = taiMilliseconds - offset * 1000;
  }
  return utcMilliseconds;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function datapointsFromJournal(records: JournalRecord[] = []): DataPoint[] {
  const datapoints: DataPoint[] = [];
  for (const record of records) {
    const linked = record.doc?.link;
    if (linked?.__typename === "T1Document") {
      datapoints.push(...(linked.dps ?? []));
    } else if (linked?.__typename === "T0Document" && linked.body) {
      datapoints.push({ body: linked.body });
    }
  }
  return datapoints;
}

function candidatePriority(tags: string[]): number {
  if (tags.includes("LSST_DP")) return 2;
  if (tags.includes("LSST_FP")) return 1;
  return 0;
}

export function lightCurvePoints(stock: StockResult): PhotometryPoint[] {
  const selected = new Map<
    string,
    { point: PhotometryPoint; priority: number }
  >();

  for (const datapoint of datapointsFromJournal(stock.photometry ?? [])) {
    const body = asRecord(datapoint.body);
    const tags = datapoint.tag ?? [];
    if (!body || tags.includes("LSST_OBJ")) continue;

    const visitValue = body.visit;
    if (
      typeof visitValue !== "string" &&
      typeof visitValue !== "number" &&
      (typeof visitValue !== "object" || visitValue === null)
    ) {
      continue;
    }
    const visit = longToString(visitValue as LongValue);
    const band = body.band;
    const midpointMjdTai = body.midpointMjdTai;
    const flux = body.psfFlux;
    const fluxError = body.psfFluxErr;
    if (
      !visit ||
      typeof band !== "string" ||
      typeof midpointMjdTai !== "number" ||
      typeof flux !== "number" ||
      typeof fluxError !== "number" ||
      !Number.isFinite(midpointMjdTai) ||
      !Number.isFinite(flux) ||
      !Number.isFinite(fluxError)
    ) {
      continue;
    }

    const point = {
      visit,
      band,
      utcTime: mjdTaiToUtcMilliseconds(midpointMjdTai),
      flux,
      fluxError,
    };
    const priority = candidatePriority(tags);
    const current = selected.get(visit);
    if (
      !current ||
      priority > current.priority ||
      (priority === current.priority && fluxError < current.point.fluxError)
    ) {
      selected.set(visit, { point, priority });
    }
  }

  return Array.from(selected.values())
    .map(({ point }) => point)
    .sort((left, right) => left.utcTime - right.utcTime);
}

export function catalogKeys(stock: StockResult): string[] {
  const lastBody = asRecord(stock.catalogMatches?.at(-1)?.doc?.body);
  return lastBody && Object.keys(lastBody).length > 0
    ? Object.keys(lastBody)
    : [];
}
