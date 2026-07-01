import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays, Umbrella, TrendingUp, Cake, PartyPopper,
  Home, Users, ChevronLeft, ChevronRight,
  CheckCircle2, LogIn, LogOut, Timer, UserPlus,
} from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Avatar } from '@/components/ui/Avatar';
import { todayStr, fmtDate, fmtTime, fmtHours } from '@/lib/utils';

const LEAVE_ICONS = {
  casual:      { emoji: '🌂', bg: 'bg-amber-50',   border: 'border-amber-100'  },
  sick:        { emoji: '🤒', bg: 'bg-rose-50',    border: 'border-rose-100'   },
  annual:      { emoji: '🏖️', bg: 'bg-[#f0f3ff]', border: 'border-[#e7eefe]' },
  emergency:   { emoji: '🚨', bg: 'bg-rose-50',    border: 'border-rose-100'   },
  maternity:   { emoji: '👶', bg: 'bg-pink-50',    border: 'border-pink-100'   },
  paternity:   { emoji: '👨‍👧', bg: 'bg-blue-50',   border: 'border-blue-100'   },
  bereavement: { emoji: '🕊️', bg: 'bg-slate-50',   border: 'border-slate-100'  },
  unpaid:      { emoji: '📋', bg: 'bg-slate-50',   border: 'border-slate-100'  },
  other:       { emoji: '📋', bg: 'bg-slate-50',   border: 'border-slate-100'  },
  wfh:         { emoji: '🏠', bg: 'bg-[#f0f3ff]', border: 'border-[#e7eefe]' },
};

const STATUS_BADGE = {
  pending:   'border border-amber-300 text-amber-700 bg-amber-50',
  approved:  'bg-emerald-500 text-white border border-emerald-500',
  rejected:  'bg-rose-500 text-white border border-rose-500',
  cancelled: 'border border-[#c7c4d8] text-[#777587] bg-white',
};

function fmtLeaveDate(start, end) {
  const opts = { day: '2-digit', month: 'short', year: 'numeric' };
  const s = new Date(start + 'T12:00:00').toLocaleDateString('en-IN', opts);
  if (start === end) return s;
  const e = new Date(end + 'T12:00:00').toLocaleDateString('en-IN', opts);
  return `${s} – ${e}`;
}

const PER_PAGE = 3;

export default function EmployeeHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [holidayPage, setHolidayPage] = useState(0);
  const [attRecord, setAttRecord]     = useState(null);
  const [elapsed, setElapsed]         = useState('');
  const [checkBusy, setCheckBusy]     = useState(false);

  // Check-in mode (Clockify vs standalone)
  const { data: checkinMode } = useQuery({
    queryKey: ['checkin-mode'],
    queryFn: () => apiGet('/attendance/checkin-mode'),
    staleTime: 5 * 60 * 1000,
  });
  const clockifySyncs = checkinMode?.syncs_clockify ?? false;

  // Fetch live Clockify total for today (only when Clockify is synced)
  const nowDate = new Date();
  const todayISO = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`;
  const { data: clockifyData } = useQuery({
    queryKey: ['my-clockify-hours', nowDate.getFullYear(), nowDate.getMonth() + 1],
    queryFn: () => apiGet('/my-clockify-hours', { year: nowDate.getFullYear(), month: nowDate.getMonth() + 1 }),
    staleTime: 2 * 60 * 1000,
    enabled: clockifySyncs,
  });
  const clockifyTodayHours = clockifyData?.hours?.[todayISO] || 0;

  // Load today's attendance record
  const loadToday = useCallback(async () => {
    try { setAttRecord(await apiGet('/attendance/today')); } catch { /* silent */ }
  }, []);
  useEffect(() => { loadToday(); }, [loadToday]);

  // Live elapsed timer when checked in but not out
  useEffect(() => {
    if (!attRecord?.check_in || attRecord?.check_out) { setElapsed(''); return; }
    const tick = () => {
      const [h, m] = attRecord.check_in.split(':').map(Number);
      const start = new Date(); start.setHours(h, m, 0, 0);
      const total = Math.floor((Date.now() - start.getTime()) / 60000);
      const hrs = Math.floor(total / 60); const min = total % 60;
      setElapsed(hrs > 0 ? `${hrs}h ${min}m` : `${min}m`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [attRecord]);

  async function checkIn() {
    setCheckBusy(true);
    try {
      const { record: r, message, clockify_synced } = await apiPost('/attendance/checkin', {});
      setAttRecord(r);
      toast(message || 'Checked in!', 'success');
      if (clockify_synced) toast('Clockify timer started', 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { setCheckBusy(false); }
  }
  async function checkOut() {
    setCheckBusy(true);
    try {
      const { record: r, message, clockify_synced } = await apiPost('/attendance/checkout', {});
      setAttRecord(r);
      toast(message || 'Checked out!', r.status === 'half_day' ? 'warning' : 'success');
      if (clockify_synced) toast('Clockify timer paused', 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { setCheckBusy(false); }
  }

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
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const today = todayStr();
  const { data: todayTeamLeaves = [] } = useQuery({
    queryKey: ['team-leaves-today'],
    queryFn:  () => apiGet('/team-leaves', { startDate: today, endDate: today }),
    staleTime: 60000,
  });

  const { data: newJoiners = [] } = useQuery({
    queryKey: ['new-joiners'],
    queryFn:  () => apiGet('/new-joiners'),
    staleTime: 5 * 60 * 1000,
  });

  const recentLeaves    = myLeaves.slice(0, 4);
  const allHolidays     = culture?.holidays || [];
  const totalPages      = Math.max(1, Math.ceil(allHolidays.length / PER_PAGE));
  const visibleHolidays = allHolidays.slice(holidayPage * PER_PAGE, (holidayPage + 1) * PER_PAGE);
  const birthdaysToday  = culture?.birthdaysToday || [];
  const upcomingBdays   = culture?.upcomingBirthdays || [];
  const upcomingEvents  = (culture?.events || []).slice(0, 4);

  const teamOnLeave = todayTeamLeaves.filter(l => l.leave_time !== 'wfh' && l.user_id !== user?.id);
  const teamWfh     = todayTeamLeaves.filter(l => l.leave_time === 'wfh' && l.user_id !== user?.id);

  const orgName  = user?.organization_name || user?.org_name || 'lumoslogic';
  const roleLabel = user?.position || 'Team Member';

  // Check-in button label
  const btnLabel = checkBusy ? (attRecord?.check_in && !attRecord?.check_out ? 'Checking out…' : (attRecord?.check_in && attRecord?.check_out && clockifySyncs ? 'Resuming…' : 'Checking in…')) : (
    attRecord?.check_in && !attRecord?.check_out
      ? (clockifySyncs ? 'On Break' : 'Check Out')
      : (attRecord?.check_in && attRecord?.check_out && clockifySyncs ? 'Resume Timer' : 'Check In')
  );

  return (
    <div className="space-y-5">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl relative overflow-hidden shadow-md"
        style={{ background: 'linear-gradient(135deg, #3525cd 0%, #4f46e5 55%, #712ae2 100%)' }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 75% 50%, rgba(255,255,255,.12) 0%, transparent 55%)' }} />
        <div className="relative px-7 py-5">
          {/* Top row: greeting + avatar */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-white">Hello, {user?.name?.split(' ')[0]}! 👋</h1>
              <p className="text-white/70 text-sm mt-1">{orgName} · {roleLabel}</p>
            </div>
            <div className="w-14 h-14 rounded-full border-2 border-white/40 flex items-center justify-center shrink-0"
              style={{ background: user?.avatar_color || '#4f46e5' }}>
              <span className="text-white font-black text-lg select-none">
                {user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'}
              </span>
            </div>
          </div>

          {/* Check-in row */}
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {clockifySyncs && (
                <span className="flex items-center gap-1 text-[0.6rem] font-bold px-1.5 py-0.5 rounded text-white bg-white/15 border border-white/20">
                  <Timer size={9} /> Clockify
                </span>
              )}
              {attRecord?.check_in ? (
                attRecord?.check_out ? (
                  <span className="text-xs text-white/80 flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-emerald-300" />
                    {clockifySyncs
                      ? clockifyTodayHours > 0
                        ? <><strong className="text-white">{fmtHours(clockifyTodayHours)}</strong> worked today · <span className="text-white/50">timer paused</span></>
                        : <>{fmtTime(attRecord.check_in)} – {fmtTime(attRecord.check_out)} <span className="text-white/50">(timer paused)</span></>
                      : <>{fmtTime(attRecord.check_in)} – {fmtTime(attRecord.check_out)}{attRecord.work_hours ? ` · ${fmtHours(attRecord.work_hours)}` : ''}</>
                    }
                  </span>
                ) : (
                  <span className="text-xs text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 size={12} /> Since {fmtTime(attRecord.check_in)}{elapsed ? ` · ${elapsed}` : ''}
                  </span>
                )
              ) : (
                <span className="text-xs text-white/60">
                  {clockifySyncs ? 'Click to start your Clockify timer' : "You haven't checked in yet"}
                </span>
              )}
            </div>

            <div className="flex gap-2 shrink-0">
              {!attRecord?.check_in ? (
                <button onClick={checkIn} disabled={checkBusy}
                  className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white transition-all disabled:opacity-60 shadow-sm">
                  <LogIn size={13} /> {checkBusy ? 'Checking in…' : 'Check In'}
                </button>
              ) : !attRecord?.check_out ? (
                <button onClick={checkOut} disabled={checkBusy}
                  className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white transition-all disabled:opacity-60 shadow-sm">
                  <LogOut size={13} /> {checkBusy ? 'Checking out…' : (clockifySyncs ? 'Go on Break' : 'Check Out')}
                </button>
              ) : clockifySyncs ? (
                <button onClick={checkIn} disabled={checkBusy}
                  className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-all disabled:opacity-60 shadow-sm border border-white/30">
                  <LogIn size={13} /> {checkBusy ? 'Resuming…' : 'Resume Timer'}
                </button>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-xl bg-white/15 text-white/80 border border-white/20">
                  <CheckCircle2 size={13} /> Day Complete
                </span>
              )}
              <button onClick={() => navigate('/portal/attendance')}
                className="text-xs text-white/70 hover:text-white px-2 py-1.5 rounded-xl hover:bg-white/10 transition-all">
                View →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3-column row ─────────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-5">

        {/* Team Status Today */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5">
          <h2 className="text-[0.65rem] font-black text-[#151c27] uppercase tracking-widest flex items-center gap-2 mb-4">
            <Users size={13} className="text-[#3525cd]" /> Team Status Today
          </h2>
          <div className="grid grid-cols-2 gap-4 divide-x divide-[#f0f3ff]">
            {/* On Leave */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Umbrella size={12} className="text-amber-500" />
                  <span className="text-xs font-bold text-amber-600">On Leave</span>
                </div>
                <span className="text-base font-black text-amber-600">{teamOnLeave.length}</span>
              </div>
              {teamOnLeave.length === 0 ? (
                <p className="text-[0.68rem] text-[#9ca3af]">Everyone is in today</p>
              ) : (
                <div className="space-y-2">
                  {teamOnLeave.slice(0, 3).map(l => (
                    <div key={l.id} className="flex items-center gap-2">
                      <Avatar name={l.name} color={l.avatar_color} size={22} />
                      <div className="min-w-0">
                        <p className="text-[0.7rem] font-semibold text-[#151c27] truncate">{l.name}</p>
                        <p className="text-[0.6rem] text-[#9ca3af] truncate">{l.department || orgName}</p>
                      </div>
                    </div>
                  ))}
                  {teamOnLeave.length > 3 && <p className="text-[0.62rem] text-[#777587]">+{teamOnLeave.length - 3} more</p>}
                </div>
              )}
            </div>

            {/* Working From Home */}
            <div className="pl-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1">
                  <Home size={12} className="text-[#3525cd]" />
                  <span className="text-[0.68rem] font-bold text-[#3525cd] leading-tight">Working From Home</span>
                </div>
                <span className="text-base font-black text-[#3525cd]">{teamWfh.length}</span>
              </div>
              {teamWfh.length === 0 ? (
                <p className="text-[0.68rem] text-[#9ca3af]">No WFH today</p>
              ) : (
                <div className="space-y-2">
                  {teamWfh.slice(0, 3).map(l => (
                    <div key={l.id} className="flex items-center gap-2">
                      <Avatar name={l.name} color={l.avatar_color} size={22} />
                      <div className="min-w-0">
                        <p className="text-[0.7rem] font-semibold text-[#151c27] truncate">{l.name}</p>
                        <p className="text-[0.6rem] text-[#9ca3af] truncate">{l.department || orgName}</p>
                      </div>
                    </div>
                  ))}
                  {teamWfh.length > 3 && <p className="text-[0.62rem] text-[#777587]">+{teamWfh.length - 3} more</p>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* This Month */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5">
          <h2 className="text-[0.65rem] font-black text-[#151c27] uppercase tracking-widest flex items-center gap-2 mb-4">
            <TrendingUp size={13} className="text-emerald-600" /> This Month
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Days Present',  value: myStats?.presentCount ?? 0, color: 'text-emerald-600', bg: 'bg-emerald-50',  border: 'border-emerald-100' },
              { label: 'Leaves Taken',  value: myStats?.leavesCount  ?? 0, color: 'text-[#3525cd]',   bg: 'bg-[#f0f3ff]',  border: 'border-[#e7eefe]'  },
              { label: 'Late Arrivals', value: myStats?.lateCount    ?? 0, color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-100'  },
            ].map(({ label, value, color, bg, border }) => (
              <div key={label} className={`${bg} border ${border} rounded-xl p-3 text-center`}>
                <p className={`text-2xl font-black ${color}`}>{value}</p>
                <p className="text-[0.6rem] text-[#464555] mt-1 leading-tight">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Holidays */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[0.65rem] font-black text-[#151c27] uppercase tracking-widest flex items-center gap-2">
              <CalendarDays size={13} className="text-rose-500" /> Upcoming Holidays
            </h2>
          </div>

          {allHolidays.length === 0 ? (
            <p className="text-xs text-[#9ca3af] text-center py-4">No upcoming holidays</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setHolidayPage(p => Math.max(0, p - 1))}
                  disabled={holidayPage === 0}
                  className="w-7 h-7 rounded-full border border-[#c7c4d8] flex items-center justify-center text-[#777587] disabled:opacity-30 hover:enabled:border-[#3525cd] hover:enabled:text-[#3525cd] transition-colors shrink-0">
                  <ChevronLeft size={14} />
                </button>
                <div className="flex-1 grid grid-cols-3 gap-2">
                  {visibleHolidays.map(h => (
                    <div key={h.id} className="rounded-xl border border-[#e7eefe] bg-[#fafaff] p-2.5 text-center">
                      <p className="text-[0.68rem] font-bold text-[#151c27] leading-tight line-clamp-2 mb-1">{h.name}</p>
                      <p className="text-[0.58rem] text-[#777587]">{fmtDate(h.date)}</p>
                    </div>
                  ))}
                  {visibleHolidays.length < PER_PAGE && Array.from({ length: PER_PAGE - visibleHolidays.length }).map((_, i) => (
                    <div key={`ph-${i}`} />
                  ))}
                </div>
                <button
                  onClick={() => setHolidayPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={holidayPage >= totalPages - 1}
                  className="w-7 h-7 rounded-full border border-[#c7c4d8] flex items-center justify-center text-[#777587] disabled:opacity-30 hover:enabled:border-[#3525cd] hover:enabled:text-[#3525cd] transition-colors shrink-0">
                  <ChevronRight size={14} />
                </button>
              </div>
              {totalPages > 1 && (
                <div className="flex justify-center gap-1.5 mt-3">
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button key={i} onClick={() => setHolidayPage(i)}
                      className={`h-1.5 rounded-full transition-all duration-300 ${i === holidayPage ? 'bg-[#3525cd] w-4' : 'bg-[#c7c4d8] w-1.5'}`} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── My Recent Leaves ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f3ff]">
          <h2 className="text-[0.65rem] font-black text-[#151c27] uppercase tracking-widest flex items-center gap-2">
            <Umbrella size={13} className="text-[#3525cd]" /> My Recent Leaves
          </h2>
          <button onClick={() => navigate('/portal/leaves')}
            className="text-[0.68rem] font-bold text-[#3525cd] hover:underline">View All</button>
        </div>

        {recentLeaves.length === 0 ? (
          <div className="py-10 text-center text-sm text-[#9ca3af]">No leave requests yet</div>
        ) : (
          <div>
            <div className="grid grid-cols-[1.5fr_1.5fr_auto] gap-4 px-5 py-2.5 bg-[#fafaff] border-b border-[#f0f3ff]">
              <span className="text-[0.62rem] font-black uppercase tracking-wider text-[#9ca3af]">Leave Type</span>
              <span className="text-[0.62rem] font-black uppercase tracking-wider text-[#9ca3af]">Dates</span>
              <span className="text-[0.62rem] font-black uppercase tracking-wider text-[#9ca3af]">Status</span>
            </div>
            {recentLeaves.map(l => {
              const lt = LEAVE_ICONS[l.leave_type] || LEAVE_ICONS.other;
              const badge = STATUS_BADGE[l.status] || STATUS_BADGE.pending;
              return (
                <div key={l.id} className="grid grid-cols-[1.5fr_1.5fr_auto] gap-4 px-5 py-3.5 items-center border-b border-[#f9f9ff] last:border-0 hover:bg-[#fafaff] transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg ${lt.bg} border ${lt.border} flex items-center justify-center text-sm shrink-0`}>
                      {lt.emoji}
                    </div>
                    <span className="text-sm font-semibold text-[#151c27]">
                      {l.leave_type.charAt(0).toUpperCase() + l.leave_type.slice(1)} Leave
                    </span>
                  </div>
                  <span className="text-xs text-[#464555]">{fmtLeaveDate(l.start_date, l.end_date)}</span>
                  <span className={`text-[0.7rem] font-bold px-2.5 py-1 rounded-full capitalize whitespace-nowrap ${badge}`}>
                    {l.status.charAt(0).toUpperCase() + l.status.slice(1)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── New Joiners ───────────────────────────────────────────────────── */}
      {newJoiners.length > 0 && (
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#f0f3ff]">
            <h2 className="text-[0.65rem] font-black text-[#151c27] uppercase tracking-widest flex items-center gap-2">
              <UserPlus size={13} className="text-emerald-500" /> New Team Members
              <span className="text-[0.58rem] font-semibold text-[#777587] normal-case tracking-normal">Last 7 days</span>
            </h2>
          </div>
          <div className="divide-y divide-[#f9f9ff]">
            {newJoiners.map(e => {
              const daysAgo = Math.floor((Date.now() - new Date(e.created_at).getTime()) / 86400000);
              return (
                <div key={e.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#fafaff] transition-colors">
                  <Avatar name={e.name} color={e.avatar_color} size={34} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#151c27]">{e.name}</p>
                    <p className="text-xs text-[#777587]">{e.position || 'Staff'} · {e.department || '—'}</p>
                  </div>
                  <span className="text-[0.62rem] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                    {daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Birthdays + Upcoming Events ──────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-5">

        {/* Birthdays */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#f0f3ff]">
            <h2 className="text-[0.65rem] font-black text-[#151c27] uppercase tracking-widest flex items-center gap-2">
              <Cake size={13} className="text-pink-500" /> Birthdays
            </h2>
          </div>
          <div className="p-5">
            {birthdaysToday.length === 0 && upcomingBdays.length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-3 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#f0f3ff] flex items-center justify-center text-3xl">🎁</div>
                <div>
                  <p className="text-sm font-semibold text-[#464555]">No upcoming birthdays</p>
                  <p className="text-xs text-[#9ca3af] mt-0.5">We'll show birthdays here when available.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {birthdaysToday.length > 0 && (
                  <div>
                    <p className="text-[0.62rem] font-black text-pink-600 uppercase tracking-wider mb-2">Today 🎂</p>
                    <div className="space-y-2">
                      {birthdaysToday.map(u => (
                        <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-pink-50 border border-pink-100">
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
                {upcomingBdays.length > 0 && (
                  <div>
                    {birthdaysToday.length > 0 && <p className="text-[0.62rem] font-black text-[#777587] uppercase tracking-wider mb-2 mt-3">Coming up</p>}
                    <div className="space-y-2">
                      {upcomingBdays.slice(0, 4).map(u => (
                        <div key={u.id + u.birthday_date} className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-pink-50 border border-pink-100 flex items-center justify-center text-base shrink-0">🎂</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#151c27] truncate">{u.name}</p>
                            <p className="text-xs text-[#777587]">in {u.days_until} day{u.days_until !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Events */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#f0f3ff]">
            <h2 className="text-[0.65rem] font-black text-[#151c27] uppercase tracking-widest flex items-center gap-2">
              <PartyPopper size={13} className="text-amber-500" /> Upcoming Events
            </h2>
          </div>
          <div className="p-5">
            {upcomingEvents.length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-3 text-center">
                <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center text-3xl">📅</div>
                <div>
                  <p className="text-sm font-semibold text-[#464555]">No upcoming events</p>
                  <p className="text-xs text-[#9ca3af] mt-0.5">Stay tuned for exciting events!</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingEvents.map(ev => (
                  <div key={ev.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-base shrink-0">🎉</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#151c27] truncate">{ev.title}</p>
                      <p className="text-xs text-[#777587]">
                        {fmtDate(ev.date)}{ev.end_date && ev.end_date !== ev.date ? ` → ${fmtDate(ev.end_date)}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
