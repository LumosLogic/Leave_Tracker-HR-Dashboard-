'use strict';

// ── Auth ──────────────────────────────────────────────────────────────────────
function saveAuth(token, user) {
  state.token = token;
  state.user  = user;
  localStorage.setItem('lt_token', token);
  localStorage.setItem('lt_user',  JSON.stringify(user));
}
function loadAuth() {
  const token = localStorage.getItem('lt_token');
  const user  = localStorage.getItem('lt_user');
  if (token && user) { state.token = token; state.user = JSON.parse(user); return true; }
  return false;
}
function logout() {
  state.token = null; state.user = null;
  state.calendarData = {}; state.employees = []; state.leaves = [];
  localStorage.removeItem('lt_token'); localStorage.removeItem('lt_user');
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
  navigate('login');
}

// ── Dark Mode ─────────────────────────────────────────────────────────────────
function initDarkMode() {
  if (localStorage.getItem('lt_dark') === '1') {
    document.body.classList.add('dark');
  }
  updateDarkModeIcon();
}
function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem('lt_dark', isDark ? '1' : '0');
  updateDarkModeIcon();
}
function updateDarkModeIcon() {
  const isDark = document.body.classList.contains('dark');
  const moon   = document.getElementById('dark-icon-moon');
  const sun    = document.getElementById('dark-icon-sun');
  if (!moon || !sun) return;
  moon.style.display = isDark ? 'block' : 'none';
  sun.style.display  = isDark ? 'none'  : 'block';
}
