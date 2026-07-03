import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  ArcElement, BarElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users, UserCheck, ClipboardList, ShieldCheck, CalendarDays,
  Check, X, Clock, TrendingUp, AlertCircle, Building2,
  Activity, Zap, Star, UserPlus, Calendar, CheckCircle2, RefreshCw,
} from 'lucide-react';
import { apiGet, apiPut } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  ArcElement, BarElement, Tooltip, Legend, Filler,
);

// ── Shared chart tooltip style ─────────────────────────────────────────────────
const tooltipDefaults = {
  backgroundColor: 'rgba(255,255,255,0.97)',
  titleColor: '#151c27',
  bodyColor: '#464555',
  borderColor: '#e7eefe',
  borderWidth: 1,
  padding: 10,
  cornerRadius: 8,
  titleFont: { weight: 'bold', size: 12 },
  bodyFont: { size: 12 },
  displayColors: true,
  boxWidth: 10,
  boxHeight: 10,
  boxPadding: 4,
};

const hoverCursor = (event, elements) => {
  const t = event.native?.target;
  if (t) t.style.cursor = elements.length > 0 ? 'pointer' : 'default';
};

// ── Constants ──────────────────────────────────────────────────────────────────
const LEAVE_KEYS = {
  casual:    { label: 'Casual',    color: '#10b981' },
  sick:      { label: 'Sick',      color: '#ef4444' },
  wfh:       { label: 'WFH',       color: '#6366f1' },
  emergency: { label: 'Emergency', color: '#f59e0b' },
  annual:    { label: 'Annual',    color: '#3525cd' },
  other:     { label: 'Other',     color: '#8b5cf6' },
};

const WORKFORCE_STATUS = {
  present:  { label: 'Present',  color: '#10b981', urlStatus: 'present' },
  wfh:      { label: 'WFH',      color: '#3525cd', urlStatus: 'wfh' },
  on_leave: { label: 'On Leave', color: '#f59e0b', urlStatus: 'on_leave' },
  half_day: { label: 'Half Day', color: '#4f46e5', urlStatus: 'half_day' },
  absent:   { label: 'Absent',   color: '#ef4444', urlStatus: 'absent' },
};

const PRIORITY_BADGE = {
  High:   'bg-rose-50 text-rose-600 border-rose-200',
  Medium: 'bg-amber-50 text-amber-600 border-amber-200',
  Low:    'bg-emerald-50 text-emerald-600 border-emerald-200',
};

// ── Utilities ──────────────────────────────────────────────────────────────────
function relTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  if (h < 48) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function fmtDate(ds) {
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function daysUntil(ds) {
  const d = Math.ceil((new Date(ds + 'T12:00:00') - new Date()) / 86400000);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return `In ${d} days`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
}

function fmtUpdatedAt(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// ── Doughnut wrapper (Chart.js + center label) ─────────────────────────────────
function DoughnutChart({ data, options, centerLabel, centerSub }) {
  const total = data.datasets[0]?.data?.reduce((a, b) => a + b, 0) ?? 0;
  return (
    <div className="relative" style={{ height: 180 }}>
      <Doughnut data={data} options={{ ...options, maintainAspectRatio: false }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-black text-[#151c27] leading-none">{centerLabel ?? total}</span>
        <span className="text-[0.62rem] text-[#777587] font-semibold mt-0.5 uppercase tracking-wide">{centerSub ?? 'Total'}</span>
      </div>
    </div>
  );
}

// ── KPI Card Tooltip ───────────────────────────────────────────────────────────
function KpiTooltip({ text, children }) {
  return (
    <div className="relative group/tip">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover/tip:block pointer-events-none">
        <div className="bg-[#151c27] text-white text-[0.65rem] font-medium px-2.5 py-1.5 rounded-lg shadow-xl max-w-[180px] whitespace-normal text-center leading-snug">
          {text}
        </div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-[#151c27]" />
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function RootDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast    = useToast();
  const qc       = useQueryClient();

  const { data, isLoading, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey:        ['root-dashboard'],
    queryFn:         () => apiGet('/root/dashboard'),
    refetchInterval: 60000,
  });

  const { data: yearlyData } = useQuery({
    queryKey:        ['root-yearly-leaves', new Date().getFullYear()],
    queryFn:         () => apiGet('/root/yearly-leaves'),
    refetchInterval: 300000,
  });

  const approveMut = useMutation({
    mutationFn: id => apiPut(`/leaves/${id}/approve`),
    onSuccess:  () => { toast('Leave approved!', 'success'); qc.invalidateQueries({ queryKey: ['root-dashboard'] }); },
    onError:    err => toast(err.message, 'error'),
  });
  const rejectMut = useMutation({
    mutationFn: id => apiPut(`/leaves/${id}/reject`),
    onSuccess:  () => { toast('Leave rejected', 'warning'); qc.invalidateQueries({ queryKey: ['root-dashboard'] }); },
    onError:    err => toast(err.message, 'error'),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><div className="spinner w-8 h-8" /></div>;
  }

  const {
    totalEmployees = 0, totalHR = 0, pendingLeaves = 0, presentToday = 0,
    pendingLeavesData = [], attendanceBreakdown = {}, leavesByType = {},
    attendanceTrend = [], departmentHealth = [], headcountGrowth = [],
    liveActivity = [], actionCenter = [], upcomingEvents = [],
    recentJoiners = [], birthdays = [],
  } = data || {};

  const isBusy       = approveMut.isPending || rejectMut.isPending;
  const onLeaveToday = attendanceBreakdown.on_leave || 0;
  const presentPct   = totalEmployees > 0 ? Math.min(100, Math.round((presentToday / totalEmployees) * 100)) : 0;
  const yearlyEmployees = [...(yearlyData?.employees || [])].sort((a, b) => b.usedDays - a.usedDays);

  // ── Today's Workforce chart data ─────────────────────────────────────────────
  const workforceEntries = Object.entries(WORKFORCE_STATUS)
    .map(([key, cfg]) => ({ ...cfg, key, value: attendanceBreakdown[key] || 0 }))
    .filter(e => e.value > 0);
  const totalWorkforce = workforceEntries.reduce((s, e) => s + e.value, 0);

  const workforceChartData = {
    labels: workforceEntries.map(e => e.label),
    datasets: [{
      data: workforceEntries.map(e => e.value),
      backgroundColor: workforceEntries.map(e => e.color),
      borderWidth: 3,
      borderColor: '#fff',
      hoverBorderWidth: 3,
      hoverBorderColor: '#fff',
      hoverOffset: 6,
    }],
  };

  const workforceOptions = {
    cutout: '70%',
    plugins: {
      legend: { display: false },
      tooltip: { ...tooltipDefaults, callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} employees` } },
    },
    onClick: (event, elements) => {
      if (elements.length > 0) {
        const s = workforceEntries[elements[0].index];
        if (s) navigateWorkforceStatus(s.urlStatus);
      }
    },
    onHover: hoverCursor,
  };

  // ── Leave Breakdown chart data ────────────────────────────────────────────────
  const leaveSegs = Object.entries(LEAVE_KEYS)
    .map(([key, cfg]) => ({ ...cfg, key, value: leavesByType[key] || 0 }))
    .filter(e => e.value > 0);
  const totalLeaveSegs = leaveSegs.reduce((s, e) => s + e.value, 0);

  const leaveChartData = {
    labels: leaveSegs.map(e => e.label),
    datasets: [{
      data: leaveSegs.map(e => e.value),
      backgroundColor: leaveSegs.map(e => e.color),
      borderWidth: 3,
      borderColor: '#fff',
      hoverBorderWidth: 3,
      hoverBorderColor: '#fff',
      hoverOffset: 6,
    }],
  };

  const leaveOptions = {
    cutout: '70%',
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipDefaults,
        callbacks: {
          label: ctx => ` ${ctx.label}: ${ctx.parsed} (${Math.round((ctx.parsed / totalLeaveSegs) * 100)}%)`,
        },
      },
    },
    onClick: (event, elements) => {
      if (elements.length > 0) {
        const seg = leaveSegs[elements[0].index];
        if (seg) navigate(`/root/leaves?type=${seg.key}&status=approved`);
      }
    },
    onHover: hoverCursor,
  };

  // ── Attendance Trend chart data ───────────────────────────────────────────────
  const trendLabels = attendanceTrend.map((t, i) => (i % 7 === 0 || i === attendanceTrend.length - 1) ? t.date.slice(5) : '');

  const trendChartData = {
    labels: attendanceTrend.map(t => t.date),
    datasets: [{
      label: 'Attendance %',
      data: attendanceTrend.map(t => t.pct),
      fill: true,
      backgroundColor: 'rgba(53, 37, 205, 0.07)',
      borderColor: '#3525cd',
      borderWidth: 2.5,
      pointRadius: 0,
      pointHoverRadius: 6,
      pointHoverBackgroundColor: '#3525cd',
      pointHoverBorderColor: '#fff',
      pointHoverBorderWidth: 2,
      tension: 0.4,
    }],
  };

  const trendOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipDefaults,
        callbacks: {
          title: ([ctx]) => {
            const entry = attendanceTrend[ctx.dataIndex];
            return entry ? fmtDate(entry.date) : ctx.label;
          },
          label: ctx => ` ${ctx.parsed.y}% attendance (${attendanceTrend[ctx.dataIndex]?.present ?? 0} present)`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          maxRotation: 0,
          font: { size: 10 },
          color: '#9ca3af',
          callback: (_, i) => trendLabels[i] || null,
        },
      },
      y: {
        min: 0,
        max: 100,
        grid: { color: '#f0f0f8', lineWidth: 1 },
        border: { display: false },
        ticks: {
          callback: v => `${v}%`,
          font: { size: 10 },
          color: '#9ca3af',
          maxTicksLimit: 5,
        },
      },
    },
    onClick: (event, elements) => {
      if (elements.length > 0) {
        const entry = attendanceTrend[elements[0].index];
        if (entry?.date) navigate(`/root/calendar?date=${entry.date}`);
      }
    },
    onHover: hoverCursor,
  };

  // ── Headcount Growth chart data ───────────────────────────────────────────────
  const curMonth = new Date().getMonth();
  const headSlice = headcountGrowth.slice(0, curMonth + 1);

  const headChartData = {
    labels: headSlice.map(h => h.month),
    datasets: [
      {
        label: 'Total Employees',
        data: headSlice.map(h => h.total),
        fill: true,
        backgroundColor: 'rgba(16, 185, 129, 0.07)',
        borderColor: '#10b981',
        borderWidth: 2.5,
        pointRadius: 4,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointHoverRadius: 7,
        tension: 0.4,
      },
      {
        label: 'New Joiners',
        data: headSlice.map(h => h.joined),
        fill: false,
        borderColor: '#3525cd',
        borderWidth: 1.5,
        borderDash: [4, 4],
        pointRadius: 3,
        pointBackgroundColor: '#3525cd',
        pointBorderColor: '#fff',
        pointBorderWidth: 1.5,
        pointHoverRadius: 6,
        tension: 0.4,
      },
    ],
  };

  const headOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: { font: { size: 11 }, color: '#777587', boxWidth: 10, boxHeight: 10, padding: 12 },
      },
      tooltip: {
        ...tooltipDefaults,
        callbacks: {
          label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { font: { size: 11 }, color: '#9ca3af' },
      },
      y: {
        grid: { color: '#f0f0f8' },
        border: { display: false },
        ticks: { font: { size: 10 }, color: '#9ca3af', maxTicksLimit: 5 },
      },
    },
    onClick: () => navigate('/root/employees?role=employee'),
    onHover: (event) => {
      const t = event.native?.target;
      if (t) t.style.cursor = 'pointer';
    },
  };

  // ── Department Health bar chart ───────────────────────────────────────────────
  const deptColors = departmentHealth.map(d =>
    d.attendancePct >= 90 ? 'rgba(16,185,129,0.85)' :
    d.attendancePct >= 70 ? 'rgba(245,158,11,0.85)' :
    'rgba(239,68,68,0.85)'
  );
  const deptHoverColors = departmentHealth.map(d =>
    d.attendancePct >= 90 ? '#10b981' : d.attendancePct >= 70 ? '#f59e0b' : '#ef4444'
  );

  const deptChartData = {
    labels: departmentHealth.map(d => d.name),
    datasets: [{
      label: 'Attendance %',
      data: departmentHealth.map(d => d.attendancePct),
      backgroundColor: deptColors,
      hoverBackgroundColor: deptHoverColors,
      borderRadius: 5,
      borderSkipped: false,
    }],
  };

  const deptOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipDefaults,
        callbacks: {
          label: ctx => ` ${ctx.parsed.x}% attendance · ${departmentHealth[ctx.dataIndex]?.present ?? 0} present · ${departmentHealth[ctx.dataIndex]?.onLeave ?? 0} on leave`,
          title: ([ctx]) => departmentHealth[ctx.dataIndex]?.name,
        },
      },
    },
    scales: {
      x: {
        max: 100,
        grid: { color: '#f0f0f8' },
        border: { display: false },
        ticks: { callback: v => `${v}%`, font: { size: 10 }, color: '#9ca3af' },
      },
      y: {
        grid: { display: false },
        border: { display: false },
        ticks: { font: { size: 12, weight: '600' }, color: '#464555' },
      },
    },
    onClick: (event, elements) => {
      if (elements.length > 0) {
        const dept = departmentHealth[elements[0].index]?.name;
        if (dept) navigate(`/root/employees?dept=${encodeURIComponent(dept)}`);
      }
    },
    onHover: hoverCursor,
  };

  // Maps workforce donut/legend status clicks to valid routes
  function navigateWorkforceStatus(urlStatus) {
    const today = new Date().toISOString().split('T')[0];
    if (urlStatus === 'on_leave') return navigate('/root/leaves?tab=today');
    if (urlStatus === 'wfh')      return navigate(`/root/leaves?tab=wfh&date=${today}`);
    return navigate(`/root/calendar?date=${today}`); // present, half_day, absent
  }

  // ── KPI cards ─────────────────────────────────────────────────────────────────
  const kpiCards = [
    { label: 'Total Employees', value: totalEmployees, sub: `+${recentJoiners.length} recent`,
      icon: <Users size={16} />, iconBg: 'bg-[#f0f3ff] text-[#3525cd]',
      tooltip: 'Total active employees in the organization. Click to view the full employee list.',
      onClick: () => navigate('/root/employees?role=employee') },
    { label: 'Present Today', value: `${presentPct}%`, sub: `${presentToday} present`,
      icon: <UserCheck size={16} />, iconBg: 'bg-emerald-50 text-emerald-600',
      tooltip: 'Percentage of employees who are present, WFH, or on half-day today.',
      onClick: () => navigate(`/root/calendar?date=${new Date().toISOString().split('T')[0]}`) },
    { label: 'Pending Approvals', value: pendingLeaves,
      sub: pendingLeaves > 0 ? 'Needs attention' : 'All clear',
      icon: <ClipboardList size={16} />,
      iconBg: pendingLeaves > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600',
      tooltip: 'Leave requests awaiting your approval. Click to review and act on them.',
      alert: pendingLeaves > 0, onClick: () => navigate('/root/leaves?tab=all&status=pending') },
    { label: 'HR Admins', value: totalHR, sub: 'Active admins',
      icon: <ShieldCheck size={16} />, iconBg: 'bg-purple-50 text-purple-600',
      tooltip: 'Number of HR administrators managing the organization. Click to manage HR access.',
      onClick: () => navigate('/root/manage-hr') },
    { label: 'Departments', value: departmentHealth.length, sub: 'Active teams',
      icon: <Building2 size={16} />, iconBg: 'bg-sky-50 text-sky-600',
      tooltip: 'Total active departments or teams. Click to view and manage departments.',
      onClick: () => navigate('/root/departments') },
    { label: 'On Leave Today', value: onLeaveToday,
      sub: onLeaveToday > 0 ? `${onLeaveToday} out today` : 'Full attendance',
      icon: <CalendarDays size={16} />,
      iconBg: onLeaveToday > 3 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500',
      tooltip: 'Employees on approved leave today. Click to see who is absent.',
      onClick: () => navigate('/root/leaves?tab=today') },
  ];

  // ── Activity click handler ────────────────────────────────────────────────────
  function handleActivityNameClick(e, item) {
    e.stopPropagation();
    if (item.type === 'leave') navigate('/root/leaves');
    else if (item.type === 'checkin') navigate('/root/calendar');
    else navigate('/root/employees');
  }

  return (
    <div className="space-y-5">

      {/* ── HERO ──────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-6 relative overflow-hidden shadow-md"
        style={{ background: 'linear-gradient(135deg, #1e1b5e 0%, #3525cd 40%, #6d28d9 75%, #9333ea 100%)' }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 75% 50%, rgba(255,255,255,.1) 0%, transparent 55%), radial-gradient(circle at 20% 80%, rgba(255,255,255,.05) 0%, transparent 40%)' }} />
        <div className="relative flex flex-col lg:flex-row lg:items-center gap-5">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck size={13} className="text-white/60" />
              <span className="text-white/60 text-[0.65rem] font-bold uppercase tracking-widest">Root Admin Console</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Good {greeting()}, {user?.name?.split(' ')[0]} 👋
            </h1>
            <p className="text-white/70 text-sm mt-1">Your organization is running smoothly today.</p>
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="flex items-center gap-1.5 bg-white/10 backdrop-blur border border-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {presentPct}% Attendance Rate
              </span>
              <span className="flex items-center gap-1.5 bg-white/10 border border-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-full">
                <CalendarDays size={11} /> {onLeaveToday} On Leave
              </span>
              {pendingLeaves > 0 && (
                <span className="flex items-center gap-1.5 bg-amber-400/20 border border-amber-400/40 text-amber-200 text-xs font-bold px-3 py-1.5 rounded-full">
                  <AlertCircle size={11} /> {pendingLeaves} Pending Approvals
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:flex-col lg:w-auto">
            <button onClick={() => navigate('/root/employees?action=add')}
              className="flex items-center gap-2 bg-white text-[#3525cd] font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-white/90 transition-all shadow-sm">
              <UserPlus size={13} /> Add Employee
            </button>
            <button onClick={() => navigate('/root/leaves')}
              className="flex items-center gap-2 bg-white/15 border border-white/30 text-white font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-white/20 transition-all">
              <ClipboardList size={13} /> Approve Leaves
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI SECTION HEADER (last updated + refresh) ───────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-black text-[#777587] uppercase tracking-wider">Key Metrics</h2>
        <div className="flex items-center gap-3">
          {dataUpdatedAt > 0 && (
            <span className="text-[0.68rem] text-[#9ca3af]">
              Updated {fmtUpdatedAt(dataUpdatedAt)}
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs font-bold text-[#3525cd] hover:text-[#4f46e5] px-2.5 py-1.5 rounded-lg hover:bg-[#f0f3ff] border border-transparent hover:border-[#c7c4d8] transition-all disabled:opacity-50">
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── KPI CARDS ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map((card, i) => (
          <KpiTooltip key={i} text={card.tooltip}>
            <div onClick={card.onClick}
              className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-4 transition-all duration-200 hover:shadow-md hover:border-[#3525cd]/30 hover:-translate-y-0.5 cursor-pointer h-full">
              <div className="flex items-start justify-between mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.iconBg}`}>{card.icon}</div>
                {card.alert && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
              </div>
              <p className="text-xl font-black text-[#151c27] leading-tight">{card.value}</p>
              <p className="text-[0.68rem] text-[#777587] mt-0.5 font-medium leading-tight">{card.label}</p>
              {card.sub && (
                <p className={`text-[0.62rem] mt-1 font-semibold ${card.alert ? 'text-amber-600' : 'text-emerald-600'}`}>{card.sub}</p>
              )}
            </div>
          </KpiTooltip>
        ))}
      </div>

      {/* ── LIVE ACTIVITY + ACTION CENTER + WORKFORCE ─────────────────────────── */}
      <div className="grid lg:grid-cols-5 gap-5">

        {/* Live Activity */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e7eefe]">
            <h2 className="text-sm font-black text-[#151c27] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Live Activity
            </h2>
            <button onClick={() => navigate('/root/calendar')}
              className="text-xs font-bold text-[#3525cd] hover:text-[#4f46e5] px-2 py-1 rounded-lg hover:bg-[#f0f3ff] transition-colors">
              View all
            </button>
          </div>
          <div className="divide-y divide-[#f9f9ff]">
            {liveActivity.length === 0 ? (
              <div className="py-10 text-center">
                <Activity size={22} className="text-[#c7c4d8] mx-auto mb-2" />
                <p className="text-sm font-semibold text-[#464555]">No activity yet today</p>
                <p className="text-xs text-[#9ca3af] mt-0.5">Check-ins and leave requests will appear here.</p>
              </div>
            ) : liveActivity.slice(0, 7).map((item, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3 hover:bg-[#fafaff] transition-colors">
                <Avatar name={item.name} color={item.avatar_color} size={30} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#464555] leading-snug">
                    <button
                      onClick={e => handleActivityNameClick(e, item)}
                      className="font-bold text-[#3525cd] hover:underline focus:outline-none">
                      {item.name}
                    </button>
                    {' '}{item.detail}
                  </p>
                  {item.department && <p className="text-[0.6rem] text-[#9ca3af] mt-0.5">{item.department}</p>}
                </div>
                <span className="text-[0.6rem] text-[#9ca3af] whitespace-nowrap flex-shrink-0">{relTime(item.time)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action Center */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e7eefe]">
            <h2 className="text-sm font-black text-[#151c27] flex items-center gap-2">
              <Zap size={14} className="text-amber-500" /> Action Center
            </h2>
            <button onClick={() => navigate('/root/leaves')}
              className="text-xs font-bold text-[#3525cd] hover:text-[#4f46e5] px-2 py-1 rounded-lg hover:bg-[#f0f3ff] transition-colors">
              View all
            </button>
          </div>
          <div className="divide-y divide-[#f9f9ff]">
            {actionCenter.length === 0 || (actionCenter.length === 1 && actionCenter[0].type === 'all_clear') ? (
              <div className="py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                </div>
                <p className="text-sm font-semibold text-[#151c27]">All clear!</p>
                <p className="text-xs text-[#777587] mt-0.5">No pending tasks — everything is up to date.</p>
              </div>
            ) : actionCenter.filter(item => item.type !== 'all_clear').map((item, i) => (
              <div key={i} onClick={item.link ? () => navigate(item.link) : undefined}
                className={`flex items-center gap-3 px-5 py-3.5 ${item.link ? 'cursor-pointer hover:bg-[#fafaff]' : ''} transition-colors`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  item.priority === 'High' ? 'bg-rose-50' : item.priority === 'Medium' ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                  {item.type === 'leaves'     ? <ClipboardList size={13} className="text-rose-500" />  :
                   item.type === 'attendance' ? <Clock size={13} className="text-amber-500" />         :
                   item.type === 'expenses'   ? <AlertCircle size={13} className="text-amber-500" />   :
                   <CheckCircle2 size={13} className="text-emerald-500" />}
                </div>
                <div className="flex-1 text-sm font-semibold text-[#151c27]">{item.label}</div>
                <span className={`text-[0.62rem] px-2 py-0.5 rounded-full border font-bold flex-shrink-0 ${PRIORITY_BADGE[item.priority] || PRIORITY_BADGE.Low}`}>
                  {item.priority}
                </span>
              </div>
            ))}
          </div>
          {pendingLeavesData.length > 0 && (
            <div className="px-5 py-3 border-t border-[#e7eefe] bg-[#fafaff]">
              <p className="text-[0.65rem] font-bold text-[#777587] uppercase tracking-wide mb-2">Quick Approvals</p>
              <div className="space-y-2">
                {pendingLeavesData.slice(0, 3).map(l => (
                  <div key={l.id} className="flex items-center gap-2">
                    <Avatar name={l.name} color={l.avatar_color} size={24} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[#151c27] truncate">{l.name}</p>
                      <p className="text-[0.6rem] text-[#9ca3af]">{l.leave_type} · {l.start_date}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => approveMut.mutate(l.id)} disabled={isBusy}
                        className="p-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 transition-colors disabled:opacity-40">
                        <Check size={10} />
                      </button>
                      <button onClick={() => rejectMut.mutate(l.id)} disabled={isBusy}
                        className="p-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-500 border border-rose-200 transition-colors disabled:opacity-40">
                        <X size={10} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Today's Workforce — interactive doughnut */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5">
          <h2 className="text-sm font-black text-[#151c27] flex items-center gap-2 mb-1">
            <Activity size={13} className="text-[#3525cd]" /> Today's Workforce
          </h2>
          <p className="text-[0.65rem] text-[#9ca3af] mb-3">Click segment to filter</p>
          {workforceEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Clock size={22} className="text-[#c7c4d8]" />
              <p className="text-sm font-semibold text-[#464555]">No check-ins yet</p>
              <p className="text-xs text-[#9ca3af] text-center">Workforce data will appear once employees mark their attendance.</p>
            </div>
          ) : (
            <>
              <DoughnutChart
                data={workforceChartData}
                options={workforceOptions}
                centerLabel={totalWorkforce}
                centerSub="Total"
              />
              <div className="mt-3 space-y-1.5">
                {workforceEntries.map(s => (
                  <button key={s.key} onClick={() => navigateWorkforceStatus(s.urlStatus)}
                    className="w-full flex items-center justify-between text-xs hover:bg-[#f9f9ff] px-1 py-0.5 rounded transition-colors">
                    <span className="flex items-center gap-1.5 font-medium text-[#464555]">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      {s.label}
                    </span>
                    <span className="font-black text-[#151c27]">{s.value}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── ATTENDANCE TREND + LEAVE BREAKDOWN ───────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-5">

        {/* Attendance Trend — Line chart (click point → attendance for that date) */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5">
          <div className="flex items-center justify-between mb-0.5">
            <h2 className="text-sm font-black text-[#151c27]">Attendance Trend</h2>
            {attendanceTrend.length > 0 && (
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                {attendanceTrend[attendanceTrend.length - 1]?.pct ?? 0}% Today
              </span>
            )}
          </div>
          <p className="text-[0.68rem] text-[#9ca3af] mb-4">Last 30 Days · Click a point to view attendance</p>
          {attendanceTrend.length > 0 ? (
            <div style={{ height: 180 }}>
              <Line data={trendChartData} options={trendOptions} />
            </div>
          ) : (
            <div className="h-40 flex flex-col items-center justify-center gap-2">
              <TrendingUp size={22} className="text-[#c7c4d8]" />
              <p className="text-sm font-semibold text-[#464555]">No attendance records yet</p>
              <p className="text-xs text-[#9ca3af]">Trend data will appear as employees mark attendance daily.</p>
            </div>
          )}
        </div>

        {/* Leave Breakdown — Doughnut (click segment → leaves of that type) */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5">
          <div className="flex items-center justify-between mb-0.5">
            <h2 className="text-sm font-black text-[#151c27]">Leave Breakdown</h2>
            <span className="text-[0.68rem] text-[#9ca3af]">{new Date().getFullYear()}</span>
          </div>
          <p className="text-[0.68rem] text-[#9ca3af] mb-4">Approved leaves by type · Click to view</p>
          {leaveSegs.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center gap-2">
              <CalendarDays size={22} className="text-[#c7c4d8]" />
              <p className="text-sm font-semibold text-[#464555]">No approved leaves yet</p>
              <p className="text-xs text-[#9ca3af]">Leave distribution will appear once leaves are approved this year.</p>
            </div>
          ) : (
            <div className="flex items-center gap-5">
              <div className="w-48 flex-shrink-0">
                <DoughnutChart
                  data={leaveChartData}
                  options={leaveOptions}
                  centerLabel={totalLeaveSegs}
                  centerSub="Leaves"
                />
              </div>
              <div className="flex-1 space-y-2.5">
                {leaveSegs.map(t => (
                  <button key={t.key} onClick={() => navigate(`/root/leaves?type=${t.key}&status=approved`)}
                    className="w-full flex items-center justify-between text-xs hover:bg-[#f9f9ff] px-2 py-1 rounded-lg transition-colors group">
                    <span className="flex items-center gap-2 font-medium text-[#464555] group-hover:text-[#3525cd] transition-colors">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: t.color }} />
                      {t.label}
                    </span>
                    <span className="font-bold text-[#151c27]">
                      {t.value}
                      <span className="text-[#9ca3af] font-normal ml-1">({Math.round((t.value / totalLeaveSegs) * 100)}%)</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── DEPARTMENT HEALTH BAR + HEADCOUNT GROWTH ─────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-5">

        {/* Department Health — horizontal bar (click bar → employees in dept) */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5">
          <div className="flex items-center justify-between mb-0.5">
            <h2 className="text-sm font-black text-[#151c27]">Department Health</h2>
            <span className="text-[0.68rem] text-[#9ca3af]">Attendance Overview</span>
          </div>
          <p className="text-[0.68rem] text-[#9ca3af] mb-4">Click a bar to view department employees</p>
          {departmentHealth.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center gap-2">
              <Building2 size={22} className="text-[#c7c4d8]" />
              <p className="text-sm font-semibold text-[#464555]">No departments found</p>
              <p className="text-xs text-[#9ca3af]">Add departments and assign employees to see attendance health.</p>
            </div>
          ) : (
            <div style={{ height: Math.max(180, departmentHealth.length * 44) }}>
              <Bar data={deptChartData} options={deptOptions} />
            </div>
          )}
        </div>

        {/* Headcount Growth — line chart (click → employees page) */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5">
          <div className="flex items-center justify-between mb-0.5">
            <h2 className="text-sm font-black text-[#151c27]">Headcount Growth</h2>
            <span className="text-[0.68rem] text-[#9ca3af]">This Year</span>
          </div>
          <p className="text-[0.68rem] text-[#9ca3af] mb-4">Cumulative employee count · Click to view all employees</p>
          {headSlice.length > 0 ? (
            <div style={{ height: 180 }}>
              <Line data={headChartData} options={headOptions} />
            </div>
          ) : (
            <div className="h-40 flex flex-col items-center justify-center gap-2">
              <TrendingUp size={22} className="text-[#c7c4d8]" />
              <p className="text-sm font-semibold text-[#464555]">No headcount data yet</p>
              <p className="text-xs text-[#9ca3af]">Growth trends will appear as employees are added over time.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── UPCOMING EVENTS + EMPLOYEE HIGHLIGHTS + PENDING APPROVALS ─────────── */}
      <div className="grid lg:grid-cols-3 gap-5">

        {/* Upcoming Events */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e7eefe]">
            <h2 className="text-sm font-black text-[#151c27] flex items-center gap-2">
              <Calendar size={13} className="text-[#3525cd]" /> Upcoming Events
            </h2>
            <button onClick={() => navigate('/root/holidays')}
              className="text-xs font-bold text-[#3525cd] hover:text-[#4f46e5] px-2 py-1 rounded-lg hover:bg-[#f0f3ff] transition-colors">
              View Calendar
            </button>
          </div>
          <div className="divide-y divide-[#f9f9ff]">
            {upcomingEvents.length === 0 ? (
              <div className="py-10 text-center">
                <Calendar size={22} className="text-[#c7c4d8] mx-auto mb-2" />
                <p className="text-sm font-semibold text-[#464555]">No upcoming events</p>
                <p className="text-xs text-[#9ca3af] mt-0.5">Add holidays or events to see them here.</p>
              </div>
            ) : upcomingEvents.map((ev, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#fafaff] transition-colors cursor-pointer"
                onClick={() => navigate('/root/holidays')}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${ev.type === 'holiday' ? 'bg-amber-50' : 'bg-[#f0f3ff]'}`}>
                  {ev.type === 'holiday' ? <Star size={13} className="text-amber-500" /> : <CalendarDays size={13} className="text-[#3525cd]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#151c27] truncate">{ev.title}</p>
                  <p className="text-[0.62rem] text-[#9ca3af]">{fmtDate(ev.date)}</p>
                </div>
                <span className="text-[0.62rem] text-[#9ca3af] font-semibold whitespace-nowrap">{daysUntil(ev.date)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Employee Highlights */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e7eefe]">
            <h2 className="text-sm font-black text-[#151c27] flex items-center gap-2">
              <UserPlus size={13} className="text-emerald-500" /> Employee Highlights
            </h2>
            <button onClick={() => navigate('/root/employees')}
              className="text-xs font-bold text-[#3525cd] hover:text-[#4f46e5] px-2 py-1 rounded-lg hover:bg-[#f0f3ff] transition-colors">
              View all
            </button>
          </div>
          <div className="divide-y divide-[#f9f9ff]">
            {birthdays.length > 0 && (
              <div className="px-5 py-3 bg-amber-50/60">
                <p className="text-xs font-bold text-amber-700 mb-2">🎂 Birthdays Today</p>
                <div className="space-y-1.5">
                  {birthdays.map((b, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Avatar name={b.name} color={b.avatar_color} size={22} />
                      <span className="text-xs font-semibold text-[#464555]">{b.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="px-5 py-3">
              <p className="text-[0.65rem] font-bold text-[#777587] uppercase tracking-wide mb-2">New Joiners</p>
              <div className="space-y-2">
                {recentJoiners.length === 0 ? (
                  <div className="py-3 text-center">
                    <p className="text-xs font-semibold text-[#464555]">No recent joiners</p>
                    <p className="text-[0.62rem] text-[#9ca3af] mt-0.5">New employees added will appear here.</p>
                  </div>
                ) : recentJoiners.map((emp, i) => (
                  <div key={i} onClick={() => navigate('/root/employees')}
                    className="flex items-center gap-2.5 hover:bg-[#fafaff] -mx-2 px-2 py-1 rounded-lg transition-colors cursor-pointer">
                    <Avatar name={emp.name} color={emp.avatar_color} size={30} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#151c27] truncate">{emp.name}</p>
                      <p className="text-[0.62rem] text-[#9ca3af]">{emp.position || emp.department || 'Employee'}</p>
                    </div>
                    <span className="text-[0.6rem] text-[#9ca3af] whitespace-nowrap">{relTime(emp.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Pending Approvals */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e7eefe]">
            <h2 className="text-sm font-black text-[#151c27] flex items-center gap-2">
              <ClipboardList size={13} className="text-amber-500" /> Pending Approvals
              {pendingLeavesData.length > 0 && (
                <span className="text-[0.62rem] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold">
                  {pendingLeavesData.length}
                </span>
              )}
            </h2>
            <button onClick={() => navigate('/root/leaves?tab=all&status=pending')}
              className="text-xs font-bold text-[#3525cd] hover:text-[#4f46e5] px-2 py-1 rounded-lg hover:bg-[#f0f3ff] transition-colors">
              View all →
            </button>
          </div>
          <div className="divide-y divide-[#f0f3ff]">
            {pendingLeavesData.length === 0 ? (
              <div className="py-10 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-2">
                  <Check size={18} className="text-emerald-500" />
                </div>
                <p className="text-sm font-semibold text-[#151c27]">All caught up!</p>
                <p className="text-xs text-[#777587] mt-0.5">No pending leave requests at the moment.</p>
              </div>
            ) : pendingLeavesData.slice(0, 5).map(l => (
              <div key={l.id} className="flex items-center gap-2.5 px-4 py-3 hover:bg-[#f9f9ff] transition-colors">
                <Avatar name={l.name} color={l.avatar_color} size={30} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#151c27] truncate">{l.name}</p>
                  <p className="text-[0.6rem] text-[#9ca3af]">{l.leave_type} · {l.start_date}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => approveMut.mutate(l.id)} disabled={isBusy}
                    className="flex items-center gap-0.5 px-2 py-1 rounded text-[0.62rem] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-all disabled:opacity-40">
                    <Check size={9} /> OK
                  </button>
                  <button onClick={() => rejectMut.mutate(l.id)} disabled={isBusy}
                    className="flex items-center gap-0.5 px-2 py-1 rounded text-[0.62rem] font-bold bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition-all disabled:opacity-40">
                    <X size={9} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── YEARLY LEAVE OVERVIEW ─────────────────────────────────────────────── */}
      {yearlyEmployees.length > 0 && (
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e7eefe] flex items-center gap-2">
            <CalendarDays size={14} className="text-[#3525cd]" />
            <h2 className="text-sm font-black text-[#151c27] uppercase tracking-wider">
              Yearly Leave Overview — {yearlyData?.year || new Date().getFullYear()}
            </h2>
            <span className="ml-auto text-xs text-[#777587]">{yearlyData?.totalLeaves || 18} days allocated</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f9f9ff]">
                  <th className="px-5 py-3 text-left text-xs font-bold text-[#777587] uppercase tracking-wider">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-[#777587] uppercase tracking-wider hidden sm:table-cell">Department</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-[#777587] uppercase tracking-wider">Used</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-[#777587] uppercase tracking-wider">Remaining</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-[#777587] uppercase tracking-wider w-44 hidden md:table-cell">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f3ff]">
                {yearlyEmployees.map(emp => {
                  const pct      = Math.min(100, Math.round((emp.usedDays / emp.totalDays) * 100));
                  const barColor = pct >= 90 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-400' : 'bg-emerald-500';
                  const remColor = emp.remainingDays <= 3 ? 'text-rose-600' : emp.remainingDays <= 7 ? 'text-amber-600' : 'text-emerald-600';
                  return (
                    <tr key={emp.id} onClick={() => navigate(`/root/leaves?userId=${emp.id}`)}
                      className="hover:bg-[#f9f9ff] transition-colors cursor-pointer">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={emp.name} color={emp.avatar_color} size={30} />
                          <div>
                            <div className="font-bold text-[#151c27] text-sm leading-tight">{emp.name}</div>
                            {emp.position && <div className="text-xs text-[#777587]">{emp.position}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#464555] hidden sm:table-cell">{emp.department || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-black text-[#151c27]">{emp.usedDays}</span>
                        <span className="text-xs text-[#777587]"> / {emp.totalDays}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-sm font-black ${remColor}`}>{emp.remainingDays}</span>
                      </td>
                      <td className="px-5 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-[#e7eefe] rounded-full h-1.5 overflow-hidden">
                            <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-[#777587] w-8 text-right shrink-0">{pct}%</span>
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
