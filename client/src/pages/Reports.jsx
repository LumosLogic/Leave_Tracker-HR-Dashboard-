import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Download, BarChart3, Users, FileText, CalendarDays, TrendingUp,
  Search, Filter, X, ChevronUp, ChevronDown, Printer,
  CheckCircle2, Clock, AlertCircle, UserCheck, Umbrella,
  Building2, ArrowUpDown,
} from 'lucide-react';
import { apiGet } from '@/lib/api';
import { MONTHS } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';

// ── Helpers ────────────────────────────────────────────────────────────────────
function cn(...classes) { return classes.filter(Boolean).join(' '); }

const ATT_STATUS_STYLE = {
  present:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  wfh:      'bg-indigo-50 text-indigo-700 border-indigo-200',
  half_day: 'bg-amber-50 text-amber-700 border-amber-200',
  on_leave: 'bg-rose-50 text-rose-600 border-rose-200',
  absent:   'bg-slate-50 text-slate-500 border-slate-200',
};
const LEAVE_STATUS_STYLE = {
  approved:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  rejected:  'bg-rose-50 text-rose-600 border-rose-200',
  cancelled: 'bg-slate-50 text-slate-500 border-slate-200',
};
const LEAVE_TYPE_STYLE = {
  casual:    'bg-teal-50 text-teal-700',
  sick:      'bg-red-50 text-red-700',
  annual:    'bg-[#f0f3ff] text-[#3525cd]',
  emergency: 'bg-orange-50 text-orange-700',
  wfh:       'bg-indigo-50 text-indigo-700',
  other:     'bg-slate-50 text-slate-600',
};
const EMP_STATUS_STYLE = {
  active:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  inactive: 'bg-slate-50 text-slate-500 border-slate-200',
  resigned: 'bg-rose-50 text-rose-600 border-rose-200',
};

function Badge({ text, styleMap, fallback = 'bg-slate-50 text-slate-500 border-slate-200' }) {
  return (
    <span className={cn('text-[0.68rem] font-bold px-2 py-0.5 rounded-full border capitalize', styleMap?.[text] || fallback)}>
      {text || '—'}
    </span>
  );
}

// ── Sort helpers ───────────────────────────────────────────────────────────────
function SortIcon({ col, sort }) {
  if (sort.col !== col) return <ArrowUpDown size={11} className="text-[#c7c4d8] flex-shrink-0" />;
  return sort.dir === 'asc'
    ? <ChevronUp size={11} className="text-[#3525cd] flex-shrink-0" />
    : <ChevronDown size={11} className="text-[#3525cd] flex-shrink-0" />;
}

function SortTh({ col, sort, onSort, children, className = '' }) {
  return (
    <th className={cn('px-4 py-3 text-left whitespace-nowrap', className)}>
      <button onClick={() => onSort(col)}
        className="flex items-center gap-1 text-xs font-black text-[#464555] uppercase tracking-wider hover:text-[#3525cd] transition-colors">
        {children} <SortIcon col={col} sort={sort} />
      </button>
    </th>
  );
}

function sortRows(rows, sort) {
  if (!sort.col) return rows;
  return [...rows].sort((a, b) => {
    const av = (a[sort.col] ?? '').toString().toLowerCase();
    const bv = (b[sort.col] ?? '').toString().toLowerCase();
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sort.dir === 'asc' ? cmp : -cmp;
  });
}

// ── KPI card ───────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon, accent, sub, onClick }) {
  return (
    <div onClick={onClick}
      className={cn('bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-4 border-t-4 transition-all duration-200',
        accent, onClick && 'cursor-pointer hover:shadow-md hover:-translate-y-0.5')}>
      <div className="flex items-start justify-between mb-2">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', accent.replace('border-t-', 'bg-').replace('-500', '-50').replace('-400', '-50').replace('[#3525cd]', '[#f0f3ff]').replace('[#712ae2]', '[#f5f0ff]'))}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-black text-[#151c27] leading-tight">{value ?? '—'}</p>
      <p className="text-xs text-[#777587] mt-0.5 font-medium">{label}</p>
      {sub && <p className="text-[0.65rem] text-emerald-600 font-semibold mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Download modal ─────────────────────────────────────────────────────────────
function DownloadModal({ open, onClose, active, onDownload }) {
  const now = new Date();
  const [type,  setType]  = useState('monthly');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  function handleDownload() {
    onDownload(type === 'monthly' ? { year, month } : { year });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Export Report" size="sm"
      footer={
        <div className="flex justify-end gap-2 flex-wrap">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-secondary" onClick={() => { window.print(); onClose(); }}>
            <Printer size={14} /> Print / PDF
          </button>
          <button className="btn btn-primary" onClick={handleDownload}>
            <Download size={14} /> Download CSV
          </button>
        </div>
      }>
      <div className="space-y-4">
        <div>
          <label className="form-label">Period Type</label>
          <div className="flex gap-2">
            {['monthly', 'yearly'].map(t => (
              <button key={t} onClick={() => setType(t)}
                className={cn('flex-1 py-2 px-3 rounded-lg text-xs font-bold border transition-all capitalize',
                  type === t ? 'bg-[#3525cd] text-white border-[#3525cd]' : 'bg-white text-[#464555] border-[#c7c4d8] hover:border-[#3525cd]/50')}>
                {t}
              </button>
            ))}
          </div>
        </div>
        {type === 'monthly' && (
          <div>
            <label className="form-label">Month</label>
            <select className="form-control" value={month} onChange={e => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="form-label">Year</label>
          <select className="form-control" value={year} onChange={e => setYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <p className="text-xs text-[#777587] bg-[#f9f9ff] rounded-lg p-3 border border-[#f0f3ff]">
          {type === 'monthly'
            ? `Will export ${active} data for ${MONTHS[month - 1]} ${year}`
            : `Will export ${active} data for the full year ${year}`}
        </p>
      </div>
    </Modal>
  );
}

// ── Main Reports page ──────────────────────────────────────────────────────────
export default function Reports() {
  const now = new Date();

  // ── Filters & UI state ────────────────────────────────────────────────────────
  const [active,          setActive]          = useState('attendance');
  const [viewMode,        setViewMode]        = useState('monthly');
  const [year,            setYear]            = useState(now.getFullYear());
  const [month,           setMonth]           = useState(now.getMonth() + 1);
  const [search,          setSearch]          = useState('');
  const [deptFilter,      setDeptFilter]      = useState('');
  const [statusFilter,    setStatusFilter]    = useState('');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('');
  const [attStatusFilter, setAttStatusFilter] = useState('');
  const [empTypeFilter,   setEmpTypeFilter]   = useState('');
  const [sort,            setSort]            = useState({ col: 'date', dir: 'desc' });
  const [pageSize,        setPageSize]        = useState(50);
  const [dlOpen,          setDlOpen]          = useState(false);

  function handleTabChange(tab) {
    setActive(tab);
    setSearch('');
    setDeptFilter('');
    setStatusFilter('');
    setLeaveTypeFilter('');
    setAttStatusFilter('');
    setEmpTypeFilter('');
    setPageSize(50);
    setSort(tab === 'employees' ? { col: 'name', dir: 'asc' } : { col: 'date', dir: 'desc' });
  }

  function toggleSort(col) {
    setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  }

  // ── Data queries ──────────────────────────────────────────────────────────────
  const queryParams = viewMode === 'monthly' ? { year, month } : { year };

  const { data: headcount } = useQuery({
    queryKey: ['headcount'],
    queryFn: () => apiGet('/reports/headcount'),
  });

  const { data: _attData = [], isLoading: attLoading } = useQuery({
    queryKey: ['report-attendance', viewMode, year, month],
    queryFn:  () => apiGet('/reports/attendance', queryParams),
  });

  const { data: _lvData = [], isLoading: lvLoading } = useQuery({
    queryKey: ['report-leaves', viewMode, year, month],
    queryFn:  () => apiGet('/reports/leaves', queryParams),
  });

  const { data: _empData = [], isLoading: empLoading } = useQuery({
    queryKey: ['report-employees'],
    queryFn:  () => apiGet('/reports/employees'),
  });

  const attRows = Array.isArray(_attData) ? _attData : [];
  const leaveRows = Array.isArray(_lvData) ? _lvData : [];
  const empRows   = Array.isArray(_empData) ? _empData : [];

  // ── Derived filter options ────────────────────────────────────────────────────
  const deptOptions = useMemo(() => {
    const src = active === 'attendance' ? attRows : active === 'leaves' ? leaveRows : empRows;
    return [...new Set(src.map(r => r.department).filter(Boolean))].sort();
  }, [active, attRows, leaveRows, empRows]);

  // ── Filtered + sorted rows ────────────────────────────────────────────────────
  const filteredAtt = useMemo(() => {
    let rows = attRows;
    if (search)         rows = rows.filter(r => r.name?.toLowerCase().includes(search.toLowerCase()));
    if (deptFilter)     rows = rows.filter(r => r.department === deptFilter);
    if (attStatusFilter) rows = rows.filter(r => r.status === attStatusFilter);
    return sortRows(rows, sort);
  }, [attRows, search, deptFilter, attStatusFilter, sort]);

  const filteredLeave = useMemo(() => {
    let rows = leaveRows;
    if (search)          rows = rows.filter(r => r.name?.toLowerCase().includes(search.toLowerCase()));
    if (deptFilter)      rows = rows.filter(r => r.department === deptFilter);
    if (statusFilter)    rows = rows.filter(r => r.status === statusFilter);
    if (leaveTypeFilter) rows = rows.filter(r => r.leave_type === leaveTypeFilter);
    return sortRows(rows, sort);
  }, [leaveRows, search, deptFilter, statusFilter, leaveTypeFilter, sort]);

  const filteredEmp = useMemo(() => {
    let rows = empRows;
    if (search)       rows = rows.filter(r => r.name?.toLowerCase().includes(search.toLowerCase()) || r.email?.toLowerCase().includes(search.toLowerCase()));
    if (deptFilter)   rows = rows.filter(r => r.department === deptFilter);
    if (statusFilter) rows = rows.filter(r => (r.employment_status || 'active') === statusFilter);
    if (empTypeFilter) rows = rows.filter(r => r.employment_type === empTypeFilter);
    return sortRows(rows, sort);
  }, [empRows, search, deptFilter, statusFilter, empTypeFilter, sort]);

  const activeRows = active === 'attendance' ? filteredAtt : active === 'leaves' ? filteredLeave : filteredEmp;
  const isLoading  = active === 'attendance' ? attLoading : active === 'leaves' ? lvLoading : empLoading;
  const displayRows = activeRows.slice(0, pageSize);
  const hasMore = activeRows.length > pageSize;

  // ── KPI cards per tab ─────────────────────────────────────────────────────────
  const kpiCards = useMemo(() => {
    if (active === 'attendance') {
      const present  = attRows.filter(r => ['present', 'wfh', 'half_day'].includes(r.status)).length;
      const absent   = attRows.filter(r => r.status === 'absent').length;
      const onLeave  = attRows.filter(r => r.status === 'on_leave').length;
      const avgHrs   = attRows.length > 0
        ? (attRows.reduce((s, r) => s + (Number(r.work_hours) || 0), 0) / attRows.filter(r => r.work_hours > 0).length || 0).toFixed(1)
        : 0;
      return [
        { label: 'Total Records',    value: attRows.length, icon: <CalendarDays size={18} className="text-[#3525cd]" />,        accent: 'border-t-[#3525cd]' },
        { label: 'Present / WFH',   value: present,         icon: <UserCheck size={18} className="text-emerald-600" />,          accent: 'border-t-emerald-500', onClick: () => setAttStatusFilter(attStatusFilter === 'present' ? '' : 'present') },
        { label: 'Absent',           value: absent,          icon: <X size={18} className="text-rose-500" />,                    accent: 'border-t-rose-500',    onClick: () => setAttStatusFilter(attStatusFilter === 'absent' ? '' : 'absent') },
        { label: 'On Leave',         value: onLeave,         icon: <Umbrella size={18} className="text-amber-500" />,             accent: 'border-t-amber-400',   onClick: () => setAttStatusFilter(attStatusFilter === 'on_leave' ? '' : 'on_leave') },
      ];
    }
    if (active === 'leaves') {
      const approved  = leaveRows.filter(r => r.status === 'approved').length;
      const pending   = leaveRows.filter(r => r.status === 'pending').length;
      const rejected  = leaveRows.filter(r => r.status === 'rejected').length;
      return [
        { label: 'Total Leaves',   value: leaveRows.length, icon: <FileText size={18} className="text-[#3525cd]" />,       accent: 'border-t-[#3525cd]' },
        { label: 'Approved',       value: approved,          icon: <CheckCircle2 size={18} className="text-emerald-600" />, accent: 'border-t-emerald-500', onClick: () => setStatusFilter(statusFilter === 'approved' ? '' : 'approved') },
        { label: 'Pending',        value: pending,           icon: <Clock size={18} className="text-amber-500" />,          accent: 'border-t-amber-400',   onClick: () => setStatusFilter(statusFilter === 'pending' ? '' : 'pending'), sub: pending > 0 ? 'Needs attention' : undefined },
        { label: 'Rejected',       value: rejected,          icon: <AlertCircle size={18} className="text-rose-500" />,     accent: 'border-t-rose-500',    onClick: () => setStatusFilter(statusFilter === 'rejected' ? '' : 'rejected') },
      ];
    }
    // employees
    const active_count = empRows.filter(r => !r.employment_status || r.employment_status === 'active').length;
    const resigned     = empRows.filter(r => r.employment_status === 'resigned').length;
    const depts        = new Set(empRows.map(r => r.department).filter(Boolean)).size;
    return [
      { label: 'Total Employees', value: headcount?.total ?? empRows.length, icon: <Users size={18} className="text-[#3525cd]" />,           accent: 'border-t-[#3525cd]' },
      { label: 'Active',          value: active_count,                        icon: <TrendingUp size={18} className="text-emerald-600" />,     accent: 'border-t-emerald-500' },
      { label: 'Resigned',        value: resigned,                            icon: <AlertCircle size={18} className="text-rose-500" />,       accent: 'border-t-rose-500' },
      { label: 'Departments',     value: depts,                               icon: <Building2 size={18} className="text-[#712ae2]" />,        accent: 'border-t-[#712ae2]' },
    ];
  }, [active, attRows, leaveRows, empRows, headcount, statusFilter, attStatusFilter]);

  // ── CSV download ──────────────────────────────────────────────────────────────
  function getToken() { return localStorage.getItem('lt_token'); }

  async function handleDownload({ year: dlYear, month: dlMonth }) {
    const token = getToken();
    let endpoint, params, filename;
    if (active === 'attendance') {
      endpoint = '/reports/attendance';
      params   = dlMonth ? { year: dlYear, month: dlMonth } : { year: dlYear };
      filename = dlMonth ? `attendance_${MONTHS[dlMonth - 1]}_${dlYear}.csv` : `attendance_${dlYear}.csv`;
    } else if (active === 'leaves') {
      endpoint = '/reports/leaves';
      params   = dlMonth ? { year: dlYear, month: dlMonth } : { year: dlYear };
      filename = dlMonth ? `leaves_${MONTHS[dlMonth - 1]}_${dlYear}.csv` : `leaves_${dlYear}.csv`;
    } else {
      endpoint = '/reports/employees';
      params   = {};
      filename = 'employee_list.csv';
    }
    const q   = new URLSearchParams({ ...params, format: 'csv' }).toString();
    const res = await fetch(`/api${endpoint}?${q}`, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  const periodLabel = viewMode === 'monthly' ? `${MONTHS[month - 1]} ${year}` : `${year}`;
  const anyFilter   = search || deptFilter || statusFilter || leaveTypeFilter || attStatusFilter || empTypeFilter;

  const LEAVE_TYPES = ['casual', 'sick', 'annual', 'emergency', 'wfh', 'other'];
  const ATT_STATUSES = ['present', 'absent', 'wfh', 'on_leave', 'half_day'];
  const LEAVE_STATUSES = ['approved', 'pending', 'rejected', 'cancelled'];
  const EMP_STATUSES = ['active', 'inactive', 'resigned'];
  const EMP_TYPES = ['full_time', 'part_time', 'contract', 'intern'];

  return (
    <div className="space-y-5">

      {/* ── PAGE HEADER ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Reports & Analytics</h1>
          <p className="page-subtitle">Attendance, leave, and employee data for {periodLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-outline btn-sm" onClick={() => window.print()}>
            <Printer size={14} /> Print
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => active === 'employees' ? handleDownload({ year }) : setDlOpen(true)}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* ── KPI CARDS ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {kpiCards.map((card, i) => (
          <KpiCard key={i} {...card} />
        ))}
      </div>

      {/* ── CONTROLS ROW ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-4 space-y-4">

        {/* Period picker + tabs */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* View mode */}
          <div className="flex gap-1 bg-[#f0f3ff] p-1 rounded-xl border border-[#c7c4d8]">
            {['monthly', 'yearly'].map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={cn('px-3 py-1.5 text-xs font-bold rounded-lg capitalize transition-colors',
                  viewMode === m ? 'bg-white text-[#3525cd] shadow-sm' : 'text-[#777587] hover:text-[#151c27]')}>
                {m}
              </button>
            ))}
          </div>

          {viewMode === 'monthly' && (
            <select className="form-control w-auto text-xs" value={month} onChange={e => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          )}

          <div className="flex items-center gap-1 bg-white border border-[#c7c4d8] rounded-lg px-3 py-2">
            <button onClick={() => setYear(y => y - 1)} className="text-[#3525cd] font-black text-base leading-none px-0.5">‹</button>
            <span className="font-bold text-[#151c27] min-w-[3rem] text-center text-sm">{year}</span>
            <button onClick={() => setYear(y => Math.min(y + 1, now.getFullYear()))} className="text-[#3525cd] font-black text-base leading-none px-0.5">›</button>
          </div>

          {/* Report tabs */}
          <div className="flex gap-1 bg-[#f0f3ff] border border-[#c7c4d8] p-1 rounded-xl ml-auto">
            {[
              { key: 'attendance', label: 'Attendance', icon: <CalendarDays size={13} /> },
              { key: 'leaves',     label: 'Leaves',     icon: <FileText size={13} /> },
              { key: 'employees',  label: 'Employees',  icon: <Users size={13} /> },
            ].map(t => (
              <button key={t.key} onClick={() => handleTabChange(t.key)}
                className={cn('flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all',
                  active === t.key ? 'bg-white text-[#3525cd] shadow-sm' : 'text-[#777587] hover:text-[#151c27]')}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={13} className="text-[#777587] flex-shrink-0" />

          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            <input
              type="text"
              placeholder="Search employee…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="form-control pl-8 py-1.5 text-xs w-full" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#464555]">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Department */}
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
            className="form-control w-auto text-xs py-1.5">
            <option value="">All Departments</option>
            {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          {/* Status filters — contextual per tab */}
          {active === 'attendance' && (
            <select value={attStatusFilter} onChange={e => setAttStatusFilter(e.target.value)}
              className="form-control w-auto text-xs py-1.5">
              <option value="">All Statuses</option>
              {ATT_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          )}

          {active === 'leaves' && (
            <>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="form-control w-auto text-xs py-1.5">
                <option value="">All Statuses</option>
                {LEAVE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={leaveTypeFilter} onChange={e => setLeaveTypeFilter(e.target.value)}
                className="form-control w-auto text-xs py-1.5">
                <option value="">All Leave Types</option>
                {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </>
          )}

          {active === 'employees' && (
            <>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="form-control w-auto text-xs py-1.5">
                <option value="">All Statuses</option>
                {EMP_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={empTypeFilter} onChange={e => setEmpTypeFilter(e.target.value)}
                className="form-control w-auto text-xs py-1.5">
                <option value="">All Types</option>
                {EMP_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </>
          )}

          {anyFilter && (
            <button onClick={() => { setSearch(''); setDeptFilter(''); setStatusFilter(''); setLeaveTypeFilter(''); setAttStatusFilter(''); setEmpTypeFilter(''); }}
              className="flex items-center gap-1 text-xs font-bold text-rose-500 hover:text-rose-600 px-2 py-1.5 rounded-lg hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-all">
              <X size={12} /> Clear all
            </button>
          )}

          <span className="ml-auto text-xs text-[#777587] font-semibold">
            {activeRows.length} record{activeRows.length !== 1 ? 's' : ''}
            {anyFilter && <span className="text-[#3525cd] ml-1">(filtered)</span>}
          </span>
        </div>
      </div>

      {/* ── ATTENDANCE TABLE ──────────────────────────────────────────────────── */}
      {active === 'attendance' && (
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f9f9ff] border-b border-[#c7c4d8]">
                <tr>
                  <SortTh col="name"       sort={sort} onSort={toggleSort}>Employee</SortTh>
                  <SortTh col="department" sort={sort} onSort={toggleSort}>Department</SortTh>
                  <SortTh col="date"       sort={sort} onSort={toggleSort}>Date</SortTh>
                  <th className="px-4 py-3 text-left text-xs font-black text-[#464555] whitespace-nowrap uppercase tracking-wider">Status</th>
                  <SortTh col="check_in"   sort={sort} onSort={toggleSort}>Check In</SortTh>
                  <SortTh col="check_out"  sort={sort} onSort={toggleSort}>Check Out</SortTh>
                  <SortTh col="work_hours" sort={sort} onSort={toggleSort}>Hours</SortTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f3ff]">
                {attLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-[#f0f3ff] rounded w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-14 text-center">
                      <CalendarDays size={32} className="text-[#c7c4d8] mx-auto mb-2" />
                      <p className="text-sm font-semibold text-[#464555]">No attendance records found</p>
                      <p className="text-xs text-[#9ca3af] mt-1">{anyFilter ? 'Try adjusting your filters.' : `No data for ${periodLabel}.`}</p>
                    </td>
                  </tr>
                ) : displayRows.map((r, i) => (
                  <tr key={i} className="hover:bg-[#f9f9ff] transition-colors">
                    <td className="px-4 py-3 font-semibold text-[#151c27] whitespace-nowrap">{r.name}</td>
                    <td className="px-4 py-3 text-[#464555] text-xs">{r.department || '—'}</td>
                    <td className="px-4 py-3 text-[#464555] text-xs whitespace-nowrap">{r.date}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[0.68rem] font-bold px-2 py-0.5 rounded-full border capitalize', ATT_STATUS_STYLE[r.status] || 'bg-slate-50 text-slate-500 border-slate-200')}>
                        {r.status?.replace('_', ' ') || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#464555] text-xs font-mono">{r.check_in || '—'}</td>
                    <td className="px-4 py-3 text-[#464555] text-xs font-mono">{r.check_out || '—'}</td>
                    <td className="px-4 py-3 text-[#464555] text-xs">{r.work_hours > 0 ? `${r.work_hours}h` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="px-4 py-3 border-t border-[#f0f3ff] bg-[#f9f9ff] flex items-center justify-between">
              <span className="text-xs text-[#777587]">Showing {displayRows.length} of {activeRows.length} records</span>
              <button onClick={() => setPageSize(p => p + 50)}
                className="text-xs font-bold text-[#3525cd] hover:underline">Load 50 more</button>
            </div>
          )}
        </div>
      )}

      {/* ── LEAVES TABLE ──────────────────────────────────────────────────────── */}
      {active === 'leaves' && (
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f9f9ff] border-b border-[#c7c4d8]">
                <tr>
                  <SortTh col="name"        sort={sort} onSort={toggleSort}>Employee</SortTh>
                  <SortTh col="department"  sort={sort} onSort={toggleSort}>Department</SortTh>
                  <th className="px-4 py-3 text-left text-xs font-black text-[#464555] whitespace-nowrap uppercase tracking-wider">Type</th>
                  <SortTh col="start_date"  sort={sort} onSort={toggleSort}>From</SortTh>
                  <SortTh col="end_date"    sort={sort} onSort={toggleSort}>To</SortTh>
                  <th className="px-4 py-3 text-left text-xs font-black text-[#464555] whitespace-nowrap uppercase tracking-wider">Duration</th>
                  <th className="px-4 py-3 text-left text-xs font-black text-[#464555] whitespace-nowrap uppercase tracking-wider">Status</th>
                  <SortTh col="approved_by" sort={sort} onSort={toggleSort}>Approved By</SortTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f3ff]">
                {lvLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-[#f0f3ff] rounded w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-14 text-center">
                      <FileText size={32} className="text-[#c7c4d8] mx-auto mb-2" />
                      <p className="text-sm font-semibold text-[#464555]">No leave records found</p>
                      <p className="text-xs text-[#9ca3af] mt-1">{anyFilter ? 'Try adjusting your filters.' : `No leave data for ${periodLabel}.`}</p>
                    </td>
                  </tr>
                ) : displayRows.map((r, i) => (
                  <tr key={i} className="hover:bg-[#f9f9ff] transition-colors">
                    <td className="px-4 py-3 font-semibold text-[#151c27] whitespace-nowrap">{r.name}</td>
                    <td className="px-4 py-3 text-[#464555] text-xs">{r.department || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[0.68rem] font-bold px-2 py-0.5 rounded-full capitalize', LEAVE_TYPE_STYLE[r.leave_type] || 'bg-slate-50 text-slate-600')}>
                        {r.leave_type || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#464555] text-xs whitespace-nowrap">{r.start_date}</td>
                    <td className="px-4 py-3 text-[#464555] text-xs whitespace-nowrap">{r.end_date}</td>
                    <td className="px-4 py-3 text-[#464555] text-xs capitalize">{r.leave_time?.replace('_', ' ') || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[0.68rem] font-bold px-2 py-0.5 rounded-full border capitalize', LEAVE_STATUS_STYLE[r.status] || 'bg-slate-50 text-slate-500 border-slate-200')}>
                        {r.status || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#464555] text-xs">{r.approved_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="px-4 py-3 border-t border-[#f0f3ff] bg-[#f9f9ff] flex items-center justify-between">
              <span className="text-xs text-[#777587]">Showing {displayRows.length} of {activeRows.length} records</span>
              <button onClick={() => setPageSize(p => p + 50)} className="text-xs font-bold text-[#3525cd] hover:underline">Load 50 more</button>
            </div>
          )}
        </div>
      )}

      {/* ── EMPLOYEES TABLE ───────────────────────────────────────────────────── */}
      {active === 'employees' && (
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f9f9ff] border-b border-[#c7c4d8]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-black text-[#464555] whitespace-nowrap uppercase tracking-wider">Employee</th>
                  <SortTh col="email"             sort={sort} onSort={toggleSort}>Email</SortTh>
                  <SortTh col="department"        sort={sort} onSort={toggleSort}>Department</SortTh>
                  <SortTh col="position"          sort={sort} onSort={toggleSort}>Position</SortTh>
                  <SortTh col="employment_type"   sort={sort} onSort={toggleSort}>Type</SortTh>
                  <SortTh col="employment_status" sort={sort} onSort={toggleSort}>Status</SortTh>
                  <SortTh col="date_of_joining"   sort={sort} onSort={toggleSort}>Joined</SortTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f3ff]">
                {empLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-[#f0f3ff] rounded w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-14 text-center">
                      <Users size={32} className="text-[#c7c4d8] mx-auto mb-2" />
                      <p className="text-sm font-semibold text-[#464555]">No employees found</p>
                      <p className="text-xs text-[#9ca3af] mt-1">{anyFilter ? 'Try adjusting your filters.' : 'No employee records available.'}</p>
                    </td>
                  </tr>
                ) : displayRows.map((r, i) => (
                  <tr key={i} className="hover:bg-[#f9f9ff] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={r.name} size={28} />
                        <div>
                          <p className="font-semibold text-[#151c27] text-sm leading-tight whitespace-nowrap">{r.name}</p>
                          {r.employee_id && <p className="text-[0.65rem] text-[#9ca3af]">#{r.employee_id}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#464555] text-xs">{r.email || '—'}</td>
                    <td className="px-4 py-3 text-[#464555] text-xs">{r.department || '—'}</td>
                    <td className="px-4 py-3 text-[#464555] text-xs">{r.position || '—'}</td>
                    <td className="px-4 py-3 text-xs capitalize">
                      <span className="bg-[#f0f3ff] text-[#3525cd] text-[0.68rem] font-bold px-2 py-0.5 rounded-full">
                        {r.employment_type?.replace('_', ' ') || 'Full Time'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[0.68rem] font-bold px-2 py-0.5 rounded-full border capitalize', EMP_STATUS_STYLE[r.employment_status] || EMP_STATUS_STYLE.active)}>
                        {r.employment_status || 'active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#464555] text-xs whitespace-nowrap">{r.date_of_joining || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="px-4 py-3 border-t border-[#f0f3ff] bg-[#f9f9ff] flex items-center justify-between">
              <span className="text-xs text-[#777587]">Showing {displayRows.length} of {activeRows.length} employees</span>
              <button onClick={() => setPageSize(p => p + 50)} className="text-xs font-bold text-[#3525cd] hover:underline">Load 50 more</button>
            </div>
          )}
        </div>
      )}

      {/* ── EXPORT MODAL ─────────────────────────────────────────────────────── */}
      {dlOpen && (
        <DownloadModal open={dlOpen} onClose={() => setDlOpen(false)} active={active} onDownload={handleDownload} />
      )}

    </div>
  );
}
