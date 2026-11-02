import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useTheme } from '@mui/material/styles';

const VARANASI = [25.3176, 82.9739];

const pin = kind => L.divIcon({ className: `rid-pin ${kind}`, html: '<span></span>', iconSize: [26, 26], iconAnchor: [13, 13] });
const ICONS = { pickup: pin('pickup'), drop: pin('drop'), car: pin('car') };

function FitView({ points }) {
  const map = useMap();
  const key = points.map(p => p.join(',')).join('|');
  useEffect(() => {
    if (!points.length) return undefined;
    // Wait a frame so the container has its final size, then leave room for
    // the floating panel that covers the left side of the map on desktop.
    const id = setTimeout(() => {
      map.invalidateSize();
      const wide = map.getContainer().clientWidth >= 900;
      if (points.length === 1) map.setView(points[0], 15);
      else map.fitBounds(L.latLngBounds(points), { paddingTopLeft: [wide ? 500 : 40, 56], paddingBottomRight: [40, 56], maxZoom: 16 });
    }, 60);
    return () => clearTimeout(id);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/**
 * Map with pickup/drop markers and an optional route.
 * Tiles: OpenStreetMap's standard tile server — free, no key, for light use
 * under the OSMF tile usage policy (attribution required). Dark mode is a CSS
 * filter on the tile layer only, so markers and the route keep their colours.
 */
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export default function RideMap({ pickup, drop, route, driverLocation, animated = true, sx }) {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';

  const points = useMemo(() => {
    const list = [];
    if (pickup) list.push([pickup.lat, pickup.lng]);
    if (drop) list.push([drop.lat, drop.lng]);
    if (driverLocation?.lat) list.push([driverLocation.lat, driverLocation.lng]);
    return list;
  }, [pickup, drop, driverLocation]);

  return (
    <div className={dark ? 'rid-map-dark' : undefined} style={{ height: '100%', width: '100%', ...sx }}>
      <MapContainer center={VARANASI} zoom={13} zoomControl={false} scrollWheelZoom style={{ height: '100%', width: '100%' }} attributionControl>
        <TileLayer
          url={TILES}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />
        {route?.length > 1 && (
          <>
            <Polyline positions={route} pathOptions={{ color: theme.palette.secondary.main, weight: 9, opacity: 0.18 }} />
            <Polyline positions={route} pathOptions={{ color: theme.palette.secondary.main, weight: 4, className: animated ? 'rid-route-anim' : undefined }} />
          </>
        )}
        {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={ICONS.pickup} title={`Pickup: ${pickup.name}`} />}
        {drop && <Marker position={[drop.lat, drop.lng]} icon={ICONS.drop} title={`Destination: ${drop.name}`} />}
        {driverLocation?.lat && <Marker position={[driverLocation.lat, driverLocation.lng]} icon={ICONS.car} title="Driver" />}
        <FitView points={points} />
      </MapContainer>
    </div>
  );
}
