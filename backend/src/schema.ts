export const typeDefs = `#graphql

scalar Long
scalar JSONObject
scalar DateTime

enum DocumentCode {
  "unit has processed the document successfully"
  OK
  "document has been created, but not yet processed"
  NEW
  ERROR
  "internal error occurred"
  INTERNAL_ERROR
  "unit raised an exception"
  EXCEPTION
  "document is currently being processed"
  RUNNING
  RERUN_REQUESTED
  "unit failed to process the document after multiple attempts"
  TOO_MANY_TRIALS
  NOT_SET

  T1_NEW_PRIO
  T1_UNKNOWN_CONFIG

  T2_NEW_PRIO
  "dependency has not yet succeeded, but may do so in the future"
  T2_PENDING_DEPENDENCY
  T2_QUEUED
  T2_EXPORTED
  "might be an ingester bugs, or uncommitted updates"
  T2_UNKNOWN_LINK
  T2_UNKNOWN_CONFIG
  "misconfiguration, or uncommitted updates"
  T2_MISSING_DEPENDENCY
  "misconfigured dependency specification"
  T2_UNEXPECTED_DEPENDENCY
  "ingester bugs, or uncommitted updates"
  T2_MISSING_INFO
  "unit returned unexpected type"
  T2_OUTDATED_CODE
  "dependency encountered a permanent error"
  T2_FAILED_DEPENDENCY
  "dependency does not meet the unit's criteria"
  T2_INADEQUATE_DEPENDENCY

  "error occured in context stage"
  T3_CONTEXT_ERROR
  "error occured in select stage"
  T3_SELECT_ERROR
  "error occured in load stage"
  T3_LOAD_ERROR
  "error occured in complement stage"
  T3_COMPLEMENT_ERROR
  "error occured in run stage"
  T3_RUN_ERROR
}

type T1Document {
  link: Long!
  stock: Long!
  channel: [String!]
  tag: [String!]
  dps: [T0Document]
  body: JSONObject
}

type T0Document {
  id: Long!
  stock: Long!
  origin: Long
  tag: [String!]
  channel: [String!]
  body: JSONObject
}

union LinkedDocument = T0Document | T1Document

type T2Document {
  id: Long!
  unit: String!
  config: JSONObject
  stock: Long!
  link: LinkedDocument
  col: String
  code: DocumentCode
  meta: [MetaRecord]
  body: JSONObject
}



type JournalRecord {
  "Processing tier of the associated process"
  tier: Int
  "UNIX epoch of the associated process"
  ts: DateTime
  channel: [String!]!
  process: String
  tag: [String!]!
  run: Int
  code: DocumentCode
  unit: String
  duration: Float
  doc: T2Document
  "Bit flags describing the actions performed; may exceed 32 bits"
  action: Float
  "Identifier of the alert that triggered this record"
  alert: String
  target_name: String
  observation_reason: String
  "Filter configurations from trace.config.directives, keyed by channel"
  filterConfigs: JSONObject
}

type MetaRecord {
  ts: DateTime
  tier: Int
  code: DocumentCode
  duration: Float
}

type TraceRecord {
  key: String
  value: Long
}

type Stock {
  "The identifier of the object"
  stock: Long!
  "The namespace of the object id"
  origin: Long
  tag: [String!]
  "Channels that selected this object"
  channel: [String!]
  "Survey names"
  name: [String!]
  journal(tier: Int, unit: String): [JournalRecord]
  body: JSONObject
}

type StockPage {
  items: [Stock!]!
  nextCursor: String
}

input Cone {
  "Right ascension in degrees"
  ra: Float!
  "Declination in degrees"
  dec: Float!
  "Radius in arcseconds"
  arcsec: Float!
}

enum StockPageSelection {
  REPORTED_TRANSIENTS
}

type Query {
  "Fetch a single stock document by its identifier"
  stock(stock: Long!): Stock
  "Fetch multiple stock documents by channel, tag, location, and time range"
  stocks(channel: String, tag: String, after: DateTime, before: DateTime, within: Cone, limit: Int): [Stock]
  "Fetch distinct channels represented by stocks updated in a time range"
  channels(after: DateTime, before: DateTime): [String!]!
  "Fetch a page of stocks, matching any selected channel"
  stocksPage(channels: [String!], customSelections: [StockPageSelection!], tag: String, after: DateTime, before: DateTime, within: Cone, cursor: String, limit: Int = 20): StockPage!
}

`;
