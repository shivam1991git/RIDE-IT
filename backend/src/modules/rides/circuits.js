// Darshan Circuits: curated multi-stop trips around Varanasi. The rider picks
// a pickup; the circuit fills in the stops (with how long the driver waits at
// each) and the final drop, and the whole outing is priced upfront as one ride.
const { LANDMARKS } = require('../geo/geo.service');

const CIRCUITS = [
    {
        key: 'kashi-darshan',
        name: 'Kashi Darshan',
        description: 'Kashi Vishwanath darshan, then the evening Ganga Aarti at Dashashwamedh.',
        stops: [{ place: 'Kashi Vishwanath Temple', waitMin: 60 }],
        drop: 'Dashashwamedh Ghat',
    },
    {
        key: 'ghats-trail',
        name: 'Ghats Trail',
        description: 'Assi Ghat at sunrise and Manikarnika, ending at Dashashwamedh Ghat.',
        stops: [{ place: 'Assi Ghat', waitMin: 30 }, { place: 'Manikarnika Ghat', waitMin: 20 }],
        drop: 'Dashashwamedh Ghat',
    },
    {
        key: 'sarnath-return',
        name: 'Sarnath Return',
        description: 'Visit the Buddhist sites at Sarnath and come back to your pickup.',
        stops: [{ place: 'Sarnath', waitMin: 90 }],
        drop: 'pickup',
    },
    {
        key: 'heritage-day',
        name: 'Heritage Day',
        description: 'BHU campus and Ramnagar Fort, then back to your pickup.',
        stops: [{ place: 'Banaras Hindu University', waitMin: 45 }, { place: 'Ramnagar Fort', waitMin: 60 }],
        drop: 'pickup',
    },
];

function landmark(name) {
    const place = LANDMARKS.find(item => item.name === name);
    if (!place) throw new Error(`Circuit references unknown landmark: ${name}`);
    return { name: place.name, address: place.address, lat: place.lat, lng: place.lng };
}

// Resolved once at load time so a typo in the catalogue fails fast.
const RESOLVED = CIRCUITS.map(circuit => ({
    key: circuit.key,
    name: circuit.name,
    description: circuit.description,
    stops: circuit.stops.map(stop => ({ ...landmark(stop.place), waitMin: stop.waitMin })),
    drop: circuit.drop === 'pickup' ? 'pickup' : landmark(circuit.drop),
    totalWaitMin: circuit.stops.reduce((sum, stop) => sum + stop.waitMin, 0),
}));

const circuitKeys = RESOLVED.map(circuit => circuit.key);

module.exports = { CIRCUITS: RESOLVED, circuitKeys };
