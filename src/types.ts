import { Long } from 'mongodb';

declare global {
  interface BSONLong {
    toJSON: () => Long;
    fromJSON: () => Long;
  }
}