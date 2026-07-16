require('dotenv').config();
const { google } = require('googleapis');
const path = require('path');
const fs   = require('fs');

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

// Color IDs used in Google Calendar API
const COLORS = {
  leave:    '9',  // blueberry
  holiday:  '11', // tomato
  event:    '2',  // sage / green
  birthday: '6',  // banana / yellow
  wfh:      '7',  // peacock / teal
};

function getAuth() {
  try {
    let credentials;
    // Prefer JSON string in env (easier for cloud deployments)
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } else {
      // Fall back to file
      const filePath = path.join(__dirname, 'service-account.json');
      if (!fs.existsSync(filePath)) return null;
      credentials = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
  } catch { return null; }
}

function getCalendar() {
  const auth = getAuth();
  if (!auth || !CALENDAR_ID) return null;
  return google.calendar({ version: 'v3', auth });
}

// ─── Core helpers ─────────────────────────────────────────────────────────────

async function insertEvent({ summary, description, start, end, colorId, extendedProperties }) {
  const cal = getCalendar();
  if (!cal) return null;
  try {
    const { data } = await cal.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: {
        summary,
        description: description || '',
        start: { date: start },
        end:   { date: end   },
        colorId,
        extendedProperties: { private: extendedProperties || {} },
      },
    });
    return data.id;
  } catch (err) {
    console.error('[GCal] insertEvent failed:', err.message);
    return null;
  }
}

async function deleteEvent(googleEventId) {
  if (!googleEventId) return;
  const cal = getCalendar();
  if (!cal) return;
  try {
    await cal.events.delete({ calendarId: CALENDAR_ID, eventId: googleEventId });
  } catch (err) {
    if (err.code !== 404) console.error('[GCal] deleteEvent failed:', err.message);
  }
}

async function updateEvent(googleEventId, patch) {
  if (!googleEventId) return;
  const cal = getCalendar();
  if (!cal) return;
  try {
    await cal.events.patch({ calendarId: CALENDAR_ID, eventId: googleEventId, requestBody: patch });
  } catch (err) {
    console.error('[GCal] updateEvent failed:', err.message);
  }
}

// ─── Leave events ─────────────────────────────────────────────────────────────

const LEAVE_LABELS = {
  annual: 'Annual Leave', sick: 'Sick Leave', casual: 'Casual Leave',
  emergency: 'Emergency Leave', other: 'Leave',
};

async function createLeaveEvent(leave, employeeName) {
  const type  = LEAVE_LABELS[leave.leave_type] || 'Leave';
  const label = leave.leave_time === 'wfh' ? 'WFH' : leave.leave_time === 'half' ? 'Half Day' : type;
  const color = leave.leave_time === 'wfh' ? COLORS.wfh : COLORS.leave;

  // Google Calendar end date for all-day events is exclusive, add 1 day
  const endDate = new Date(leave.end_date + 'T12:00:00');
  endDate.setDate(endDate.getDate() + 1);
  const endStr = endDate.toISOString().split('T')[0];

  return insertEvent({
    summary:     `${employeeName} — ${label}`,
    description: leave.reason ? `Reason: ${leave.reason}` : '',
    start:       leave.start_date,
    end:         endStr,
    colorId:     color,
    extendedProperties: { leaveId: String(leave.id), type: 'leave' },
  });
}

async function deleteLeaveEvent(googleEventId) {
  return deleteEvent(googleEventId);
}

// ─── Holiday events ───────────────────────────────────────────────────────────

async function createHolidayEvent(holiday) {
  const next = new Date(holiday.date + 'T12:00:00');
  next.setDate(next.getDate() + 1);
  return insertEvent({
    summary:     `🏖 ${holiday.name}`,
    description: holiday.description || '',
    start:       holiday.date,
    end:         next.toISOString().split('T')[0],
    colorId:     COLORS.holiday,
    extendedProperties: { holidayId: String(holiday.id), type: 'holiday' },
  });
}

async function deleteHolidayEvent(googleEventId) {
  return deleteEvent(googleEventId);
}

async function updateHolidayEvent(googleEventId, holiday) {
  const next = new Date(holiday.date + 'T12:00:00');
  next.setDate(next.getDate() + 1);
  return updateEvent(googleEventId, {
    summary:     `🏖 ${holiday.name}`,
    description: holiday.description || '',
    start: { date: holiday.date },
    end:   { date: next.toISOString().split('T')[0] },
  });
}

// ─── Company events ───────────────────────────────────────────────────────────

async function createCompanyEvent(evt) {
  const endDate = evt.end_date || evt.date;
  const next = new Date(endDate + 'T12:00:00');
  next.setDate(next.getDate() + 1);
  return insertEvent({
    summary:     `📅 ${evt.title}`,
    description: evt.description || '',
    start:       evt.date,
    end:         next.toISOString().split('T')[0],
    colorId:     COLORS.event,
    extendedProperties: { eventId: String(evt.id), type: 'company_event' },
  });
}

async function deleteCompanyEvent(googleEventId) {
  return deleteEvent(googleEventId);
}

async function updateCompanyEvent(googleEventId, evt) {
  const endDate = evt.end_date || evt.date;
  const next = new Date(endDate + 'T12:00:00');
  next.setDate(next.getDate() + 1);
  return updateEvent(googleEventId, {
    summary:     `📅 ${evt.title}`,
    description: evt.description || '',
    start: { date: evt.date },
    end:   { date: next.toISOString().split('T')[0] },
  });
}

// ─── Fetch events for display ─────────────────────────────────────────────────

async function fetchEvents(timeMin, timeMax) {
  const cal = getCalendar();
  if (!cal) return [];
  try {
    const { data } = await cal.events.list({
      calendarId:   CALENDAR_ID,
      timeMin:      timeMin || new Date(new Date().getFullYear(), 0, 1).toISOString(),
      timeMax:      timeMax || new Date(new Date().getFullYear() + 1, 11, 31).toISOString(),
      singleEvents: true,
      orderBy:      'startTime',
      maxResults:   500,
    });
    return (data.items || []).map(e => ({
      id:          e.id,
      title:       e.summary,
      start:       e.start?.date || e.start?.dateTime?.split('T')[0],
      end:         e.end?.date   || e.end?.dateTime?.split('T')[0],
      description: e.description,
      colorId:     e.colorId,
      type:        e.extendedProperties?.private?.type || 'google',
    }));
  } catch (err) {
    console.error('[GCal] fetchEvents failed:', err.message);
    return [];
  }
}

function isConfigured() {
  const auth = getAuth();
  return !!(auth && CALENDAR_ID);
}

module.exports = {
  createLeaveEvent, deleteLeaveEvent,
  createHolidayEvent, deleteHolidayEvent, updateHolidayEvent,
  createCompanyEvent, deleteCompanyEvent, updateCompanyEvent,
  fetchEvents, isConfigured,
};
