import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays, Umbrella, TrendingUp, Cake, PartyPopper,
  Home, Users, ChevronLeft, ChevronRight,
  CheckCircle2, LogIn, LogOut, Timer, UserPlus,
  Coffee, Play, Bell, ClipboardList, Clock, AlertTriangle,
  BookOpen,
} from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Avatar } from '@/components/ui/Avatar';
import { todayStr, fmtDate, fmtTime, fmtHours, countWorkingDaysInRange } from '@/lib/utils';

const LEAVE_ICONS = {
  casual:      { emoji: '🌂', bg: 'bg-amber-50',   border: 'border-amber-100'  },
  sick:        { emoji: '🤒', bg: 'bg-rose-50',    border: 'border-rose-100'   },
  annual:      { emoji: '🏖️', bg: 'bg-[#f0f3ff]', border: 'border-[#e7eefe]' },
  earned:      { emoji: '🏖️', bg: 'bg-[#f0f3ff]', border: 'border-[#e7eefe]' },
  emergency:   { emoji: '🚨', bg: 'bg-rose-50',    border: 'border-rose-100'   },
  maternity:   { emoji: '👶', bg: 'bg-pink-50',    border: 'border-pink-100'   },
  paternity:   { emoji: '👨‍👧', bg: 'bg-blue-50',   border: 'border-blue-100'   },
  bereavement: { emoji: '🕊️', bg: 'bg-slate-50',   border: 'border-slate-100'  },
  unpaid:      { emoji: '📋', bg: 'bg-slate-50',   border: 'border-slate-100'  },
  comp_off:    { emoji: '⏱️', bg: 'bg-purple-50',  border: 'border-purple-100' },
  other:       { emoji: '📋', bg: 'bg-slate-50',   border: 'border-slate-100'  },
  wfh:         { emoji: '🏠', bg: 'bg-[#f0f3ff]', border: 'border-[#e7eefe]' },
};

const LEAVE_LABELS = {
  wfh: 'WFH', casual: 'Casual Leave', sick: 'Sick Leave', annual: 'Annual Leave',
  earned: 'Earned Leave', emergency: 'Emergency Leave', maternity: 'Maternity Leave',
  paternity: 'Paternity Leave', bereavement: 'Bereavement Leave', unpaid: 'Unpaid Leave',
  comp_off: 'Comp Off', other: 'Other Leave',
};

function leaveLabel(type) {
  return LEAVE_LABELS[type] || (type ? type.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase()) : 'Leave');
}

const STATUS_BADGE = {
  pending:   'border border-amber-300 text-amber-700 bg-amber-50',
  approved:  'bg-emerald-500 text-white border border-emerald-500',
  rejected:  'bg-rose-500 text-white border border-rose-500',
  cancelled: 'border border-[#c7c4d8] text-[#777587] bg-[#f9f9ff]',
};

const ATT_STATUS_CONFIG = {
  present:  { label: 'Present',  dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  half_day: { label: 'Half Day', dot: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50'   },
  on_leave: { label: 'On Leave', dot: 'bg-[#3525cd]',   text: 'text-[#3525cd]',   bg: 'bg-[#f0f3ff]'  },
  wfh:      { label: 'WFH',      dot: 'bg-cyan-500',    text: 'text-cyan-700',     bg: 'bg-cyan-50'    },
  absent:   { label: 'Absent',   dot: 'bg-rose-500',    text: 'text-rose-700',     bg: 'bg-rose-50'    },
};

function fmtLeaveDate(start, end) {
  const opts = { day: '2-digit', month: 'short', year: 'numeric' };
  const s = new Date(start + 'T12:00:00').toLocaleDateString('en-IN', opts);
  if (start === end) return s;
  const e = new Date(end + 'T12:00:00').toLocaleDateString('en-IN', opts);
  return `${s} – ${e}`;
}

function fmtBreakTime(totalBreakMinutes) {
  if (!totalBreakMinutes) return '—';
  const h = Math.floor(totalBreakMinutes / 60), m = totalBreakMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDateShort(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
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
  const [breakBusy, setBreakBusy]     = useState(false);

  const clockifySyncs = false;
  const clockifyTodayHours = 0;

  const nowDate = new Date();

  const loadToday = useCallback(async () => {
    try { setAttRecord(await apiGet('/attendance/today')); } catch { /* silent */ }
  }, []);
  useEffect(() => { loadToday(); }, [loadToday]);


  // Elapsed timer — pauses when on break
  useEffect(() => {
    const isOnBreak = attRecord?.break_start && !attRecord?.break_end;
    if (!attRecord?.check_in || attRecord?.check_out) { setElapsed(''); return; }
    const tick = () => {
      if (isOnBreak) {
        const [bh, bm] = attRecord.break_start.split(':').map(Number);
        const breakStart = new Date(); breakStart.setHours(bh, bm, 0, 0);
        const total = Math.floor((Date.now() - breakStart.getTime()) / 60000);
        const hrs = Math.floor(total / 60); const min = total % 60;
        setElapsed(hrs > 0 ? `${hrs}h ${min}m` : `${min}m`);
      } else {
        const [h, m] = attRecord.check_in.split(':').map(Number);
        const start = new Date(); start.setHours(h, m, 0, 0);
        const totalMins = Math.max(0, Math.floor((Date.now() - start.getTime()) / 60000) - (attRecord.total_break_minutes || 0));
        const hrs = Math.floor(totalMins / 60); const min = totalMins % 60;
        setElapsed(hrs > 0 ? `${hrs}h ${min}m` : `${min}m`);
      }
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [attRecord]);

  async function checkIn() {
    setCheckBusy(true);
    try {
      const { record: r, message } = await apiPost('/attendance/checkin', {});
      setAttRecord(r);
      toast(message || 'Checked in!', 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { setCheckBusy(false); }
  }
  async function checkOut() {
    setCheckBusy(true);
    try {
      const { record: r, message } = await apiPost('/attendance/checkout', {});
      setAttRecord(r);
      toast(message || 'Checked out!', r.status === 'half_day' ? 'warning' : 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { setCheckBusy(false); }
  }
  async function breakIn() {
    setBreakBusy(true);
    try {
      const { record: r, message } = await apiPost('/attendance/break-in', {});
      setAttRecord(r);
      toast(message || 'Break started', 'info');
    } catch (err) { toast(err.message, 'error'); }
    finally { setBreakBusy(false); }
  }
  async function breakOut() {
    setBreakBusy(true);
    try {
      const { record: r, message } = await apiPost('/attendance/break-out', {});
      setAttRecord(r);
      toast(message || 'Break ended', 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { setBreakBusy(false); }
  }

  const { data: myStats } = useQuery({ queryKey: ['my-stats'], queryFn: () => apiGet('/my-stats') });
  const { data: myLeaves = [] } = useQuery({ queryKey: ['my-leaves-recent'], queryFn: () => apiGet('/leaves') });
  const { data: culture } = useQuery({
    queryKey: ['culture'], queryFn: () => apiGet('/culture'), staleTime: 5 * 60 * 1000, retry: 2,
  });
  const today = todayStr();
  const { data: todayTeamLeaves = [] } = useQuery({
    queryKey: ['team-leaves-today'], queryFn: () => apiGet('/team-leaves', { startDate: today, endDate: today }), staleTime: 60000,
  });
  const { data: newJoiners = [] } = useQuery({
    queryKey: ['new-joiners'], queryFn: () => apiGet('/new-joiners'), staleTime: 5 * 60 * 1000,
  });
  const { data: announcements = [] } = useQuery({
    queryKey: ['announcements'], queryFn: () => apiGet('/announcements'),
    staleTime: 5 * 60 * 1000, retry: 1,
  });
  const { data: regularizations = [] } = useQuery({
    queryKey: ['my-regularization'], queryFn: () => apiGet('/regularization'), staleTime: 2 * 60 * 1000, retry: 1,
  });
  const { data: recentAttendance = [] } = useQuery({
    queryKey: ['my-att-recent', nowDate.getFullYear(), nowDate.getMonth() + 1],
    queryFn: () => apiGet('/attendance', { year: nowDate.getFullYear(), month: nowDate.getMonth() + 1 }),
    staleTime: 2 * 60 * 1000,
  });
  const { data: leavePolicies = [] } = useQuery({
    queryKey: ['leave-policies'], queryFn: () => apiGet('/leave-policies'), staleTime: 5 * 60 * 1000,
  });

  const recentLeaves    = myLeaves.slice(0, 4);
  const allHolidays     = culture?.holidays || [];
  const totalPages      = Math.max(1, Math.ceil(allHolidays.length / PER_PAGE));
  const visibleHolidays = allHolidays.slice(holidayPage * PER_PAGE, (holidayPage + 1) * PER_PAGE);
  const birthdaysToday  = culture?.birthdaysToday || [];
  const upcomingBdays   = culture?.upcomingBirthdays || [];
  const upcomingEvents  = (culture?.events || []).slice(0, 4);

  const isWFHLeave  = (l) => l.leave_time === 'wfh' || l.leave_type === 'wfh';
  const teamOnLeave = todayTeamLeaves.filter(l => !isWFHLeave(l) && l.user_id !== user?.id);
  const teamWfh     = todayTeamLeaves.filter(l =>  isWFHLeave(l) && l.user_id !== user?.id);

  const todayDow      = new Date().getDay();
  const isWeekend     = todayDow === 0 || todayDow === 6;
  const todayHoliday  = allHolidays.find(h => h.date === today);

  const orgName   = user?.organization_name || user?.org_name || 'lumoslogic';
  const roleLabel = user?.position || 'Team Member';

  // Break state helpers
  const isOnBreak    = !!(attRecord?.break_start && !attRecord?.break_end && !attRecord?.check_out);
  const hasBreakDone = !!(attRecord?.break_end && !attRecord?.check_out);

  // Recent attendance: last 7 days, sorted desc
  const last7Days = recentAttendance
    .filter(r => r.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7);

  // Pending regularization count
  const pendingReg = regularizations.filter(r => r.status === 'pending');

  // Latest announcements
  const latestAnnouncements = announcements.slice(0, 3);

  // Leave balance from policies
  const isWFHRecord = (l) => l.leave_time === 'wfh' || l.leave_type === 'wfh';
  const activePolicies = leavePolicies.filter(p => p.active && p.annual_quota > 0);

  // Upcoming approved leaves
  const upcomingLeaves = myLeaves
    .filter(l => l.status === 'approved' && l.start_date >= today && !isWFHRecord(l))
    .slice(0, 3);

  // Pending leave requests
  const pendingLeaves = myLeaves.filter(l => l.status === 'pending' && !isWFHRecord(l));

  return (
    <div className="space-y-5">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl relative overflow-hidden shadow-md"
        style={{ background: 'linear-gradient(135deg, #3525cd 0%, #4f46e5 55%, #712ae2 100%)' }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 75% 50%, rgba(255,255,255,.12) 0%, transparent 55%)' }} />
        <div className="relative px-6 py-4">
          {/* Top row: greeting + avatar + buttons */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-full border-2 border-white/40 flex items-center justify-center shrink-0"
                style={{ background: user?.avatar_color || '#4f46e5' }}>
                <span className="text-white font-black text-base select-none">
                  {user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'}
                </span>
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-black text-white leading-tight">Hello, {user?.name?.split(' ')[0]}! 👋</h1>
                <p className="text-white/60 text-xs mt-0.5 truncate">{orgName} · {roleLabel}</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {clockifySyncs && (
                <span className="hidden sm:flex items-center gap-1 text-[0.6rem] font-bold px-1.5 py-0.5 rounded text-white bg-white/15 border border-white/20">
                  <Timer size={9} /> Clockify
                </span>
              )}

              {/* Clockify mode: use existing Check In / Go on Break / Resume flow */}
              {clockifySyncs ? (
                !attRecord?.check_in ? (
                  <button onClick={checkIn} disabled={checkBusy}
                    className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white transition-all disabled:opacity-60 shadow-sm">
                    <LogIn size={13} /> {checkBusy ? 'Checking in…' : 'Check In'}
                  </button>
                ) : !attRecord?.check_out ? (
                  <button onClick={checkOut} disabled={checkBusy}
                    className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white transition-all disabled:opacity-60 shadow-sm">
                    <LogOut size={13} /> {checkBusy ? 'Pausing…' : 'Go on Break'}
                  </button>
                ) : (
                  <button onClick={checkIn} disabled={checkBusy}
                    className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-all disabled:opacity-60 border border-white/30">
                    <Play size={13} /> {checkBusy ? 'Resuming…' : 'Resume Timer'}
                  </button>
                )
              ) : (
                /* Standalone mode: Check In → Break In + Check Out → End Break → Check Out */
                !attRecord?.check_in ? (
                  <button onClick={checkIn} disabled={checkBusy}
                    className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white transition-all disabled:opacity-60 shadow-sm">
                    <LogIn size={13} /> {checkBusy ? 'Checking in…' : 'Check In'}
                  </button>
                ) : isOnBreak ? (
                  <button onClick={breakOut} disabled={breakBusy}
                    className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white transition-all disabled:opacity-60 shadow-sm">
                    <Play size={13} /> {breakBusy ? 'Ending…' : 'End Break'}
                  </button>
                ) : attRecord?.check_out ? (
                  <span className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-white/15 text-white/80 border border-white/20">
                    <CheckCircle2 size={13} /> Day Complete
                  </span>
                ) : (
                  <>
                    <button onClick={breakIn} disabled={breakBusy || checkBusy}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-amber-500/80 hover:bg-amber-400 text-white transition-all disabled:opacity-60 shadow-sm">
                      <Coffee size={13} /> {breakBusy ? '…' : 'Break'}
                    </button>
                    <button onClick={checkOut} disabled={checkBusy}
                      className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white transition-all disabled:opacity-60 shadow-sm">
                      <LogOut size={13} /> {checkBusy ? 'Checking out…' : 'Check Out'}
                    </button>
                  </>
                )
              )}

              <button onClick={() => navigate('/portal/attendance')}
                className="text-xs text-white/60 hover:text-white px-2.5 py-2 rounded-xl hover:bg-white/10 transition-all whitespace-nowrap">
                View →
              </button>
            </div>
          </div>

          {/* Status strip */}
          {attRecord?.check_in && (
            <div className="mt-3 pt-3 border-t border-white/10">
              {isOnBreak ? (
                <span className="text-xs text-amber-300 flex items-center gap-1.5">
                  <Coffee size={12} /> On break since {fmtTime(attRecord.break_start)}{elapsed ? ` · ${elapsed} elapsed` : ''}
                </span>
              ) : attRecord.check_out ? (
                <span className="text-xs text-white/75 flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-emerald-300" />
                  {clockifySyncs && clockifyTodayHours > 0
                    ? <><strong className="text-white">{fmtHours(clockifyTodayHours)}</strong> worked today · <span className="text-white/50">timer paused</span></>
                    : <>{fmtTime(attRecord.check_in)} – {fmtTime(attRecord.check_out)}{attRecord.work_hours ? ` · ${fmtHours(attRecord.work_hours)} effective` : ''}</>
                  }
                </span>
              ) : (
                <span className="text-xs text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 size={12} /> Since {fmtTime(attRecord.check_in)}{elapsed ? ` · ${elapsed} working` : ''}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Today's Attendance Summary ─────────────────────────────────────── */}
      {attRecord?.check_in && (
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-[#fafaff] border-b border-[#f0f3ff] flex items-center justify-between">
            <h2 className="text-[0.65rem] font-black text-[#777587] uppercase tracking-widest flex items-center gap-2">
              <Clock size={13} className="text-[#3525cd]" /> Today's Attendance Summary
            </h2>
            {attRecord.status && (
              <span className={`text-[0.65rem] font-bold px-2.5 py-0.5 rounded-full capitalize ${
                ATT_STATUS_CONFIG[attRecord.status]?.bg || 'bg-[#f0f3ff]'} ${ATT_STATUS_CONFIG[attRecord.status]?.text || 'text-[#464555]'}`}>
                {ATT_STATUS_CONFIG[attRecord.status]?.label || attRecord.status}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-[#f0f3ff]">
            {[
              { label: 'Check-In', value: attRecord.check_in ? fmtTime(attRecord.check_in) : '—', color: 'text-emerald-600', icon: <LogIn size={14} className="text-emerald-500" /> },
              { label: 'Break Time', value: fmtBreakTime(attRecord.total_break_minutes), color: 'text-amber-600', icon: <Coffee size={14} className="text-amber-500" /> },
              { label: 'Check-Out', value: attRecord.check_out ? fmtTime(attRecord.check_out) : '—', color: 'text-rose-600', icon: <LogOut size={14} className="text-rose-500" /> },
              { label: 'Gross Hours', value: attRecord.gross_hours ? fmtHours(attRecord.gross_hours) : (attRecord.check_in && !attRecord.check_out ? 'In progress' : '—'), color: 'text-[#3525cd]', icon: <Timer size={14} className="text-[#3525cd]" /> },
              { label: 'Effective Hours', value: attRecord.work_hours ? fmtHours(attRecord.work_hours) : '—', color: 'text-[#151c27]', icon: <CheckCircle2 size={14} className="text-emerald-600" /> },
            ].map(({ label, value, color, icon }) => (
              <div key={label} className="px-4 py-4 flex flex-col gap-1.5 text-center items-center">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#f0f3ff]">{icon}</div>
                <p className={`text-base font-black ${color} leading-tight`}>{value}</p>
                <p className="text-[0.6rem] font-semibold text-[#777587] uppercase tracking-wide">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 3-column row ──────────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-5">

        {/* Team Status Today */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5">
          <h2 className="text-[0.65rem] font-black text-[#777587] uppercase tracking-widest flex items-center gap-2 mb-4">
            <Users size={13} className="text-[#3525cd]" /> Team Status Today
          </h2>
          {(todayHoliday || isWeekend) ? (
            <div className="flex flex-col items-center justify-center text-center py-3 gap-2">
              <span className="text-3xl">{todayHoliday ? '🏖️' : '🌟'}</span>
              <p className="text-sm font-black text-[#151c27]">{todayHoliday ? todayHoliday.name : 'Weekend Holiday'}</p>
              <p className="text-[0.7rem] text-[#777587]">Attendance not applicable today</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 divide-x divide-[#f0f3ff]">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <Umbrella size={12} className="text-amber-500" />
                    <span className="text-xs font-bold text-amber-600">On Leave</span>
                  </div>
                  <span className="text-lg font-black text-amber-600 leading-none">{teamOnLeave.length}</span>
                </div>
                {teamOnLeave.length === 0 ? (
                  <p className="text-[0.7rem] text-[#9ca3af] italic">Everyone's in today</p>
                ) : (
                  <div className="space-y-2.5">
                    {teamOnLeave.slice(0, 3).map(l => (
                      <div key={l.id} className="flex items-center gap-2.5">
                        <Avatar name={l.name} color={l.avatar_color} size={26} />
                        <div className="min-w-0">
                          <p className="text-[0.72rem] font-semibold text-[#151c27] truncate leading-tight">{l.name}</p>
                          <p className="text-[0.62rem] text-[#9ca3af] truncate">{l.department || orgName}</p>
                        </div>
                      </div>
                    ))}
                    {teamOnLeave.length > 3 && <p className="text-[0.65rem] text-[#777587] font-medium">+{teamOnLeave.length - 3} more</p>}
                  </div>
                )}
              </div>
              <div className="pl-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <Home size={12} className="text-[#3525cd]" />
                    <span className="text-[0.7rem] font-bold text-[#3525cd] leading-tight">WFH</span>
                  </div>
                  <span className="text-lg font-black text-[#3525cd] leading-none">{teamWfh.length}</span>
                </div>
                {teamWfh.length === 0 ? (
                  <p className="text-[0.7rem] text-[#9ca3af] italic">No WFH today</p>
                ) : (
                  <div className="space-y-2.5">
                    {teamWfh.slice(0, 3).map(l => (
                      <div key={l.id} className="flex items-center gap-2.5">
                        <Avatar name={l.name} color={l.avatar_color} size={26} />
                        <div className="min-w-0">
                          <p className="text-[0.72rem] font-semibold text-[#151c27] truncate leading-tight">{l.name}</p>
                          <p className="text-[0.62rem] text-[#9ca3af] truncate">{l.department || orgName}</p>
                        </div>
                      </div>
                    ))}
                    {teamWfh.length > 3 && <p className="text-[0.65rem] text-[#777587] font-medium">+{teamWfh.length - 3} more</p>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* This Month KPIs */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5">
          <h2 className="text-[0.65rem] font-black text-[#777587] uppercase tracking-widest flex items-center gap-2 mb-4">
            <TrendingUp size={13} className="text-emerald-600" /> This Month
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Days Present',  value: myStats?.presentCount ?? 0, color: 'text-emerald-600', bg: 'bg-emerald-50',  border: 'border-emerald-100' },
              { label: 'Leaves Taken',  value: myStats?.leavesCount  ?? 0, color: 'text-[#3525cd]',   bg: 'bg-[#f0f3ff]',  border: 'border-[#e7eefe]'  },
              { label: 'Late Arrivals', value: myStats?.lateCount    ?? 0, color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-100'  },
            ].map(({ label, value, color, bg, border }) => (
              <div key={label} className={`${bg} border ${border} rounded-xl p-3.5 flex flex-col items-center justify-center text-center min-h-[80px]`}>
                <p className={`text-[1.75rem] font-black leading-none ${color}`}>{value}</p>
                <p className="text-[0.6rem] font-semibold text-[#464555] mt-1.5 leading-tight">{label}</p>
              </div>
            ))}
          </div>
          {pendingLeaves.length > 0 && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle size={11} className="text-amber-600 shrink-0" />
              <span className="text-[0.65rem] text-amber-700 font-semibold">
                {pendingLeaves.length} leave request{pendingLeaves.length > 1 ? 's' : ''} pending approval
              </span>
            </div>
          )}
        </div>

        {/* Upcoming Holidays */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5">
          <h2 className="text-[0.65rem] font-black text-[#777587] uppercase tracking-widest flex items-center gap-2 mb-4">
            <CalendarDays size={13} className="text-rose-500" /> Upcoming Holidays
          </h2>
          {allHolidays.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[80px] text-center">
              <p className="text-xs text-[#9ca3af]">No upcoming holidays</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <button onClick={() => setHolidayPage(p => Math.max(0, p - 1))} disabled={holidayPage === 0}
                  className="w-8 h-8 rounded-full border border-[#c7c4d8] flex items-center justify-center text-[#777587] disabled:opacity-30 hover:enabled:border-[#3525cd] hover:enabled:text-[#3525cd] transition-colors shrink-0">
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
                <button onClick={() => setHolidayPage(p => Math.min(totalPages - 1, p + 1))} disabled={holidayPage >= totalPages - 1}
                  className="w-8 h-8 rounded-full border border-[#c7c4d8] flex items-center justify-center text-[#777587] disabled:opacity-30 hover:enabled:border-[#3525cd] hover:enabled:text-[#3525cd] transition-colors shrink-0">
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

      {/* ── Announcements + Regularization ────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-5">

        {/* Announcements */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f3ff]">
            <h2 className="text-[0.65rem] font-black text-[#777587] uppercase tracking-widest flex items-center gap-2">
              <Bell size={13} className="text-amber-500" /> Announcements
            </h2>
            <button onClick={() => navigate('/portal/announcements')} className="text-[0.68rem] font-bold text-[#3525cd] hover:underline">
              View All
            </button>
          </div>
          {latestAnnouncements.length === 0 ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-center px-5">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-xl">📢</div>
              <p className="text-sm font-semibold text-[#464555]">No announcements</p>
              <p className="text-xs text-[#9ca3af]">Company announcements will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#f9f9ff]">
              {latestAnnouncements.map(a => (
                <div key={a.id} className="px-5 py-3.5 hover:bg-[#fafaff] transition-colors">
                  <div className="flex items-start gap-2.5">
                    <span className="text-lg shrink-0 mt-0.5">{a.type === 'urgent' ? '🚨' : a.pinned ? '📌' : '📢'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="text-sm font-bold text-[#151c27] leading-tight line-clamp-1">{a.title}</p>
                        {a.priority === 'high' && (
                          <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 shrink-0">High</span>
                        )}
                      </div>
                      <p className="text-[0.72rem] text-[#777587] line-clamp-2">{a.content}</p>
                      <p className="text-[0.62rem] text-[#9ca3af] mt-1">{fmtDate(a.created_at?.split('T')[0])}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Regularization */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f3ff]">
            <h2 className="text-[0.65rem] font-black text-[#777587] uppercase tracking-widest flex items-center gap-2">
              <ClipboardList size={13} className="text-[#3525cd]" /> Attendance Regularization
            </h2>
            <button onClick={() => navigate('/portal/regularization')}
              className="text-[0.68rem] font-bold text-[#3525cd] hover:underline">
              Apply / View
            </button>
          </div>
          <div className="p-5">
            {pendingReg.length > 0 && (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 mb-4">
                <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                <span className="text-xs font-bold text-amber-700">
                  {pendingReg.length} pending request{pendingReg.length > 1 ? 's' : ''} awaiting approval
                </span>
              </div>
            )}
            {regularizations.length === 0 ? (
              <div className="flex flex-col items-center gap-2 text-center py-4">
                <div className="w-10 h-10 rounded-xl bg-[#f0f3ff] flex items-center justify-center text-xl">🗂️</div>
                <p className="text-sm font-semibold text-[#464555]">No regularization requests</p>
                <p className="text-xs text-[#9ca3af]">Submit a request if your attendance needs correction.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {regularizations.slice(0, 3).map(r => (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-[#f9f9ff] last:border-0">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#151c27]">{fmtDate(r.date)}</p>
                      <p className="text-[0.65rem] text-[#777587] truncate">{r.reason}</p>
                    </div>
                    <span className={`ml-2 text-[0.65rem] font-bold px-2 py-0.5 rounded-full capitalize shrink-0 ${
                      r.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : r.status === 'rejected' ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>{r.status}</span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => navigate('/portal/regularization')}
              className="w-full mt-3 text-xs font-bold text-[#3525cd] border border-[#c7c4d8] rounded-xl py-2 hover:bg-[#f0f3ff] transition-colors">
              + Apply Attendance Correction
            </button>
          </div>
        </div>
      </div>

      {/* ── Recent Attendance (Last 7 Days) ───────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f3ff]">
          <h2 className="text-[0.65rem] font-black text-[#777587] uppercase tracking-widest flex items-center gap-2">
            <CalendarDays size={13} className="text-[#3525cd]" /> Recent Attendance
          </h2>
          <button onClick={() => navigate('/portal/attendance')} className="text-[0.68rem] font-bold text-[#3525cd] hover:underline">
            Full History
          </button>
        </div>
        {last7Days.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-[#9ca3af]">No attendance records this month yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f0f3ff] border-b border-[#c7c4d8]">
                <tr>
                  {['Date', 'Status', 'Check-In', 'Check-Out', 'Break', 'Hours'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[0.62rem] font-bold text-[#464555] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f9f9ff]">
                {last7Days.map(r => {
                  const cfg = ATT_STATUS_CONFIG[r.status] || ATT_STATUS_CONFIG.present;
                  return (
                    <tr key={r.id} className="hover:bg-[#fafaff] transition-colors">
                      <td className="px-4 py-2.5 font-medium text-[#151c27] text-xs">{fmtDateShort(r.date)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#464555]">{r.check_in ? fmtTime(r.check_in) : '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-[#464555]">{r.check_out ? fmtTime(r.check_out) : '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-amber-600">{r.total_break_minutes ? fmtBreakTime(r.total_break_minutes) : '—'}</td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-[#151c27]">
                        {(r.clockify_hours > 0 ? r.clockify_hours : r.work_hours) > 0
                          ? <span className="flex items-center gap-1">
                              {fmtHours(r.clockify_hours > 0 ? r.clockify_hours : r.work_hours)}
                              {r.clockify_hours > 0 && <span className="text-[0.55rem] text-[#3525cd] font-bold">⏱</span>}
                            </span>
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Leave Balance + Upcoming Approved ────────────────────────────── */}
      {(activePolicies.length > 0 || upcomingLeaves.length > 0) && (
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Leave Balance */}
          {activePolicies.length > 0 && (
            <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-[#f0f3ff] flex items-center gap-2">
                <BookOpen size={13} className="text-[#3525cd]" />
                <h2 className="text-[0.65rem] font-black text-[#777587] uppercase tracking-widest">Leave Balance</h2>
              </div>
              <div className="p-4 space-y-0">
                {activePolicies.map(p => {
                  const used = myLeaves
                    .filter(l => l.leave_type === p.leave_type && l.status === 'approved' && !isWFHRecord(l))
                    .reduce((sum, l) => sum + (l.leave_time === 'half' ? 0.5 : countWorkingDaysInRange(l.start_date, l.end_date)), 0);
                  const total     = p.annual_quota;
                  const remaining = Math.max(0, total - used);
                  const pct       = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
                  return (
                    <div key={p.leave_type} className="py-2.5 border-b border-[#f0f3ff] last:border-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-[#151c27]">{p.label}</span>
                        <span className="text-xs font-black text-[#3525cd]">{remaining} <span className="font-normal text-[#777587]">/ {total} days</span></span>
                      </div>
                      <div className="h-1.5 bg-[#f0f3ff] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 80 ? '#ef4444' : pct >= 50 ? '#f59e0b' : '#10b981' }} />
                      </div>
                    </div>
                  );
                })}
                <button onClick={() => navigate('/portal/leaves')} className="w-full mt-2 text-xs font-bold text-[#3525cd] border border-[#c7c4d8] rounded-xl py-2 hover:bg-[#f0f3ff] transition-colors">
                  Apply Leave →
                </button>
              </div>
            </div>
          )}

          {/* Upcoming Approved Leaves */}
          <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#f0f3ff] flex items-center gap-2">
              <Umbrella size={13} className="text-emerald-500" />
              <h2 className="text-[0.65rem] font-black text-[#777587] uppercase tracking-widest">Upcoming Approved Leaves</h2>
            </div>
            {upcomingLeaves.length === 0 ? (
              <div className="py-8 text-center px-5">
                <p className="text-sm font-semibold text-[#464555]">No upcoming leaves</p>
                <p className="text-xs text-[#9ca3af] mt-1">Your approved upcoming leaves will show here.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#f9f9ff]">
                {upcomingLeaves.map(l => {
                  const lt = LEAVE_ICONS[l.leave_type] || LEAVE_ICONS.other;
                  return (
                    <div key={l.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#fafaff] transition-colors">
                      <div className={`w-8 h-8 rounded-lg ${lt.bg} border ${lt.border} flex items-center justify-center text-sm shrink-0`}>{lt.emoji}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#151c27] leading-tight">{leaveLabel(l.leave_type)}</p>
                        <p className="text-xs text-[#777587]">{fmtLeaveDate(l.start_date, l.end_date)}</p>
                      </div>
                      <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">Approved</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="px-5 py-3 border-t border-[#f0f3ff]">
              <button onClick={() => navigate('/portal/leaves')} className="text-xs font-bold text-[#3525cd] hover:underline">
                View All Leaves →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── My Recent Leaves ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f3ff]">
          <h2 className="text-[0.65rem] font-black text-[#777587] uppercase tracking-widest flex items-center gap-2">
            <Umbrella size={13} className="text-[#3525cd]" /> My Recent Leaves
          </h2>
          <button onClick={() => navigate('/portal/leaves')} className="text-[0.68rem] font-bold text-[#3525cd] hover:underline">View All</button>
        </div>

        {recentLeaves.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center gap-2">
            <div className="w-12 h-12 rounded-2xl bg-[#f0f3ff] flex items-center justify-center text-2xl">🗓️</div>
            <p className="text-sm font-semibold text-[#464555]">No leave requests yet</p>
            <p className="text-xs text-[#9ca3af]">You haven't applied for any leave yet.</p>
            <button onClick={() => navigate('/portal/leaves')}
              className="mt-2 text-xs font-bold text-[#3525cd] border border-[#c7c4d8] rounded-xl px-4 py-2 hover:bg-[#f0f3ff] transition-colors">
              Apply Leave →
            </button>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-[2fr_2fr_auto] px-5 py-2.5 bg-[#fafaff] border-b border-[#f0f3ff]">
              <span className="text-[0.62rem] font-black uppercase tracking-wider text-[#9ca3af]">Leave Type</span>
              <span className="text-[0.62rem] font-black uppercase tracking-wider text-[#9ca3af]">Dates</span>
              <span className="text-[0.62rem] font-black uppercase tracking-wider text-[#9ca3af] text-right">Status</span>
            </div>
            {recentLeaves.map(l => {
              const lt    = LEAVE_ICONS[l.leave_type] || LEAVE_ICONS.other;
              const badge = STATUS_BADGE[l.status] || STATUS_BADGE.pending;
              const isWfh = isWFHLeave(l);
              return (
                <div key={l.id} className="grid grid-cols-[2fr_2fr_auto] px-5 py-3.5 items-center border-b border-[#f9f9ff] last:border-0 hover:bg-[#fafaff] transition-colors gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-lg ${lt.bg} border ${lt.border} flex items-center justify-center text-sm shrink-0`}>{lt.emoji}</div>
                    <span className="text-sm font-semibold text-[#151c27] truncate">{isWfh ? 'WFH' : leaveLabel(l.leave_type)}</span>
                  </div>
                  <span className="text-xs text-[#464555] leading-tight">{fmtLeaveDate(l.start_date, l.end_date)}</span>
                  <span className={`text-[0.7rem] font-bold px-3 py-1 rounded-full capitalize whitespace-nowrap ${badge}`}>
                    {l.status === 'cancelled' ? 'Cancelled' : l.status.charAt(0).toUpperCase() + l.status.slice(1)}
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
          <div className="px-5 py-4 border-b border-[#f0f3ff] flex items-center gap-2">
            <UserPlus size={13} className="text-emerald-500" />
            <h2 className="text-[0.65rem] font-black text-[#777587] uppercase tracking-widest">New Team Members</h2>
            <span className="text-[0.6rem] font-semibold text-[#9ca3af] ml-1">· Last 7 days</span>
          </div>
          <div className="divide-y divide-[#f9f9ff]">
            {newJoiners.map(e => {
              const daysAgo = Math.floor((Date.now() - new Date(e.created_at).getTime()) / 86400000);
              return (
                <div key={e.id} className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-[#fafaff] transition-colors">
                  <Avatar name={e.name} color={e.avatar_color} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#151c27] leading-tight">{e.name}</p>
                    <p className="text-xs text-[#777587] mt-0.5">{e.position || 'Staff'} · {e.department || '—'}</p>
                  </div>
                  <span className="text-[0.65rem] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                    {daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Birthdays + Upcoming Events ───────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#f0f3ff]">
            <h2 className="text-[0.65rem] font-black text-[#777587] uppercase tracking-widest flex items-center gap-2">
              <Cake size={13} className="text-pink-500" /> Birthdays
            </h2>
          </div>
          <div className="p-5">
            {birthdaysToday.length === 0 && upcomingBdays.length === 0 ? (
              <div className="min-h-[120px] flex flex-col items-center justify-center gap-3 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#f0f3ff] flex items-center justify-center text-2xl">🎁</div>
                <div>
                  <p className="text-sm font-semibold text-[#464555]">No upcoming birthdays</p>
                  <p className="text-xs text-[#9ca3af] mt-0.5">We'll show birthdays here when available.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {birthdaysToday.length > 0 && (
                  <div>
                    <p className="text-[0.62rem] font-black text-pink-600 uppercase tracking-wider mb-2.5">Today 🎂</p>
                    <div className="space-y-2">
                      {birthdaysToday.map(u => (
                        <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-pink-50 border border-pink-100">
                          <Avatar name={u.name} color={u.avatar_color} size={32} />
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-[#151c27] truncate leading-tight">{u.name}</p>
                            <p className="text-xs text-[#777587] mt-0.5">{u.department}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {upcomingBdays.length > 0 && (
                  <div>
                    {birthdaysToday.length > 0 && <p className="text-[0.62rem] font-black text-[#777587] uppercase tracking-wider mb-2.5 mt-4">Coming Up</p>}
                    <div className="space-y-2.5">
                      {upcomingBdays.slice(0, 4).map(u => (
                        <div key={u.id + u.birthday_date} className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center text-lg shrink-0">🎂</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#151c27] truncate leading-tight">{u.name}</p>
                            <p className="text-xs text-[#777587] mt-0.5">in {u.days_until} day{u.days_until !== 1 ? 's' : ''}</p>
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

        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#f0f3ff]">
            <h2 className="text-[0.65rem] font-black text-[#777587] uppercase tracking-widest flex items-center gap-2">
              <PartyPopper size={13} className="text-amber-500" /> Upcoming Events
            </h2>
          </div>
          <div className="p-5">
            {upcomingEvents.length === 0 ? (
              <div className="min-h-[120px] flex flex-col items-center justify-center gap-3 text-center">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center text-2xl">📅</div>
                <div>
                  <p className="text-sm font-semibold text-[#464555]">No upcoming events</p>
                  <p className="text-xs text-[#9ca3af] mt-0.5">Stay tuned for exciting events!</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map(ev => (
                  <div key={ev.id} className="flex items-center gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-lg shrink-0">🎉</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#151c27] truncate leading-tight">{ev.title}</p>
                      <p className="text-xs text-[#777587] mt-0.5">
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
