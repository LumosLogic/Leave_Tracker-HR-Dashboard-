import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Home, Umbrella, Globe, Users, CalendarDays, Info } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { MONTHS } from '@/lib/utils';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(n) { return String(n).padStart(2, '0'); }

function getCalendarDays(year, month) {
  const first  = new Date(year, month - 1, 1).getDay();
  const total  = new Date(year, month, 0).getDate();
  const days   = [];
  for (let i = 0; i < first; i++) days.push(null);
  for (let i = 1; i <= total; i++) days.push(i);
  return days;
}

export default function TeamCalendar() {
  const now   = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd   = `${year}-${pad(month)}-31`;
  const today      = now.toISOString().split('T')[0];

  const { data: _lvData }  = useQuery({ queryKey: ['team-leaves',  year, month], queryFn: () => apiGet('/leaves', { startDate: monthStart, endDate: monthEnd }) });
  const { data: _holData } = useQuery({ queryKey: ['holidays',     year],         queryFn: () => apiGet('/holidays', { year }) });
  const leaves   = Array.isArray(_lvData)  ? _lvData  : [];
  const holidays = Array.isArray(_holData) ? _holData : [];

  const approvedLeaves = leaves.filter(l => l.status === 'approved');

  function getLeavesForDay(day) {
    const ds = `${year}-${pad(month)}-${pad(day)}`;
    return approvedLeaves.filter(l => l.start_date <= ds && l.end_date >= ds);
  }

  function getHolidayForDay(day) {
    const ds = `${year}-${pad(month)}-${pad(day)}`;
    return holidays.find(h => h.date === ds);
  }

  function prev() { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); }
  function next() { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); }

  const calDays     = getCalendarDays(year, month);
  const todayLeaves = getLeavesForDay(now.getDate());
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  // Who's out today
  const wfhToday   = todayLeaves.filter(l => l.leave_time === 'wfh');
  const leaveToday = todayLeaves.filter(l => l.leave_time !== 'wfh');

  return (
    <div className="p-5 md:p-8 max-w-4xl mx-auto">
      <div className="page-header">
        <div>
          <h1 className="page-title">Team Calendar</h1>
          <p className="page-subtitle">See who's on leave, WFH, or out this month — {MONTHS[month - 1]} {year}</p>
        </div>
        <div className="flex items-center gap-1 bg-white border border-[#c7c4d8] rounded-lg px-2 py-1.5 shadow-sm">
          <button onClick={prev} className="w-7 h-7 flex items-center justify-center rounded text-[#777587] hover:text-[#3525cd] hover:bg-[#f0f3ff] transition-colors"><ChevronLeft size={15} /></button>
          <span className="font-black text-[#151c27] min-w-[8rem] text-center text-sm">{MONTHS[month - 1]} {year}</span>
          <button onClick={next} className="w-7 h-7 flex items-center justify-center rounded text-[#777587] hover:text-[#3525cd] hover:bg-[#f0f3ff] transition-colors"><ChevronRight size={15} /></button>
        </div>
      </div>

      {/* Today's quick status */}
      {isCurrentMonth && (todayLeaves.length > 0) && (
        <div className="card p-4 mb-6 border-amber-200 bg-amber-50">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays size={14} className="text-amber-700" />
            <span className="text-xs font-black uppercase tracking-widest text-amber-700">Today — {now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {leaveToday.map(l => (
              <div key={l.id} className="flex items-center gap-2 bg-white border border-amber-200 rounded-full pl-1.5 pr-3 py-1">
                <Avatar name={l.user_name || l.name || '?'} color={l.avatar_color} size={20} />
                <span className="text-xs font-semibold text-amber-800">{l.user_name || l.name}</span>
                <span className="text-xs text-amber-500">{l.leave_time === 'half' ? '(Half day)' : '(On Leave)'}</span>
              </div>
            ))}
            {wfhToday.map(l => (
              <div key={l.id} className="flex items-center gap-2 bg-white border border-[#c7c4d8] rounded-full pl-1.5 pr-3 py-1">
                <Avatar name={l.user_name || l.name || '?'} color={l.avatar_color} size={20} />
                <span className="text-xs font-semibold text-[#464555]">{l.user_name || l.name}</span>
                <span className="text-xs text-[#777587]">(WFH)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendar grid */}
      <div className="card overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-[#f0f3ff] border-b border-[#c7c4d8]">
          {DAYS.map((d, i) => (
            <div key={d} className={`py-3 text-center text-[0.68rem] font-black uppercase tracking-wider ${i === 0 || i === 6 ? 'text-rose-400' : 'text-[#777587]'}`}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {calDays.map((day, i) => {
            if (!day) return <div key={`e-${i}`} className="min-h-[90px] border-b border-r border-[#f0f3ff] bg-[#fafafa]" />;

            const ds        = `${year}-${pad(month)}-${pad(day)}`;
            const isToday   = ds === today;
            const holiday   = getHolidayForDay(day);
            const dayLeaves = getLeavesForDay(day);
            const dow       = new Date(ds + 'T12:00:00').getDay();
            const isWeekend = dow === 0 || dow === 6;

            return (
              <div key={day}
                className={`min-h-[90px] border-b border-r border-[#f0f3ff] p-1.5 transition-colors ${isWeekend ? 'bg-[#fafafe]' : 'bg-white'} ${holiday ? 'bg-emerald-50/40' : ''} ${isToday ? 'ring-2 ring-inset ring-[#3525cd]/20' : ''}`}>
                {/* Day number */}
                <div className="flex items-center justify-between mb-1">
                  <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold transition-colors ${isToday ? 'bg-[#3525cd] text-white shadow-sm' : isWeekend ? 'text-rose-400' : 'text-[#464555]'}`}>
                    {day}
                  </div>
                  {holiday && <Globe size={9} className="text-emerald-600 mr-0.5" />}
                </div>

                {/* Holiday name */}
                {holiday && (
                  <div className="text-[0.56rem] font-bold text-emerald-700 truncate px-0.5 mb-0.5 leading-tight">{holiday.name}</div>
                )}

                {/* Leave chips */}
                <div className="space-y-0.5">
                  {dayLeaves.slice(0, 2).map(l => (
                    <div key={l.id} title={`${l.user_name || l.name} — ${l.leave_time}`}
                      className={`flex items-center gap-0.5 rounded px-1 py-0.5 text-[0.55rem] font-bold truncate ${l.leave_time === 'wfh' ? 'bg-[#f0f3ff] text-[#3525cd]' : 'bg-amber-50 text-amber-800'}`}>
                      {l.leave_time === 'wfh' ? <Home size={7} className="flex-shrink-0" /> : <Umbrella size={7} className="flex-shrink-0" />}
                      <span className="truncate">{l.user_name || l.name}</span>
                    </div>
                  ))}
                  {dayLeaves.length > 2 && (
                    <div className="text-[0.55rem] text-[#777587] pl-1 font-semibold">+{dayLeaves.length - 2} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-4 flex-wrap">
        {[
          { color: 'bg-amber-100 border-amber-300',   label: 'On Leave' },
          { color: 'bg-[#f0f3ff] border-[#c7c4d8]',  label: 'WFH' },
          { color: 'bg-emerald-100 border-emerald-200',label: 'Holiday' },
          { color: 'bg-[#fafafe] border-[#f0f3ff]',  label: 'Weekend' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5 text-xs text-[#777587]">
            <div className={`w-3.5 h-3.5 rounded border ${l.color}`} />
            {l.label}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs text-[#777587]">
          <div className="w-5 h-5 rounded-full bg-[#3525cd] flex items-center justify-center text-white text-[0.55rem] font-bold">1</div>
          Today
        </div>
      </div>
    </div>
  );
}
