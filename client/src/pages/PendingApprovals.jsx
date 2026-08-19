import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList, CheckCircle2, XCircle, Clock, Umbrella, Home,
  Search, Filter, ChevronLeft, ChevronRight, Users, Check, X,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPut, apiPost } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { fmtDate } from '@/lib/utils';

const TYPE_CFG = {
  leave: { label: 'Leave Request',  icon: <Umbrella size={13} />, bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  wfh:   { label: 'WFH Request',    icon: <Home size={13} />,    bg: 'bg-[#f0f3ff]', text: 'text-[#3525cd]',  border: 'border-[#c7c4d8]' },
  reg:   { label: 'Regularization', icon: <Clock size={13} />,   bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
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
  const toast = useToast();
  const qc    = useQueryClient();

  const [tab,        setTab]        = useState('all');
  const [search,     setSearch]     = useState('');
  const [deptFilt,   setDeptFilt]   = useState('');
  const [page,       setPage]       = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // ── Old-flow: status=pending ──────────────────────────────────────────────
  const { data: _leaves = [], isLoading: loadLeaves } = useQuery({
    queryKey: ['pending-approvals-leaves'],
    queryFn:  () => apiGet('/leaves').catch(() => []),
    select:   d  => (Array.isArray(d) ? d : []).filter(l => l.status === 'pending'),
    refetchInterval: 30000,
  });

  // ── Old-flow: status=pending_root ─────────────────────────────────────────
  const { data: _rootLeaves = [], isLoading: loadRootLeaves } = useQuery({
    queryKey: ['pending-root-leaves'],
    queryFn:  () => apiGet('/leaves/pending-root').catch(() => []),
    refetchInterval: 30000,
  });

  // ── New workflow: my-approvals (hr_admin / root_admin levels) ─────────────
  const { data: _myApprovals = [], isLoading: loadMyApprovals } = useQuery({
    queryKey: ['my-workflow-approvals'],
    queryFn:  () => apiGet('/leaves/my-approvals').catch(() => []),
    refetchInterval: 30000,
  });

  // ── Regularizations ───────────────────────────────────────────────────────
  const { data: _regs = [], isLoading: loadRegs } = useQuery({
    queryKey: ['pending-approvals-regs'],
    queryFn:  () => apiGet('/regularization').catch(() => []),
    select:   d  => (Array.isArray(d) ? d : []).filter(r => r.status === 'pending'),
    refetchInterval: 30000,
  });

  const isLoading = loadLeaves || loadRegs || loadRootLeaves || loadMyApprovals;

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['pending-approvals-leaves'] });
    qc.invalidateQueries({ queryKey: ['pending-root-leaves'] });
    qc.invalidateQueries({ queryKey: ['my-workflow-approvals'] });
    qc.invalidateQueries({ queryKey: ['pending-approvals-regs'] });
    qc.invalidateQueries({ queryKey: ['root-dashboard'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  }

  // ── Mutations ─────────────────────────────────────────────────────────────
  const approveLeaveMut = useMutation({
    mutationFn: id => apiPut(`/leaves/${id}/approve`),
    onSuccess:  () => { toast('Leave approved!', 'success'); invalidate(); },
    onError:    e  => toast(e.message, 'error'),
  });
  const rejectLeaveMut = useMutation({
    mutationFn: id => apiPut(`/leaves/${id}/reject`),
    onSuccess:  () => { toast('Leave rejected', 'warning'); invalidate(); },
    onError:    e  => toast(e.message, 'error'),
  });
  const approveRegMut = useMutation({
    mutationFn: id => apiPut(`/regularization/${id}/review`, { status: 'approved' }),
    onSuccess:  () => { toast('Regularization approved!', 'success'); invalidate(); },
    onError:    e  => toast(e.message, 'error'),
  });
  const rejectRegMut = useMutation({
    mutationFn: id => apiPut(`/regularization/${id}/review`, { status: 'rejected' }),
    onSuccess:  () => { toast('Regularization rejected', 'warning'); invalidate(); },
    onError:    e  => toast(e.message, 'error'),
  });

  const isBusy = approveLeaveMut.isPending || rejectLeaveMut.isPending ||
    approveRegMut.isPending || rejectRegMut.isPending;

  const isWfh = l => l.leave_type === 'wfh' || l.leave_time === 'wfh';

  // Old flow leaves
  const leaves     = _leaves.map(l => ({ ...l, _kind: isWfh(l) ? 'wfh' : 'leave', _name: l.name, _dept: l.department || '', _flow: 'old_pending' }));
  // Old flow pending_root
  const rootLeaves = _rootLeaves
    .filter(l => l._flow === 'legacy' || !l._flow)   // only legacy ones (new workflow ones come via my-approvals)
    .map(l => ({ ...l, _kind: isWfh(l) ? 'wfh' : 'leave', _name: l.name, _dept: l.department || '', _flow: 'old_root' }));
  // New workflow (admin/root level) — filter out dept-level ones (handled by DeptHeadApprovals)
  const workflowLeaves = _myApprovals
    .filter(l => ['hr_admin','root_admin'].includes(l.current_level_role_type))
    .map(l => ({ ...l, _kind: isWfh(l) ? 'wfh' : 'leave', _name: l.name, _dept: l.department || '', _flow: 'new' }));
  // Regs
  const regs = _regs.map(r => ({ ...r, _kind: 'reg', _name: r.user_name, _dept: r.user_department || '' }));

  const all = [...leaves, ...rootLeaves, ...workflowLeaves, ...regs]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const leaveCount    = leaves.length;
  const wfhCount      = leaves.filter(l => l._kind === 'wfh').length;
  const regCount      = regs.length;
  const workflowCount = workflowLeaves.length;
  const oldRootCount  = rootLeaves.length;
  const totalCount    = all.length;

  const summaryCards = [
    { label: 'Total Pending',       value: totalCount,     bg: 'bg-amber-50',  text: 'text-amber-700',  icon: <ClipboardList size={16} />, tabKey: 'all'      },
    { label: 'Workflow Approvals',  value: workflowCount,  bg: 'bg-[#f0f3ff]', text: 'text-[#3525cd]',  icon: <CheckCircle2 size={16} />,  tabKey: 'workflow' },
    { label: 'Legacy Pending Root', value: oldRootCount,   bg: 'bg-violet-50', text: 'text-violet-700', icon: <Clock size={16} />,         tabKey: 'root'     },
    { label: 'Regularization',      value: regCount,       bg: 'bg-orange-50', text: 'text-orange-700', icon: <Clock size={16} />,         tabKey: 'reg'      },
  ];

  const TABS = [
    { key: 'all',      label: `All (${totalCount})` },
    { key: 'workflow', label: `New Workflow (${workflowCount})`, highlight: workflowCount > 0 },
    { key: 'root',     label: `Pending Final (${oldRootCount})` },
    { key: 'leave',    label: `Legacy Leave (${leaveCount})` },
    { key: 'reg',      label: `Regularization (${regCount})` },
  ];

  const depts   = [...new Set(all.map(r => r._dept).filter(Boolean))].sort();

  const filtered = all.filter(r => {
    if (tab === 'workflow') return r._flow === 'new';
    if (tab === 'root')     return r._flow === 'old_root';
    if (tab === 'leave')    return r._flow === 'old_pending' && r._kind === 'leave';
    if (tab === 'wfh')      return r._flow === 'old_pending' && r._kind === 'wfh';
    if (tab === 'reg')      return r._kind === 'reg';
    // 'all': everything
    if (deptFilt && r._dept !== deptFilt) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r._name?.toLowerCase().includes(q) && !r._dept?.toLowerCase().includes(q)) return false;
    }
    return true;
  }).filter(r => {
    if (tab !== 'all') return true;
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
    if (item._kind === 'reg') return approveRegMut.mutate(item.id);
    approveLeaveMut.mutate(item.id); // works for all flows — PUT /approve is now workflow-aware
  }
  function handleReject(item) {
    if (item._kind === 'reg') return rejectRegMut.mutate(item.id);
    rejectLeaveMut.mutate(item.id);
  }

  // ── Status cell ───────────────────────────────────────────────────────────
  function StatusCell({ item }) {
    if (item._flow === 'new') {
      const levelLabel = item.current_level_label || item.current_level_role_type?.replace(/_/g, ' ') || 'Your Approval';
      return (
        {/* BUG_139: constrain stage cell width to prevent layout overflow */}
        <div className="space-y-0.5 max-w-full overflow-hidden">
          <span title={levelLabel} className="inline-flex items-center gap-1 text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-[#f0f3ff] text-[#3525cd] border border-[#c7c4d8] max-w-full truncate">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3525cd] animate-pulse flex-shrink-0" /> <span className="truncate">{levelLabel}</span>
          </span>
          {item.current_level && (
            <p className="text-[0.58rem] text-[#777587]">Level {item.current_level}</p>
          )}
        </div>
      );
    }
    if (item._flow === 'old_root') {
      return (
        <div className="space-y-0.5">
          <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500" /> Pending Final Approval
          </span>
          <p className="text-[0.58rem] text-emerald-600 font-semibold">✓ Dept Head Approved</p>
        </div>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Pending
      </span>
    );
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
          <div key={i} onClick={() => { setTab(c.tabKey); setPage(1); }}
            className={`bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-4 cursor-pointer hover:shadow-md hover:border-[#3525cd]/30 hover:-translate-y-0.5 transition-all ${tab === c.tabKey ? 'ring-2 ring-[#3525cd]/30' : ''}`}>
            <div className={`w-9 h-9 rounded-xl ${c.bg} ${c.text} flex items-center justify-center mb-3`}>{c.icon}</div>
            <p className="text-2xl font-black text-[#151c27]">{c.value}</p>
            <p className="text-xs text-[#777587] font-medium mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-4 border-b border-[#e7eefe] overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setPage(1); }}
              className={`px-3 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
                tab === t.key
                  ? 'border-[#3525cd] text-[#3525cd] bg-[#f0f3ff]'
                  : 'border-transparent text-[#777587] hover:text-[#151c27]'
              }`}>
              {t.label}
              {t.highlight && tab !== t.key && (
                <span className="w-2 h-2 rounded-full bg-[#3525cd] animate-pulse" />
              )}
            </button>
          ))}
        </div>

        {/* Filters */}
        {tab === 'all' && (
          <div className="flex flex-wrap gap-3 px-5 py-3 border-b border-[#f0f3ff] bg-[#fafaff]">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
              <input className="form-control pl-8 py-1.5 text-xs" placeholder="Search by name…"
                value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <select className="form-control w-44 py-1.5 text-xs" value={deptFilt} onChange={e => { setDeptFilt(e.target.value); setPage(1); }}>
              <option value="">All Departments</option>
              {depts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}

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
                  {['Type','Employee','Department','Details','Applied','Stage','Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[0.65rem] font-black uppercase tracking-wider text-[#9ca3af]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f9f9ff]">
                {paginated.map(item => (
                  <tr key={`${item._flow || item._kind}-${item.id}`} className="hover:bg-[#fafaff] transition-colors">
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
                        : `${(item.leave_type || 'leave').replace(/_/g,' ')} · ${item.start_date === item.end_date ? fmtDate(item.start_date) : `${fmtDate(item.start_date)} – ${fmtDate(item.end_date)}`}`
                      }
                    </td>
                    <td className="px-4 py-3 text-xs text-[#777587] whitespace-nowrap">
                      {item.created_at ? new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-3 max-w-[140px] overflow-hidden"><StatusCell item={item} /></td>
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
              Showing {Math.min((page - 1) * rowsPerPage + 1, filtered.length)}–{Math.min(page * rowsPerPage, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-[#777587]">
                <span>Rows:</span>
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

      <div className="rounded-xl border border-[#e7eefe] bg-[#f9f9ff] px-5 py-4 text-xs text-[#777587] space-y-1">
        <p><span className="font-bold text-[#3525cd]">ℹ️</span> New Workflow leaves use the configurable approval chain set in Leave Workflow Settings.</p>
        <p>All approval activities are logged for audit purposes.</p>
      </div>
    </div>
  );
}
