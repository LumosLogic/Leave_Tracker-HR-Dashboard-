import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { apiGet } from '@/lib/api';

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
      // Approved leaves always override attendance status for those dates
      const leaveStatus = l.leave_time === 'wfh' ? 'wfh'
                        : l.leave_time === 'half' ? 'half_day'
                        : 'on_leave';
      recMap[ds] = { ...(existing || {}), date: ds, status: leaveStatus, _synthetic: !existing };
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
