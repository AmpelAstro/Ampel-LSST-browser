import { DateTimeResolver } from "graphql-scalars";
import { ObjectId, Long } from "bson";
import type { GraphQLResolveInfo } from "graphql";
import type { Document, Binary } from "bson";

import { BSONLongResolver, JSONObjectResolver } from "./types";
import { connectDb } from "./db";

const buildProjection = (info: GraphQLResolveInfo) => {
  const projection: Record<string, number> = {};
  const selections = info?.fieldNodes[0]?.selectionSet?.selections || [];
  for (const selection of selections) {
    if (selection.kind === "Field") {
      projection[selection.name.value] = 1;
    }
  }
  return projection;
};

const getConfig = async (configId: Long) => {
  const db = await connectDb();
  const doc = await db
    .collection("conf")
    .findOne({ _id: configId }, { projection: { _id: 0 } });
  if (!doc) return null;
  // recursively resolve t2_dependency.config
  if (doc.t2_dependency) {
    doc.t2_dependency = await Promise.all(
      doc.t2_dependency.map(async (dep: Document) => {
        if (dep.config) {
          dep.config = await getConfig(dep.config);
        }
        return dep;
      }),
    );
  }
  return doc;
};

// maps each enum name to its numeric DocumentCode value, so integers resolve to the matching enum member
const DocumentCode = {
  OK: 0,
  NEW: -1,
  ERROR: -2,
  INTERNAL_ERROR: -3,
  EXCEPTION: -4,
  RUNNING: -5,
  RERUN_REQUESTED: -6,
  TOO_MANY_TRIALS: -7,
  NOT_SET: -8,

  T1_NEW_PRIO: -1000,
  T1_UNKNOWN_CONFIG: -1001,

  T2_NEW_PRIO: -2000,
  T2_PENDING_DEPENDENCY: -2001,
  T2_QUEUED: -2002,
  T2_EXPORTED: -2003,
  T2_UNKNOWN_LINK: -2004,
  T2_UNKNOWN_CONFIG: -2005,
  T2_MISSING_DEPENDENCY: -2006,
  T2_UNEXPECTED_DEPENDENCY: -2007,
  T2_MISSING_INFO: -2008,
  T2_OUTDATED_CODE: -2009,
  T2_FAILED_DEPENDENCY: -2010,
  T2_INADEQUATE_DEPENDENCY: -2011,

  T3_CONTEXT_ERROR: -3000,
  T3_SELECT_ERROR: -3001,
  T3_LOAD_ERROR: -3002,
  T3_COMPLEMENT_ERROR: -3003,
  T3_RUN_ERROR: -3004,
};

interface T2Document {
  link: Long | null;
  col: string | null;
  stock: Long | null;
  config: Long | null;
  body: object[] | null;
}

interface JournalRecord {
  tier: number;
  unit: string;
  ts: number;
  doc: Binary | null;
}

interface MetaRecord {
  ts: number;
  tier: number;
}

interface StockDocument {
  stock: Long;
  channel: string[];
  tag: string[];
  journal: JournalRecord[];
  meta: MetaRecord[];
}

export const resolvers = {
  Query: {
    stock: async (
      _: unknown,
      { stock }: { stock: Long },
      __: unknown,
      info: GraphQLResolveInfo,
    ) => {
      const db = await connectDb();
      const doc = await db
        .collection("stock")
        .findOne({ stock: stock }, { projection: buildProjection(info) });
      return doc;
    },
    stocks: async (
      _: unknown,
      {
        channel,
        tag,
        after,
        before,
        limit,
      }: {
        channel?: string;
        tag?: string;
        after?: Date;
        before?: Date;
        limit?: number;
      },
      __: unknown,
      info: GraphQLResolveInfo,
    ) => {
      const db = await connectDb();
      /* eslint-disable  @typescript-eslint/no-explicit-any */
      const filter: Record<string, any> = {};
      if (channel) {
        filter.channel = channel;
      }
      if (tag) {
        filter.tag = tag;
      }
      if (after || before) {
        const key = `ts.${channel || "any"}.upd`;
        filter[key] = {};
        if (after) {
          filter[key].$gte = after.getTime() / 1000;
        }
        if (before) {
          filter[key].$lte = before.getTime() / 1000;
        }
      }
      const docs = await db
        .collection("stock")
        .find(filter, { projection: buildProjection(info) })
        .limit(limit || 100)
        .toArray();
      return docs;
    },
  },
  JSONObject: JSONObjectResolver,
  Long: BSONLongResolver,
  DateTime: DateTimeResolver,
  DocumentCode,
  T1Document: {
    dps: async (parent: Document) => {
      const db = await connectDb();
      return await db
        .collection("t0")
        .find({ stock: parent.stock, id: { $in: parent.dps || [] } })
        .toArray();
    },
  },
  T2Document: {
    // resolve hashed config
    config: async (parent: T2Document) => {
      if (!parent.config) return null;
      return await getConfig(parent.config);
    },
    // resolve input doc id
    link: async (parent: T2Document) => {
      const db = await connectDb();
      const collection = db.collection(
        parent.col == undefined ? "t1" : parent.col,
      );
      if (collection.collectionName === "t0") {
        const filter = { id: parent.link };
        const doc = await collection.findOne(filter, {
          projection: { _id: 0 },
        });
        return doc ? { ...doc, __typename: "T0Document" } : null;
      } else if (
        collection.collectionName === "t1" ||
        collection.collectionName === "t2"
      ) {
        const filter = { stock: parent.stock, link: parent.link };
        const doc = await collection.findOne(filter, {
          projection: { _id: 0 },
        });
        return doc
          ? {
              ...doc,
              __typename:
                collection.collectionName === "t1"
                  ? "T1Document"
                  : "T2Document",
            }
          : null;
      }
      return null;
    },
    body: (parent: T2Document) => {
      if (parent.body === null || parent.body === undefined) return null;
      if (Array.isArray(parent.body)) {
        if (parent.body.length === 0) return null;
        return parent.body[parent.body.length - 1];
      }
      return parent.body;
    },
  },
  JournalRecord: {
    doc: async (
      parent: JournalRecord,
      _: unknown,
      __: unknown,
      info: GraphQLResolveInfo,
    ) => {
      if (!parent.doc) return null;
      const oid = ObjectId.createFromHexString(parent.doc.buffer.toHex());
      const db = await connectDb();
      const doc = await db.collection("t2").findOne(
        { _id: oid },
        {
          projection: {
            ...buildProjection(info),
            col: 1,
            stock: 1,
            link: 1,
            id: 1,
          },
        },
      );
      return doc;
    },
    ts: (parent: JournalRecord) => {
      if (!parent.ts) return null;
      return new Date(parent.ts * 1000);
    },
  },
  MetaRecord: {
    ts: (parent: MetaRecord) => {
      if (!parent.ts) return null;
      return new Date(parent.ts * 1000);
    },
  },
  Stock: {
    journal: (
      parent: StockDocument,
      { tier, unit }: { tier?: number; unit?: string },
    ) => {
      if (!parent.journal) return parent.journal;
      if (tier !== undefined || unit !== undefined) {
        return parent.journal.filter((record: JournalRecord) => {
          if (tier !== undefined && record.tier !== tier) return false;
          if (unit !== undefined && record.unit !== unit) return false;
          return true;
        });
      }
      return parent.journal;
    },
  },
};
