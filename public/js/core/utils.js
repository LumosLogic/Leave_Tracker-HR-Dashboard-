'use strict';

// ── Date / Time Formatters ────────────────────────────────────────────────────
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateRange(s, e) {
  if (s === e) return fmtDate(s);
  return `${fmtDate(s)} – ${fmtDate(e)}`;
}
function fmtTime(t) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}
function fmtHours(h) {
  if (h == null || h === 0) return '—';
  const hrs = Math.floor(h);
  const min = Math.round((h - hrs) * 60);
  if (hrs === 0) return `${min}m`;
  return min > 0 ? `${hrs}h ${min}m` : `${hrs}h`;
}
function toISODate(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function todayStr() { return toISODate(new Date()); }

// ── String / Avatar Helpers ───────────────────────────────────────────────────
function initials(name = '') { return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase(); }
function avatar(name, color, size = 34) {
  return `<div class="sidebar-avatar" style="width:${size}px;height:${size}px;background:${color||'#0EA5E9'};font-size:${size*.33}px">${initials(name)}</div>`;
}

// ── Date Range Helpers ────────────────────────────────────────────────────────
function getDaysInRange(start, end) {
  const days = [];
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end   + 'T12:00:00');
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) days.push(toISODate(new Date(d)));
  return days;
}
function getWeekDates(date) {
  const d   = new Date(date);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  return Array.from({length: 7}, (_, i) => { const x = new Date(monday); x.setDate(monday.getDate() + i); return x; });
}
function isWeekend(date) { const d = new Date(date); return d.getDay() === 0 || d.getDay() === 6; }

// ── Status Label ──────────────────────────────────────────────────────────────
function statusLabel(s) {
  const map = { present:'Present', absent:'Absent', on_leave:'On Leave', half_day:'Half Day', wfh:'WFH' };
  return map[s] || s || '—';
}

// ── Icon Helper ───────────────────────────────────────────────────────────────
const I = k => window.ICONS[k] || '';

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success', duration = 3500) {
  const container = document.getElementById('toast-container');
  const el        = document.createElement('div');
  el.className    = `toast ${type}`;
  const icons     = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  el.innerHTML    = `<span style="font-size:1.1rem">${icons[type]||'•'}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity    = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(html, cls = '') {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal ${cls}" id="modal-box">
        ${html}
      </div>
    </div>`;
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
}
function closeModal() {
  stopClockifyLive();
  document.getElementById('modal-root').innerHTML = '';
}
