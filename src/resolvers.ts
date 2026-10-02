import { DateTimeResolver } from "graphql-scalars";
import { ObjectId, Long } from "bson";
import { GraphQLError } from "graphql";
import type { FieldNode, GraphQLResolveInfo, SelectionSetNode } from "graphql";
import type { Document, Binary } from "bson";

import { BSONLongResolver, JSONObjectResolver } from "./types.js";
import { connectDb } from "./db.js";

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

const collectFields = (
  selectionSet: SelectionSetNode | undefined,
  fragments: GraphQLResolveInfo["fragments"],
  visited = new Set<string>(),
): FieldNode[] => {
  const fields: FieldNode[] = [];
  for (const selection of selectionSet?.selections || []) {
    if (selection.kind === "Field") {
      fields.push(selection);
    } else if (selection.kind === "InlineFragment") {
      fields.push(...collectFields(selection.selectionSet, fragments, visited));
    } else if (!visited.has(selection.name.value)) {
      visited.add(selection.name.value);
      const fragment = fragments[selection.name.value];
      if (fragment) {
        fields.push(
          ...collectFields(fragment.selectionSet, fragments, visited),
        );
      }
    }
  }
  return fields;
};

const buildStockPageProjection = (info: GraphQLResolveInfo) => {
  const rootFields = collectFields(
    info.fieldNodes[0]?.selectionSet,
    info.fragments,
  );
  const itemsField = rootFields.find((field) => field.name.value === "items");
  const projection: Record<string, number> = { stock: 1, "ts.any.upd": 1 };
  for (const field of collectFields(itemsField?.selectionSet, info.fragments)) {
    if (field.name.value !== "__typename") {
      projection[field.name.value] = 1;
    }
  }
  return projection;
};

const getTimeRange = (after?: Date, before?: Date): Document | undefined => {
  if (!after && !before) return undefined;
  const range: Document = {};
  if (after) range.$gte = after.getTime() / 1000;
  if (before) range.$lte = before.getTime() / 1000;
  return range;
};

const decodeStockCursor = (cursor: string) => {
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (typeof payload !== "object" || payload === null) throw new Error();
    const { updatedAt, stock } = payload as Record<string, unknown>;
    if (
      typeof updatedAt !== "number" ||
      !Number.isFinite(updatedAt) ||
      typeof stock !== "string" ||
      !/^-?\d+$/.test(stock)
    ) {
      throw new Error();
    }
    return { updatedAt, stock: Long.fromString(stock) };
  } catch {
    throw new GraphQLError("Invalid stock page cursor", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
};

const encodeStockCursor = (stock: Document) =>
  Buffer.from(
    JSON.stringify({
      updatedAt: stock.ts.any.upd,
      stock: stock.stock.toString(),
    }),
  ).toString("base64url");

const buildStockPageFilter = ({
  channels,
  tag,
  after,
  before,
  within,
  cursor,
}: {
  channels?: string[];
  tag?: string;
  after?: Date;
  before?: Date;
  within?: { ra: number; dec: number; arcsec: number };
  cursor?: string;
}) => {
  const clauses: Document[] = [];
  const timeRange = getTimeRange(after, before);

  if (channels?.length && timeRange) {
    clauses.push({
      $or: channels.map((channel) => ({
        channel,
        [`ts.${channel}.upd`]: timeRange,
      })),
    });
  } else {
    if (channels?.length) clauses.push({ channel: { $in: channels } });
    if (timeRange) clauses.push({ "ts.any.upd": timeRange });
  }

  if (tag) clauses.push({ tag });
  if (within) {
    const { ra, dec, arcsec } = within;
    const radiusInRad = (Math.PI * arcsec) / 3600 / 180;
    clauses.push({
      "body._loc": {
        $geoWithin: {
          $centerSphere: { coordinates: [ra - 180, dec], radius: radiusInRad },
        },
      },
    });
  }

  clauses.push({ "ts.any.upd": { $type: "number" } });
  if (cursor) {
    const { updatedAt, stock } = decodeStockCursor(cursor);
    clauses.push({
      $or: [
        { "ts.any.upd": { $lt: updatedAt } },
        { "ts.any.upd": updatedAt, stock: { $gt: stock } },
      ],
    });
  }

  if (clauses.length === 1) return clauses[0]!;
  return { $and: clauses };
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
  doc: Binary | ObjectId | null;
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
        within,
        limit,
      }: {
        channel?: string;
        tag?: string;
        after?: Date;
        before?: Date;
        within?: { ra: number; dec: number; arcsec: number };
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
      if (within) {
        const { ra, dec, arcsec } = within;
        const radiusInRad = (Math.PI * arcsec) / 3600 / 180; // convert arcseconds to radians
        filter["body._loc"] = {
          $geoWithin: {
            $centerSphere: {
              coordinates: [ra - 180, dec],
              radius: radiusInRad,
            },
          },
        };
      }
      const docs = await db
        .collection("stock")
        .find(filter, { projection: buildProjection(info) })
        .limit(limit || 100)
        .toArray();
      return docs;
    },
    channels: async (
      _: unknown,
      { after, before }: { after?: Date; before?: Date },
    ) => {
      const db = await connectDb();
      const timeRange = getTimeRange(after, before);
      const filter = timeRange ? { "ts.any.upd": timeRange } : {};
      const values = await db.collection("stock").distinct("channel", filter);
      return Array.from(
        new Set(
          values.filter((value): value is string => typeof value === "string"),
        ),
      ).sort();
    },
    stocksPage: async (
      _: unknown,
      args: {
        channels?: string[];
        tag?: string;
        after?: Date;
        before?: Date;
        within?: { ra: number; dec: number; arcsec: number };
        cursor?: string;
        limit?: number;
      },
      __: unknown,
      info: GraphQLResolveInfo,
    ) => {
      const pageSize = args.limit ?? 20;
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        throw new GraphQLError("Stock page limit must be between 1 and 100", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const db = await connectDb();
      const docs = await db
        .collection("stock")
        .find(buildStockPageFilter(args), {
          projection: buildStockPageProjection(info),
        })
        .sort({ "ts.any.upd": -1, stock: 1 })
        .limit(pageSize + 1)
        .toArray();
      const hasNextPage = docs.length > pageSize;
      const items = docs.slice(0, pageSize);
      const lastItem = items.at(-1);
      return {
        items,
        nextCursor:
          hasNextPage && lastItem ? encodeStockCursor(lastItem) : null,
      };
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
      const oid =
        // can't use instanceof here, because mongodb driver uses require() and
        // we use import, so have different ideas of what ObjetctId ctor is
        parent.doc._bsontype == "ObjectId"
          ? parent.doc
          : ObjectId.createFromHexString(parent.doc.buffer.toHex());
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
