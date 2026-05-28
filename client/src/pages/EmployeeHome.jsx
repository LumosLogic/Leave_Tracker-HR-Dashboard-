import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, CheckCircle2, XCircle, LogIn, LogOut, CalendarDays, Umbrella, AlertCircle, TrendingUp, Cake, PartyPopper } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Avatar } from '@/components/ui/Avatar';

const LEAVE_TYPE_COLORS = {
  annual:    'bg-[#f0f3ff] text-[#3525cd] border-[#c7c4d8]',
  sick:      'bg-rose-50 text-rose-700 border-rose-200',
  casual:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  emergency: 'bg-amber-50 text-amber-700 border-amber-200',
  other:     'bg-[#f0f3ff] text-[#464555] border-[#c7c4d8]',
};
const STATUS_COLORS = {
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function EmployeeHome() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const { data: attendance } = useQuery({
    queryKey: ['my-today'],
    queryFn:  () => apiGet('/attendance/today'),
    refetchInterval: 30000,
  });

  const { data: myStats } = useQuery({
    queryKey: ['my-stats'],
    queryFn:  () => apiGet('/my-stats'),
  });

  const { data: myLeaves = [] } = useQuery({
    queryKey: ['my-leaves-recent'],
    queryFn:  () => apiGet('/leaves'),
  });

  const { data: culture } = useQuery({
    queryKey: ['culture'],
    queryFn:  () => apiGet('/culture'),
  });

  const checkIn = useMutation({
    mutationFn: () => apiPost('/attendance/checkin'),
    onSuccess: (d) => { toast(d.message || 'Checked in!', 'success'); qc.invalidateQueries({ queryKey: ['my-today'] }); },
    onError: (e) => toast(e.message, 'error'),
  });

  const checkOut = useMutation({
    mutationFn: () => apiPost('/attendance/checkout'),
    onSuccess: (d) => { toast(d.message || 'Checked out!', 'success'); qc.invalidateQueries({ queryKey: ['my-today'] }); },
    onError: (e) => toast(e.message, 'error'),
  });

  const recentLeaves     = myLeaves.slice(0, 4);
  const upcomingHolidays = (culture?.holidays || []).slice(0, 3);
  const birthdaysToday   = culture?.birthdaysToday || [];
  const upcomingBdays    = culture?.upcomingBirthdays || [];
  const upcomingEvents   = (culture?.events || []).slice(0, 4);

  const checkedIn  = !!attendance?.check_in;
  const checkedOut = !!attendance?.check_out;

  const nowStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <div className="p-5 md:p-8 max-w-5xl mx-auto">
      {/* Hero */}
      <div className="rounded-2xl p-5 md:p-6 mb-6 relative overflow-hidden shadow-card"
        style={{ background: 'linear-gradient(135deg, #3525cd 0%, #4f46e5 60%, #712ae2 100%)' }}>
        <div className="flex items-center justify-between">
          <div className="relative z-10">
            <p className="text-white/70 text-xs font-bold uppercase tracking-widest mb-1">Employee Portal</p>
            <h1 className="text-xl md:text-2xl font-black text-white">Hello, {user?.name?.split(' ')[0]}!</h1>
            <p className="text-white/75 text-sm mt-0.5">{user?.department} · {user?.position}</p>
          </div>
          <Avatar name={user?.name} color={user?.avatar_color} size={52} className="border-2 border-white/30" />
        </div>
      </div>

      {/* Check In/Out Card */}
      <div className="bg-white rounded-xl shadow-card border border-[#c7c4d8] p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-black text-[#151c27] uppercase tracking-wider flex items-center gap-2">
            <Clock size={15} className="text-[#3525cd]" /> Today's Attendance
          </h2>
          <span className="text-xs text-[#777587]">{nowStr}</span>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Check In',   value: attendance?.check_in  || '—' },
            { label: 'Check Out',  value: attendance?.check_out || '—' },
            { label: 'Work Hours', value: attendance?.work_hours ? `${attendance.work_hours}h` : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="text-center bg-[#f0f3ff] rounded-xl py-3">
              <p className="text-base font-black text-[#151c27]">{value}</p>
              <p className="text-[0.68rem] text-[#777587] mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => checkIn.mutate()}
            disabled={checkedIn || checkIn.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={!checkedIn ? { background: 'linear-gradient(135deg, #3525cd, #4f46e5)', color: '#fff' } : { background: '#f0f3ff', color: '#3525cd', border: '1px solid #c7c4d8' }}
          >
            {checkIn.isPending ? <span className="spinner w-4 h-4" /> : <LogIn size={16} />}
            {checkedIn ? 'Checked In' : 'Check In'}
          </button>
          <button
            onClick={() => checkOut.mutate()}
            disabled={!checkedIn || checkedOut || checkOut.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all bg-[#2a313d] text-white hover:bg-[#151c27] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {checkOut.isPending ? <span className="spinner w-4 h-4" /> : <LogOut size={16} />}
            {checkedOut ? 'Checked Out' : 'Check Out'}
          </button>
        </div>

        {attendance?.is_late && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <AlertCircle size={13} /> Late arrival recorded
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Monthly Stats */}
        <div className="bg-white rounded-xl shadow-card border border-[#c7c4d8] p-5">
          <h2 className="text-sm font-black text-[#151c27] uppercase tracking-wider flex items-center gap-2 mb-4">
            <TrendingUp size={15} className="text-emerald-600" /> This Month
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label:'Days Present', value: myStats?.presentCount ?? 0, color:'text-emerald-600', bg:'bg-emerald-50' },
              { label:'Leaves Taken', value: myStats?.leavesCount  ?? 0, color:'text-[#3525cd]',     bg:'bg-[#f0f3ff]' },
              { label:'Late Arrivals',value: myStats?.lateCount    ?? 0, color:'text-amber-600',   bg:'bg-amber-50' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`${bg} rounded-xl p-3 text-center`}>
                <p className={`text-2xl font-black ${color}`}>{value}</p>
                <p className="text-[0.65rem] text-[#464455] mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Holidays */}
        <div className="bg-white rounded-xl shadow-card border border-[#c7c4d8] p-5">
          <h2 className="text-sm font-black text-[#151c27] uppercase tracking-wider flex items-center gap-2 mb-4">
            <CalendarDays size={15} className="text-rose-500" /> Upcoming Holidays
          </h2>
          {upcomingHolidays.length === 0 ? (
            <p className="text-[#777587] text-sm text-center py-4">No upcoming holidays</p>
          ) : (
            <div className="space-y-2">
              {upcomingHolidays.map(h => (
                <div key={h.id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center flex-shrink-0">
                    <CalendarDays size={14} className="text-rose-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#151c27]">{h.name}</p>
                    <p className="text-xs text-[#777587]">{h.date}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Leaves */}
        <div className="bg-white rounded-xl shadow-card border border-[#c7c4d8] p-5 md:col-span-2">
          <h2 className="text-sm font-black text-[#151c27] uppercase tracking-wider flex items-center gap-2 mb-4">
            <Umbrella size={15} className="text-[#3525cd]" /> My Recent Leaves
          </h2>
          {recentLeaves.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">No leave requests yet</div>
          ) : (
            <div className="space-y-2">
              {recentLeaves.map(l => (
                <div key={l.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#f0f3ff] transition-colors border border-transparent hover:border-[#c7c4d8]">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#151c27] capitalize">{l.leave_type} Leave</p>
                    <p className="text-xs text-[#777587]">{l.start_date} → {l.end_date}</p>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full border font-bold ${STATUS_COLORS[l.status] || ''}`}>
                    {l.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Birthdays */}
        <div className="bg-white rounded-xl shadow-card border border-[#c7c4d8] p-5">
          <h2 className="text-sm font-black text-[#151c27] uppercase tracking-wider flex items-center gap-2 mb-4">
            <Cake size={15} className="text-pink-500" /> Birthdays
          </h2>

          {birthdaysToday.length > 0 && (
            <div className="mb-3">
              <p className="text-[0.68rem] font-bold text-pink-600 uppercase tracking-wider mb-2">Today 🎂</p>
              <div className="space-y-2">
                {birthdaysToday.map(u => (
                  <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-pink-50 border border-pink-200">
                    <Avatar name={u.name} color={u.avatar_color} size={32} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#151c27] truncate">{u.name}</p>
                      <p className="text-xs text-[#777587]">{u.department}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {upcomingBdays.length === 0 && birthdaysToday.length === 0 ? (
            <p className="text-[#777587] text-sm text-center py-4">No upcoming birthdays</p>
          ) : upcomingBdays.length > 0 ? (
            <div>
              {birthdaysToday.length > 0 && <p className="text-[0.68rem] font-bold text-[#777587] uppercase tracking-wider mb-2">Coming up</p>}
              <div className="space-y-2">
                {upcomingBdays.slice(0, 4).map(u => (
                  <div key={u.id + u.birthday_date} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-pink-50 flex items-center justify-center flex-shrink-0">
                      <Cake size={14} className="text-pink-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#151c27] truncate">{u.name}</p>
                      <p className="text-xs text-[#777587]">in {u.days_until} day{u.days_until !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Upcoming Events */}
        <div className="bg-white rounded-xl shadow-card border border-[#c7c4d8] p-5">
          <h2 className="text-sm font-black text-[#151c27] uppercase tracking-wider flex items-center gap-2 mb-4">
            <PartyPopper size={15} className="text-amber-500" /> Upcoming Events
          </h2>
          {upcomingEvents.length === 0 ? (
            <p className="text-[#777587] text-sm text-center py-4">No upcoming events</p>
          ) : (
            <div className="space-y-2">
              {upcomingEvents.map(ev => (
                <div key={ev.id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                    <PartyPopper size={14} className="text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#151c27] truncate">{ev.title}</p>
                    <p className="text-xs text-[#777587]">{ev.date}{ev.end_date && ev.end_date !== ev.date ? ` → ${ev.end_date}` : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
