// ─── DATE UTILITIES ───────────────────────────────────────────
export function formatDate(date) {
  if (!date) return '—';
  const d = new Date(date+(typeof date==='string'&&!date.includes('T')?'T00:00:00':''));
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}
export function formatDateTime(date) {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'America/New_York'})+' at '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'});
}
export function formatTimeOnly(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'});
}
export function formatDateOnly(date) {
  if (!date) return '';
  const d = new Date(date+(typeof date==='string'&&!date.includes('T')?'T00:00:00':''));
  return d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'America/New_York'});
}
export function formatDateTimeShort(date) {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'America/New_York'})+' at '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'});
}
export function formatActivityTime(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  const mins = Math.floor((now-d)/60000);
  const hours = Math.floor((now-d)/3600000);
  const days = Math.floor((now-d)/86400000);
  if (mins<1) return 'just now';
  if (mins<60) return `${mins}m ago`;
  if (hours<24) return `${hours}h ago`;
  if (days<7) return `${days}d ago`;
  return formatDate(ts);
}
export function calcDueDate(createdAt, relativeDays) {
  if (relativeDays==null) return null;
  const base = new Date(createdAt);
  base.setDate(base.getDate()+relativeDays);
  return base.toISOString().split('T')[0];
}
export function calcFutureDueDate(value, unit) {
  const n = parseInt(value);
  if (isNaN(n)||n<=0) return null;
  const d = new Date();
  if (unit==='days') d.setDate(d.getDate()+n);
  else if (unit==='weeks') d.setDate(d.getDate()+n*7);
  else if (unit==='months') d.setMonth(d.getMonth()+n);
  return d.toISOString().split('T')[0];
}
export function getDueStatus(dueDateStr) {
  if (!dueDateStr) return null;
  const due = new Date(dueDateStr.includes('T') ? dueDateStr : dueDateStr+'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
  const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate()+7);
  if (due < today) return 'overdue';
  if (due.getTime()===today.getTime()) return 'today';
  if (due.getTime()===tomorrow.getTime()) return 'tomorrow';
  if (due <= nextWeek) return 'this-week';
  return 'upcoming';
}
export function getDueLabel(dueDateStr) {
  const status = getDueStatus(dueDateStr);
  if (!status) return '';
  if (status==='overdue') {
    const due = new Date(dueDateStr.includes('T')?dueDateStr:dueDateStr+'T00:00:00');
    const today = new Date(); today.setHours(0,0,0,0);
    const days = Math.round((today-due)/86400000);
    return days===1?'Overdue 1 day':`Overdue ${days} days`;
  }
  if (status==='today') return 'Due today';
  if (status==='tomorrow') return 'Due tomorrow';
  if (status==='this-week') return `Due ${formatDate(dueDateStr)}`;
  return `Due ${formatDate(dueDateStr)}`;
}
export function getArrangementStatus(arrangementDate) {
  if (!arrangementDate) return null;
  const arr = new Date(arrangementDate);
  const now = new Date();
  // Use Eastern time for date comparison
  const etNow = new Date(now.toLocaleString('en-US',{timeZone:'America/New_York'}));
  const etArr = new Date(arr.toLocaleString('en-US',{timeZone:'America/New_York'}));
  const todayET = new Date(etNow); todayET.setHours(0,0,0,0);
  const tomorrowET = new Date(todayET); tomorrowET.setDate(tomorrowET.getDate()+1);
  const arrDayET = new Date(etArr); arrDayET.setHours(0,0,0,0);
  // Only show if arrangement is in the future
  if (arr <= now) return null;
  if (arrDayET.getTime()===todayET.getTime()) return 'today';
  if (arrDayET.getTime()===tomorrowET.getTime()) return 'tomorrow';
  if (arrDayET <= new Date(todayET.getTime()+7*86400000)) return 'this-week';
  return null;
}
export function todayStr() { return new Date().toISOString().split('T')[0]; }
export function toInputDate(dateStr) { if (!dateStr) return ''; return dateStr.split('T')[0]; }
export function toInputDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
