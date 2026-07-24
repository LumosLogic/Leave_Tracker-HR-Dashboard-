import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList, CheckCircle2, XCircle, Clock, Umbrella, Home,
  Search, Filter, ChevronLeft, ChevronRight, Users, Check, X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPut } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { fmtDate } from '@/lib/utils';

const TYPE_CFG = {
  leave:    { label: 'Leave Request',     icon: <Umbrella size={13} />,    bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  wfh:      { label: 'WFH Request',       icon: <Home size={13} />,        bg: 'bg-[#f0f3ff]',  text: 'text-[#3525cd]',   border: 'border-[#c7c4d8]' },
  reg:      { label: 'Regularization',    icon: <Clock size={13} />,       bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200' },
};

function TypeBadge({ kind }) {
  const cfg = TYPE_CFG[kind] || TYPE_CFG.leave;
  return (
    <span className={`inline-flex items-center gap-1 text-[0.65rem] font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

const ROWS_OPTIONS = [5, 10, 20, 50];

export default function PendingApprovals() {
  const { isAdmin, isRootAdmin } = useAuth();
  const navigate   = useNavigate();
  const toast      = useToast();
  const qc         = useQueryClient();

  const [tab,       setTab]       = useState('all');
  const [search,    setSearch]    = useState('');
  const [deptFilt,  setDeptFilt]  = useState('');
  const [page,      setPage]      = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // ── Fetch pending leaves ────────────────────────────────────────────────────
  const { data: _leaves = [], isLoading: loadLeaves } = useQuery({
    queryKey: ['pending-approvals-leaves'],
    queryFn:  () => apiGet('/leaves').catch(() => []),
    select:   d => (Array.isArray(d) ? d : []).filter(l => l.status === 'pending'),
    refetchInterval: 30000,
  });

  // ── Fetch pending regularizations ──────────────────────────────────────────
  const { data: _regs = [], isLoading: loadRegs } = useQuery({
    queryKey: ['pending-approvals-regs'],
    queryFn:  () => apiGet('/regularization').catch(() => []),
    select:   d => (Array.isArray(d) ? d : []).filter(r => r.status === 'pending'),
    refetchInterval: 30000,
  });

  const isLoading = loadLeaves || loadRegs;

  // ── Mutations ───────────────────────────────────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['pending-approvals-leaves'] });
    qc.invalidateQueries({ queryKey: ['pending-approvals-regs'] });
    qc.invalidateQueries({ queryKey: ['root-dashboard'] });
    qc.invalidateQueries({ queryKey: ['root-pending-regs'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const approveLeaveMut = useMutation({
    mutationFn: id => apiPut(`/leaves/${id}/approve`),
    onSuccess: () => { toast('Leave approved!', 'success'); invalidate(); },
    onError:   e  => toast(e.message, 'error'),
  });
  const rejectLeaveMut = useMutation({
    mutationFn: id => apiPut(`/leaves/${id}/reject`),
    onSuccess: () => { toast('Leave rejected', 'warning'); invalidate(); },
    onError:   e  => toast(e.message, 'error'),
  });
  const approveRegMut = useMutation({
    mutationFn: id => apiPut(`/regularization/${id}/review`, { status: 'approved' }),
    onSuccess: () => { toast('Regularization approved!', 'success'); invalidate(); },
    onError:   e  => toast(e.message, 'error'),
  });
  const rejectRegMut = useMutation({
    mutationFn: id => apiPut(`/regularization/${id}/review`, { status: 'rejected' }),
    onSuccess: () => { toast('Regularization rejected', 'warning'); invalidate(); },
    onError:   e  => toast(e.message, 'error'),
  });

  const isBusy = approveLeaveMut.isPending || rejectLeaveMut.isPending || approveRegMut.isPending || rejectRegMut.isPending;

  // ── Build unified list ──────────────────────────────────────────────────────
  const isWfh = l => l.leave_type === 'wfh' || l.leave_time === 'wfh';

  const leaves     = _leaves.map(l => ({ ...l, _kind: isWfh(l) ? 'wfh' : 'leave', _name: l.name, _dept: l.department || '' }));
  const regs       = _regs.map(r => ({ ...r, _kind: 'reg', _name: r.user_name, _dept: r.user_department || '' }));
  const all        = [...leaves, ...regs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const leaveCount = leaves.filter(l => l._kind === 'leave').length;
  const wfhCount   = leaves.filter(l => l._kind === 'wfh').length;
  const regCount   = regs.length;
  const totalCount = all.length;

  const summaryCards = [
    { label: 'Total Pending',           value: totalCount,  icon: <ClipboardList size={16} />, bg: 'bg-amber-50',   text: 'text-amber-700',  onClick: () => setTab('all') },
    { label: 'Leave Requests',          value: leaveCount,  icon: <Umbrella size={16} />,      bg: 'bg-[#f0f3ff]',  text: 'text-[#3525cd]',  onClick: () => setTab('leave') },
    { label: 'WFH Requests',            value: wfhCount,    icon: <Home size={16} />,           bg: 'bg-sky-50',     text: 'text-sky-700',    onClick: () => setTab('wfh') },
    { label: 'Regularization Requests', value: regCount,    icon: <Clock size={16} />,          bg: 'bg-orange-50',  text: 'text-orange-700', onClick: () => setTab('reg') },
  ];

  const TABS = [
    { key: 'all',   label: `All (${totalCount})` },
    { key: 'leave', label: `Leave (${leaveCount})` },
    { key: 'wfh',   label: `WFH (${wfhCount})` },
    { key: 'reg',   label: `Regularization (${regCount})` },
  ];

  // ── Filter ──────────────────────────────────────────────────────────────────
  const depts = [...new Set(all.map(r => r._dept).filter(Boolean))].sort();

  const filtered = all.filter(r => {
    if (tab !== 'all' && r._kind !== tab) return false;
    if (deptFilt && r._dept !== deptFilt) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r._name?.toLowerCase().includes(q) && !r._dept?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paginated  = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  function handleApprove(item) {
    if (item._kind === 'reg') approveRegMut.mutate(item.id);
    else approveLeaveMut.mutate(item.id);
  }
  function handleReject(item) {
    if (item._kind === 'reg') rejectRegMut.mutate(item.id);
    else rejectLeaveMut.mutate(item.id);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Pending Approvals</div>
          <div className="page-subtitle">
            <span className="text-[#777587]">Dashboard</span>
            <span className="mx-1.5 text-[#c7c4d8]">›</span>
            Pending Approvals
            {totalCount > 0 && (
              <span className="ml-2 text-[0.7rem] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                {totalCount} pending
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {summaryCards.map((c, i) => (
          <div key={i} onClick={c.onClick}
            className={`bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-4 cursor-pointer hover:shadow-md hover:border-[#3525cd]/30 hover:-translate-y-0.5 transition-all ${tab === (i === 0 ? 'all' : i === 1 ? 'leave' : i === 2 ? 'wfh' : 'reg') ? 'ring-2 ring-[#3525cd]/30' : ''}`}>
            <div className={`w-9 h-9 rounded-xl ${c.bg} ${c.text} flex items-center justify-center mb-3`}>{c.icon}</div>
            <p className="text-2xl font-black text-[#151c27]">{c.value}</p>
            <p className="text-xs text-[#777587] font-medium mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-4 border-b border-[#e7eefe]">
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setPage(1); }}
              className={`px-3 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all ${
                tab === t.key
                  ? 'border-[#3525cd] text-[#3525cd] bg-[#f0f3ff]'
                  : 'border-transparent text-[#777587] hover:text-[#151c27]'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 px-5 py-3 border-b border-[#f0f3ff] bg-[#fafaff]">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            <input className="form-control pl-8 py-1.5 text-xs" placeholder="Search by employee name…"
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <select className="form-control w-44 py-1.5 text-xs" value={deptFilt} onChange={e => { setDeptFilt(e.target.value); setPage(1); }}>
            <option value="">All Departments</option>
            {depts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><div className="spinner w-6 h-6" /></div>
        ) : paginated.length === 0 ? (
          <div className="py-16 text-center">
            <CheckCircle2 size={40} className="mx-auto mb-3 text-emerald-400" />
            <p className="font-semibold text-[#464555]">No pending requests</p>
            <p className="text-sm text-[#9ca3af] mt-1">All approval requests have been reviewed.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#f0f3ff] bg-[#fafaff]">
                  {['Request Type','Employee','Department','Request Details','Applied Date','Status','Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[0.65rem] font-black uppercase tracking-wider text-[#9ca3af]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f9f9ff]">
                {paginated.map(item => (
                  <tr key={`${item._kind}-${item.id}`} className="hover:bg-[#fafaff] transition-colors">
                    <td className="px-4 py-3"><TypeBadge kind={item._kind} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={item._name} color={item.avatar_color || item.user_avatar_color} size={28} />
                        <div>
                          <p className="text-xs font-bold text-[#151c27]">{item._name}</p>
                          {item.employee_id && <p className="text-[0.6rem] text-[#9ca3af]">{item.employee_id}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#464555]">{item._dept || '—'}</td>
                    <td className="px-4 py-3 text-xs text-[#464555]">
                      {item._kind === 'reg'
                        ? `Check-in Correction · ${fmtDate(item.date)}`
                        : `${item.leave_type ? item.leave_type.replace(/_/g,' ') : 'Leave'} · ${item.start_date === item.end_date ? fmtDate(item.start_date) : `${fmtDate(item.start_date)} – ${fmtDate(item.end_date)}`}`
                      }
                    </td>
                    <td className="px-4 py-3 text-xs text-[#777587] whitespace-nowrap">
                      {item.created_at ? new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Pending
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button onClick={() => handleApprove(item)} disabled={isBusy}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[0.7rem] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-all disabled:opacity-50">
                          <Check size={11} /> Approve
                        </button>
                        <button onClick={() => handleReject(item)} disabled={isBusy}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[0.7rem] font-bold bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition-all disabled:opacity-50">
                          <X size={11} /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-[#f0f3ff] bg-[#fafaff]">
            <p className="text-xs text-[#777587]">
              Showing {Math.min((page - 1) * rowsPerPage + 1, filtered.length)}–{Math.min(page * rowsPerPage, filtered.length)} of {filtered.length} results
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-[#777587]">
                <span>Rows per page:</span>
                <select className="border border-[#c7c4d8] rounded-lg px-1.5 py-0.5 text-xs text-[#464555] bg-white outline-none"
                  value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }}>
                  {ROWS_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1.5 rounded-lg border border-[#c7c4d8] hover:bg-[#f0f3ff] disabled:opacity-40 transition-colors">
                  <ChevronLeft size={13} />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold border transition-all ${
                        p === page ? 'bg-[#3525cd] text-white border-[#3525cd]' : 'border-[#c7c4d8] text-[#464555] hover:bg-[#f0f3ff]'
                      }`}>
                      {p}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-1.5 rounded-lg border border-[#c7c4d8] hover:bg-[#f0f3ff] disabled:opacity-40 transition-colors">
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info footer */}
      <div className="rounded-xl border border-[#e7eefe] bg-[#f9f9ff] px-5 py-4 text-xs text-[#777587] space-y-1">
        <p><span className="font-bold text-[#3525cd]">ℹ️</span> Pending approvals require HR Admin or Root Admin action.</p>
        <p>All approval activities are logged for audit purposes. Approval actions are secure and traceable.</p>
      </div>
    </div>
  );
}
