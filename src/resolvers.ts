import { ObjectId, Long } from 'mongodb';
import { connectDb } from './db.ts';
import { GraphQLScalarType } from 'graphql';

const buildProjection = (info: any) => {
  const projection: Record<string, number> = {};
  const selections = info.fieldNodes[0].selectionSet.selections;
  for (const selection of selections) {
    if (selection.kind === 'Field') {
      projection[selection.name.value] = 1;
    }
  }
  return projection;
};

const longFromString = new GraphQLScalarType({
  name: 'Long',
  description: 'Description of my custom scalar type',
  serialize(value: Long) {
    return value.toString();
  },
  parseValue(value: string) {
    return new Long(value);
  },
  parseLiteral(ast) {
    switch (ast.kind) {
    }
  }
});

const getConfig = async (configId: Long) => {
  const db = await connectDb();
  const doc = await db.collection('conf').findOne({ _id: configId }, { projection: { _id: 0 } });
  if (!doc) return null;
  // recursively resolve t2_dependency.config
  if (doc.t2_dependency) {
    doc.t2_dependency_res = await Promise.all(doc.t2_dependency.map(async (dep: any) => {
      if (dep.config) {
        dep.config = await getConfig(dep.config);
      }
      return dep;
    }));
  }
  return doc;
}

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

export const resolvers = {
  Query: {
    stock: async (_: unknown, { stock }: { stock: string }, __: unknown, info: any) => {
      const db = await connectDb();
      const stockId = Long.fromString(stock);      
      const doc = await db.collection('stock').findOne({ stock: stockId }, {projection: buildProjection(info)});
      return doc;
    },
  },
  Long: longFromString,
  DocumentCode,
  LinkedDocument: {
    __resolveType: (obj: any) => {
      if (obj.dps !== undefined) {
        return 'T1Document';
      } else if (obj.body !== undefined) {
        return 'T0Document';
      } else {
        return null;
      }
    },
  },
  T1Document: {
    dps: async (parent: any) => {
      const db = await connectDb();
      const docs = await db.collection('t0').find({ stock: parent.stock }).toArray();
      return docs.map(doc => ({ ...doc, id: doc._id.toString(), stock: doc.stock.toString(), origin: doc.origin?.toString() }));
    }
  },
  T2Document: {
    // resolve hashed config
    config: async (parent: any) => {
      if (!parent.config) return null;
      return await getConfig(parent.config);
    },
    // resolve input doc id
    link: async (parent: any) => {
      const db = await connectDb();
      const collection = db.collection(parent.col == undefined ? 't1' : parent.col);
      if (collection.collectionName === 't0') {
        const filter = { id: parent.link };
        const doc = await collection.findOne(filter, {projection: { _id: 0 }});
        return doc ? { ...doc, __typename: 'T0Document' } : null;
      } else if (collection.collectionName === 't1' || collection.collectionName === 't2') {
        const filter = { stock: parent.stock, link: parent.link }
        const doc = await collection.findOne(filter, {projection: { _id: 0 }});
        return doc ? { ...doc, __typename: collection.collectionName === 't1' ? 'T1Document' : 'T2Document' } : null;
      }
      return null;
    }
  },
  JournalRecord: {
    doc: async (parent: any, _: unknown, __: unknown, info: any) => {
      if (!parent.doc) return null;
      const oid = ObjectId.createFromHexString(parent.doc.buffer.toHex());
      const db = await connectDb();
      const doc = await db.collection('t2').findOne({ _id: oid }, {projection: {...buildProjection(info), col: 1, stock: 1, link: 1, id: 1}});
      return doc;
    },
    ts: (parent: any) => {
      if (!parent.ts) return null;
      return new Date(parent.ts * 1000);
    }
  },
  MetaRecord: {
    ts: (parent: any) => {
      if (!parent.ts) return null;
      return new Date(parent.ts * 1000);
    }
  }
};