import { Box } from '@mui/material';
import VehicleArt from './VehicleArt';

const PALETTE = ['#FF9F1C', '#2EC4B6', '#F3F4F6', '#9AA1AD', '#5AA9FF', '#E4572E'];

function colorFor(name = '') {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

// Fleet cars either use a built-in illustration (/cars/<shape>.svg) or a photo URL.
export default function CarImage({ car, width = 200 }) {
  if (!car) return null;
  const match = /^\/cars\/([\w-]+)\.svg$/.exec(car.image || '');
  if (match || !car.image) {
    return <Box sx={{ color: 'text.primary' }}><VehicleArt kind={match?.[1] || 'sedan'} color={colorFor(car.name)} width={width} title={car.name} /></Box>;
  }
  return <Box component="img" src={car.image} alt={car.name} loading="lazy" sx={{ width, maxWidth: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 3 }} />;
}
