'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const MONTHS    = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS      = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const STATUS_COLOR = {
  present:  '#10B981',
  absent:   '#EF4444',
  on_leave: '#F59E0B',
  half_day: '#3B82F6',
  wfh:      '#06B6D4',
};

// ── App State ─────────────────────────────────────────────────────────────────
let state = {
  user:             null,
  token:            null,
  view:             'login',
  calendarDate:     new Date(),
  calendarMode:     'month',
  calendarData:     {},
  employees:        [],
  leaves:           [],
  settings:         {},
  dashboard:        {},
  todayRecord:      null,
  timer:            null,
  leavesTab:        'all',
  profileEmp:       null,
  lateEarlyRecords: [],
  leavesFilterDate: null,
  dashboardDate:    null,
};

let leaveFormCount       = 0;
let clockifyLiveInterval = null;
let clockifyTimers       = {};
