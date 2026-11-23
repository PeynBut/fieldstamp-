import { apiUrl } from '../services/ApiClient.js';

const DATABASE_NAME = 'fieldstamp-local';
const DATABASE_VERSION = 2;
const PHOTO_STORE = 'photos';
const DELETED_STORE = 'deletedPhotos';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function newCaptureId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function imageFromBase64(encoded, type) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: type || 'image/jpeg' });
}

async function imageToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export class PhotoStore {
  open() {
    if (this.databasePromise) return this.databasePromise;

    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(PHOTO_STORE)) {
          const photos = database.createObjectStore(PHOTO_STORE, { keyPath: 'id', autoIncrement: true });
          photos.createIndex('createdAt', 'createdAt');
        }
        if (!database.objectStoreNames.contains(DELETED_STORE)) {
          database.createObjectStore(DELETED_STORE, { keyPath: 'captureId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Close other FieldStamp tabs, then reopen the app.'));
    });

    return this.databasePromise;
  }

  async #store(name, mode, operation) {
    const database = await this.open();
    const store = database.transaction(name, mode).objectStore(name);
    return requestResult(operation(store));
  }

  async list() {
    const photos = await this.#store(PHOTO_STORE, 'readonly', store => store.getAll());
    return photos.sort((first, second) => second.createdAt - first.createdAt);
  }

  async saveLocal(photo) {
    const record = { ...photo, captureId: newCaptureId(), remoteSynced: false };
    record.id = await this.#store(PHOTO_STORE, 'readwrite', store => store.add(record));
    return record;
  }

  async #saveRecord(photo) {
    await this.#store(PHOTO_STORE, 'readwrite', store => store.put(photo));
    return photo;
  }

  async syncPhoto(photo) {
    if (!photo.captureId) {
      photo = { ...photo, captureId: newCaptureId(), remoteSynced: false };
      await this.#saveRecord(photo);
    }
    const response = await fetch(apiUrl('/api/photos'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        captureId: photo.captureId,
        image: await imageToBase64(photo.image),
        imageType: photo.image.type || 'image/jpeg',
        createdAt: photo.createdAt,
        location: photo.location || null,
      })
    });
    if (!response.ok) throw new Error('MongoDB sync is unavailable.');
    return this.#saveRecord({ ...photo, remoteSynced: true });
  }

  async syncPending() {
    let synced = 0;
    const deleted = await this.#store(DELETED_STORE, 'readonly', store => store.getAll());
    for (const tombstone of deleted) {
      try {
        await this.#syncDeleted(tombstone.captureId);
        synced += 1;
      } catch { /* Keep the tombstone and retry during the next sync. */ }
    }

    const photos = await this.list();
    for (const photo of photos) {
      if (photo.remoteSynced) continue;
      try {
        await this.syncPhoto(photo);
        synced += 1;
      } catch { /* Keep the local photo and retry during the next sync. */ }
    }
    return synced;
  }

  async importRemote() {
    const response = await fetch(apiUrl('/api/photos'));
    if (!response.ok) throw new Error('Could not load MongoDB photos.');
    const remotePhotos = await response.json();
    const localPhotos = await this.list();
    const localIds = new Set(localPhotos.map(photo => photo.captureId).filter(Boolean));
    const deleted = await this.#store(DELETED_STORE, 'readonly', store => store.getAll());
    const deletedIds = new Set(deleted.map(photo => photo.captureId));

    for (const photo of remotePhotos) {
      if (!photo.captureId || localIds.has(photo.captureId) || deletedIds.has(photo.captureId)) continue;
      const localPhoto = {
        captureId: photo.captureId,
        image: imageFromBase64(photo.image, photo.imageType),
        createdAt: photo.createdAt,
        location: photo.location || null,
        remoteSynced: true
      };
      localPhoto.id = await this.#store(PHOTO_STORE, 'readwrite', store => store.add(localPhoto));
      localIds.add(localPhoto.captureId);
    }
    return this.list();
  }

  async deleteLocal(id) {
    const photo = await this.#store(PHOTO_STORE, 'readonly', store => store.get(id));
    if (!photo) return { synced: true };
    if (photo.captureId) {
      await this.#store(DELETED_STORE, 'readwrite', store => store.put({ captureId: photo.captureId }));
    }
    await this.#store(PHOTO_STORE, 'readwrite', store => store.delete(id));

    if (!photo.captureId) return { synced: true };
    try {
      await this.#syncDeleted(photo.captureId);
      return { synced: true };
    } catch {
      return { synced: false };
    }
  }

  async #syncDeleted(captureId) {
    const response = await fetch(apiUrl(`/api/photos/${encodeURIComponent(captureId)}`), { method: 'DELETE' });
    if (!response.ok) throw new Error('MongoDB delete is unavailable.');
    await this.#store(DELETED_STORE, 'readwrite', store => store.delete(captureId));
  }
}

