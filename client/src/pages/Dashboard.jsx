import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, Clock, FileText, CheckCircle2, Users, UserCheck,
  Umbrella, Home, Timer, AlarmClock, Activity, BarChart2,
  ClipboardList, Inbox, Cake, CalendarDays, CalendarCheck,
  PartyPopper, Trash2, X, RefreshCw, Building2, Mail,
  LogIn, LogOut, Briefcase, ExternalLink, Pencil,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge, LeaveTypeBadge } from '@/components/ui/Badge';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { fmtDate, fmtDateRange, fmtTime, fmtHours, todayStr, getGreeting, MONTHS } from '@/lib/utils';

// ── Stat Card ─────────────────────────────────────────────────────────────────
const VARIANT = {
  primary: { border: '#3525cd #4f46e5', bg: 'from-[#f0f3ff] to-[#e7eefe]', value: 'text-[#3525cd]',  label: 'text-[#4f46e5]',  iconBg: 'bg-[#e7eefe] text-[#3525cd]' },
  success: { border: '#10B981 #059669', bg: 'from-emerald-50 to-emerald-100', value: 'text-emerald-800', label: 'text-emerald-600', iconBg: 'bg-emerald-100 text-emerald-600' },
  warning: { border: '#F59E0B #D97706', bg: 'from-amber-50 to-amber-100',   value: 'text-amber-800',   label: 'text-amber-600',   iconBg: 'bg-amber-100 text-amber-600' },
  danger:  { border: '#ba1a1a #EF4444', bg: 'from-rose-50 to-rose-100',     value: 'text-rose-700',    label: 'text-rose-600',    iconBg: 'bg-rose-100 text-rose-600' },
  info:    { border: '#712ae2 #8a4cfc', bg: 'from-[#f0f3ff] to-[#e7eefe]', value: 'text-[#712ae2]',  label: 'text-[#712ae2]',  iconBg: 'bg-[#f0f3ff] text-[#712ae2]' },
};

function StatCard({ icon, value, label, variant = 'primary', hint }) {
  const v = VARIANT[variant] || VARIANT.primary;
  return (
    <div className={`rounded-xl p-5 flex flex-col gap-2.5 relative overflow-hidden bg-gradient-to-br border border-[#c7c4d8] hover:border-[#3525cd]/30 hover:translate-y-[-2px] hover:shadow-card-hover transition-all duration-200 shadow-card ${v.bg}`}>
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl"
        style={{ background: `linear-gradient(90deg, ${v.border})` }} />
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${v.iconBg}`}>{icon}</div>
      <div className={`text-3xl font-black leading-none tracking-[-0.05em] ${v.value}`}>{value ?? '—'}</div>
      <div className={`text-[0.71rem] font-bold uppercase tracking-wider ${v.label}`}>{label}</div>
      {hint && <div className="text-[0.62rem] text-[#777587] mt-0.5">{hint}</div>}
    </div>
  );
}

// ── Check-in Widget ───────────────────────────────────────────────────────────
function CheckinWidget({ onRefresh }) {
  const toast = useToast();
  const [record, setRecord] = useState(null);
  const [elapsed, setElapsed] = useState('');

  const load = useCallback(async () => {
    try { const r = await apiGet('/attendance/today'); setRecord(r); } catch { /* silent */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!record?.check_in || record?.check_out) return;
    const tick = () => {
      const [h, m] = record.check_in.split(':').map(Number);
      const start  = new Date(); start.setHours(h, m, 0, 0);
      const diff   = Date.now() - start.getTime();
      const total  = Math.floor(diff / 60000);
      const hrs    = Math.floor(total / 60); const min = total % 60;
      setElapsed(hrs > 0 ? `(${hrs}h ${min}m)` : `(${min}m)`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [record]);

  async function checkIn() {
    try {
      const { record: r, message } = await apiPost('/attendance/checkin', {});
      setRecord(r);
      toast(message || 'Checked in!', r.is_late ? 'warning' : 'success');
      onRefresh?.();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function checkOut() {
    try {
      const { record: r, message } = await apiPost('/attendance/checkout', {});
      setRecord(r);
      toast(message || 'Checked out!', r.status === 'half_day' ? 'warning' : 'success');
      onRefresh?.();
    } catch (err) { toast(err.message, 'error'); }
  }

  if (!record || !record.check_in) {
    return <button className="btn btn-success btn-sm" onClick={checkIn}><Clock size={14} /> Check In</button>;
  }
  if (!record.check_out) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={record.is_late ? 'late' : 'present'} />
        <span className="text-sm font-bold text-[#151c27] flex items-center gap-1"><Timer size={14} /> {elapsed}</span>
        <button className="btn btn-danger btn-sm" onClick={checkOut}>Check Out</button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <StatusBadge status={record.status || 'present'} />
      {record.is_late && <StatusBadge status="late" />}
      <span className="text-sm font-bold text-[#3525cd] flex items-center gap-1"><Timer size={14} /> {fmtHours(record.work_hours)}</span>
    </div>
  );
}

// ── Employee Quick View Modal ─────────────────────────────────────────────────
function EmployeeQuickView({ record: r, onClose, onViewProfile }) {
  if (!r) return null;
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-5"
      style={{ background: 'rgba(4,6,14,.55)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl border border-[#c7c4d8] overflow-hidden">
        {/* Top accent */}
        <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #3525cd, #4f46e5, #712ae2)' }} />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#f0f3ff]">
          <div className="flex items-center gap-3">
            <Avatar name={r.name} color={r.avatar_color} size={44} />
            <div>
              <div className="font-black text-[#151c27] text-base leading-tight">{r.name}</div>
              {r.position && <div className="text-xs text-[#777587] mt-0.5">{r.position}</div>}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon text-[#777587]" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Details */}
        <div className="p-5 space-y-3">
          {/* Info row */}
          <div className="flex flex-col gap-2">
            {r.department && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Building2 size={14} className="text-[#777587] flex-shrink-0" />
                {r.department}
              </div>
            )}
            {r.email && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Mail size={14} className="text-[#777587] flex-shrink-0" />
                {r.email}
              </div>
            )}
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={r.status} />
            {r.is_late       && <StatusBadge status="late" />}
            {r.is_early_exit && <StatusBadge status="early_exit" />}
            {r.clockify_live && (
              <span className="text-[0.65rem] font-bold px-1.5 py-0.5 rounded text-white flex items-center gap-0.5"
                style={{ background: 'linear-gradient(135deg, #3525cd, #4f46e5)' }}>
                <Timer size={10} /> Clockify Live
              </span>
            )}
          </div>

          {/* Attendance times */}
          <div className="rounded-xl border border-[#c7c4d8] bg-[#f0f3ff] divide-y divide-[#e7eefe]">
            {r.check_in && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs text-[#464555]">
                  <LogIn size={13} className="text-emerald-500" /> Check In
                </div>
                <span className="text-sm font-bold text-[#151c27]">{fmtTime(r.check_in)}</span>
              </div>
            )}
            {r.check_out && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs text-[#464555]">
                  <LogOut size={13} className="text-rose-500" /> Check Out
                </div>
                <span className="text-sm font-bold text-[#151c27]">{fmtTime(r.check_out)}</span>
              </div>
            )}
            {r.work_hours != null && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs text-[#464555]">
                  <Timer size={13} className="text-[#4f46e5]" /> Work Hours
                </div>
                <span className="text-sm font-bold text-[#3525cd]">{fmtHours(r.work_hours)}</span>
              </div>
            )}
            {!r.check_in && (
              <div className="px-4 py-3 text-xs text-[#777587] text-center">No attendance recorded today</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            className="btn btn-outline btn-full text-sm"
            onClick={() => { onClose(); onViewProfile(r); }}
          >
            <ExternalLink size={14} /> View Full Profile
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard Page ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [dashDate, setDashDate] = useState('');
  const [selectedEmp, setSelectedEmp] = useState(null);

  const qs = dashDate ? { date: dashDate } : {};
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard', dashDate],
    queryFn: async () => {
      await apiPost('/attendance/cleanup-orphaned', {}).catch(() => {});
      const [d, culture, myStats] = await Promise.all([
        apiGet('/dashboard', qs),
        apiGet('/culture').catch(() => ({ birthdaysToday: [], upcomingBirthdays: [], holidays: [], events: [] })),
        (!dashDate && !isAdmin) ? apiGet('/my-stats').catch(() => null) : null,
      ]);
      return { d, culture, myStats };
    },
  });

  const { data: analytics } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => apiGet('/analytics').catch(() => null),
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const { d, culture, myStats } = data || {};
  const isToday = d?.isToday;
  const suffix  = isToday ? 'Today' : 'on Date';

  const displayDate = d?.today
    ? new Date(d.today + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  const greet = getGreeting();

  async function handleApprove(id) {
    try { await apiPut(`/leaves/${id}/approve`, {}); toast('Leave approved', 'success'); refetch(); }
    catch (err) { toast(err.message, 'error'); }
  }
  async function handleReject(id) {
    try { await apiPut(`/leaves/${id}/reject`, {}); toast('Leave rejected', 'warning'); refetch(); }
    catch (err) { toast(err.message, 'error'); }
  }

  function handleViewProfile(r) {
    navigate('/employees');
  }

  if (isLoading) return <div className="loading"><span className="spinner" /> Loading…</div>;

  const statCards = [
    { label: 'Total Employees',   value: d?.totalEmployees, icon: <Users size={18} />,     variant: 'primary' },
    { label: `Present ${suffix}`, value: d?.presentToday,   icon: <UserCheck size={18} />, variant: 'success', hint: 'Total minus on leave' },
    { label: 'On Leave',          value: d?.onLeaveToday,   icon: <Umbrella size={18} />,  variant: 'warning' },
    { label: `WFH ${suffix}`,     value: d?.wfhToday,       icon: <Home size={18} />,      variant: 'info' },
    ...(isToday ? [{ label: 'On Clockify', value: d?.onClockify, icon: <Timer size={18} />, variant: 'success' }] : []),
  ];

  return (
    <div>
      {/* Hero Banner */}
      <div className="rounded-xl p-7 mb-6 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #3525cd 0%, #4f46e5 50%, #712ae2 100%)' }}>
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs font-bold text-white/75 uppercase tracking-widest mb-1.5">{greet}</div>
            <div className="text-2xl font-black text-white tracking-tight">{user?.name?.split(' ')[0]}</div>
            <div className="text-sm text-white/75 mt-1.5">{isToday ? displayDate : `Viewing: ${displayDate}`}</div>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            {!dashDate && <CheckinWidget onRefresh={refetch} />}
            <input type="date"
              className="px-3.5 py-2.5 text-sm rounded-xl font-semibold text-white cursor-pointer"
              style={{ border: '1.5px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.15)', backdropFilter: 'blur(10px)', colorScheme: 'dark' }}
              value={dashDate} max={todayStr()}
              onChange={e => setDashDate(e.target.value)} />
            {dashDate && (
              <button className="btn btn-sm text-white flex items-center gap-1.5"
                style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)' }}
                onClick={() => setDashDate('')}>
                <RefreshCw size={13} /> Today
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 mb-6">
        {statCards.map(c => <StatCard key={c.label} {...c} />)}
      </div>

      {/* Culture & Calendar — moved above attendance */}
      {culture && <CultureSection culture={culture} isAdmin={isAdmin} onRefresh={refetch} />}

      {/* My Stats */}
      {myStats && (
        <div className="mt-6">
          <div className="text-xs font-bold uppercase tracking-widest text-[#464555] mb-4 flex items-center gap-2">
            <span className="w-4 h-0.5 inline-block rounded" style={{ background: 'linear-gradient(90deg, #3525cd, #712ae2)' }} />
            My Stats This Month
            <span className="w-4 h-0.5 inline-block rounded" style={{ background: 'linear-gradient(90deg, #712ae2, #3525cd)' }} />
          </div>
          <div className="grid grid-cols-3 gap-3.5">
            <StatCard icon={<UserCheck size={18} />} value={myStats.presentCount} label="Days Present" variant="success" />
            <StatCard icon={<Umbrella size={18} />}  value={myStats.leavesCount}  label="Leaves Taken" variant="warning" />
            <StatCard icon={<AlarmClock size={18} />} value={myStats.lateCount}   label="Late Entries"  variant="danger" />
          </div>
        </div>
      )}

      {/* Live Attendance + Leave Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 mt-6">
        {/* Attendance */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f3ff]">
            <div>
              <div className="font-black text-[#151c27] flex items-center gap-2">
                {isToday ? <Activity size={16} className="text-[#3525cd]" /> : <BarChart2 size={16} className="text-[#3525cd]" />}
                {isToday ? 'Live Attendance' : 'Attendance'}
              </div>
              <div className="text-xs text-[#777587] mt-0.5">{displayDate}</div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => navigate('/calendar')}>
              <Calendar size={13} /> Calendar
            </button>
          </div>
          <div className="p-5">
            {(d?.recentActivity || []).length === 0 ? (
              <div className="empty-state">
                <Inbox size={36} className="mx-auto mb-2 opacity-30" />
                <p>No activity recorded today</p>
              </div>
            ) : (d?.recentActivity || []).map(r => (
              <div
                key={r.id || r.name}
                className="flex items-center gap-3.5 py-2.5 border-b border-[#f0f3ff] last:border-b-0 hover:bg-[#f0f3ff]/80 rounded-lg px-2 cursor-pointer transition-all duration-150"
                onClick={() => setSelectedEmp(r)}
                title="Click to view details"
              >
                <Avatar name={r.name} color={r.avatar_color} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-[#151c27]">{r.name}</div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    <span className="text-xs text-[#777587]">{r.department}</span>
                    <StatusBadge status={r.status} />
                    {r.is_late       && <StatusBadge status="late" />}
                    {r.is_early_exit && <StatusBadge status="early_exit" />}
                    {r.clockify_live && (
                      <span className="text-[0.65rem] font-bold px-1.5 py-0.5 rounded text-white flex items-center gap-0.5"
                        style={{ background: 'linear-gradient(135deg, #3525cd, #4f46e5)' }}>
                        <Timer size={10} /> Clockify
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {r.check_in   && <div className="text-xs text-[#777587] flex items-center gap-1 justify-end"><Clock size={11} /> {fmtTime(r.check_in)}</div>}
                  {r.work_hours && <div className="text-xs text-[#777587]">{fmtHours(r.work_hours)}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Leave Queue */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f3ff]">
            <div>
              <div className="font-black text-[#151c27] flex items-center gap-2">
                {isAdmin ? <ClipboardList size={16} className="text-[#3525cd]" /> : <Umbrella size={16} className="text-[#3525cd]" />}
                {isAdmin ? 'Leave Requests' : 'My Leaves'}
              </div>
              {isAdmin && <div className="text-xs text-[#777587] mt-0.5">Pending approvals</div>}
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => navigate('/leaves')}>
              <FileText size={13} /> All
            </button>
          </div>
          <div className="p-5">
            {(d?.pendingLeaveList || []).length === 0 ? (
              <div className="empty-state">
                <CheckCircle2 size={36} className="mx-auto mb-2 opacity-30" />
                <p>{isAdmin ? 'No pending requests' : 'No recent leaves'}</p>
              </div>
            ) : (d?.pendingLeaveList || []).map(l => (
              <div key={l.id} className="flex items-start gap-3 py-3 border-b border-[#f0f3ff] last:border-b-0">
                <Avatar name={l.name} color={l.avatar_color} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{l.name}</div>
                  <div className="text-xs text-[#777587] mt-0.5">{fmtDateRange(l.start_date, l.end_date)}</div>
                  {l.reason && <div className="text-xs text-[#777587] italic mt-0.5">"{l.reason}"</div>}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <LeaveTypeBadge type={l.leave_type} />
                    <StatusBadge status={l.status} />
                  </div>
                  {isAdmin && l.status === 'pending' && (
                    <div className="flex gap-1.5 mt-2">
                      <button className="btn btn-success btn-sm py-1 px-2 text-xs" onClick={() => handleApprove(l.id)}><CheckCircle2 size={12} /></button>
                      <button className="btn btn-danger btn-sm py-1 px-2 text-xs"  onClick={() => handleReject(l.id)}><X size={12} /></button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Analytics charts — admin only */}
      {isAdmin && analytics && <AnalyticsSection analytics={analytics} />}

      {/* Employee quick-view modal */}
      {selectedEmp && (
        <EmployeeQuickView
          record={selectedEmp}
          onClose={() => setSelectedEmp(null)}
          onViewProfile={handleViewProfile}
        />
      )}
    </div>
  );
}

// ── Culture Section ───────────────────────────────────────────────────────────
function CultureSection({ culture, isAdmin, onRefresh }) {
  const { birthdaysToday = [], upcomingBirthdays = [], holidays = [], events = [] } = culture;

  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-widest text-[#777587] mb-4">Culture & Calendar</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Birthdays */}
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#f0f3ff]">
            <div className="font-bold text-sm text-[#151c27] flex items-center gap-2">
              <Cake size={16} className="text-[#3525cd]" /> Birthdays
            </div>
            {isAdmin && <ManageBirthdaysBtn onRefresh={onRefresh} />}
          </div>
          <div className="p-4">
            {birthdaysToday.length > 0 && (
              <div className="mb-3">
                <div className="text-[0.7rem] font-bold uppercase text-[#777587] tracking-widest mb-2 flex items-center gap-1.5">
                  <PartyPopper size={11} /> Today
                </div>
                {birthdaysToday.map(u => (
                  <div key={u.id} className="flex items-center gap-2.5 py-2 border-b border-[#f0f3ff] last:border-0">
                    <Avatar name={u.name} color={u.avatar_color} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{u.name}</div>
                      <div className="text-xs text-[#777587]">{u.department}</div>
                    </div>
                    <Cake size={16} className="text-[#8a4cfc] flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}
            {upcomingBirthdays.length > 0 && (
              <div>
                <div className="text-[0.7rem] font-bold uppercase text-[#777587] tracking-widest mb-2">Upcoming (7 days)</div>
                {upcomingBirthdays.map(u => (
                  <div key={u.id} className="flex items-center gap-2.5 py-2 border-b border-[#f0f3ff] last:border-0">
                    <Avatar name={u.name} color={u.avatar_color} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{u.name}</div>
                      <div className="text-xs text-[#777587]">In {u.days_until} day{u.days_until > 1 ? 's' : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {birthdaysToday.length === 0 && upcomingBirthdays.length === 0 && (
              <div className="empty-state" style={{ padding: '12px 0' }}>
                <Cake size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs">No birthdays in the next 7 days</p>
              </div>
            )}
          </div>
        </div>

        {/* Holidays */}
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#f0f3ff]">
            <div className="font-bold text-sm text-[#151c27] flex items-center gap-2">
              <CalendarDays size={16} className="text-[#3525cd]" /> Upcoming Holidays
            </div>
            {isAdmin && <ManageHolidaysBtn onRefresh={onRefresh} />}
          </div>
          <div className="p-4">
            {holidays.length === 0 ? (
              <div className="empty-state" style={{ padding: '12px 0' }}>
                <CalendarDays size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs">No holidays in next 30 days</p>
              </div>
            ) : holidays.map(h => (
              <div key={h.id} className="flex items-center justify-between py-2 border-b border-[#f0f3ff] last:border-0 gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{h.name}</div>
                  <div className="text-xs text-[#777587]">{fmtDate(h.date)}</div>
                </div>
                <span className="text-[0.68rem] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 shrink-0">{h.type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Events */}
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#f0f3ff]">
            <div className="font-bold text-sm text-[#151c27] flex items-center gap-2">
              <CalendarCheck size={16} className="text-[#3525cd]" /> Upcoming Events
            </div>
            {isAdmin && <ManageEventsBtn onRefresh={onRefresh} />}
          </div>
          <div className="p-4">
            {events.length === 0 ? (
              <div className="empty-state" style={{ padding: '12px 0' }}>
                <CalendarCheck size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs">No upcoming events</p>
              </div>
            ) : events.map(ev => (
              <div key={ev.id} className="flex items-start gap-2.5 py-2 border-b border-[#f0f3ff] last:border-0">
                <div className="w-9 h-9 rounded-lg bg-[#f0f3ff] flex items-center justify-center shrink-0">
                  <CalendarCheck size={16} className="text-[#4f46e5]" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{ev.title}</div>
                  <div className="text-xs text-[#777587]">{fmtDate(ev.date)}{ev.end_date && ev.end_date !== ev.date ? ` – ${fmtDate(ev.end_date)}` : ''}</div>
                  {ev.description && <div className="text-xs text-[#777587] truncate">{ev.description}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Manage Birthdays Button ───────────────────────────────────────────────────
function ManageBirthdaysBtn({ onRefresh }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState(null);
  const [search, setSearch] = useState('');

  async function load() {
    const emps = await apiGet('/employees').catch(() => []);
    setEmployees(emps);
    setOpen(true);
  }

  async function saveDob(emp, dob) {
    setSaving(emp.id);
    try {
      await apiPut(`/employees/${emp.id}`, { ...emp, date_of_birth: dob || null });
      setEmployees(es => es.map(e => e.id === emp.id ? { ...e, date_of_birth: dob } : e));
      toast(`Birthday updated for ${emp.name}`, 'success');
      onRefresh?.();
    } catch (err) { toast(err.message, 'error'); }
    finally { setSaving(null); }
  }

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.department || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <button className="btn btn-outline btn-sm text-xs py-1 px-2" onClick={load}>Manage</button>
      {open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-5"
          style={{ background: 'rgba(4,6,14,.65)', backdropFilter: 'blur(14px)' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl border border-[#c7c4d8] overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#f0f3ff] shrink-0">
              <h2 className="font-black text-[#151c27] flex items-center gap-2">
                <Cake size={18} className="text-[#3525cd]" /> Manage Birthdays
              </h2>
              <button className="btn btn-ghost btn-icon text-[#777587]" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <div className="px-6 pt-4 shrink-0">
              <input
                className="form-control"
                placeholder="Search employees…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <p className="text-xs text-[#777587] text-center py-4">No employees found</p>
              ) : filtered.map(emp => (
                <div key={emp.id} className="flex items-center gap-3 py-3 border-b border-[#f0f3ff] last:border-0">
                  <Avatar name={emp.name} color={emp.avatar_color} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{emp.name}</div>
                    <div className="text-xs text-[#777587]">{emp.department || '—'}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="date"
                      className="form-control w-36 text-xs py-1.5"
                      defaultValue={emp.date_of_birth || ''}
                      onBlur={e => {
                        if (e.target.value !== (emp.date_of_birth || '')) {
                          saveDob(emp, e.target.value);
                        }
                      }}
                    />
                    {saving === emp.id && <span className="spinner w-4 h-4 flex-shrink-0" />}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 pb-5 shrink-0 border-t border-[#f0f3ff] pt-4">
              <p className="text-xs text-[#777587]">Changes save automatically when you leave the date field.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Manage Holidays Button ────────────────────────────────────────────────────
function ManageHolidaysBtn({ onRefresh }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [holidays, setHolidays] = useState([]);
  const [form, setForm] = useState({ name: '', date: '', type: 'public', description: '' });
  const [confirmDel, setConfirmDel] = useState(null);

  async function load() { const h = await apiGet('/holidays').catch(() => []); setHolidays(h); setOpen(true); }
  async function add() {
    if (!form.name) return toast('Enter holiday name', 'warning');
    if (!form.date) return toast('Select a date', 'warning');
    try {
      await apiPost('/holidays', form);
      toast('Holiday added!', 'success');
      const h = await apiGet('/holidays'); setHolidays(h);
      setForm({ name: '', date: '', type: 'public', description: '' });
      onRefresh?.();
    } catch (err) { toast(err.message, 'error'); }
  }
  async function del(id) {
    try { await apiDelete(`/holidays/${id}`); setHolidays(h => h.filter(x => x.id !== id)); toast('Deleted', 'info'); onRefresh?.(); }
    catch (err) { toast(err.message, 'error'); }
  }

  return (
    <>
      <button className="btn btn-outline btn-sm text-xs py-1 px-2" onClick={load}>Manage</button>
      {open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-5" style={{ background: 'rgba(4,6,14,.65)', backdropFilter: 'blur(14px)' }} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl border border-[#c7c4d8] overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#f0f3ff] shrink-0">
              <h2 className="font-black text-[#151c27] flex items-center gap-2"><CalendarDays size={18} className="text-[#3525cd]" /> Manage Holidays</h2>
              <button className="btn btn-ghost btn-icon text-[#777587]" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="mb-5">
                <div className="text-xs font-bold uppercase text-[#777587] tracking-widest mb-3">Add New Holiday</div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div><label className="form-label">Name</label><input className="form-control" placeholder="e.g. Diwali" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div><label className="form-label">Date</label><input type="date" className="form-control" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div><label className="form-label">Type</label><select className="form-control" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}><option value="public">Public</option><option value="optional">Optional</option><option value="restricted">Restricted</option></select></div>
                  <div><label className="form-label">Description</label><input className="form-control" placeholder="Optional" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={add}>Add Holiday</button>
              </div>
              <div className="border-t border-[#f0f3ff] pt-4">
                <div className="text-xs font-bold uppercase text-[#777587] tracking-widest mb-3">All Holidays</div>
                {holidays.length === 0 ? <p className="text-xs text-[#777587]">No holidays added yet.</p> : holidays.map(h => (
                  <div key={h.id} className="flex items-center justify-between py-2 border-b border-[#f0f3ff] last:border-0 gap-2">
                    <div><div className="text-sm font-semibold">{h.name}</div><div className="text-xs text-[#777587]">{fmtDate(h.date)} · {h.type}</div></div>
                    <button className="btn btn-danger btn-sm text-xs py-1 px-2" onClick={() => setConfirmDel(h)}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal
        open={!!confirmDel}
        title="Delete Holiday"
        message={`Delete "${confirmDel?.name}"? This will also remove it from Google Calendar.`}
        confirmLabel="Delete"
        onConfirm={() => del(confirmDel.id)}
        onCancel={() => setConfirmDel(null)}
      />
    </>
  );
}

function ManageEventsBtn({ onRefresh }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState({ title: '', date: '', end_date: '', description: '' });
  const [confirmDel, setConfirmDel] = useState(null);

  async function load() { const ev = await apiGet('/events').catch(() => []); setEvents(ev); setOpen(true); }
  async function add() {
    if (!form.title) return toast('Enter event title', 'warning');
    if (!form.date)  return toast('Select a date', 'warning');
    try {
      await apiPost('/events', { ...form, end_date: form.end_date || null });
      toast('Event added!', 'success');
      const ev = await apiGet('/events'); setEvents(ev);
      setForm({ title: '', date: '', end_date: '', description: '' });
      onRefresh?.();
    } catch (err) { toast(err.message, 'error'); }
  }
  async function del(id) {
    try { await apiDelete(`/events/${id}`); setEvents(ev => ev.filter(x => x.id !== id)); toast('Deleted', 'info'); onRefresh?.(); }
    catch (err) { toast(err.message, 'error'); }
  }

  return (
    <>
      <button className="btn btn-outline btn-sm text-xs py-1 px-2" onClick={load}>Manage</button>
      {open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-5" style={{ background: 'rgba(4,6,14,.65)', backdropFilter: 'blur(14px)' }} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl border border-[#c7c4d8] overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#f0f3ff] shrink-0">
              <h2 className="font-black text-[#151c27] flex items-center gap-2"><CalendarCheck size={18} className="text-[#3525cd]" /> Manage Events</h2>
              <button className="btn btn-ghost btn-icon text-[#777587]" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="mb-5">
                <div className="text-xs font-bold uppercase text-[#777587] tracking-widest mb-3">Add New Event</div>
                <div className="mb-3"><label className="form-label">Title</label><input className="form-control" placeholder="e.g. Team Building Day" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div><label className="form-label">Start Date</label><input type="date" className="form-control" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
                  <div><label className="form-label">End Date (optional)</label><input type="date" className="form-control" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} /></div>
                </div>
                <div className="mb-3"><label className="form-label">Description</label><input className="form-control" placeholder="Optional" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
                <button className="btn btn-primary btn-sm" onClick={add}>Add Event</button>
              </div>
              <div className="border-t border-[#f0f3ff] pt-4">
                <div className="text-xs font-bold uppercase text-[#777587] tracking-widest mb-3">All Events</div>
                {events.length === 0 ? <p className="text-xs text-[#777587]">No events added yet.</p> : events.map(ev => (
                  <div key={ev.id} className="flex items-start justify-between py-2 border-b border-[#f0f3ff] last:border-0 gap-2">
                    <div><div className="text-sm font-semibold">{ev.title}</div><div className="text-xs text-[#777587]">{fmtDate(ev.date)}{ev.end_date && ev.end_date !== ev.date ? ` – ${fmtDate(ev.end_date)}` : ''}</div></div>
                    <button className="btn btn-danger btn-sm text-xs py-1 px-2 shrink-0" onClick={() => setConfirmDel(ev)}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal
        open={!!confirmDel}
        title="Delete Event"
        message={`Delete "${confirmDel?.title}"? This will also remove it from Google Calendar.`}
        confirmLabel="Delete"
        onConfirm={() => del(confirmDel.id)}
        onCancel={() => setConfirmDel(null)}
      />
    </>
  );
}

// ── Analytics Section ─────────────────────────────────────────────────────────
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function AnalyticsSection({ analytics }) {
  const { leaveByStatus = {}, leaveByType = {}, attByStatus = {}, month, year } = analytics;
  const totalLeaves = Object.values(leaveByStatus).reduce((a, b) => a + b, 0);
  const maxType = Math.max(...Object.values(leaveByType), 1);
  const maxAtt  = Math.max(...Object.values(attByStatus), 1);

  return (
    <div className="mt-6">
      <div className="text-xs font-bold uppercase tracking-widest text-[#464555] mb-4 flex items-center gap-2">
        <span className="w-4 h-0.5 inline-block rounded" style={{ background: 'linear-gradient(90deg, #3525cd, #712ae2)' }} />
        Analytics Overview
        <span className="w-4 h-0.5 inline-block rounded" style={{ background: 'linear-gradient(90deg, #712ae2, #3525cd)' }} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Leave Status Distribution */}
        <div className="card p-5">
          <div className="text-xs font-black uppercase text-[#777587] tracking-widest mb-4">Leave Status</div>
          <div className="h-3 rounded-full overflow-hidden flex mb-4" style={{ background: '#f0f3ff' }}>
            {totalLeaves > 0 && [
              ['approved', '#10B981'], ['pending', '#F59E0B'], ['rejected', '#EF4444'], ['cancelled', '#94a3b8'],
            ].map(([key, color]) => leaveByStatus[key] > 0 ? (
              <div key={key} style={{ width: `${(leaveByStatus[key] / totalLeaves) * 100}%`, background: color }} />
            ) : null)}
          </div>
          <div className="space-y-2">
            {[
              ['approved',  '#10B981', 'Approved'],
              ['pending',   '#F59E0B', 'Pending'],
              ['rejected',  '#EF4444', 'Rejected'],
              ['cancelled', '#94a3b8', 'Cancelled'],
            ].map(([key, color, label]) => (
              <div key={key} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="text-[#464555]">{label}</span>
                </div>
                <span className="font-bold text-[#151c27]">{leaveByStatus[key] || 0}</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-xs pt-2 border-t border-[#f0f3ff]">
              <span className="text-[#777587]">Total</span>
              <span className="font-black text-[#151c27]">{totalLeaves}</span>
            </div>
          </div>
        </div>

        {/* Leave by Type */}
        <div className="card p-5">
          <div className="text-xs font-black uppercase text-[#777587] tracking-widest mb-4">Leave by Type</div>
          <div className="space-y-3">
            {Object.entries(leaveByType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <div key={type}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[#464555] capitalize">{type}</span>
                  <span className="font-bold text-[#151c27]">{count}</span>
                </div>
                <div className="h-2 rounded-full bg-[#f0f3ff] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(count / maxType) * 100}%`, background: 'linear-gradient(90deg, #3525cd, #712ae2)' }} />
                </div>
              </div>
            ))}
            {Object.keys(leaveByType).length === 0 && (
              <p className="text-xs text-[#777587] text-center py-4">No leave data yet</p>
            )}
          </div>
        </div>

        {/* Attendance This Month */}
        <div className="card p-5">
          <div className="text-xs font-black uppercase text-[#777587] tracking-widest mb-4">
            Attendance — {MONTH_NAMES[month]} {year}
          </div>
          <div className="space-y-3">
            {[
              ['present',  '#10B981', 'Present'],
              ['on_leave', '#F59E0B', 'On Leave'],
              ['wfh',      '#712ae2', 'WFH'],
              ['half_day', '#4f46e5', 'Half Day'],
              ['absent',   '#EF4444', 'Absent'],
            ].map(([key, color, label]) => {
              const count = attByStatus[key] || 0;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-[#464555]">{label}</span>
                    </div>
                    <span className="font-bold text-[#151c27]">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#f0f3ff] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${(count / maxAtt) * 100}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
