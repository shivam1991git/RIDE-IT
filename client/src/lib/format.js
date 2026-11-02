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
  requested: { label: 'Finding driver', tone: 'warning' },
  accepted: { label: 'Driver on the way', tone: 'info' },
  arrived: { label: 'Driver arrived', tone: 'secondary' },
  in_progress: { label: 'On trip', tone: 'primary' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'default' },
  expired: { label: 'Expired', tone: 'default' },
  pending_driver: { label: 'Awaiting chauffeur', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'success' },
};

export const ACTIVE_STATUSES = ['requested', 'accepted', 'arrived', 'in_progress', 'pending_driver', 'confirmed'];

// Datetime-local input value in the user's local time zone.
export function toLocalInput(date) {
  const d = new Date(date);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
