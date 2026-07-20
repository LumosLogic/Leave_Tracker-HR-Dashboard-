import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// ── Date / Time Formatters ─────────────────────────────────────────────────────
export function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateRange(s, e) {
  if (s === e) return fmtDate(s);
  return `${fmtDate(s)} – ${fmtDate(e)}`;
}

export function fmtTime(t) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function fmtHours(h) {
  if (h == null || h === 0) return '—';
  const hrs = Math.floor(h);
  const min = Math.round((h - hrs) * 60);
  if (hrs === 0) return `${min}m`;
  return min > 0 ? `${hrs}h ${min}m` : `${hrs}h`;
}

export function toISODate(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function todayStr() {
  return toISODate(new Date());
}

// ── String / Avatar Helpers ───────────────────────────────────────────────────
export function initials(name = '') {
  if (!name) return '';
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

// ── Date Range Helpers ────────────────────────────────────────────────────────
export function getWeekDates(date) {
  const d   = new Date(date);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    return x;
  });
}

export function isWeekend(date) {
  const d = new Date(date);
  return d.getDay() === 0 || d.getDay() === 6;
}

// ── Status Helpers ────────────────────────────────────────────────────────────
export function statusLabel(s) {
  const map = { present: 'Present', absent: 'Absent', on_leave: 'On Leave', half_day: 'Half Day', wfh: 'WFH' };
  return map[s] || s || '—';
}

export const MONTHS     = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export const DAYS       = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export const DAYS_FULL  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export const AVATAR_COLORS = ['#3525cd','#10B981','#F59E0B','#EF4444','#712ae2','#F97316','#4f46e5','#EC4899'];

export function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return '☀️ Good morning';
  if (h < 17) return '👋 Good afternoon';
  return '🌙 Good evening';
}

export function liveElapsed(startTime) {
  const [h, m] = startTime.split(':').map(Number);
  const start = new Date();
  start.setHours(h, m, 0, 0);
  const diff = Date.now() - start.getTime();
  const totalMin = Math.floor(diff / 60000);
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

export function isDayActive(dow, workDays) {
  if (!workDays) return dow !== 0 && dow !== 6;
  const activeList = Array.isArray(workDays) ? workDays : String(workDays).split(',').map(Number);
  return activeList.includes(dow);
}

export function countWorkingDays(year, month, maxDate, workDays) {
  let count = 0;
  const days = new Date(year, month, 0).getDate();
  const cap  = maxDate ? new Date(maxDate + 'T23:59:59') : null;
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month - 1, d);
    if (cap && date > cap) break;
    const dow = date.getDay();
    if (isDayActive(dow, workDays)) count++;
  }
  return count;
}

export function countLeaveDaysInMonth(leave, year, month, maxDate, workDays) {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd   = maxDate ? new Date(maxDate + 'T23:59:59') : new Date(year, month, 0);
  const start = new Date(Math.max(new Date(leave.start_date + 'T12:00:00'), monthStart));
  const end   = new Date(Math.min(new Date(leave.end_date   + 'T12:00:00'), monthEnd));
  let count = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (isDayActive(dow, workDays)) count++;
  }
  return count;
}

export function countWorkingDaysInRange(startStr, endStr, workDays) {
  if (!startStr || !endStr) return 0;
  const start = new Date(startStr + 'T12:00:00');
  const end   = new Date(endStr   + 'T12:00:00');
  if (start > end) return 0;
  let count = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (isDayActive(dow, workDays)) count++;
  }
  return count;
}

export function countLeaveDaysInRange(leave, startStr, endStr, workDays) {
  if (!startStr || !endStr) return 0;
  const rangeStart = new Date(startStr + 'T12:00:00');
  const rangeEnd   = new Date(endStr   + 'T12:00:00');
  const start = new Date(Math.max(new Date(leave.start_date + 'T12:00:00'), rangeStart));
  const end   = new Date(Math.min(new Date(leave.end_date   + 'T12:00:00'), rangeEnd));
  if (start > end) return 0;
  let count = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (isDayActive(dow, workDays)) count++;
  }
  return count;
}

