import { ObjectId, Long } from 'mongodb';
import { connectDb } from './db.ts';

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

export const resolvers = {
  Query: {
    stock: async (_: unknown, { stock }: { stock: string }, __: unknown, info: any) => {
      const db = await connectDb();
      const stockId = Long.fromString(stock);      
      const doc = await db.collection('stock').findOne({ stock: stockId }, {projection: buildProjection(info)});
      return doc ? { ...doc, stock: doc.stock.toString(), origin: doc.origin?.toString() } : null;
    },
  },
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
      console.log('Fetched T2Document for JournalRecord:', doc);
      return doc ? { ...doc, id: doc._id.toString() } : null;
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