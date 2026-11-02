const { config } = require('../config');
const { haversineKm, round, downsample } = require('../utils/geo');
const { badRequest } = require('../utils/http');

// Curated landmarks: instant suggestions, and the only source in offline mode.
const LANDMARKS = [
    { name: 'Varanasi Junction (Cantt) Railway Station', address: 'Cantonment, Varanasi', lat: 25.3263, lng: 82.9873, tag: 'station' },
    { name: 'Lal Bahadur Shastri International Airport', address: 'Babatpur, Varanasi', lat: 25.4524, lng: 82.8593, tag: 'airport' },
    { name: 'Kashi Vishwanath Temple', address: 'Lahori Tola, Varanasi', lat: 25.3109, lng: 83.0107, tag: 'temple' },
    { name: 'Dashashwamedh Ghat', address: 'Dashashwamedh, Varanasi', lat: 25.3068, lng: 83.0104, tag: 'ghat' },
    { name: 'Assi Ghat', address: 'Shivala, Varanasi', lat: 25.2860, lng: 83.0066, tag: 'ghat' },
    { name: 'Manikarnika Ghat', address: 'Lahori Tola, Varanasi', lat: 25.3109, lng: 83.0144, tag: 'ghat' },
    { name: 'Banaras Hindu University', address: 'Lanka, Varanasi', lat: 25.2677, lng: 82.9913, tag: 'campus' },
    { name: 'Sarnath', address: 'Sarnath, Varanasi', lat: 25.3811, lng: 83.0213, tag: 'heritage' },
    { name: 'Godowlia Chowk', address: 'Godowlia, Varanasi', lat: 25.3089, lng: 83.0070, tag: 'market' },
    { name: 'Lanka Gate', address: 'Lanka, Varanasi', lat: 25.2770, lng: 82.9990, tag: 'market' },
    { name: 'Ramnagar Fort', address: 'Ramnagar, Varanasi', lat: 25.2694, lng: 83.0255, tag: 'heritage' },
    { name: 'Sigra', address: 'Sigra, Varanasi', lat: 25.3176, lng: 82.9890, tag: 'area' },
];

const cache = new Map();
const CACHE_LIMIT = 500;

function cached(key, producer) {
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    return producer().then(value => {
        if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
        cache.set(key, value);
        return value;
    });
}

async function fetchJson(url, timeoutMs = 4000) {
    const response = await fetch(url, {
        headers: { 'User-Agent': config.geoUserAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Upstream ${response.status}`);
    return response.json();
}

function isInServiceArea(point) {
    const { lat, lng, radiusKm } = config.serviceArea;
    return haversineKm(point, { lat, lng }) <= radiusKm;
}

function assertInServiceArea(point, label) {
    if (!isInServiceArea(point)) {
        throw badRequest(`${label} is outside our ${config.serviceArea.name} service area`);
    }
}

function matchLandmarks(query) {
    const q = query.toLowerCase();
    return LANDMARKS
        .filter(place => place.name.toLowerCase().includes(q) || place.address.toLowerCase().includes(q))
        .map(({ tag, ...place }) => ({ ...place, source: 'landmark' }));
}

function photonFeatureToPlace(feature) {
    const p = feature.properties || {};
    const [lng, lat] = feature.geometry.coordinates;
    const name = p.name || [p.housenumber, p.street].filter(Boolean).join(' ') || p.city || 'Pinned location';
    const address = [p.street, p.district || p.locality, p.city || p.county, p.state]
        .filter(Boolean)
        .filter((part, index, all) => all.indexOf(part) === index && part !== name)
        .join(', ');
    return { name, address, lat, lng, source: 'osm' };
}

async function searchPlaces(query) {
    const landmarks = matchLandmarks(query);
    if (config.geoProvider !== 'osm') return landmarks.slice(0, 8);

    const { lat, lng } = config.serviceArea;
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=${lat}&lon=${lng}&limit=8&lang=en`;
    try {
        const data = await cached(`s:${query.toLowerCase()}`, () => fetchJson(url));
        const remote = (data.features || [])
            .map(photonFeatureToPlace)
            .filter(isInServiceArea);
        const seen = new Set(landmarks.map(place => place.name.toLowerCase()));
        return [...landmarks, ...remote.filter(place => !seen.has(place.name.toLowerCase()))].slice(0, 8);
    } catch (error) {
        return landmarks.slice(0, 8);
    }
}

async function reverseGeocode(point) {
    const nearest = LANDMARKS
        .map(place => ({ place, km: haversineKm(point, place) }))
        .sort((a, b) => a.km - b.km)[0];
    const fallback = nearest && nearest.km < 0.3
        ? { name: nearest.place.name, address: nearest.place.address, lat: point.lat, lng: point.lng }
        : { name: 'Pinned location', address: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`, lat: point.lat, lng: point.lng };

    if (config.geoProvider !== 'osm') return fallback;
    const url = `https://photon.komoot.io/reverse?lat=${point.lat}&lon=${point.lng}&limit=1&lang=en`;
    try {
        const key = `r:${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
        const data = await cached(key, () => fetchJson(url));
        const feature = (data.features || [])[0];
        return feature ? { ...photonFeatureToPlace(feature), lat: point.lat, lng: point.lng } : fallback;
    } catch (error) {
        return fallback;
    }
}

// OSRM's car profile assumes free-flowing roads; Indian city traffic is
// considerably slower, so durations are scaled by a documented factor.
const TRAFFIC_FACTOR = 1.5;
const ROAD_FACTOR = 1.35;
const FALLBACK_SPEED_KMH = 20;

function estimateRoute(from, to) {
    const distanceKm = round(haversineKm(from, to) * ROAD_FACTOR, 2);
    return {
        distanceKm,
        durationMin: Math.max(1, Math.round((distanceKm / FALLBACK_SPEED_KMH) * 60)),
        geometry: [[from.lat, from.lng], [to.lat, to.lng]],
        source: 'estimate',
    };
}

async function getRoute(from, to) {
    if (config.geoProvider !== 'osm') return estimateRoute(from, to);
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=simplified&geometries=geojson`;
    try {
        const key = `route:${coords.replace(/(\.\d{4})\d+/g, '$1')}`;
        const data = await cached(key, () => fetchJson(url, 5000));
        const route = data.routes && data.routes[0];
        if (!route) return estimateRoute(from, to);
        return {
            distanceKm: round(route.distance / 1000, 2),
            durationMin: Math.max(1, Math.round((route.duration / 60) * TRAFFIC_FACTOR)),
            geometry: downsample(route.geometry.coordinates.map(([lng, lat]) => [round(lat, 5), round(lng, 5)])),
            source: 'osrm',
        };
    } catch (error) {
        return estimateRoute(from, to);
    }
}

module.exports = {
    LANDMARKS,
    TRAFFIC_FACTOR,
    ROAD_FACTOR,
    searchPlaces,
    reverseGeocode,
    getRoute,
    isInServiceArea,
    assertInServiceArea,
};
