import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CheckCircle2, LogIn, LogOut, Timer, Clock } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/context/ToastContext';

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}
function fmtHours(h) {
  if (!h) return '0h 0m';
  const hrs = Math.floor(h); const min = Math.round((h - hrs) * 60);
  return hrs > 0 ? `${hrs}h ${min}m` : `${min}m`;
}

function AttendanceCheckinCard({ onRefreshed }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [record, setRecord] = useState(null);
  const [elapsed, setElapsed] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: mode } = useQuery({
    queryKey: ['checkin-mode'],
    queryFn: () => apiGet('/attendance/checkin-mode'),
    staleTime: 5 * 60 * 1000,
  });
  const clockifySyncs = mode?.syncs_clockify ?? false;

  const load = useCallback(async () => {
    try { setRecord(await apiGet('/attendance/today')); } catch { /* silent */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!record?.check_in || record?.check_out) { setElapsed(''); return; }
    const tick = () => {
      const [h, m] = record.check_in.split(':').map(Number);
      const start = new Date(); start.setHours(h, m, 0, 0);
      const total = Math.floor((Date.now() - start.getTime()) / 60000);
      const hrs = Math.floor(total / 60); const min = total % 60;
      setElapsed(hrs > 0 ? `${hrs}h ${min}m` : `${min}m`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [record]);

  async function checkIn() {
    setBusy(true);
    try {
      const { record: r, message, clockify_synced } = await apiPost('/attendance/checkin', {});
      setRecord(r);
      toast(message || 'Checked in!', 'success');
      if (clockify_synced) toast('Clockify timer started', 'success');
      qc.invalidateQueries(['my-attendance']);
      onRefreshed?.();
    } catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  }
  async function checkOut() {
    setBusy(true);
    try {
      const { record: r, message, clockify_synced } = await apiPost('/attendance/checkout', {});
      setRecord(r);
      toast(message || 'Checked out!', r.status === 'half_day' ? 'warning' : 'success');
      if (clockify_synced) toast('Clockify timer stopped', 'success');
      qc.invalidateQueries(['my-attendance']);
      onRefreshed?.();
    } catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden mb-6">
      {/* Header */}
      <div className="px-5 py-3 bg-[#f8f9ff] border-b border-[#e7eefe] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-[#777587]" />
          <span className="text-xs font-semibold text-[#777587]">Today's Attendance · {dateStr}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {clockifySyncs ? (
            <span className="flex items-center gap-1 text-[0.6rem] font-bold px-2 py-0.5 rounded text-white"
              style={{ background: 'linear-gradient(135deg, #3525cd, #4f46e5)' }}>
              <Timer size={9} /> Clockify Sync ON
            </span>
          ) : mode?.has_clockify ? (
            <span className="text-[0.6rem] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">
              Link your Clockify ID to enable sync
            </span>
          ) : (
            <span className="text-[0.6rem] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-500">
              Standalone Mode
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Status block */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {!record?.check_in ? (
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
              <LogIn size={18} className="text-slate-400" />
            </div>
          ) : !record?.check_out ? (
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
              <CheckCircle2 size={18} className="text-emerald-500" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-[#f0f3ff] flex items-center justify-center shrink-0">
              <CheckCircle2 size={18} className="text-[#3525cd]" />
            </div>
          )}
          <div className="min-w-0">
            {!record?.check_in ? (
              <>
                <p className="text-sm font-bold text-[#151c27]">Not Checked In</p>
                <p className="text-xs text-[#777587]">
                  {clockifySyncs ? 'Checking in will also start your Clockify timer' : 'Mark yourself present for today'}
                </p>
              </>
            ) : !record?.check_out ? (
              <>
                <p className="text-sm font-bold text-emerald-600 flex items-center gap-1.5">
                  Checked In at {fmtTime(record.check_in)}
                  {record.clockify_entry_id && (
                    <span className="text-[0.6rem] bg-indigo-100 text-indigo-600 px-1 py-0.5 rounded font-bold">Clockify ✓</span>
                  )}
                </p>
                <p className="text-xs text-[#777587]">{elapsed ? `Working for ${elapsed}` : 'Timer running'}</p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-[#151c27]">Work Complete</p>
                <p className="text-xs text-[#777587]">
                  {fmtTime(record.check_in)} – {fmtTime(record.check_out)} · {fmtHours(record.work_hours)} worked
                  {record.status === 'half_day' && ' · Half Day'}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Action button */}
        <div className="shrink-0">
          {!record?.check_in ? (
            <button onClick={checkIn} disabled={busy}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-all shadow-sm">
              <LogIn size={15} /> {busy ? 'Checking in…' : 'Check In'}
            </button>
          ) : !record?.check_out ? (
            <button onClick={checkOut} disabled={busy}
              className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-60 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-all shadow-sm">
              <LogOut size={15} /> {busy ? 'Checking out…' : 'Check Out'}
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-[#777587] bg-[#f0f3ff] px-4 py-2.5 rounded-xl border border-[#c7c4d8]">
              <CheckCircle2 size={13} className="text-[#3525cd]" /> Day Complete
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const STATUS_CONFIG = {
  present:  { label:'Present',  bg:'bg-emerald-50',  text:'text-emerald-700',  border:'border-emerald-200', dot:'bg-emerald-500', cellBg:'bg-emerald-50',  showTag: false },
  half_day: { label:'Half Day', bg:'bg-amber-50',    text:'text-amber-700',    border:'border-amber-200',   dot:'bg-amber-500',   cellBg:'bg-amber-50',    showTag: true,  tag: 'Half' },
  on_leave: { label:'On Leave', bg:'bg-[#f0f3ff]',   text:'text-[#3525cd]',    border:'border-[#c7c4d8]',   dot:'bg-[#3525cd]',   cellBg:'bg-indigo-50',   showTag: true,  tag: 'Leave' },
  wfh:      { label:'WFH',      bg:'bg-cyan-50',     text:'text-cyan-700',     border:'border-cyan-200',    dot:'bg-cyan-500',    cellBg:'bg-cyan-50',     showTag: true,  tag: 'WFH' },
  absent:   { label:'Absent',   bg:'bg-rose-50',     text:'text-rose-700',     border:'border-rose-200',    dot:'bg-rose-500',    cellBg:'bg-rose-50',     showTag: false },
};

// Build YYYY-MM-DD date string from a Date object without timezone shifts
function toDSString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function MyAttendance() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['my-attendance', year, month],
    queryFn:  () => apiGet(`/attendance?year=${year}&month=${month}`),
  });

  // Fetch approved leaves for this month to overlay missing/wrong attendance records
  const { data: allLeaves = [] } = useQuery({
    queryKey: ['my-leaves-att', year, month],
    queryFn:  () => apiGet(`/leaves?year=${year}&month=${month}`),
  });

  const { data: schedule } = useQuery({
    queryKey: ['work-schedule'],
    queryFn:  () => apiGet('/settings/schedule'),
    staleTime: 300000,
  });
  const activeWorkDays = schedule?.work_days ? schedule.work_days.split(',').map(Number) : [1,2,3,4,5];

  // Fetch real-time Clockify hours directly for this employee
  // This gives the accurate SUM of all sessions (start→stop→start→stop) with breaks excluded
  const { data: clockifyData } = useQuery({
    queryKey: ['my-clockify-hours', year, month],
    queryFn:  () => apiGet('/my-clockify-hours', { year, month }),
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
  const clockifyHoursMap = clockifyData?.hours || {}; // { 'YYYY-MM-DD': X.XX }

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  // Build attendance map from actual records
  const attMap = {};
  records.forEach(r => { attMap[r.date] = r; });

  // Overlay approved leaves: if a day has no attendance record or shows 'absent',
  // synthesise the leave status so calendar and counts are accurate
  const approvedLeaves = allLeaves.filter(l => l.status === 'approved');
  const recMap = { ...attMap };

  approvedLeaves.forEach(l => {
    const start = new Date(l.start_date + 'T12:00:00');
    const end   = new Date(l.end_date   + 'T12:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (!activeWorkDays.includes(dow)) continue; // Skip non-working days based on company schedule settings
      const ds = toDSString(d);
      // Only overlay if within the displayed month
      const [dy, dm] = ds.split('-').map(Number);
      if (dy !== year || dm !== month) continue;
      const existing = recMap[ds];
      const leaveStatus = l.leave_time === 'wfh' ? 'wfh'
                        : l.leave_time === 'half' ? 'half_day'
                        : 'on_leave';
      // Only apply leave status if the employee didn't actually clock in that day.
      // A real check-in means they worked — don't hide that behind the leave badge.
      if (!existing || !existing.check_in) {
        recMap[ds] = { ...(existing || {}), date: ds, status: leaveStatus, _synthetic: !existing };
      }
    }
  });

  // Calendar grid
  const firstDay   = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr   = toDSString(new Date());

  // Summary counts from merged map (excluding non-working days)
  const summary = { present: 0, half_day: 0, on_leave: 0, wfh: 0, absent: 0 };
  Object.values(recMap).forEach(r => {
    const d = new Date(r.date + 'T12:00:00');
    const dow = d.getDay();
    if (activeWorkDays.includes(dow) && summary[r.status] !== undefined) {
      summary[r.status]++;
    }
  });



  // Merged records array for the table (original only, no synthetics)
  const tableRecords = records.map(r => {
    // If this record was 'absent' but an approved leave exists → use merged status
    const merged = recMap[r.date];
    return merged ? { ...r, status: merged.status } : r;
  });

  return (
    <div>
      {/* Check-in / Check-out */}
      <AttendanceCheckinCard />

      {/* Month nav */}
      <div className="flex justify-end mb-6">
        <div className="flex items-center gap-2 bg-white border border-[#c7c4d8] rounded-xl p-1 shadow-sm">
          <button onClick={prevMonth} className="p-2 text-[#464555] hover:text-[#151c27] hover:bg-[#f0f3ff] rounded-lg transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-bold text-[#151c27] px-2 min-w-[130px] text-center">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button onClick={nextMonth} className="p-2 text-[#464555] hover:text-[#151c27] hover:bg-[#f0f3ff] rounded-lg transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {Object.entries({ present: 'Present', half_day: 'Half Day', on_leave: 'On Leave', wfh: 'WFH', absent: 'Absent' }).map(([key, label]) => {
          const cfg = STATUS_CONFIG[key] || { bg:'bg-[#f0f3ff]', text:'text-[#464555]', border:'border-[#c7c4d8]' };
          return (
            <div key={key} className={`${cfg.bg} ${cfg.border} border rounded-xl p-3 text-center`}>
              <p className={`text-xl font-black ${cfg.text}`}>{summary[key]}</p>
              <p className="text-[0.65rem] text-[#464455] mt-0.5">{label}</p>
            </div>
          );
        })}
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-card overflow-hidden mb-6">
        <div className="grid grid-cols-7 bg-[#f0f3ff] border-b border-[#c7c4d8]">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} className="py-2.5 text-center text-xs font-bold text-[#777587] uppercase tracking-wide">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`e${i}`} className="border-b border-r border-[#f0f3ff] h-14" />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
            const ds  = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const rec = recMap[ds];
            const cfg = rec ? (STATUS_CONFIG[rec.status] || STATUS_CONFIG.present) : null;
            const isToday  = ds === todayStr;
            const dow      = new Date(ds + 'T12:00:00').getDay();
            const isWeekend = dow === 0 || dow === 6;

            return (
              <div key={day}
                className={`border-b border-r h-14 p-1.5 relative flex flex-col justify-between transition-colors
                  ${cfg ? cfg.cellBg : (isWeekend ? 'bg-slate-50' : 'bg-white')}
                  ${isToday ? 'ring-2 ring-inset ring-[#3525cd]' : `border-[#f0f3ff]`}
                `}
              >
                <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0
                  ${isToday
                    ? 'bg-[#3525cd] text-white'
                    : isWeekend
                      ? 'text-slate-400'
                      : cfg
                        ? `${cfg.text} font-black`
                        : 'text-[#464555]'
                  }
                `}>{day}</span>
                {rec && cfg && (
                  cfg.showTag ? (
                    <span className={`text-[0.55rem] font-black px-1 py-0.5 rounded leading-none ${cfg.bg} ${cfg.text} self-start`}>
                      {cfg.tag}
                    </span>
                  ) : (
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} flex-shrink-0`} title={cfg.label} />
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-6">
        {Object.entries(STATUS_CONFIG).map(([, cfg]) => (
          <div key={cfg.label} className="flex items-center gap-1.5 text-xs text-[#464455]">
            <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />{cfg.label}
          </div>
        ))}
      </div>

      {/* Table — show merged records */}
      {isLoading ? (
        <div className="flex justify-center py-10"><div className="spinner w-6 h-6" /></div>
      ) : tableRecords.length === 0 && Object.keys(recMap).length === 0 ? (
        <div className="text-center py-10 bg-white rounded-xl border border-[#c7c4d8] text-[#777587] text-sm">
          No records for {MONTH_NAMES[month - 1]} {year}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f0f3ff] border-b border-[#c7c4d8]">
                <tr>
                  {['Date', 'Status', 'Total Working Hours'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-[#464555] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f3ff]">
                {tableRecords.map(r => {
                  const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.present;
                  // Priority: live Clockify fetch > synced clockify_hours > work_hours (span, includes break)
                  const liveHours   = clockifyHoursMap[r.date];
                  const totalHours  = liveHours > 0
                    ? liveHours                                          // real-time from Clockify API ✅
                    : r.clockify_hours > 0
                      ? r.clockify_hours                                 // synced by admin ✅
                      : r.work_hours || null;                            // manual check-in span fallback
                  const isLive = liveHours > 0;
                  return (
                    <tr key={r.id} className="hover:bg-[#f0f3ff] transition-colors">
                      <td className="px-4 py-3 font-medium text-[#151c27]">{r.date}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2.5 py-0.5 rounded-full border font-bold ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {totalHours ? (
                          <span className="flex items-center gap-1.5">
                            <span className="font-semibold text-[#151c27]">{totalHours}h</span>
                            {isLive && (
                              <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Clockify
                              </span>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
