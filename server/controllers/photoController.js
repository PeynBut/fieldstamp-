import { Photo } from '../models/Photo.js';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;

function validLocation(location) {
  if (location == null) return true;
  return typeof location === 'object' &&
    Number.isFinite(location.latitude) && location.latitude >= -90 && location.latitude <= 90 &&
    Number.isFinite(location.longitude) && location.longitude >= -180 && location.longitude <= 180 &&
    Number.isFinite(location.accuracy) && location.accuracy >= 0 && location.accuracy <= 100000 &&
    (location.place === undefined || (typeof location.place === 'string' && location.place.length <= 160));
}

function toClientPhoto(photo) {
  return {
    captureId: photo.captureId,
    image: photo.image.toString('base64'),
    imageType: photo.imageType,
    createdAt: photo.createdAt,
    location: photo.location,
    project: photo.project,
    note: photo.note
  };
}

export async function listPhotos(_request, response, next) {
  try {
    const photos = await Photo.find().sort({ createdAt: -1 }).limit(200).exec();
    response.json(photos.map(toClientPhoto));
  } catch (error) {
    next(error);
  }
}

export async function createPhoto(request, response, next) {
  try {
    const { captureId, image, imageType, createdAt, location } = request.body;
    if (typeof captureId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(captureId) || typeof image !== 'string') {
      return response.status(400).json({ error: 'A capture ID and image are required.' });
    }

    if (image.length > MAX_BASE64_LENGTH || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image)) {
      return response.status(400).json({ error: 'The photo data is invalid.' });
    }
    if (imageType !== undefined && imageType !== 'image/jpeg') {
      return response.status(415).json({ error: 'Only JPEG photos are supported.' });
    }
    const imageBuffer = Buffer.from(image, 'base64');
    if (!imageBuffer.length || imageBuffer.length > MAX_IMAGE_BYTES) {
      return response.status(413).json({ error: 'Photo must be smaller than 10 MB.' });
    }
    if (imageBuffer[0] !== 0xff || imageBuffer[1] !== 0xd8 || imageBuffer[2] !== 0xff) {
      return response.status(415).json({ error: 'The uploaded file is not a JPEG photo.' });
    }
    const timestamp = Number(createdAt);
    if (!Number.isFinite(timestamp) || timestamp < Date.UTC(2000, 0, 1) || timestamp > Date.now() + 24 * 60 * 60 * 1000) {
      return response.status(400).json({ error: 'A valid capture time is required.' });
    }
    if (!validLocation(location)) return response.status(400).json({ error: 'The GPS location is invalid.' });

    const photo = await Photo.findOneAndUpdate(
      { captureId },
      { $setOnInsert: {
        captureId,
        image: imageBuffer,
        imageType: 'image/jpeg',
        createdAt: timestamp,
        location: location || undefined,
        project: '',
        note: ''
      } },
      { upsert: true, new: true, runValidators: true }
    );

    response.status(201).json({ captureId: photo.captureId, saved: true });
  } catch (error) {
    next(error);
  }
}

export async function deletePhoto(request, response, next) {
  try {
    await Photo.deleteOne({ captureId: request.params.captureId });
    response.status(204).end();
  } catch (error) {
    next(error);
  }
}
