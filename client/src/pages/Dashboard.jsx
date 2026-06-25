import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS,
  ArcElement, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Doughnut, Line, Bar } from 'react-chartjs-2';
import {
  Users, UserCheck, Umbrella, Home, Clock, ClipboardList,
  Cake, CalendarDays, Megaphone, Activity, BarChart2,
  Timer, X, LogIn, LogOut, ExternalLink, Building2, Mail,
  UserPlus, FileText, CheckCircle2, Pencil, RefreshCw, Inbox,
  Trash2, CalendarCheck, PartyPopper, ChevronRight,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge, LeaveTypeBadge } from '@/components/ui/Badge';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { fmtDate, fmtDateRange, fmtTime, fmtHours, todayStr, getGreeting } from '@/lib/utils';

ChartJS.register(
  ArcElement, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Tooltip, Legend, Filler,
);

// ── Shared chart tooltip style ────────────────────────────────────────────────
const tooltipStyle = {
  backgroundColor: 'rgba(255,255,255,0.97)',
  titleColor: '#151c27', bodyColor: '#464555',
  borderColor: '#e7eefe', borderWidth: 1,
  padding: 10, cornerRadius: 8,
  titleFont: { weight: 'bold', size: 12 },
  bodyFont: { size: 12 },
  boxWidth: 10, boxHeight: 10, boxPadding: 4,
};

// ── Date helpers ──────────────────────────────────────────────────────────────
function getWeekNumber(d = new Date()) {
  const date = new Date(d); date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 4 - (date.getDay() || 7));
  const y = new Date(date.getFullYear(), 0, 1);
  return Math.ceil((((date - y) / 86400000) + 1) / 7);
}

function getSeason(month) {
  if (month >= 3 && month <= 5) return 'Spring Season';
  if (month >= 6 && month <= 8) return 'Summer Season';
  if (month >= 9 && month <= 11) return 'Autumn Season';
  return 'Winter Season';
}

function relTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  if (h < 48) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ── Check-in Widget ────────────────────────────────────────────────────────────
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
      setElapsed(hrs > 0 ? `${hrs}h ${min}m` : `${min}m`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [record]);

  async function checkIn() {
    try {
      const { record: r, message } = await apiPost('/attendance/checkin', {});
      setRecord(r); toast(message || 'Checked in!', 'success'); onRefresh?.();
    } catch (err) { toast(err.message, 'error'); }
  }
  async function checkOut() {
    try {
      const { record: r, message } = await apiPost('/attendance/checkout', {});
      setRecord(r); toast(message || 'Checked out!', r.status === 'half_day' ? 'warning' : 'success'); onRefresh?.();
    } catch (err) { toast(err.message, 'error'); }
  }

  if (!record || !record.check_in) {
    return (
      <button onClick={checkIn}
        className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all shadow-sm">
        <Clock size={14} /> Check In
      </button>
    );
  }
  if (!record.check_out) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-white/80 bg-white/15 px-2.5 py-1.5 rounded-lg border border-white/20">
          ⏱ {elapsed}
        </span>
        <button onClick={checkOut}
          className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all shadow-sm">
          <LogOut size={14} /> Check Out
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 bg-white/15 border border-white/20 px-3 py-2 rounded-xl">
      <CheckCircle2 size={14} className="text-emerald-400" />
      <span className="text-sm font-bold text-white">{fmtHours(record.work_hours)}</span>
    </div>
  );
}

// ── Employee Quick View Modal ──────────────────────────────────────────────────
function EmployeeQuickView({ record: r, onClose }) {
  if (!r) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-5"
      style={{ background: 'rgba(4,6,14,.55)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl border border-[#c7c4d8] overflow-hidden">
        <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #3525cd, #4f46e5, #712ae2)' }} />
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
        <div className="p-5 space-y-3">
          <div className="flex flex-col gap-2">
            {r.department && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Building2 size={14} className="text-[#777587]" /> {r.department}
              </div>
            )}
            {r.email && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Mail size={14} className="text-[#777587]" /> {r.email}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={r.status} />
            {r.clockify_live && (
              <span className="text-[0.65rem] font-bold px-1.5 py-0.5 rounded text-white flex items-center gap-0.5"
                style={{ background: 'linear-gradient(135deg, #3525cd, #4f46e5)' }}>
                <Timer size={10} /> Clockify Live
              </span>
            )}
          </div>
          <div className="rounded-xl border border-[#c7c4d8] bg-[#f0f3ff] divide-y divide-[#e7eefe]">
            {r.check_in && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs text-[#464555]"><LogIn size={13} className="text-emerald-500" /> Check In</div>
                <span className="text-sm font-bold text-[#151c27]">{fmtTime(r.check_in)}</span>
              </div>
            )}
            {r.check_out && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs text-[#464555]"><LogOut size={13} className="text-rose-500" /> Check Out</div>
                <span className="text-sm font-bold text-[#151c27]">{fmtTime(r.check_out)}</span>
              </div>
            )}
            {(r.clockify_hours > 0 || r.work_hours > 0) && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs text-[#464555]"><Timer size={13} className="text-[#4f46e5]" /> Work Hours</div>
                <span className="text-sm font-bold text-[#3525cd]">{fmtHours(r.clockify_hours > 0 ? r.clockify_hours : r.work_hours)}</span>
              </div>
            )}
            {!r.check_in && <div className="px-4 py-3 text-xs text-[#777587] text-center">No attendance recorded today</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Manage Birthdays Modal ────────────────────────────────────────────────────
function ManageBirthdaysBtn({ onRefresh }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState(null);
  const [search, setSearch] = useState('');

  async function load() {
    const emps = await apiGet('/employees').catch(() => []);
    setEmployees(emps); setOpen(true);
  }
  async function saveDob(emp, dob) {
    setSaving(emp.id);
    try {
      await apiPut(`/employees/${emp.id}`, { ...emp, date_of_birth: dob || null });
      setEmployees(es => es.map(e => e.id === emp.id ? { ...e, date_of_birth: dob } : e));
      toast(`Birthday updated for ${emp.name}`, 'success'); onRefresh?.();
    } catch (err) { toast(err.message, 'error'); }
    finally { setSaving(null); }
  }

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.department || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <button className="text-xs font-bold text-[#3525cd] hover:text-[#4f46e5] px-2 py-1 rounded-lg hover:bg-[#f0f3ff] transition-colors" onClick={load}>Manage</button>
      {open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-5"
          style={{ background: 'rgba(4,6,14,.65)', backdropFilter: 'blur(14px)' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl border border-[#c7c4d8] overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#f0f3ff] shrink-0">
              <h2 className="font-black text-[#151c27] flex items-center gap-2"><Cake size={18} className="text-[#3525cd]" /> Manage Birthdays</h2>
              <button className="btn btn-ghost btn-icon text-[#777587]" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <div className="px-6 pt-4 shrink-0">
              <input className="form-control" placeholder="Search employees…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {filtered.map(emp => (
                <div key={emp.id} className="flex items-center gap-3 py-3 border-b border-[#f0f3ff] last:border-0">
                  <Avatar name={emp.name} color={emp.avatar_color} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{emp.name}</div>
                    <div className="text-xs text-[#777587]">{emp.department || '—'}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input type="date" className="form-control w-36 text-xs py-1.5" defaultValue={emp.date_of_birth || ''}
                      onBlur={e => { if (e.target.value !== (emp.date_of_birth || '')) saveDob(emp, e.target.value); }} />
                    {saving === emp.id && <span className="spinner w-4 h-4 flex-shrink-0" />}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 pb-5 shrink-0 border-t border-[#f0f3ff] pt-4">
              <p className="text-xs text-[#777587]">Changes save automatically on blur.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Manage Holidays Modal ─────────────────────────────────────────────────────
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
      setForm({ name: '', date: '', type: 'public', description: '' }); onRefresh?.();
    } catch (err) { toast(err.message, 'error'); }
  }
  async function del(id) {
    try { await apiDelete(`/holidays/${id}`); setHolidays(h => h.filter(x => x.id !== id)); toast('Deleted', 'info'); onRefresh?.(); }
    catch (err) { toast(err.message, 'error'); }
  }

  return (
    <>
      <button className="text-xs font-bold text-[#3525cd] hover:text-[#4f46e5] px-2 py-1 rounded-lg hover:bg-[#f0f3ff] transition-colors" onClick={load}>Manage</button>
      {open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-5" style={{ background: 'rgba(4,6,14,.65)', backdropFilter: 'blur(14px)' }} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl border border-[#c7c4d8] overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#f0f3ff] shrink-0">
              <h2 className="font-black text-[#151c27] flex items-center gap-2"><CalendarDays size={18} className="text-[#3525cd]" /> Manage Holidays</h2>
              <button className="btn btn-ghost btn-icon text-[#777587]" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className="form-label">Name</label><input className="form-control" placeholder="e.g. Diwali" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div><label className="form-label">Date</label><input type="date" className="form-control" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
                <div><label className="form-label">Type</label>
                  <select className="form-control" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="public">Public</option><option value="optional">Optional</option><option value="restricted">Restricted</option>
                  </select>
                </div>
                <div><label className="form-label">Description</label><input className="form-control" placeholder="Optional" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              </div>
              <button className="btn btn-primary btn-sm mb-5" onClick={add}>Add Holiday</button>
              <div className="border-t border-[#f0f3ff] pt-4">
                {holidays.map(h => (
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
      <ConfirmModal open={!!confirmDel} title="Delete Holiday" message={`Delete "${confirmDel?.name}"?`} confirmLabel="Delete"
        onConfirm={() => del(confirmDel.id)} onCancel={() => setConfirmDel(null)} />
    </>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const toast    = useToast();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const [dashDate, setDashDate]   = useState('');
  const [selectedEmp, setSelectedEmp] = useState(null);

  const qs = dashDate ? { date: dashDate } : {};
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard', dashDate],
    queryFn: async () => {
      await apiPost('/attendance/cleanup-orphaned', {}).catch(() => {});
      const [d, culture] = await Promise.all([
        apiGet('/dashboard', qs),
        apiGet('/culture').catch(() => ({ birthdaysToday: [], upcomingBirthdays: [], holidays: [], events: [] })),
      ]);
      return { d, culture };
    },
    retry: 1,
  });

  const { data: analytics } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => apiGet('/analytics').catch(() => null),
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const { data: announcements } = useQuery({
    queryKey: ['announcements-dash'],
    queryFn: () => apiGet('/announcements').catch(() => []),
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const { d, culture } = data || {};
  const isToday = d?.isToday ?? true;
  const now = new Date();
  const weekNum = getWeekNumber(now);
  const season  = getSeason(now.getMonth());
  const displayDate = d?.today
    ? new Date(d.today + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  async function handleApprove(id) {
    try { await apiPut(`/leaves/${id}/approve`, {}); toast('Leave approved', 'success'); refetch(); }
    catch (err) { toast(err.message, 'error'); }
  }
  async function handleReject(id) {
    try { await apiPut(`/leaves/${id}/reject`, {}); toast('Leave rejected', 'warning'); refetch(); }
    catch (err) { toast(err.message, 'error'); }
  }

  if (isLoading) return <div className="loading"><span className="spinner" /> Loading…</div>;
  if (isError) return (
    <div className="card p-8 text-center">
      <div className="text-rose-600 font-bold mb-2">Dashboard failed to load</div>
      <div className="text-sm text-[#777587] mb-4">{error?.message}</div>
      <button className="btn btn-primary btn-sm" onClick={() => refetch()}>Retry</button>
    </div>
  );

  // KPI data
  const total   = d?.totalEmployees ?? 0;
  const present = d?.presentToday   ?? 0;
  const onLeave = d?.onLeaveToday   ?? 0;
  const wfh     = d?.wfhToday       ?? 0;
  const checked = d?.checkedInToday ?? 0;
  const pending = d?.pendingLeaves  ?? 0;
  const newThis = d?.newThisMonth   ?? 0;

  const pct = v => total > 0 ? `${Math.round((v / total) * 100)}% of total` : '—';

  const kpiCards = [
    { label: 'Total Employees',    value: total,   hint: newThis > 0 ? `↑${newThis} this month` : 'No new this month', hintGreen: newThis > 0, icon: <Users size={16} />,     iconBg: 'bg-[#f0f3ff] text-[#3525cd]',   onClick: () => navigate('/employees') },
    { label: 'Present Today',      value: present, hint: pct(present),  hintGreen: false, icon: <UserCheck size={16} />, iconBg: 'bg-emerald-50 text-emerald-600',  onClick: () => navigate('/attendance') },
    { label: 'On Leave',           value: onLeave, hint: pct(onLeave),  hintGreen: false, icon: <Umbrella size={16} />,  iconBg: 'bg-amber-50 text-amber-600',     onClick: () => navigate('/leaves') },
    { label: 'WFH Today',          value: wfh,     hint: pct(wfh),      hintGreen: false, icon: <Home size={16} />,      iconBg: 'bg-indigo-50 text-indigo-600',   onClick: () => navigate('/leaves') },
    { label: 'Checked In',         value: checked, hint: pct(checked),  hintGreen: false, icon: <Clock size={16} />,     iconBg: 'bg-emerald-50 text-emerald-500', onClick: () => navigate('/attendance') },
    { label: 'Pending Approvals',  value: pending, hint: pending === 0 ? 'No pending' : 'Needs attention', hintGreen: false, alert: pending > 0,
      icon: <ClipboardList size={16} />, iconBg: pending > 0 ? 'bg-rose-50 text-rose-500' : 'bg-slate-50 text-slate-500', onClick: () => navigate('/leaves') },
  ];

  const { birthdaysToday = [], upcomingBirthdays = [], holidays = [] } = culture || {};
  const allBirthdays = [...birthdaysToday, ...upcomingBirthdays];
  const latestAnnouncement = (announcements || [])[0];

  return (
    <div className="space-y-5">

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl relative overflow-hidden shadow-md"
        style={{ background: 'linear-gradient(135deg, #1e1b5e 0%, #3525cd 40%, #6d28d9 75%, #9333ea 100%)' }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 40%, rgba(255,255,255,.12) 0%, transparent 50%)' }} />

        <div className="relative px-7 pt-6 pb-5">
          <div className="flex flex-col lg:flex-row lg:items-start gap-4">
            <div className="flex-1">
              <h1 className="text-2xl font-black text-white tracking-tight">
                {getGreeting()}, {user?.name?.split(' ')[0]}! 👋
              </h1>
              <p className="text-white/70 text-sm mt-1">Here's what's happening in your organization today.</p>
              <div className="flex flex-wrap gap-3 mt-4">
                {!dashDate && <CheckinWidget onRefresh={refetch} />}
                <input type="date" className="px-3 py-2.5 text-sm rounded-xl font-semibold text-white cursor-pointer"
                  style={{ border: '1.5px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.15)', backdropFilter: 'blur(10px)', colorScheme: 'dark' }}
                  value={dashDate} max={todayStr()} onChange={e => setDashDate(e.target.value)} />
                {dashDate && (
                  <button className="flex items-center gap-1.5 text-white text-sm font-bold px-3 py-2 rounded-xl"
                    style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)' }}
                    onClick={() => setDashDate('')}>
                    <RefreshCw size={13} /> Today
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Date / Week / Season bar */}
          <div className="flex items-center gap-4 mt-5 pt-4 border-t border-white/10 flex-wrap">
            <span className="flex items-center gap-1.5 text-white/70 text-xs font-semibold">
              <CalendarDays size={12} /> {displayDate || new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
            <span className="text-white/30">|</span>
            <span className="text-white/70 text-xs font-semibold">📅 Week {weekNum}</span>
            <span className="text-white/30">|</span>
            <span className="text-white/70 text-xs font-semibold">✨ {season}</span>
          </div>
        </div>
      </div>

      {/* ── 6 KPI CARDS ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map((card, i) => (
          <div key={i} onClick={card.onClick}
            className={`bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-4 transition-all duration-200 hover:shadow-md hover:border-[#3525cd]/30 hover:-translate-y-0.5 ${card.onClick ? 'cursor-pointer' : ''}`}>
            <div className="flex items-start justify-between mb-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${card.iconBg}`}>{card.icon}</div>
              {card.alert && <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse flex-shrink-0" />}
            </div>
            <p className="text-xl font-black text-[#151c27] leading-tight">{card.value}</p>
            <p className="text-[0.68rem] text-[#777587] mt-0.5 font-medium leading-tight">{card.label}</p>
            {card.hint && (
              <p className={`text-[0.62rem] mt-1 font-semibold ${card.alert ? 'text-rose-500' : card.hintGreen ? 'text-emerald-600' : 'text-[#9ca3af]'}`}>
                {card.hint}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* ── BIRTHDAYS + HOLIDAYS + ANNOUNCEMENTS ─────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Birthdays */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e7eefe]">
            <h2 className="text-sm font-black text-[#151c27] flex items-center gap-2">
              <Cake size={14} className="text-[#3525cd]" /> Birthdays
            </h2>
            {isAdmin && <ManageBirthdaysBtn onRefresh={refetch} />}
          </div>
          <div className="p-5">
            {allBirthdays.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 gap-2 text-center">
                <Cake size={28} className="text-[#c7c4d8]" />
                <p className="text-xs text-[#777587]">No birthdays in the next 7 days</p>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="flex -space-x-2.5 flex-shrink-0">
                  {allBirthdays.slice(0, 4).map((u, i) => (
                    <div key={u.id} style={{ zIndex: 4 - i }}>
                      <Avatar name={u.name} color={u.avatar_color} size={36} className="ring-2 ring-white" />
                    </div>
                  ))}
                  {allBirthdays.length > 4 && (
                    <div className="w-9 h-9 rounded-full bg-[#f0f3ff] border-2 border-white flex items-center justify-center text-[0.65rem] font-black text-[#3525cd] z-0">
                      +{allBirthdays.length - 4}
                    </div>
                  )}
                </div>
                <div>
                  {birthdaysToday.length > 0 && (
                    <p className="text-sm font-bold text-[#151c27]">🎂 {birthdaysToday.length} birthday{birthdaysToday.length > 1 ? 's' : ''} today!</p>
                  )}
                  <p className="text-xs text-[#777587]">
                    {allBirthdays.length} birthday{allBirthdays.length > 1 ? 's' : ''} in next 7 days
                  </p>
                  {allBirthdays.slice(0, 2).map(u => (
                    <p key={u.id} className="text-[0.65rem] text-[#9ca3af] truncate">{u.name}{u.days_until != null ? ` · in ${u.days_until}d` : ' · today'}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Holidays */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e7eefe]">
            <h2 className="text-sm font-black text-[#151c27] flex items-center gap-2">
              <CalendarDays size={14} className="text-[#3525cd]" /> Upcoming Holidays
            </h2>
            {isAdmin && <ManageHolidaysBtn onRefresh={refetch} />}
          </div>
          <div className="divide-y divide-[#f9f9ff]">
            {holidays.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
                <CalendarDays size={24} className="text-[#c7c4d8]" />
                <p className="text-xs text-[#777587]">No holidays in next 30 days</p>
              </div>
            ) : (
              <>
                {holidays.slice(0, 2).map(h => (
                  <div key={h.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                        <CalendarDays size={13} className="text-amber-500" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#151c27]">{h.name}</p>
                        <p className="text-[0.62rem] text-[#9ca3af]">{fmtDate(h.date)}</p>
                      </div>
                    </div>
                    <span className="text-[0.62rem] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 capitalize flex-shrink-0">{h.type}</span>
                  </div>
                ))}
                {holidays.length > 2 && (
                  <div className="px-5 py-2.5 cursor-pointer hover:bg-[#f9f9ff] transition-colors" onClick={() => navigate('/holidays')}>
                    <p className="text-xs font-bold text-[#3525cd]">+{holidays.length - 2} more →</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Announcements */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e7eefe]">
            <h2 className="text-sm font-black text-[#151c27] flex items-center gap-2">
              <Megaphone size={14} className="text-[#3525cd]" /> Announcements
            </h2>
            <button onClick={() => navigate('/announcements')}
              className="text-xs font-bold text-[#3525cd] hover:text-[#4f46e5] px-2 py-1 rounded-lg hover:bg-[#f0f3ff] transition-colors">
              View all
            </button>
          </div>
          <div className="p-5">
            {!latestAnnouncement ? (
              <div className="flex flex-col items-center justify-center py-4 gap-2 text-center">
                <Megaphone size={24} className="text-[#c7c4d8]" />
                <p className="text-xs text-[#777587]">No announcements yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(announcements || []).slice(0, 2).map(a => (
                  <div key={a.id} className="flex items-start gap-3 cursor-pointer hover:bg-[#f9f9ff] -mx-2 px-2 py-2 rounded-lg transition-colors"
                    onClick={() => navigate('/announcements')}>
                    <div className="w-8 h-8 rounded-lg bg-[#f0f3ff] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Megaphone size={13} className="text-[#3525cd]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#151c27] truncate">{a.title}</p>
                      <p className="text-[0.62rem] text-[#9ca3af] mt-0.5">
                        By {a.created_by_name || 'Admin'} · {relTime(a.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── LIVE ATTENDANCE + LEAVE REQUESTS + QUICK ACTIONS ─────────────────── */}
      <div className="grid lg:grid-cols-[1fr_300px_260px] gap-4">

        {/* Live Attendance */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e7eefe]">
            <div>
              <h2 className="text-sm font-black text-[#151c27] flex items-center gap-2">
                {isToday ? <Activity size={14} className="text-[#3525cd]" /> : <BarChart2 size={14} className="text-[#3525cd]" />}
                {isToday ? 'Live Attendance' : 'Attendance'}
              </h2>
              <p className="text-[0.65rem] text-[#9ca3af] mt-0.5">
                {isToday ? `Today · ${displayDate}` : displayDate}
              </p>
            </div>
            <button onClick={() => navigate('/calendar')}
              className="flex items-center gap-1.5 text-xs font-bold text-[#3525cd] border border-[#c7c4d8] px-3 py-1.5 rounded-lg hover:bg-[#f0f3ff] transition-colors">
              <CalendarDays size={12} /> View Calendar
            </button>
          </div>

          <div className="divide-y divide-[#f9f9ff]">
            {(d?.recentActivity || []).length === 0 ? (
              <div className="py-12 text-center">
                <Inbox size={32} className="mx-auto mb-2 text-[#c7c4d8]" />
                <p className="text-sm text-[#777587]">No activity recorded today</p>
              </div>
            ) : (d?.recentActivity || []).map(r => (
              <div key={r.id || r.name} className="flex items-center gap-3.5 px-5 py-3 hover:bg-[#fafaff] cursor-pointer transition-colors"
                onClick={() => setSelectedEmp(r)}>
                <Avatar name={r.name} color={r.avatar_color} size={34} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-[#151c27]">{r.name}</div>
                  <div className="text-[0.65rem] text-[#9ca3af]">{r.department}</div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <StatusBadge status={r.status} />
                  {r.clockify_live && (
                    <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded text-white flex items-center gap-0.5"
                      style={{ background: 'linear-gradient(135deg, #3525cd, #4f46e5)' }}>
                      <Timer size={9} /> Clockify
                    </span>
                  )}
                </div>
                <div className="text-right flex-shrink-0 min-w-[70px]">
                  {r.check_in && (
                    <div className="text-xs font-bold text-[#151c27] flex items-center gap-1 justify-end">
                      <Clock size={10} /> {fmtTime(r.check_in)}
                    </div>
                  )}
                  {r.check_in && (
                    <div className="text-[0.6rem] text-[#9ca3af]">{r.is_late ? 'Late' : 'On time'}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 py-3 border-t border-[#e7eefe]">
            <button onClick={() => navigate('/attendance')}
              className="text-xs font-bold text-[#3525cd] hover:text-[#4f46e5] flex items-center gap-1 transition-colors">
              View all attendance <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {/* Leave Requests */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e7eefe]">
            <div>
              <h2 className="text-sm font-black text-[#151c27] flex items-center gap-2">
                <ClipboardList size={14} className="text-amber-500" />
                {isAdmin ? 'Leave Requests' : 'My Leaves'}
              </h2>
              {isAdmin && <p className="text-[0.65rem] text-[#9ca3af] mt-0.5">Pending approvals</p>}
            </div>
            <button onClick={() => navigate('/leaves')}
              className="text-xs font-bold text-[#3525cd] hover:text-[#4f46e5] px-2 py-1 rounded-lg hover:bg-[#f0f3ff] transition-colors">
              View all
            </button>
          </div>

          <div className="divide-y divide-[#f0f3ff]">
            {(d?.pendingLeaveList || []).length === 0 ? (
              <div className="py-12 text-center px-4">
                <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 size={22} className="text-emerald-500" />
                </div>
                <p className="text-sm font-semibold text-[#151c27]">No pending requests</p>
                <p className="text-xs text-[#777587] mt-1">All leave requests have been reviewed.</p>
              </div>
            ) : (d?.pendingLeaveList || []).map(l => (
              <div key={l.id} className="flex items-start gap-2.5 px-4 py-3">
                <Avatar name={l.name} color={l.avatar_color} size={30} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-[#151c27]">{l.name}</div>
                  <div className="text-[0.62rem] text-[#9ca3af] mt-0.5">{fmtDateRange(l.start_date, l.end_date)}</div>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <LeaveTypeBadge type={l.leave_type} />
                  </div>
                  {isAdmin && l.status === 'pending' && (
                    <div className="flex gap-1.5 mt-2">
                      <button className="flex items-center gap-0.5 px-2 py-1 rounded text-[0.62rem] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-all"
                        onClick={() => handleApprove(l.id)}>
                        <CheckCircle2 size={10} /> Approve
                      </button>
                      <button className="flex items-center gap-0.5 px-2 py-1 rounded text-[0.62rem] font-bold bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition-all"
                        onClick={() => handleReject(l.id)}>
                        <X size={10} /> Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e7eefe]">
            <h2 className="text-sm font-black text-[#151c27]">Quick Actions</h2>
          </div>
          <div className="p-4 grid grid-cols-2 gap-2.5">
            {[
              { label: 'Add Employee',        icon: <UserPlus size={15} />,      color: 'text-[#3525cd] bg-[#f0f3ff]',   onClick: () => navigate('/employees') },
              { label: 'Apply Leave',         icon: <Umbrella size={15} />,      color: 'text-emerald-600 bg-emerald-50', onClick: () => navigate('/leaves') },
              { label: 'Mark Attendance',     icon: <UserCheck size={15} />,     color: 'text-amber-600 bg-amber-50',    onClick: () => navigate('/attendance') },
              { label: 'Regularization',      icon: <Pencil size={15} />,        color: 'text-orange-600 bg-orange-50',  onClick: () => navigate('/regularization') },
              { label: 'Announcement',        icon: <Megaphone size={15} />,     color: 'text-purple-600 bg-purple-50',  onClick: () => navigate('/announcements') },
              { label: 'View Reports',        icon: <BarChart2 size={15} />,     color: 'text-sky-600 bg-sky-50',        onClick: () => navigate('/reports') },
              { label: 'Assign Shift',        icon: <Clock size={15} />,         color: 'text-indigo-600 bg-indigo-50',  onClick: () => navigate('/shifts') },
              { label: 'Holidays',            icon: <CalendarDays size={15} />,  color: 'text-rose-600 bg-rose-50',      onClick: () => navigate('/holidays') },
            ].map((action, i) => (
              <button key={i} onClick={action.onClick}
                className="flex flex-col items-center gap-2 p-3 rounded-xl border border-[#e7eefe] hover:border-[#3525cd]/30 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-150 text-center bg-white">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${action.color}`}>{action.icon}</div>
                <span className="text-[0.62rem] font-bold text-[#464555] leading-tight">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── ANALYTICS (admin only) ────────────────────────────────────────────── */}
      {isAdmin && analytics && <AnalyticsSection analytics={analytics} navigate={navigate} />}

      {/* Employee quick-view modal */}
      {selectedEmp && <EmployeeQuickView record={selectedEmp} onClose={() => setSelectedEmp(null)} />}
    </div>
  );
}

// ── Analytics Section ─────────────────────────────────────────────────────────
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const hoverCursor = (event, elements) => {
  const t = event.native?.target;
  if (t) t.style.cursor = elements.length > 0 ? 'pointer' : 'default';
};

function AnalyticsSection({ analytics, navigate }) {
  const { leaveByStatus = {}, leaveByType = {}, attByStatus = {}, month, year, weeklyTrend = [] } = analytics;

  // Leave Status doughnut
  const statusData = [
    { label: 'Approved',  key: 'approved',  color: '#10b981' },
    { label: 'Pending',   key: 'pending',   color: '#f59e0b' },
    { label: 'Rejected',  key: 'rejected',  color: '#ef4444' },
    { label: 'Cancelled', key: 'cancelled', color: '#94a3b8' },
  ].map(s => ({ ...s, value: leaveByStatus[s.key] || 0 }));
  const totalLeaves = statusData.reduce((a, b) => a + b.value, 0);

  const leaveStatusChart = {
    labels: statusData.map(s => s.label),
    datasets: [{ data: statusData.map(s => s.value), backgroundColor: statusData.map(s => s.color), borderWidth: 3, borderColor: '#fff', hoverBorderWidth: 3, hoverBorderColor: '#fff', hoverOffset: 5 }],
  };
  const leaveStatusOptions = {
    cutout: '72%', maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { ...tooltipStyle, callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} (${totalLeaves > 0 ? Math.round((ctx.parsed / totalLeaves) * 100) : 0}%)` } } },
    onClick: (_, els) => { if (els.length > 0) navigate(`/leaves?status=${statusData[els[0].index]?.key}`); },
    onHover: hoverCursor,
  };

  // Leave By Type doughnut
  const TYPE_COLORS = { casual: '#10b981', sick: '#ef4444', annual: '#3525cd', emergency: '#f59e0b', wfh: '#6366f1', other: '#8b5cf6' };
  const typeSegs = Object.entries(leaveByType).map(([key, value]) => ({ key, value, color: TYPE_COLORS[key] || '#94a3b8', label: key.charAt(0).toUpperCase() + key.slice(1) }));
  const totalTypes = typeSegs.reduce((a, b) => a + b.value, 0);

  const leaveTypeChart = {
    labels: typeSegs.map(s => s.label),
    datasets: [{ data: typeSegs.map(s => s.value), backgroundColor: typeSegs.map(s => s.color), borderWidth: 3, borderColor: '#fff', hoverBorderWidth: 3, hoverBorderColor: '#fff', hoverOffset: 5 }],
  };
  const leaveTypeOptions = {
    cutout: '72%', maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { ...tooltipStyle, callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} (${totalTypes > 0 ? Math.round((ctx.parsed / totalTypes) * 100) : 0}%)` } } },
    onClick: (_, els) => { if (els.length > 0) navigate(`/leaves?type=${typeSegs[els[0].index]?.key}`); },
    onHover: hoverCursor,
  };

  // Attendance this month horizontal bar
  const attRows = [
    { label: 'Present',  key: 'present',  color: '#10b981' },
    { label: 'On Leave', key: 'on_leave', color: '#f59e0b' },
    { label: 'WFH',      key: 'wfh',      color: '#6366f1' },
    { label: 'Half Day', key: 'half_day', color: '#4f46e5' },
    { label: 'Absent',   key: 'absent',   color: '#ef4444' },
  ].map(r => ({ ...r, value: attByStatus[r.key] || 0 }));
  const totalDays = attRows.reduce((a, b) => a + b.value, 0);

  const attChart = {
    labels: attRows.map(r => r.label),
    datasets: [{ label: 'Days', data: attRows.map(r => r.value), backgroundColor: attRows.map(r => r.color), borderRadius: 4, borderSkipped: false }],
  };
  const attOptions = {
    indexAxis: 'y', maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { ...tooltipStyle, callbacks: { label: ctx => ` ${ctx.parsed.x} days (${totalDays > 0 ? Math.round((ctx.parsed.x / totalDays) * 100) : 0}%)` } } },
    scales: {
      x: { grid: { color: '#f0f0f8' }, border: { display: false }, ticks: { font: { size: 10 }, color: '#9ca3af' } },
      y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11, weight: '600' }, color: '#464555' } },
    },
    onClick: (_, els) => { if (els.length > 0) navigate(`/attendance?status=${attRows[els[0].index]?.key}`); },
    onHover: hoverCursor,
  };

  // Weekly Attendance Trend line
  const trendChart = {
    labels: weeklyTrend.map(t => t.label),
    datasets: [{
      label: 'Attendance %',
      data: weeklyTrend.map(t => t.pct),
      fill: true,
      backgroundColor: 'rgba(53, 37, 205, 0.06)',
      borderColor: '#10b981',
      borderWidth: 2.5,
      pointRadius: 4,
      pointBackgroundColor: '#10b981',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointHoverRadius: 6,
      tension: 0.4,
    }],
  };
  const trendOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { ...tooltipStyle, callbacks: { label: ctx => ` ${ctx.parsed.y}% attendance` } },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 }, color: '#9ca3af' } },
      y: { min: 0, max: 100, grid: { color: '#f0f0f8' }, border: { display: false }, ticks: { callback: v => `${v}%`, font: { size: 10 }, color: '#9ca3af', maxTicksLimit: 5 } },
    },
    onClick: () => navigate('/attendance'),
    onHover: (e) => { const t = e.native?.target; if (t) t.style.cursor = 'pointer'; },
  };

  return (
    <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#e7eefe]">
        <h2 className="text-sm font-black text-[#151c27]">Analytics Overview</h2>
        <span className="text-[0.68rem] text-[#9ca3af] font-semibold">Last 7 days</span>
      </div>

      <div className="grid lg:grid-cols-4 gap-0 divide-x divide-[#e7eefe]">

        {/* Leave Status */}
        <div className="p-5">
          <h3 className="text-xs font-bold text-[#777587] uppercase tracking-wide mb-4">Leave Status</h3>
          <div className="relative mx-auto" style={{ height: 160, maxWidth: 160 }}>
            <Doughnut data={leaveStatusChart} options={leaveStatusOptions} />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-black text-[#151c27]">{totalLeaves}</span>
              <span className="text-[0.58rem] text-[#777587] uppercase">Total</span>
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            {statusData.map(s => (
              <button key={s.key} onClick={() => navigate(`/leaves?status=${s.key}`)}
                className="w-full flex items-center justify-between text-xs hover:bg-[#f9f9ff] px-1 py-0.5 rounded transition-colors">
                <span className="flex items-center gap-1.5 font-medium text-[#464555]">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} /> {s.label}
                </span>
                <span className="font-bold text-[#151c27]">{s.value} <span className="text-[#9ca3af] font-normal">({totalLeaves > 0 ? Math.round((s.value / totalLeaves) * 100) : 0}%)</span></span>
              </button>
            ))}
            <div className="flex justify-between text-xs pt-2 border-t border-[#f0f3ff]">
              <span className="text-[#777587]">Total Leaves</span>
              <span className="font-black text-[#151c27]">{totalLeaves}</span>
            </div>
          </div>
        </div>

        {/* Leave By Type */}
        <div className="p-5">
          <h3 className="text-xs font-bold text-[#777587] uppercase tracking-wide mb-4">Leave By Type</h3>
          {typeSegs.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-[#9ca3af]">No data</div>
          ) : (
            <>
              <div className="relative mx-auto" style={{ height: 160, maxWidth: 160 }}>
                <Doughnut data={leaveTypeChart} options={leaveTypeOptions} />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-black text-[#151c27]">{totalTypes}</span>
                  <span className="text-[0.58rem] text-[#777587] uppercase">Total</span>
                </div>
              </div>
              <div className="mt-4 space-y-1.5">
                {typeSegs.map(s => (
                  <button key={s.key} onClick={() => navigate(`/leaves?type=${s.key}`)}
                    className="w-full flex items-center justify-between text-xs hover:bg-[#f9f9ff] px-1 py-0.5 rounded transition-colors">
                    <span className="flex items-center gap-1.5 font-medium text-[#464555]">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} /> {s.label}
                    </span>
                    <span className="font-bold text-[#151c27]">{s.value} <span className="text-[#9ca3af] font-normal">({totalTypes > 0 ? Math.round((s.value / totalTypes) * 100) : 0}%)</span></span>
                  </button>
                ))}
                <div className="flex justify-between text-xs pt-2 border-t border-[#f0f3ff]">
                  <span className="text-[#777587]">Total Leaves</span>
                  <span className="font-black text-[#151c27]">{totalTypes}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Attendance This Month */}
        <div className="p-5">
          <h3 className="text-xs font-bold text-[#777587] uppercase tracking-wide mb-1">Attendance</h3>
          <p className="text-[0.65rem] text-[#9ca3af] mb-4">{MONTH_NAMES[month]} {year} · Click to filter</p>
          {totalDays === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-[#9ca3af]">No data yet</div>
          ) : (
            <div style={{ height: 180 }}>
              <Bar data={attChart} options={attOptions} />
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-[#f0f3ff] flex justify-between text-xs">
            <span className="text-[#777587]">Total Days</span>
            <span className="font-black text-[#151c27]">{totalDays}</span>
          </div>
        </div>

        {/* Weekly Attendance Trend */}
        <div className="p-5">
          <h3 className="text-xs font-bold text-[#777587] uppercase tracking-wide mb-1">Weekly Attendance Trend</h3>
          <p className="text-[0.65rem] text-[#9ca3af] mb-4">Last 7 days · Click to view attendance</p>
          {weeklyTrend.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-[#9ca3af]">No data</div>
          ) : (
            <div style={{ height: 180 }}>
              <Line data={trendChart} options={trendOptions} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
