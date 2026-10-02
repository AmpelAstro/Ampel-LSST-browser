# Ampel Dashboard Implementation Plan

## Scope

Build the specified Vue single-page dashboard with Bootstrap styling and Plotly light curves. Keep the GraphQL backend unchanged except for the query and schema changes needed to support the dashboard. This plan covers the Recent view and its data flow; it does not implement code.

## Existing GraphQL Surface

`src/schema.ts` currently defines:

- `stock(stock: Long!)` for one stock.
- `stocks(channel: String, tag: String, after: DateTime, before: DateTime, within: Cone, limit: Int)` for filtered stock results.
- `Stock.journal(tier, unit)` with linked T2 documents, and T2 document links to T0/T1 documents. T1 documents expose their T0 datapoints through `dps`.
- T0 and T2 document bodies are exposed as `JSONObject`, so the dashboard can read the specified photometry and catalog-match fields without enumerating every body field in GraphQL.

The resolver implements the stock lookups and date/location filters. The current stock result limit defaults to 100. The channel argument is scalar, so it cannot express the required multi-selection directly. There is no query for the distinct channel choices in the selected date range, and the current list result has no cursor/pagination contract.

## GraphQL Changes To Plan

1. Add a `channels(after: DateTime, before: DateTime): [String!]!` query returning distinct channel names for stocks updated in the requested time window. This avoids presenting an incomplete checkbox list derived from a limited stock result.
2. Add a cursor-paginated stock query for the Recent view, for example `stocksPage(channels: [String!], ..., cursor: String, limit: Int = 20)`, returning a page of stocks and a continuation cursor. Match a stock in **any** selected channel (OR); an empty or omitted selection means no channel constraint. Keep the existing `stock` and `stocks` APIs unchanged for backward compatibility.
3. Order pages deterministically by most recent update first, with stock ID as a stable tie-breaker. Request 20 stocks per page, fetch the next page when an intersection sentinel approaches the end of the loaded results, and reset the cursor when filters change.
4. Preserve the existing nested selections for result rows: stock fields, journal T2 documents, T2 document bodies and links, T1 datapoints, and T0 bodies. Use the `T2CatalogMatch` journal filter to retrieve catalog matches, and select the last matching journal record in journal order. A catalog body is populated when it is an object with at least one key.
5. Correct `T2Document.col` from `Int` to `String` to match stored values such as `t0`; the resolver uses this value to select the linked collection. Verify this against actual stored documents while implementing.

No separate query for datapoints is planned initially: the schema already provides the T2-to-T1-to-T0 traversal. If fixtures or live data show that this path omits datapoints referenced by the stock journal, revisit the schema with a narrowly scoped stock-datapoint field or query.

## Frontend Work

1. Establish the frontend entry point and build configuration for Vue, Plotly, and Bootstrap. The current `package.json` contains only the GraphQL server dependencies, so frontend dependencies and scripts will need to be added.
2. Implement the Recent two-column layout: filter sidebar and results panel. Initialize the date range to the preceding seven days, provide the two-ended range slider, and extend the lower bound by the current range when the `after` handle reaches the left boundary.
3. Load distinct channel choices for the active date range; provide a multi-select checkbox control with “all” represented as no channel constraint.
4. Implement RA/Dec and radius inputs with the specified validation and submit a `within` cone only when both location inputs are valid.
5. Query `stocksPage` with current filters, starting at 20 results and requesting the next 20 just before they scroll into view. Show each stock identifier across its row, broker links for Lasair/Fink/Alerce, and catalog-match chiclets from the last matching journal document. Include a chiclet for each key when its body is an object with at least one key.
6. Build the light curve from datapoints reached through the stock journal. Ignore `LSST_OBJ` datapoints; for a visit with both `LSST_DP` and `LSST_FP` candidates, prefer `LSST_DP`; among multiple `LSST_DP` candidates for one visit, choose the one with the smallest `psfFluxErr`. Convert `midpointMjdTai` from TAI to UTC, plot `psfFlux` with `psfFluxErr`, use one marker per visit, assign each band its own symbol and the specified D3 qualitative color, and do not connect markers with lines.
7. Add loading, empty, and query-error states. Keep the filter controls usable on narrow screens and preserve a practical minimum width for broker/catalog links.

## Verification Plan

- Validate GraphQL schema and resolver behavior for date bounds, location, no channel constraint, OR matching for multiple selected channels, and cursor pagination without duplicate or skipped stocks across pages.
- Verify channel choices are distinct and are not truncated by the stock result limit.
- Exercise the nested journal-to-datapoint and catalog-match selections against representative data, including empty/missing bodies and journal records without linked documents.
- Test UI defaults, slider expansion, coordinate/radius validation, all-channel behavior, 20-result initial and subsequent batches, outbound URLs, `LSST_DP`/`LSST_FP` preference, minimum-`psfFluxErr` selection among same-visit `LSST_DP` points, `LSST_OBJ` exclusion, UTC date conversion, catalog-match selection, band styling, and error/empty states.
- Run the available build, lint, and tests; add focused tests for new GraphQL behavior and frontend interactions using the project’s selected test tooling.

## Remaining Clarification

- Should non-`LSST_OBJ` datapoints with neither `LSST_DP` nor `LSST_FP` be eligible when no preferred candidate exists?

## Requirement Updates

The agreed channel, datapoint selection, date conversion, catalog-match, and infinite-scroll behavior have been added to `design/requirements.md`. Resolve the remaining question about datapoints without `LSST_DP` or `LSST_FP` tags before implementation, or adopt a documented deterministic fallback.
