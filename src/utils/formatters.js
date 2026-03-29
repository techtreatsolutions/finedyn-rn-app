const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +05:30 in ms

/**
 * Extract date/time numbers from any date string.
 * Strips timezone indicators and always treats the embedded digits as IST.
 * If the string is a proper UTC string (ends with Z), converts to IST first.
 */
function toISTParts(dateStr) {
  if (!dateStr) return null;

  // Handle Date objects directly
  if (dateStr instanceof Date) {
    if (isNaN(dateStr.getTime())) return null;
    return { year: dateStr.getFullYear(), month: dateStr.getMonth() + 1, day: dateStr.getDate(), hours: dateStr.getHours(), minutes: dateStr.getMinutes() };
  }

  let str = String(dateStr).trim();

  // Case 1: Has 'Z' suffix — genuine UTC, convert to IST
  if (str.endsWith('Z') || str.endsWith('z')) {
    const date = new Date(str);
    if (isNaN(date.getTime())) return null;
    const istMs = date.getTime() + IST_OFFSET_MS;
    const d = new Date(istMs);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hours: d.getUTCHours(), minutes: d.getUTCMinutes() };
  }

  // Case 2: Has explicit offset like +05:30 or -04:00 — timezone-aware
  if (/[+-]\d{2}:\d{2}$/.test(str)) {
    const date = new Date(str);
    if (isNaN(date.getTime())) return null;
    const istMs = date.getTime() + IST_OFFSET_MS;
    const d = new Date(istMs);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hours: d.getUTCHours(), minutes: d.getUTCMinutes() };
  }

  // Case 3: No timezone info — treat digits as IST directly
  // Handles both "2026-03-23 13:00:00" and "2026-03-23T13:00:00" and "2026-03-23T13:00:00.000"
  // Replace 'T' with space so we can parse uniformly
  str = str.replace('T', ' ');
  // Remove milliseconds if present
  str = str.replace(/\.\d+$/, '');

  const [datePart, timePart] = str.split(' ');
  if (!datePart) return null;
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = (timePart || '00:00:00').split(':').map(Number);
  if (isNaN(y) || isNaN(mo) || isNaN(d)) return null;
  return { year: y, month: mo, day: d, hours: h || 0, minutes: mi || 0 };
}

/**
 * Parse a date string to a correct absolute Date object (for timeAgo calculations).
 * Always produces the correct absolute instant regardless of input format.
 */
function parseIST(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
  let str = String(dateStr).trim();

  // If it already has Z or explicit offset, parse directly
  if (str.endsWith('Z') || str.endsWith('z') || /[+-]\d{2}:\d{2}$/.test(str)) {
    return new Date(str);
  }

  // No timezone — treat as IST by appending +05:30
  str = str.replace('T', ' ').replace(/\.\d+$/, '');
  const [datePart, timePart] = str.split(' ');
  return new Date(`${datePart}T${timePart || '00:00:00'}+05:30`);
}

function pad2(n) { return n < 10 ? '0' + n : String(n); }

function formatAmPm(hours, minutes) {
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h = hours % 12 || 12;
  return `${h}:${pad2(minutes)} ${ampm}`;
}

export function formatCurrency(amount, currency = '₹') {
  const n = Number(amount) || 0;
  return `${currency}${n.toFixed(2)}`;
}

export function formatDate(dateStr) {
  const p = toISTParts(dateStr);
  if (!p) return '—';
  return `${pad2(p.day)} ${MONTHS[p.month - 1]} ${p.year}`;
}

export function formatDateTime(dateStr) {
  const p = toISTParts(dateStr);
  if (!p) return '—';
  return `${pad2(p.day)} ${MONTHS[p.month - 1]} ${p.year}, ${formatAmPm(p.hours, p.minutes)}`;
}

export function formatTime(dateStr) {
  if (!dateStr) return '—';
  // Handle bare time strings like "09:30:00" or "14:00:00"
  const str = String(dateStr).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) {
    const [h, m] = str.split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) return formatAmPm(h, m);
  }
  const p = toISTParts(dateStr);
  if (!p) return '—';
  return formatAmPm(p.hours, p.minutes);
}

export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = parseIST(dateStr);
  if (!d || isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
}

export function getStatusColor(status) {
  const map = {
    available: '#059669', occupied: '#D97706', reserved: '#2563EB',
    cleaning: '#6B7280', pending: '#D97706', confirmed: '#2563EB',
    preparing: '#EA580C', ready: '#059669', served: '#6B7280',
    completed: '#059669', cancelled: '#DC2626', paid: '#059669',
    unpaid: '#DC2626', partial: '#D97706', active: '#059669',
    present: '#059669', absent: '#DC2626', half_day: '#D97706',
  };
  return map[status] || '#6B7280';
}
