import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema({
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  accuracy: { type: Number, required: true },
  place: { type: String, default: '' }
}, { _id: false });

const photoSchema = new mongoose.Schema({
  captureId: { type: String, required: true, unique: true, index: true },
  image: { type: Buffer, required: true },
  imageType: { type: String, default: 'image/jpeg' },
  createdAt: { type: Number, required: true },
  location: { type: locationSchema, default: null },
  project: { type: String, default: 'My field notes' },
  note: { type: String, default: '' }
}, { versionKey: false });

export const Photo = mongoose.model('Photo', photoSchema, 'photos');
