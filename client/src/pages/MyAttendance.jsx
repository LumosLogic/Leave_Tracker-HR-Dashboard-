import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CheckCircle2, LogIn, LogOut, Timer, Clock, Coffee, Play } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/context/ToastContext';

function fmtTime(t) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}
function fmtHours(h) {
  if (!h && h !== 0) return '—';
  if (h === 0) return '0m';
  const hrs = Math.floor(h); const min = Math.round((h - hrs) * 60);
  return hrs > 0 ? `${hrs}h ${min}m` : `${min}m`;
}
function fmtBreak(mins) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function AttendanceCheckinCard({ onRefreshed }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [record, setRecord] = useState(null);
  const [elapsed, setElapsed] = useState('');
  const [busy, setBusy] = useState(false);
  const [breakBusy, setBreakBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRecord(await apiGet('/attendance/today')); } catch { /* silent */ }
  }, []);
  useEffect(() => { load(); }, [load]);


  // Elapsed timer (pauses during break)
  useEffect(() => {
    const isOnBreak = record?.break_start && !record?.break_end;
    if (!record?.check_in || record?.check_out) { setElapsed(''); return; }
    const tick = () => {
      if (isOnBreak) {
        const [bh, bm] = record.break_start.split(':').map(Number);
        const breakStart = new Date(); breakStart.setHours(bh, bm, 0, 0);
        const total = Math.floor((Date.now() - breakStart.getTime()) / 60000);
        const hrs = Math.floor(total / 60); const min = total % 60;
        setElapsed(hrs > 0 ? `${hrs}h ${min}m` : `${min}m`);
      } else {
        const [h, m] = record.check_in.split(':').map(Number);
        const start = new Date(); start.setHours(h, m, 0, 0);
        const totalMins = Math.max(0, Math.floor((Date.now() - start.getTime()) / 60000) - (record.total_break_minutes || 0));
        const hrs = Math.floor(totalMins / 60); const min = totalMins % 60;
        setElapsed(hrs > 0 ? `${hrs}h ${min}m` : `${min}m`);
      }
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [record]);

  async function checkIn() {
    setBusy(true);
    try {
      const { record: r, message } = await apiPost('/attendance/checkin', {});
      setRecord(r);
      toast(message || 'Checked in!', 'success');
      qc.invalidateQueries(['my-attendance']);
      onRefreshed?.();
    } catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  }
  async function checkOut() {
    setBusy(true);
    try {
      const { record: r, message } = await apiPost('/attendance/checkout', {});
      setRecord(r);
      toast(message || 'Checked out!', r.status === 'half_day' ? 'warning' : 'success');
      qc.invalidateQueries(['my-attendance']);
      onRefreshed?.();
    } catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  }
  async function breakIn() {
    setBreakBusy(true);
    try {
      const { record: r, message } = await apiPost('/attendance/break-in', {});
      setRecord(r);
      toast(message || 'Break started', 'info');
      qc.invalidateQueries(['my-attendance']);
      onRefreshed?.();
    } catch (err) { toast(err.message, 'error'); }
    finally { setBreakBusy(false); }
  }
  async function breakOut() {
    setBreakBusy(true);
    try {
      const { record: r, message } = await apiPost('/attendance/break-out', {});
      setRecord(r);
      toast(message || 'Break ended', 'success');
      qc.invalidateQueries(['my-attendance']);
      onRefreshed?.();
    } catch (err) { toast(err.message, 'error'); }
    finally { setBreakBusy(false); }
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const isOnBreak = !!(record?.break_start && !record?.break_end && !record?.check_out);

  return (
    <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden mb-6">
      {/* Header */}
      <div className="px-5 py-3 bg-[#f8f9ff] border-b border-[#e7eefe] flex items-center gap-2">
        <Clock size={14} className="text-[#777587]" />
        <span className="text-xs font-semibold text-[#777587]">Today's Attendance · {dateStr}</span>
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Status icon + text */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            !record?.check_in ? 'bg-slate-100' :
            isOnBreak        ? 'bg-amber-50'  :
            record?.check_out ? 'bg-[#f0f3ff]' : 'bg-emerald-50'
          }`}>
            {!record?.check_in  ? <LogIn size={18} className="text-slate-400" /> :
             isOnBreak          ? <Coffee size={18} className="text-amber-500" /> :
             record?.check_out  ? <CheckCircle2 size={18} className="text-[#3525cd]" /> :
                                  <CheckCircle2 size={18} className="text-emerald-500" />}
          </div>
          <div className="min-w-0">
            {!record?.check_in ? (
              <>
                <p className="text-sm font-bold text-[#151c27]">Not Checked In</p>
                <p className="text-xs text-[#777587]">Mark yourself present for today</p>
              </>
            ) : isOnBreak ? (
              <>
                <p className="text-sm font-bold text-amber-600">On Break</p>
                <p className="text-xs text-[#777587]">Break started at {fmtTime(record.break_start)}{elapsed ? ` · ${elapsed} elapsed` : ''}</p>
              </>
            ) : record?.check_out ? (
              <>
                <p className="text-sm font-bold text-[#151c27]">Work Complete</p>
                <p className="text-xs text-[#777587]">
                  {fmtTime(record.check_in)} – {fmtTime(record.check_out)}
                  {record.work_hours ? ` · ${fmtHours(record.work_hours)} effective` : ''}
                  {record.status === 'half_day' ? ' · Half Day' : ''}
                </p>
                {record.total_break_minutes > 0 && (
                  <p className="text-xs text-amber-600">Break: {fmtBreak(record.total_break_minutes)}</p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-emerald-600">Checked In</p>
                <p className="text-xs text-[#777587]">
                  Since {fmtTime(record.check_in)}{elapsed ? ` · ${elapsed} working` : ''}
                  {record.total_break_minutes > 0 ? ` (${fmtBreak(record.total_break_minutes)} break)` : ''}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="shrink-0 flex gap-2 flex-wrap">
          {!record?.check_in ? (
            <button onClick={checkIn} disabled={busy}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-all shadow-sm">
              <LogIn size={15} /> {busy ? 'Checking in…' : 'Check In'}
            </button>
          ) : isOnBreak ? (
            <button onClick={breakOut} disabled={breakBusy}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-all shadow-sm">
              <Play size={15} /> {breakBusy ? 'Ending…' : 'End Break'}
            </button>
          ) : record?.check_out ? (
            <div className="flex items-center gap-1.5 text-xs text-[#777587] bg-[#f0f3ff] px-4 py-2.5 rounded-xl border border-[#c7c4d8]">
              <CheckCircle2 size={13} className="text-[#3525cd]" /> Day Complete
            </div>
          ) : (
            <>
              <button onClick={breakIn} disabled={breakBusy || busy}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all shadow-sm">
                <Coffee size={15} /> {breakBusy ? '…' : 'Break'}
              </button>
              <button onClick={checkOut} disabled={busy}
                className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-60 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-all shadow-sm">
                <LogOut size={15} /> {busy ? 'Checking out…' : 'Check Out'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Today's summary strip (only when checked out) */}
      {record?.check_out && (
        <div className="px-5 py-3 bg-[#fafaff] border-t border-[#f0f3ff] grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Check-In',       value: fmtTime(record.check_in)     },
            { label: 'Check-Out',      value: fmtTime(record.check_out)    },
            { label: 'Gross Hours',    value: record.gross_hours ? fmtHours(record.gross_hours) : '—' },
            { label: 'Working Hours',  value: record.work_hours  ? fmtHours(record.work_hours)  : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <p className="text-xs font-black text-[#151c27]">{value}</p>
              <p className="text-[0.6rem] text-[#777587] mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}
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

function toDSString(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function MyAttendance() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data: records = [], isLoading, refetch } = useQuery({
    queryKey: ['my-attendance', year, month],
    queryFn:  () => apiGet(`/attendance?year=${year}&month=${month}`),
  });

  const { data: allLeaves = [] } = useQuery({
    queryKey: ['my-leaves-att', year, month],
    queryFn:  () => apiGet(`/leaves?year=${year}&month=${month}`),
  });

  const { data: schedule } = useQuery({
    queryKey: ['work-schedule'], queryFn: () => apiGet('/settings/schedule'), staleTime: 300000,
  });
  const activeWorkDays = schedule?.work_days ? schedule.work_days.split(',').map(Number) : [1,2,3,4,5];


  function prevMonth() { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }

  const attMap = {};
  records.forEach(r => { attMap[r.date] = r; });

  const approvedLeaves = allLeaves.filter(l => l.status === 'approved');
  const recMap = { ...attMap };
  approvedLeaves.forEach(l => {
    const start = new Date(l.start_date + 'T12:00:00');
    const end   = new Date(l.end_date   + 'T12:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (!activeWorkDays.includes(dow)) continue;
      const ds = toDSString(d);
      const [dy, dm] = ds.split('-').map(Number);
      if (dy !== year || dm !== month) continue;
      const existing = recMap[ds];
      const leaveStatus = (l.leave_time === 'wfh' || l.leave_type === 'wfh') ? 'wfh'
                        : l.leave_time === 'half' ? 'half_day' : 'on_leave';
      if (!existing || !existing.check_in) {
        recMap[ds] = { ...(existing || {}), date: ds, status: leaveStatus, _synthetic: !existing };
      }
    }
  });

  const firstDay   = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr   = toDSString(new Date());

  const summary = { present: 0, half_day: 0, on_leave: 0, wfh: 0, absent: 0 };
  Object.values(recMap).forEach(r => {
    const d = new Date(r.date + 'T12:00:00');
    if (activeWorkDays.includes(d.getDay()) && summary[r.status] !== undefined) summary[r.status]++;
  });

  const tableRecords = records.map(r => {
    const merged = recMap[r.date];
    return merged ? { ...r, status: merged.status } : r;
  }).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      {/* Check-in / Check-out */}
      <AttendanceCheckinCard onRefreshed={refetch} />

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
            const isToday   = ds === todayStr;
            const dow       = new Date(ds + 'T12:00:00').getDay();
            const isWeekend = dow === 0 || dow === 6;
            return (
              <div key={day}
                className={`border-b border-r h-14 p-1.5 relative flex flex-col justify-between transition-colors
                  ${cfg ? cfg.cellBg : (isWeekend ? 'bg-slate-50' : 'bg-white')}
                  ${isToday ? 'ring-2 ring-inset ring-[#3525cd]' : `border-[#f0f3ff]`}`}
              >
                <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0
                  ${isToday ? 'bg-[#3525cd] text-white' : isWeekend ? 'text-slate-400' : cfg ? `${cfg.text} font-black` : 'text-[#464555]'}`}>
                  {day}
                </span>
                {rec && cfg && (
                  cfg.showTag
                    ? <span className={`text-[0.55rem] font-black px-1 py-0.5 rounded leading-none ${cfg.bg} ${cfg.text} self-start`}>{cfg.tag}</span>
                    : <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} flex-shrink-0`} title={cfg.label} />
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

      {/* Table — enhanced with break/gross/effective columns */}
      {isLoading ? (
        <div className="flex justify-center py-10"><div className="spinner w-6 h-6" /></div>
      ) : tableRecords.length === 0 && Object.keys(recMap).length === 0 ? (
        <div className="text-center py-10 bg-white rounded-xl border border-[#c7c4d8] text-[#777587] text-sm">
          No records for {MONTH_NAMES[month - 1]} {year}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-[#f0f3ff] border-b border-[#c7c4d8]">
                <tr>
                  {['Date', 'Status', 'Check-In', 'Check-Out', 'Break', 'Gross Hours', 'Working Hours'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-bold text-[#464555] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f3ff]">
                {tableRecords.map(r => {
                  const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.present;
                  const grossH     = r.gross_hours > 0 ? r.gross_hours : r.work_hours || null;
                  const effectiveH = r.work_hours > 0 ? r.work_hours : null;
                  return (
                    <tr key={r.id} className="hover:bg-[#f0f3ff] transition-colors">
                      <td className="px-3 py-3 font-medium text-[#151c27] text-xs">{r.date}</td>
                      <td className="px-3 py-3">
                        <span className={`text-xs px-2.5 py-0.5 rounded-full border font-bold ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-[#464555]">{r.check_in ? fmtTime(r.check_in) : '—'}</td>
                      <td className="px-3 py-3 text-xs text-[#464555]">{r.check_out ? fmtTime(r.check_out) : '—'}</td>
                      <td className="px-3 py-3 text-xs text-amber-600">{r.total_break_minutes ? fmtBreak(r.total_break_minutes) : '—'}</td>
                      <td className="px-3 py-3 text-xs text-[#151c27]">{grossH ? fmtHours(grossH) : '—'}</td>
                      <td className="px-3 py-3 text-xs font-semibold text-[#151c27]">
                        {effectiveH ? fmtHours(effectiveH) : '—'}
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
