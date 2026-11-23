import mongoose from 'mongoose';

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
  const database = process.env.MONGODB_DB || 'capturejotoh';

  await mongoose.connect(uri, { dbName: database });
  return database;
}
