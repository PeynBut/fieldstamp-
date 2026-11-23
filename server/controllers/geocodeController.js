const PLACE_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
const placeCache = new Map();
let nominatimQueue = Promise.resolve();
let lastNominatimRequest = 0;

function cacheKey(latitude, longitude) {
  return `v4:${latitude.toFixed(3)},${longitude.toFixed(3)}`;
}

function findPlace(address, placeName = '') {
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
  const landmark = placeName || address.name || address.amenity || address.office || address.shop || address.tourism || address.building || '';
  const dwelling = [number, purok].filter(Boolean).join(' ');
  const placeParts = landmark
    ? [landmark, dwelling, road, neighborhood, district, city, postcodeProvince || province, country]
    : [dwelling, neighborhood, district, road, city, postcodeProvince || province, country];
  return placeParts
    .filter((name, index, all) => name && all.findIndex(value => value?.toLowerCase() === name.toLowerCase()) === index)
    .join(', ');
}

async function queryNominatim(latitude, longitude) {
  const request = nominatimQueue.then(async () => {
    const wait = Math.max(0, 1000 - (Date.now() - lastNominatimRequest));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastNominatimRequest = Date.now();

    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('zoom', '18');
    url.searchParams.set('lat', latitude);
    url.searchParams.set('lon', longitude);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FieldStamp/1.0 (reverse geocoding for field photo place labels)',
        'Accept-Language': 'en'
      },
      signal: AbortSignal.timeout(9000)
    });
    if (!response.ok) throw new Error(`OpenStreetMap returned ${response.status}.`);
    const result = await response.json();
    return findPlace(result.address || {}, result.name || '');
  });

  nominatimQueue = request.catch(() => {});
  return request;
}

export async function reverseGeocode(request, response) {
  const latitude = Number(request.query.latitude);
  const longitude = Number(request.query.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return response.status(400).json({ error: 'Valid GPS coordinates are required.' });
  }

  const key = cacheKey(latitude, longitude);
  const cached = placeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return response.json({ place: cached.place });

  try {
    const place = await queryNominatim(latitude, longitude);
    if (place) placeCache.set(key, { place, expiresAt: Date.now() + PLACE_CACHE_TTL });
    return response.json({ place });
  } catch (error) {
    console.warn('OpenStreetMap reverse lookup failed:', error.message);
    return response.status(502).json({ error: 'The place name service is unavailable.' });
  }
}
