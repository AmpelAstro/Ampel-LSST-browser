# Ampel Dashboard Implementation Plan

## Scope

Build the specified Vue single-page dashboard with Bootstrap styling and Plotly light curves. Keep the GraphQL backend unchanged except for the query and schema changes needed to support the dashboard. This plan covers the Recent view and its data flow; it does not implement code.

## Existing GraphQL Surface

`src/schema.ts` currently defines:

- `stock(stock: Long!)` for one stock.
- `stocks(channel: String, tag: String, after: DateTime, before: DateTime, within: Cone, limit: Int)` for filtered stock results.
- `Stock.journal(tier, unit)` with linked T2 documents, and T2 document links to T0/T1 documents. T1 documents expose their T0 datapoints through `dps`.
- T0 and T2 document bodies are exposed as `JSONObject`, so the dashboard can read the specified photometry and catalog-match fields without enumerating every body field in GraphQL.

The resolver implements the stock lookups and date/location filters. The current stock result limit defaults to 100. The channel argument is scalar, so it cannot express the required multi-selection directly. There is no query for the distinct channel choices in the selected date range.

## GraphQL Changes To Plan

1. Add a `channels(after: DateTime, before: DateTime): [String!]!` query returning distinct channel names for stocks updated in the requested time window. This avoids presenting an incomplete checkbox list derived from the default-limited `stocks` result.
2. Change `stocks.channel` to accept a list of strings and update its resolver to filter for the selected channel set. An empty or omitted selection means no channel constraint. Confirm whether a stock must match any selected channel or every selected channel before implementation.
3. Preserve the existing `stock`/`stocks` shape and use nested selections for result rows: stock fields, journal T2 documents, T2 document bodies and links, T1 datapoints, and T0 bodies. Use the `T2CatalogMatch` journal filter to retrieve catalog matches.
4. Correct `T2Document.col` from `Int` to `String` to match stored values such as `t0`; the resolver uses this value to select the linked collection. Verify this against actual stored documents while implementing.
5. Ensure the query can return all needed journal entries and datapoints within a predictable response size. Preserve the existing `stocks` limit and add pagination only if testing shows the Recent view needs it; do not silently raise an unbounded result limit.

No separate query for datapoints is planned initially: the schema already provides the T2-to-T1-to-T0 traversal. If fixtures or live data show that this path omits datapoints referenced by the stock journal, revisit the schema with a narrowly scoped stock-datapoint field or query.

## Frontend Work

1. Establish the frontend entry point and build configuration for Vue, Plotly, and Bootstrap. The current `package.json` contains only the GraphQL server dependencies, so frontend dependencies and scripts will need to be added.
2. Implement the Recent two-column layout: filter sidebar and results panel. Initialize the date range to the preceding seven days, provide the two-ended range slider, and extend the lower bound by the current range when the `after` handle reaches the left boundary.
3. Load distinct channel choices for the active date range; provide a multi-select checkbox control with “all” represented as no channel constraint.
4. Implement RA/Dec and radius inputs with the specified validation and submit a `within` cone only when both location inputs are valid.
5. Query `stocks` with current filters and render one result row per returned stock. Show its identifier across the row, broker links for Lasair/Fink/Alerce, and catalog-match chiclets from the last matching journal document. Treat null catalog values as unpopulated unless clarified otherwise.
6. Build the light curve from datapoints reached through the stock journal. Convert `midpointMjdTai` to a date, plot `psfFlux` with `psfFluxErr`, use one marker per visit, assign each band its own symbol and the specified D3 qualitative color, and do not connect markers with lines.
7. Add loading, empty, and query-error states. Keep the filter controls usable on narrow screens and preserve a practical minimum width for broker/catalog links.

## Verification Plan

- Validate GraphQL schema and resolver behavior for date bounds, location, no channel constraint, and multiple selected channels.
- Verify channel choices are distinct and are not truncated by the stock result limit.
- Exercise the nested journal-to-datapoint and catalog-match selections against representative data, including empty/missing bodies and journal records without linked documents.
- Test UI defaults, slider expansion, coordinate/radius validation, all-channel behavior, outbound URLs, visit deduplication, MJD date conversion, band styling, and error/empty states.
- Run the available build, lint, and tests; add focused tests for new GraphQL behavior and frontend interactions using the project’s selected test tooling.

## Decisions Needed Before Implementation

- For multiple selected channels, should results match stocks in **any** selected channel (OR) or stocks in **all** selected channels (AND)?
- If multiple datapoints share a visit, which one should be plotted? Should the first journal-referenced point win, or should a quality rule choose the representative?
- Should plotted dates display in UTC or the viewer’s local timezone? `midpointMjdTai` is in TAI and must be converted with the appropriate time-scale offset.
- For catalog matches, does “populated” mean any non-null value, or should empty objects/arrays also be omitted? Should the “last” match mean the last matching record in journal array order?
- Is the existing `stocks` result limit of 100 acceptable for the Recent view, or is pagination required in the initial implementation?

## Requirement Updates

No specification decisions have been made yet. Record agreed answers here and update the source specification before implementation begins.
