const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
    return (deg * Math.PI) / 180;
}

function haversineKm(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

function round(value, decimals = 2) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

// Keeps at most `max` points of a polyline, always including both ends.
function downsample(points, max = 150) {
    if (points.length <= max) return points;
    const step = (points.length - 1) / (max - 1);
    const out = [];
    for (let i = 0; i < max; i += 1) {
        out.push(points[Math.round(i * step)]);
    }
    return out;
}

module.exports = { haversineKm, round, downsample };
