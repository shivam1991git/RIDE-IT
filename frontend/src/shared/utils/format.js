const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrPrecise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money = value => inr.format(Math.round(value || 0));
export const moneyPrecise = value => inrPrecise.format(value || 0);

export const dateTime = value => new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const dateOnly = value => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const timeOnly = value => new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export function relativeTime(value) {
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return dateOnly(value);
}

export const km = value => `${Number(value || 0).toFixed(1)} km`;
export const minutes = value => (value >= 60 ? `${Math.floor(value / 60)} h ${Math.round(value % 60)} min` : `${Math.round(value)} min`);

export const STATUS = {
  pending_approval: { label: 'Awaiting confirmation', tone: 'warning' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  requested: { label: 'Finding driver', tone: 'warning' },
  accepted: { label: 'Driver on the way', tone: 'info' },
  arrived: { label: 'Driver arrived', tone: 'secondary' },
  in_progress: { label: 'On trip', tone: 'primary' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'default' },
  expired: { label: 'Expired', tone: 'default' },
  rejected: { label: 'Not confirmed', tone: 'error' },
  pending_driver: { label: 'Awaiting chauffeur', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'success' },
};

export const ACTIVE_STATUSES = ['pending_approval', 'scheduled', 'requested', 'accepted', 'arrived', 'in_progress', 'pending_driver', 'confirmed'];

export const RENTAL_TYPES = {
  hourly: 'Hourly local',
  full_day: 'Full day local',
  outstation_oneway: 'Outstation one-way',
  outstation_round: 'Outstation round trip',
  airport: 'Airport transfer',
};

export const PAYMENT_STATUS = {
  unpaid: { label: 'Unpaid', tone: 'default' },
  pending: { label: 'Unpaid', tone: 'default' },
  advance_paid: { label: 'Advance paid', tone: 'info' },
  partially_paid: { label: 'Partly paid', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  refund_pending: { label: 'Refund due', tone: 'warning' },
  partially_refunded: { label: 'Partly refunded', tone: 'warning' },
  refunded: { label: 'Refunded', tone: 'success' },
  failed: { label: 'Failed', tone: 'error' },
};

export const VEHICLE_CLASSES = { hatchback: 'Hatchback', sedan: 'Sedan', suv: 'SUV', muv: 'MUV' };

// Short title for a booking in lists, e.g. "BK1042 · Full day local".
export const bookingTitle = booking => (booking.type === 'rental'
  ? [booking.reference, RENTAL_TYPES[booking.rentalType] || 'Rental'].filter(Boolean).join(' · ')
  : `${booking.pickup?.name} → ${booking.drop?.name}`);

// Where a rental goes, in one line.
export function rentalRoute(booking) {
  if (booking.rentalType === 'airport') return `${booking.pickup?.name} → ${booking.drop?.name}`;
  if (booking.destination) return `${booking.pickup?.name} → ${booking.destination.name}${booking.rentalType === 'outstation_round' ? ' and back' : ''}`;
  return booking.pickup?.name || '';
}

// "Today, 6:30 pm" / "Tomorrow, 9:00 am" / "Sat 23 Nov, 7:15 am"
export function friendlyDateTime(value) {
  const date = new Date(value);
  const today = new Date();
  const dayDiff = Math.round((new Date(date).setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)) / 86400000);
  const time = timeOnly(date);
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Tomorrow, ${time}`;
  return `${date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

// What the driver earns: promo discounts are paid by RIDE-IT, not the driver.
export const driverEarning = booking => (booking?.totalAmount || 0) + (booking?.promo?.discount || 0);

export const PREFERENCES = [
  ['quiet', 'Quiet ride'],
  ['ac', 'AC on'],
  ['luggage', 'Extra luggage'],
  ['assistance', 'Needs assistance'],
];

// Datetime-local input value in the user's local time zone.
export function toLocalInput(date) {
  const d = new Date(date);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
