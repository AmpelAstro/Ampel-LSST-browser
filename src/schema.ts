export const typeDefs = `#graphql

scalar Long
scalar JSONObject
scalar DateTime

type T1Document {
  link: Long!
  stock: Long!
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
  col: Int
  code: Int
  meta: [MetaRecord]
  body: JSONObject
}



type JournalRecord {
  "Processing tier of the associated process"
  tier: Int
  "UNIX epoch of the associated process"
  ts: DateTime
  channel: [String!]
  process: String
  tag: [String!]
  run: Int
  code: Int
  duration: Float
  doc: T2Document
}

type MetaRecord {
  ts: DateTime
  tier: Int
  code: Int
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
  journal: [JournalRecord]
  body: JSONObject
}

type Query {
  stock(stock: Long!): Stock
}

`;