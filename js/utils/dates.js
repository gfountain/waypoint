// ─── DATE UTILITIES ───────────────────────────────────────────

// Format a date string or Date object for display
export function formatDate(date) {
  if (!date) return '—';
  const d = new Date(date + (typeof date === 'string' && !date.includes('T') ? 'T00:00:00' : ''));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Format date + time
export function formatDateTime(date) {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Format just time
export function formatTime(date) {
  if (!date) return '—';
  return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Format timestamp for activity log
export function formatActivityTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(ts);
}

// Calculate absolute due date from case creation date + relative days
export function calcDueDate(createdAt, relativeDays) {
  if (!relativeDays && relativeDays !== 0) return null;
  const base = new Date(createdAt);
  base.setDate(base.getDate() + relativeDays);
  return base.toISOString().split('T')[0]; // YYYY-MM-DD
}

// Calculate due date from "in N days/weeks/months" input
export function calcFutureDueDate(value, unit) {
  const n = parseInt(value);
  if (isNaN(n) || n <= 0) return null;
  const d = new Date();
  if (unit === 'days') d.setDate(d.getDate() + n);
  else if (unit === 'weeks') d.setDate(d.getDate() + n * 7);
  else if (unit === 'months') d.setMonth(d.getMonth() + n);
  return d.toISOString().split('T')[0];
}

// Get due status for an item
export function getDueStatus(dueDateStr) {
  if (!dueDateStr) return null;
  const due = new Date(dueDateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (due < today) return 'overdue';
  if (due.getTime() === today.getTime()) return 'today';
  if (due.getTime() === tomorrow.getTime()) return 'tomorrow';
  return 'upcoming';
}

// Human-readable due label
export function getDueLabel(dueDateStr) {
  const status = getDueStatus(dueDateStr);
  if (!status) return '';
  if (status === 'overdue') {
    const due = new Date(dueDateStr + 'T00:00:00');
    const today = new Date(); today.setHours(0,0,0,0);
    const days = Math.round((today - due) / 86400000);
    return days === 1 ? 'Overdue 1 day' : `Overdue ${days} days`;
  }
  if (status === 'today') return 'Due today';
  if (status === 'tomorrow') return 'Due tomorrow';
  return `Due ${formatDate(dueDateStr)}`;
}

// Is a date within N days from now?
export function isWithinDays(dueDateStr, days) {
  if (!dueDateStr) return false;
  const due = new Date(dueDateStr + 'T00:00:00');
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);
  cutoff.setHours(23, 59, 59, 999);
  return due <= cutoff;
}

// Today as YYYY-MM-DD string
export function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// Format for <input type="date"> value
export function toInputDate(dateStr) {
  if (!dateStr) return '';
  return dateStr.split('T')[0];
}
