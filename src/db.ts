import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const client = new MongoClient(uri);

let db: Db;

export async function connectDb(): Promise<Db> {
  if (!db) {
    await client.connect();
    db = client.db('vro_archive');
  }
  return db;
}