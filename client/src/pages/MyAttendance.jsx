import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, ChevronLeft, ChevronRight, CalendarDays, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { apiGet } from '@/lib/api';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const STATUS_CONFIG = {
  present:  { label:'Present',  bg:'bg-emerald-50',  text:'text-emerald-700', border:'border-emerald-200', dot:'bg-emerald-500' },
  half_day: { label:'Half Day', bg:'bg-amber-50',    text:'text-amber-700',   border:'border-amber-200',   dot:'bg-amber-500' },
  on_leave: { label:'On Leave', bg:'bg-[#f0f3ff]',    text:'text-[#3525cd]',   border:'border-[#c7c4d8]',   dot:'bg-[#3525cd]' },
  wfh:      { label:'WFH',      bg:'bg-purple-50',   text:'text-purple-700',  border:'border-purple-200',  dot:'bg-purple-500' },
  absent:   { label:'Absent',   bg:'bg-rose-50',     text:'text-rose-700',    border:'border-rose-200',    dot:'bg-rose-500' },
};

export default function MyAttendance() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['my-attendance', year, month],
    queryFn:  () => apiGet(`/attendance?year=${year}&month=${month}`),
  });

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  // Build a map of date → record
  const recMap = {};
  records.forEach(r => { recMap[r.date] = r; });

  // Calendar grid: first day of month
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  // Summary
  const summary = { present: 0, half_day: 0, on_leave: 0, wfh: 0, absent: 0, late: 0 };
  records.forEach(r => {
    if (summary[r.status] !== undefined) summary[r.status]++;
    if (r.is_late) summary.late++;
  });

  return (
    <div className="p-5 md:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-[#151c27] tracking-tight">My Attendance</h1>
          <p className="text-[#777587] text-sm mt-0.5">Your personal attendance history.</p>
        </div>

        {/* Month nav */}
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
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
        {Object.entries({ present: 'Present', half_day: 'Half Day', on_leave: 'On Leave', wfh: 'WFH', absent: 'Absent', late: 'Late' }).map(([key, label]) => {
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
            const isToday = ds === new Date().toISOString().split('T')[0];
            const dow = new Date(ds + 'T12:00:00').getDay();
            const isWeekend = dow === 0 || dow === 6;

            return (
              <div key={day}
                className={`border-b border-r border-[#f0f3ff] h-14 p-1.5 relative flex flex-col justify-between
                  ${isWeekend ? 'bg-[#f0f3ff]/60' : 'bg-white'}
                  ${isToday ? 'ring-1 ring-inset ring-[#3525cd]/30' : ''}
                `}
              >
                <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0
                  ${isToday ? 'bg-[#3525cd] text-white' : isWeekend ? 'text-[#c7c4d8]' : 'text-[#464555]'}
                `}>{day}</span>
                {rec && cfg && (
                  <div className="flex gap-0.5 flex-wrap">
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} flex-shrink-0`} title={cfg.label} />
                    {rec.is_late && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Late" />}
                  </div>
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
        <div className="flex items-center gap-1.5 text-xs text-[#464455]">
          <span className="w-2 h-2 rounded-full bg-amber-400" />Late
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-10"><div className="spinner w-6 h-6" /></div>
      ) : records.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-xl border border-[#c7c4d8] text-[#777587] text-sm">
          No records for {MONTH_NAMES[month - 1]} {year}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f0f3ff] border-b border-[#c7c4d8]">
                <tr>
                  {['Date','Status','Check In','Check Out','Hours','Flags'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-[#464555] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f3ff]">
                {records.map(r => {
                  const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.present;
                  return (
                    <tr key={r.id} className="hover:bg-[#f0f3ff]/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-[#151c27]">{r.date}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2.5 py-0.5 rounded-full border font-bold ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#464555]">{r.check_in  || '—'}</td>
                      <td className="px-4 py-3 text-[#464555]">{r.check_out || '—'}</td>
                      <td className="px-4 py-3 text-[#464555]">{r.work_hours ? `${r.work_hours}h` : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {r.is_late       && <span className="text-[0.65rem] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-bold">Late</span>}
                          {r.is_early_exit && <span className="text-[0.65rem] bg-orange-50 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full font-bold">Early</span>}
                        </div>
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
