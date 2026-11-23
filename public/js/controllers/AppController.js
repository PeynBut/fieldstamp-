import { PhotoStore } from '../models/PhotoStore.js';
import { AppView } from '../views/AppView.js';
import { stampPhoto } from '../services/PhotoStamp.js';
import { saveToGallery } from '../services/GallerySaver.js';
import { openAppSettings } from '../services/DeviceSettings.js';
import { apiUrl } from '../services/ApiClient.js';

const LAST_LOCATION_KEY = 'fieldstamp-last-location';
const PERMISSION_INTRO_KEY = 'fieldstamp-permission-intro-choice';
const NOMINATIM_LAST_REQUEST_KEY = 'fieldstamp-nominatim-last-request';

function readLastLocation() {
  try {
    const location = JSON.parse(localStorage.getItem(LAST_LOCATION_KEY) || 'null');
    if (location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude) && location.place) return location;
  } catch { /* Ignore invalid or unavailable local storage. */ }
  return null;
}

function nearby(first, second) {
  if (!first || !second) return false;
  const radians = value => value * Math.PI / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const value = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)) <= 1500;
}

export class AppController {
  constructor() {
    this.photos = new PhotoStore();
    this.view = new AppView();
    this.stream = null;
    this.cameraStartPromise = null;
    this.cameraGeneration = 0;
    this.watchId = null;
    this.facing = 'environment';
    this.currentPlace = null;
    this.lastKnownLocation = readLastLocation();
    this.activePhoto = null;
    this.installPrompt = null;
    this.clockTimer = null;
    this.captureInProgress = false;
    this.gallerySaveQueue = Promise.resolve();
    this.syncSaveQueue = Promise.resolve();
  }

  async start() {
    this.view.bind({
      startCamera: () => this.startCamera(),
      capture: () => this.capture(),
      switchCamera: () => this.switchCamera(),
      locate: () => this.locate(),
      sharePhoto: () => this.sharePhoto(),
      openPhoto: photo => { this.activePhoto = photo; this.view.openDetail(photo); },
      deletePhoto: () => this.deletePhoto(),
      openSettings: () => this.openDeviceSettings(),
      install: () => this.install(),
      stopCamera: () => this.stopCamera()
    });
    this.view.initialize();
    if (this.lastKnownLocation) this.view.setLocation({ ...this.lastKnownLocation, cached: true });
    this.view.renderPhotos([]);
    this.clockTimer = setInterval(() => this.view.updateClock(), 1000);
    this.view.updateClock();
    this.registerInstallPrompt();
    this.registerServiceWorker();

    try {
      await this.photos.open();
      this.view.renderPhotos(await this.photos.list());
    } catch {
      this.view.renderPhotos(await this.photos.list().catch(() => []));
      this.view.toast('Local photo storage could not be opened. Check available device storage.');
    }

    window.addEventListener('online', () => this.syncFromMongo());
    window.addEventListener('pagehide', () => this.stopCamera());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stopCamera();
    });
    void this.syncFromMongo();
  }

  registerInstallPrompt() {
    const installed = window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true || window.Capacitor?.isNativePlatform?.() === true;
    this.view.setInstallVisible(false);
    if (installed) return;

    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      this.installPrompt = event;
      this.view.setInstallVisible(true);
    });
    window.addEventListener('appinstalled', () => {
      this.installPrompt = null;
      this.view.setInstallVisible(false);
    });
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }

  async install() {
    if (!this.installPrompt) {
      this.view.toast('Open Chrome’s menu and choose Install app or Add to Home screen.');
      return;
    }
    this.installPrompt.prompt();
    await this.installPrompt.userChoice;
    this.installPrompt = null;
    this.view.setInstallVisible(false);
  }

  async confirmPermissionIntent() {
    const choice = localStorage.getItem(PERMISSION_INTRO_KEY);
    if (choice === 'continue') return true;
    if (choice === 'not-now') {
      const openSettings = await this.view.askPermission({
        title: 'Camera and location are off',
        message: 'To capture a stamped photo, allow camera and location access in FieldStamp’s device settings.',
        primaryLabel: 'Open settings'
      });
      if (openSettings) await this.openDeviceSettings();
      return false;
    }

    const accepted = await this.view.askPermission({
      title: 'Allow camera and location?',
      message: 'FieldStamp uses the camera to take your photo and GPS to add the place and time. Your device will ask for each permission. You can change access in Settings at any time.'
    });
    localStorage.setItem(PERMISSION_INTRO_KEY, accepted ? 'continue' : 'not-now');
    return accepted;
  }

  async openDeviceSettings() {
    try {
      const opened = await openAppSettings();
      if (!opened) this.view.toast('Open your device Settings, find FieldStamp, then allow camera and location access.');
    } catch {
      this.view.toast('Could not open device settings. Find FieldStamp in Settings to change its permissions.');
    }
  }

  async startCamera() {
    if (this.stream?.getVideoTracks().some(track => track.readyState === 'live')) return;
    if (this.cameraStartPromise) return this.cameraStartPromise;
    this.cameraStartPromise = this.openCamera();
    try {
      await this.cameraStartPromise;
    } finally {
      this.cameraStartPromise = null;
    }
  }

  async openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.view.toast('Open FieldStamp over HTTPS or localhost to use the camera.');
      return;
    }
    if (!(await this.confirmPermissionIntent())) return;
    this.stopCamera();
    const generation = this.cameraGeneration;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: this.facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false
      });
      // A pending permission prompt can outlive the page; never attach a late stream.
      if (generation !== this.cameraGeneration || document.hidden) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      this.stream = stream;
      this.view.setCamera(this.stream);
      stream.getTracks().forEach(track => track.addEventListener('ended', () => {
        if (this.stream === stream) this.stopCamera();
      }, { once: true }));
      this.startLocationWatch();
      void this.locate({ quiet: true, permissionConfirmed: true });
    } catch (error) {
      if (generation !== this.cameraGeneration) return;
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        await this.showPermissionSettings('Camera access is off', 'Turn on Camera permission for FieldStamp in device settings, then return to capture.');
      } else {
        this.view.toast('Camera is busy or unavailable. Close other camera apps, return to FieldStamp, and try again.');
      }
    }
  }

  async showPermissionSettings(title, message) {
    const openSettings = await this.view.askPermission({ title, message, primaryLabel: 'Open settings' });
    if (openSettings) await this.openDeviceSettings();
  }

  stopCamera() {
    this.cameraGeneration += 1;
    if (this.stream) this.stream.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.view.setCameraOff();
    if (this.watchId !== null && 'geolocation' in navigator) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }

  async switchCamera() {
    this.facing = this.facing === 'environment' ? 'user' : 'environment';
    this.stopCamera();
    await this.startCamera();
  }

  startLocationWatch() {
    if (!navigator.geolocation || this.watchId !== null) return;
    this.watchId = navigator.geolocation.watchPosition(result => {
      this.currentPlace = {
        ...this.currentPlace,
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
        accuracy: result.coords.accuracy,
        place: this.currentPlace?.place || (nearby(result.coords, this.lastKnownLocation) ? this.lastKnownLocation.place : '')
      };
      this.view.setLocation(this.currentPlace);
    }, () => {}, { enableHighAccuracy: true, maximumAge: 5000 });
  }

  async locate({ quiet = false, permissionConfirmed = false } = {}) {
    if (!permissionConfirmed && !(await this.confirmPermissionIntent())) return null;
    this.view.setGpsBusy(true);
    try {
      const fix = await this.getCurrentPosition();
      if (!fix) return null;
      const previousPlace = nearby(fix, this.lastKnownLocation) ? this.lastKnownLocation.place : '';
      this.currentPlace = { ...fix, place: previousPlace, lookupPending: true };
      this.view.setLocation(this.currentPlace);
      this.startLocationWatch();
      try {
        const place = await this.resolvePlaceName(fix);
        if (place) {
          this.lastKnownLocation = { latitude: fix.latitude, longitude: fix.longitude, place, savedAt: Date.now() };
          try { localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(this.lastKnownLocation)); } catch { /* Keep the live place in memory. */ }
          this.currentPlace = { ...this.currentPlace, place };
        }
      } catch (error) {
        console.warn('Place name lookup failed:', error.message);
      } finally {
        this.currentPlace = { ...this.currentPlace, lookupPending: false };
      }
      this.view.setLocation(this.currentPlace);
      return this.currentPlace;
    } catch (error) {
      if (this.currentPlace) this.view.setLocation(this.currentPlace);
      else if (this.lastKnownLocation) this.view.setLocation({ ...this.lastKnownLocation, cached: true });
      else this.view.setLocation(null);
      if (error.code === 1) {
        await this.showPermissionSettings('Location access is off', 'Turn on Location permission for FieldStamp in device settings to add a place name to your photos.');
      } else if (!quiet) {
        this.view.toast('Could not get GPS. Check location permission and try again.');
      }
      return this.currentPlace || (this.lastKnownLocation
        ? { ...this.lastKnownLocation, accuracy: 0, cached: true }
        : null);
    } finally {
      this.view.setGpsBusy(false);
    }
  }

  getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Location access is unavailable.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(result => resolve({
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
        accuracy: result.coords.accuracy,
        place: ''
      }), reject, { enableHighAccuracy: true, timeout: 18000, maximumAge: 0 });
    });
  }

  async resolvePlaceName(location) {
    // Ask for the street address first. The BigDataCloud client endpoint is
    // city-level, so using it first prevents a more specific address being shown.
    const addressKey = `fieldstamp-address-v4-${location.latitude.toFixed(4)}-${location.longitude.toFixed(4)}`;
    try {
      const cached = JSON.parse(localStorage.getItem(addressKey) || 'null');
      if (cached?.place && Date.now() - cached.savedAt < 30 * 24 * 60 * 60 * 1000) return cached.place;
    } catch { /* Cache is optional. */ }

    try {
      const addressUrl = new URL('https://nominatim.openstreetmap.org/reverse');
      addressUrl.searchParams.set('format', 'jsonv2');
      addressUrl.searchParams.set('addressdetails', '1');
      addressUrl.searchParams.set('zoom', '18');
      addressUrl.searchParams.set('lat', location.latitude);
      addressUrl.searchParams.set('lon', location.longitude);
      const previousRequest = Number(localStorage.getItem(NOMINATIM_LAST_REQUEST_KEY)) || 0;
      const wait = Math.max(0, 1100 - (Date.now() - previousRequest));
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      try { localStorage.setItem(NOMINATIM_LAST_REQUEST_KEY, String(Date.now())); } catch { /* Rate limiting still applies in this page session. */ }
      const response = await fetch(addressUrl, { signal: AbortSignal.timeout(9000) });
      if (response.ok) {
        const result = await response.json();
        const address = result.address || {};
        const road = address.road || address.pedestrian || address.residential || address.path || '';
        const number = address.house_number ? `#${String(address.house_number).replace(/^#/, '')}` : '';
        const purok = address.purok || Object.entries(address).find(([key, value]) =>
          /purok/i.test(`${key} ${value || ''}`))?.[1] || '';
        let city = address.city || address.town || address.municipality || address.village || '';
        const isPhilippines = address.country_code?.toLowerCase() === 'ph' || address.country?.toLowerCase() === 'philippines';
        if (isPhilippines && address.city && city && !/\bcity$/i.test(city)) city += ' City';
        const neighborhood = address.neighbourhood || address.suburb || '';
        const district = address.quarter || address.city_district || address.district || '';
        const province = address.province || address.state || address.state_district || '';
        const country = isPhilippines ? 'Philippines' : address.country || '';
        const postcodeProvince = [address.postcode, province].filter(Boolean).join(' ');
        const placeName = result.name || address.amenity || address.office || address.shop || address.tourism || address.building || '';
        const dwelling = [number, purok].filter(Boolean).join(' ');
        const placeParts = placeName
          ? [placeName, dwelling, road, neighborhood, district, city, postcodeProvince || province, country]
          : [dwelling, neighborhood, district, road, city, postcodeProvince || province, country];
        const place = placeParts.filter((name, index, all) => name &&
          all.findIndex(value => value?.toLowerCase() === name.toLowerCase()) === index).join(', ');
        if (place) {
          try { localStorage.setItem(addressKey, JSON.stringify({ place, savedAt: Date.now() })); } catch { /* Keep the resolved address in memory. */ }
          return place;
        }
      }
    } catch { /* Use the city-level provider when street lookup is unavailable. */ }

    const endpoint = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
    endpoint.searchParams.set('latitude', location.latitude);
    endpoint.searchParams.set('longitude', location.longitude);
    endpoint.searchParams.set('localityLanguage', 'en');
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(7000) });
      if (response.ok) {
        const result = await response.json();
        const locality = result.localityName || result.locality || result.city;
        const province = result.localityInfo?.administrative?.map(item => item.name)
          .find(name => name && name !== locality && name !== result.principalSubdivision && name !== result.countryName);
        const place = [locality, province || result.principalSubdivision, result.countryName]
          .filter((name, index, all) => name && all.findIndex(value => value?.toLowerCase() === name.toLowerCase()) === index)
          .join(', ');
        if (place) return place;
      }
    } catch { /* Try the public map geocoder if the primary lookup is unavailable. */ }

    if (!location.place) {
      const fallback = new URL(apiUrl('/api/geocode/reverse'));
      fallback.searchParams.set('latitude', location.latitude);
      fallback.searchParams.set('longitude', location.longitude);
      const response = await fetch(fallback, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('The backup place lookup is unavailable.');
      return (await response.json()).place || '';
    }
    return '';
  }

  async capture() {
    if (this.captureInProgress) return;
    this.captureInProgress = true;
    this.view.flashCapture();
    this.view.setCaptureBusy(true);
    try {
      if (!this.stream || this.view.video().readyState < 2) {
        throw new Error('Wait for the camera preview, then try again.');
      }

      const createdAt = Date.now();
      const liveLocation = this.currentPlace && Number.isFinite(this.currentPlace.latitude)
        ? this.currentPlace
        : this.lastKnownLocation;
      const location = liveLocation ? {
        ...liveLocation,
        place: liveLocation.place || (nearby(liveLocation, this.lastKnownLocation) ? this.lastKnownLocation?.place || '' : '')
      } : null;
      const image = await stampPhoto(this.view.video(), {
        location,
        createdAt,
        zoom: this.view.zoom
      });
      const photo = {
        image,
        createdAt,
        location
      };

      const savedPhoto = await this.photos.saveLocal(photo);
      this.view.addPhoto(savedPhoto);
      this.view.toast(window.Capacitor?.isNativePlatform?.()
        ? 'Captured. Saving to Gallery…'
        : 'Photo saved to this device.');
      this.queueBackgroundSave(savedPhoto);
    } catch (error) {
      this.view.toast(error.message || 'Could not save the photo. Please try again.');
    } finally {
      this.captureInProgress = false;
      this.view.setCaptureBusy(false);
    }
  }

  queueBackgroundSave(photo) {
    const fileName = `FieldStamp-${new Date(photo.createdAt).toISOString().replace(/[:.]/g, '-')}.jpg`;
    this.gallerySaveQueue = this.gallerySaveQueue
      .then(() => new Promise(resolve => setTimeout(resolve, 150)))
      .then(() => saveToGallery(photo.image, fileName, photo.location, photo.createdAt).catch(() => false))
      .then(gallerySaved => {
        if (gallerySaved) this.view.toast('Photo saved to Gallery.');
        else if (window.Capacitor?.isNativePlatform?.()) this.view.toast('Photo is saved in FieldStamp, but Gallery saving failed.');
      })
      .catch(() => {});
    this.syncSaveQueue = this.syncSaveQueue
      .then(() => new Promise(resolve => setTimeout(resolve, 500)))
      .then(() => this.photos.syncPhoto(photo))
      .catch(() => {});
  }

  async syncFromMongo() {
    try {
      await this.photos.syncPending();
      this.view.renderPhotos(await this.photos.importRemote());
    } catch { /* Keep working from the local photo library while offline. */ }
  }

  async sharePhoto() {
    if (!this.activePhoto) return;
    const file = new File([this.activePhoto.image], `FieldStamp-${new Date(this.activePhoto.createdAt).toISOString().replace(/[:.]/g, '-')}.jpg`, { type: 'image/jpeg' });
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: 'FieldStamp field photo' });
      } else {
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      if (error.name !== 'AbortError') this.view.toast('Could not share the photo.');
    }
  }

  async deletePhoto() {
    if (!this.activePhoto) return;
    const result = await this.photos.deleteLocal(this.activePhoto.id);
    this.view.closeDetail();
    this.activePhoto = null;
    this.view.renderPhotos(await this.photos.list());
    this.view.toast(result.synced
      ? 'Photo deleted from this device and MongoDB.'
      : 'Photo deleted here. MongoDB will sync the deletion when connected.');
  }
}
