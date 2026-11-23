import { formatPhotoDate } from '../services/PhotoStamp.js';

const byId = id => document.getElementById(id);

export class AppView {
  constructor() {
    this.cameraReady = false;
    this.thumbnailUrls = [];
    this.detailUrl = null;
    this.toastTimer = null;
    this.zoom = 1;
    this.permissionResolver = null;
    this.flashTimer = null;
    this.photoCount = 0;
    this.photoIds = new Set();
  }

  bind(actions) {
    this.actions = actions;
    document.querySelectorAll('[data-tab]').forEach(button => {
      button.addEventListener('click', () => {
        if (button.dataset.tab !== 'capturePage') actions.stopCamera?.();
        this.showTab(button.dataset.tab);
      });
    });
    byId('enableCamera').addEventListener('click', actions.startCamera);
    byId('captureBtn').addEventListener('click', () => this.cameraReady ? actions.capture() : actions.startCamera());
    byId('switchCamera').addEventListener('click', actions.switchCamera);
    byId('gpsButton').addEventListener('click', actions.locate);
    byId('closeDetail').addEventListener('click', () => this.closeDetail());
    byId('detailDialog').addEventListener('click', event => {
      if (event.target === byId('detailDialog')) this.closeDetail();
    });
    byId('sharePhoto').addEventListener('click', actions.sharePhoto);
    byId('deletePhoto').addEventListener('click', actions.deletePhoto);
    byId('permissionsSettings').addEventListener('click', actions.openSettings);
    byId('permissionContinue').addEventListener('click', () => this.closePermissionPrompt(true));
    byId('permissionCancel').addEventListener('click', () => this.closePermissionPrompt(false));
    byId('permissionDialog').addEventListener('close', () => {
      if (!this.permissionResolver) return;
      const resolve = this.permissionResolver;
      this.permissionResolver = null;
      resolve(byId('permissionDialog').returnValue === 'continue');
    });
    byId('settingsOpen').addEventListener('click', () => this.showTab('settingsPage'));
    byId('installBtn').addEventListener('click', actions.install);
    document.querySelectorAll('[data-zoom]').forEach(button => {
      button.addEventListener('click', () => this.setZoom(Number(button.dataset.zoom)));
    });
  }

  initialize() {
    document.body.classList.add('camera-mode');
    byId('todayLabel').textContent = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date());
  }

  video() { return byId('video'); }

  setCamera(stream) {
    this.cameraReady = true;
    byId('video').srcObject = stream;
    byId('video').hidden = false;
    byId('cameraPlaceholder').hidden = true;
    byId('cameraStatus').textContent = 'CAMERA ON';
    byId('viewHeading').textContent = 'LIVE PREVIEW';
    byId('liveStamp').hidden = false;
    byId('switchCamera').hidden = false;
    byId('enableCamera').hidden = true;
    byId('captureBtn').disabled = false;
    this.setZoom(this.zoom);
  }

  setCameraOff() {
    this.cameraReady = false;
    byId('video').srcObject = null;
    byId('video').hidden = true;
    byId('cameraPlaceholder').hidden = false;
    byId('cameraStatus').textContent = 'CAMERA OFF';
    byId('viewHeading').textContent = 'CAMERA PREVIEW';
    byId('liveStamp').hidden = true;
    byId('switchCamera').hidden = true;
    byId('enableCamera').hidden = false;
    byId('captureBtn').disabled = true;
    byId('video').style.setProperty('--digital-zoom', 1);
  }

  setZoom(zoom) {
    this.zoom = Math.max(1, Math.min(3, Number(zoom) || 1));
    byId('video').style.setProperty('--digital-zoom', this.zoom);
    document.querySelectorAll('[data-zoom]').forEach(button => {
      const active = Number(button.dataset.zoom) === this.zoom;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  setCaptureBusy(busy) {
    const button = byId('captureBtn');
    button.disabled = busy || !this.cameraReady;
    button.classList.toggle('is-saving', busy);
    button.setAttribute('aria-label', busy ? 'Saving photo' : 'Capture photo');
    button.querySelector('span:last-child').textContent = busy ? 'SAVING…' : 'CAPTURE';
  }

  flashCapture() {
    const flash = byId('captureFlash');
    flash.classList.remove('flash');
    void flash.offsetWidth;
    flash.classList.add('flash');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => flash.classList.remove('flash'), 220);
    if (navigator.vibrate) navigator.vibrate(25);
  }

  setInstallVisible(visible) {
    byId('installBtn').hidden = !visible;
  }

  askPermission({ title, message, primaryLabel = 'Continue' }) {
    byId('permissionTitle').textContent = title;
    byId('permissionMessage').textContent = message;
    byId('permissionContinue').textContent = primaryLabel;
    byId('permissionDialog').showModal();
    return new Promise(resolve => { this.permissionResolver = resolve; });
  }

  closePermissionPrompt(accepted) {
    byId('permissionDialog').close(accepted ? 'continue' : 'cancel');
  }
  setGpsBusy(busy) {
    byId('gpsButton').disabled = busy;
    byId('gpsButton').textContent = busy ? 'Locating…' : 'Get location';
  }

  setLocation(location) {
    if (!location) {
      byId('gpsStatus').textContent = 'Location unavailable';
      byId('gpsAccuracy').textContent = 'Check location permission';
      byId('liveLocation').textContent = 'Location unavailable';
      return;
    }
    byId('gpsStatus').textContent = location.place ||
      (location.lookupPending ? 'Finding place name…' : (location.cached ? 'Last known place' : 'Place name unavailable'));
    byId('gpsAccuracy').textContent = Number.isFinite(location.accuracy) && location.accuracy > 0
      ? `GPS accuracy ±${Math.round(location.accuracy)} m`
      : 'Saved on this device';
    byId('liveLocation').textContent = location.place ||
      (location.lookupPending ? 'Finding place name…' : (location.cached ? 'Last known place' : 'Place name unavailable'));
  }

  updateClock() {
    byId('liveDate').textContent = new Intl.DateTimeFormat(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit'
    }).format(new Date());
  }

  renderPhotos(photos) {
    this.thumbnailUrls.forEach(url => URL.revokeObjectURL(url));
    this.thumbnailUrls = [];
    byId('recentGrid').replaceChildren();
    byId('libraryGrid').replaceChildren();
    const count = photos.length;
    this.photoCount = count;
    this.photoIds = new Set(photos.map(photo => photo.id).filter(id => id !== undefined));
    byId('photoCount').textContent = `${count} ${count === 1 ? 'photo' : 'photos'}`;
    byId('libraryCount').textContent = `${count} saved`;
    byId('navCount').textContent = String(count);
    byId('navCount').hidden = count === 0;
    byId('emptyPhotos').hidden = count > 0;
    byId('libraryEmpty').hidden = count > 0;

    for (const photo of photos) {
      const url = URL.createObjectURL(photo.image);
      this.thumbnailUrls.push(url);
      const recent = document.createElement('button');
      recent.className = 'photo-tile';
      recent.setAttribute('aria-label', `View photo taken ${formatPhotoDate(photo.createdAt)}`);
      const image = document.createElement('img');
      image.src = url;
      image.alt = '';
      recent.append(image);
      const caption = document.createElement('span');
      caption.textContent = formatPhotoDate(photo.createdAt, false);
      recent.append(caption);
      recent.addEventListener('click', () => this.actions.openPhoto(photo));
      byId('recentGrid').append(recent);

      const tile = document.createElement('button');
      tile.className = 'library-photo';
      tile.setAttribute('aria-label', `View photo taken ${formatPhotoDate(photo.createdAt)}`);
      const libraryImage = document.createElement('img');
      libraryImage.src = url;
      libraryImage.alt = '';
      tile.append(libraryImage);
      const metadata = document.createElement('div');
      metadata.className = 'library-meta';
      const date = document.createElement('strong');
      date.textContent = formatPhotoDate(photo.createdAt);
      metadata.append(date);
      const place = document.createElement('span');
      place.textContent = photo.location?.place || 'Place name unavailable';
      metadata.append(place);
      tile.append(metadata);
      tile.addEventListener('click', () => this.actions.openPhoto(photo));
      byId('libraryGrid').append(tile);
    }
  }

  addPhoto(photo) {
    if (photo.id !== undefined && this.photoIds.has(photo.id)) return;
    if (photo.id !== undefined) this.photoIds.add(photo.id);
    const url = URL.createObjectURL(photo.image);
    this.thumbnailUrls.push(url);
    this.photoCount += 1;
    byId('photoCount').textContent = `${this.photoCount} ${this.photoCount === 1 ? 'photo' : 'photos'}`;
    byId('libraryCount').textContent = `${this.photoCount} saved`;
    byId('navCount').textContent = String(this.photoCount);
    byId('navCount').hidden = this.photoCount === 0;
    byId('emptyPhotos').hidden = true;
    byId('libraryEmpty').hidden = true;

    const recent = document.createElement('button');
    recent.className = 'photo-tile';
    recent.setAttribute('aria-label', `View photo taken ${formatPhotoDate(photo.createdAt)}`);
    const recentImage = document.createElement('img');
    recentImage.src = url;
    recentImage.alt = '';
    recent.append(recentImage);
    recent.addEventListener('click', () => this.actions.openPhoto(photo));
    byId('recentGrid').replaceChildren(recent);

    const tile = document.createElement('button');
    tile.className = 'library-photo';
    tile.setAttribute('aria-label', `View photo taken ${formatPhotoDate(photo.createdAt)}`);
    const image = document.createElement('img');
    image.src = url;
    image.alt = '';
    tile.append(image);
    const metadata = document.createElement('div');
    metadata.className = 'library-meta';
    const date = document.createElement('strong');
    date.textContent = formatPhotoDate(photo.createdAt);
    metadata.append(date);
    const place = document.createElement('span');
    place.textContent = photo.location?.place || 'Place name unavailable';
    metadata.append(place);
    tile.append(metadata);
    tile.addEventListener('click', () => this.actions.openPhoto(photo));
    byId('libraryGrid').prepend(tile);
  }

  openDetail(photo) {
    if (this.detailUrl) URL.revokeObjectURL(this.detailUrl);
    this.detailUrl = URL.createObjectURL(photo.image);
    byId('detailImage').src = this.detailUrl;
    byId('detailDate').textContent = formatPhotoDate(photo.createdAt);
    byId('detailPlace').textContent = photo.location?.place ||
      (photo.location ? 'Place name unavailable' : 'Location unavailable');
    byId('detailCoords').textContent = photo.location && Number.isFinite(photo.location.accuracy)
      ? `GPS accuracy ±${Math.round(photo.location.accuracy)} m`
      : 'GPS unavailable for this photo';
    byId('mapLink').hidden = !photo.location;
    if (photo.location) {
      byId('mapLink').href = `https://maps.google.com/?q=${encodeURIComponent(`${photo.location.latitude},${photo.location.longitude}`)}`;
    }
    byId('detailDialog').showModal();
  }

  closeDetail() {
    byId('detailDialog').close();
    if (this.detailUrl) URL.revokeObjectURL(this.detailUrl);
    this.detailUrl = null;
  }

  showTab(id) {
    document.body.classList.toggle('camera-mode', id === 'capturePage');
    document.body.classList.toggle('subpage-mode', id !== 'capturePage');
    document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === id));
    document.querySelectorAll('.tab').forEach(tab => {
      const active = tab.dataset.tab === id;
      tab.classList.toggle('active', active);
      if (active) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  toast(message) {
    const element = byId('toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => element.classList.remove('show'), 3200);
  }
}
