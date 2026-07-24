import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Plus, ClipboardList, CheckCircle2, XCircle, Clock, ChevronRight, Trash2, Search, Download, SortDesc, X, CalendarRange } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Avatar } from '@/components/ui/Avatar';
import { fmtDate } from '@/lib/utils';

const STATUS_CFG = {
  pending:  { cls: 'badge-pending',  icon: <Clock size={11} />,         label: 'Pending'  },
  approved: { cls: 'badge-approved', icon: <CheckCircle2 size={11} />,  label: 'Approved' },
  rejected: { cls: 'badge-rejected', icon: <XCircle size={11} />,       label: 'Rejected' },
};

const STATUS_BORDER = {
  pending:  'border-l-4 border-l-amber-400',
  approved: 'border-l-4 border-l-emerald-400',
  rejected: 'border-l-4 border-l-rose-400',
};

function ReviewModal({ open, onClose, request }) {
  const toast = useToast();
  const qc    = useQueryClient();
  const [notes, setNotes] = useState('');

  const mut = useMutation({
    mutationFn: status => apiPut(`/regularization/${request.id}/review`, { status, reviewer_notes: notes }),
    onSuccess: () => { toast('Review submitted!', 'success'); qc.invalidateQueries({ queryKey: ['regularization'] }); onClose(); },
    onError: e => toast(e.message, 'error'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Review Regularization Request" size="md"
      footer={
        <div className="flex justify-end gap-3">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={() => mut.mutate('rejected')} disabled={mut.isPending}>Reject</button>
          <button className="btn btn-primary" onClick={() => mut.mutate('approved')} disabled={mut.isPending}>
            {mut.isPending ? <><span className="spinner w-4 h-4" />Saving…</> : 'Approve'}
          </button>
        </div>
      }>
      <div className="space-y-4">
        <div className="rounded-xl bg-[#f9f9ff] border border-[#e7eefe] p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Avatar name={request.user_name || 'Employee'} color={request.user_avatar_color} size={32} />
            <div>
              <p className="font-bold text-sm text-[#151c27]">{request.user_name}</p>
              <p className="text-xs text-[#777587]">{request.user_department}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div className="text-xs"><span className="text-[#777587]">Date</span><p className="font-semibold text-[#151c27]">{fmtDate(request.date)}</p></div>
            {request.requested_check_in  && <div className="text-xs"><span className="text-[#777587]">Requested In</span><p className="font-semibold text-[#151c27]">{request.requested_check_in}</p></div>}
            {request.requested_check_out && <div className="text-xs"><span className="text-[#777587]">Requested Out</span><p className="font-semibold text-[#151c27]">{request.requested_check_out}</p></div>}
          </div>
          <div className="text-xs pt-1 border-t border-[#f0f3ff]">
            <span className="text-[#777587]">Reason</span>
            <p className="text-[#151c27] mt-0.5 italic">"{request.reason}"</p>
          </div>
        </div>
        <div>
          <label className="form-label">Reviewer Notes <span className="font-normal text-[#777587] normal-case tracking-normal">(optional — sent to employee)</span></label>
          <textarea className="form-control" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add a note for the employee…" />
        </div>
      </div>
    </Modal>
  );
}

function ApplyModal({ open, onClose }) {
  const toast = useToast();
  const qc    = useQueryClient();
  const [form, setForm] = useState({ date: '', requested_check_in: '', requested_check_out: '', reason: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const mut = useMutation({
    mutationFn: () => apiPost('/regularization', form),
    onSuccess: () => { toast('Request submitted!', 'success'); qc.invalidateQueries({ queryKey: ['regularization'] }); onClose(); },
    onError: e => toast(e.message, 'error'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Request Attendance Correction" size="md"
      footer={
        <div className="flex justify-end gap-3">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => mut.mutate()} disabled={mut.isPending || !form.date || !form.reason}>
            {mut.isPending ? <><span className="spinner w-4 h-4" />Submitting…</> : 'Submit Request'}
          </button>
        </div>
      }>
      <div className="space-y-4">
        <div>
          <label className="form-label">Date *</label>
          <input type="date" className="form-control" value={form.date} onChange={e => set('date', e.target.value)} max={new Date().toISOString().split('T')[0]} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Correct Check-in</label>
            <input type="time" className="form-control" value={form.requested_check_in} onChange={e => set('requested_check_in', e.target.value)} />
          </div>
          <div>
            <label className="form-label">Correct Check-out</label>
            <input type="time" className="form-control" value={form.requested_check_out} onChange={e => set('requested_check_out', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="form-label">Reason *</label>
          <textarea className="form-control" rows={3} placeholder="Explain why the attendance needs correction…" value={form.reason} onChange={e => set('reason', e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

const PAGE_SIZE = 15;

function fmtUpdated(dateStr) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch {
    return null;
  }
}

function exportCSV(rows) {
  const headers = ['Date', 'Requester', 'Department', 'Req Check-in', 'Req Check-out', 'Actual Check-in', 'Actual Check-out', 'Reason', 'Status', 'Submitted', 'Reviewer Notes'];
  const escape = v => {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    headers.join(','),
    ...rows.map(r => [
      r.date,
      r.user_name || '',
      r.user_department || '',
      r.requested_check_in || '',
      r.requested_check_out || '',
      r.actual_check_in || '',
      r.actual_check_out || '',
      r.reason || '',
      r.status || '',
      r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN') : '',
      r.reviewer_notes || '',
    ].map(escape).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `regularization_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Regularization() {
  const { isAdmin, isEmployee, isRootAdmin } = useAuth();
  const wrap = '';
  const [searchParams] = useSearchParams();
  const [applyOpen,   setApplyOpen]   = useState(false);
  const [reviewReq,   setReviewReq]   = useState(null);
  const [confirmDel,  setConfirmDel]  = useState(null);
  const [filter,      setFilter]      = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');
  const [sortBy,      setSortBy]      = useState('newest');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const toast = useToast();
  const qc    = useQueryClient();

  // Auto-open apply modal if coming from quick actions; auto-apply status filter from dashboard
  useEffect(() => {
    if (!isAdmin && searchParams.get('action') === 'apply') setApplyOpen(true);
    const s = searchParams.get('status');
    if (s && ['pending', 'approved', 'rejected'].includes(s)) setFilter(s);
  }, []);

  const { data: _regData, isLoading } = useQuery({ queryKey: ['regularization'], queryFn: () => apiGet('/regularization') });
  const requests = Array.isArray(_regData) ? _regData : [];

  const delMut = useMutation({
    mutationFn: id => apiDelete(`/regularization/${id}`),
    onSuccess: () => { toast('Request deleted', 'warning'); qc.invalidateQueries({ queryKey: ['regularization'] }); setConfirmDel(null); },
    onError: e => toast(e.message, 'error'),
  });

  const counts = {
    pending:  requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  };

  const isFilterActive = filter !== 'all' || searchQuery.trim() !== '' || dateFrom !== '' || dateTo !== '' || sortBy !== 'newest';

  const filtered = useMemo(() => {
    let list = filter === 'all' ? [...requests] : requests.filter(r => r.status === filter);

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(r =>
        (r.reason && r.reason.toLowerCase().includes(q)) ||
        (r.date && r.date.includes(q)) ||
        (r.user_name && r.user_name.toLowerCase().includes(q))
      );
    }

    if (dateFrom) {
      list = list.filter(r => r.date && r.date >= dateFrom);
    }
    if (dateTo) {
      list = list.filter(r => r.date && r.date <= dateTo);
    }

    list.sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
      if (sortBy === 'oldest') {
        return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      }
      if (sortBy === 'date_asc') {
        return (a.date || '').localeCompare(b.date || '');
      }
      if (sortBy === 'date_desc') {
        return (b.date || '').localeCompare(a.date || '');
      }
      return 0;
    });

    return list;
  }, [requests, filter, searchQuery, dateFrom, dateTo, sortBy]);

  const clearAllFilters = () => {
    setFilter('all');
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setSortBy('newest');
    setVisibleCount(PAGE_SIZE);
  };

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter, searchQuery, dateFrom, dateTo, sortBy]);

  const visibleRows = filtered.slice(0, visibleCount);
  const remaining   = filtered.length - visibleCount;

  return (
    <div className={wrap}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance Regularization</h1>
          <p className="page-subtitle">{isAdmin ? 'Review and approve employee attendance correction requests' : 'Request a correction to your attendance record'}</p>
        </div>
        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <button
              className="btn btn-outline"
              onClick={() => exportCSV(filtered)}
              title="Export filtered requests as CSV"
            >
              <Download size={14} />
              Export
            </button>
          )}
          {!isAdmin && (
            <button className="btn btn-primary" onClick={() => setApplyOpen(true)}>
              <Plus size={16} />Request Correction
            </button>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { key: 'pending',  label: 'Pending Review', color: 'from-amber-50 to-amber-100',     top: '#F59E0B', text: 'text-amber-700' },
          { key: 'approved', label: 'Approved',        color: 'from-emerald-50 to-emerald-100', top: '#10B981', text: 'text-emerald-700' },
          { key: 'rejected', label: 'Rejected',        color: 'from-rose-50 to-rose-100',       top: '#EF4444', text: 'text-rose-700' },
        ].map(s => (
          <div key={s.key} onClick={() => setFilter(f => f === s.key ? 'all' : s.key)}
            className={`rounded-xl p-4 bg-gradient-to-br ${s.color} border shadow-card relative overflow-hidden cursor-pointer hover:shadow-card-hover transition-all ${filter === s.key ? 'ring-2 ring-[#3525cd] ring-offset-1 border-[#3525cd]/30' : 'border-[#c7c4d8]'}`}>
            <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: s.top }} />
            <div className={`text-2xl font-black ${s.text}`}>{counts[s.key]}</div>
            <div className="text-[0.68rem] font-bold uppercase tracking-wider text-[#777587] mt-1">{s.label}</div>
            {filter === s.key && (
              <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#3525cd]" />
            )}
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['all','pending','approved','rejected'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold capitalize border transition-all ${filter === f ? 'bg-[#3525cd] text-white border-[#3525cd] shadow-sm' : 'bg-white text-[#464555] border-[#c7c4d8] hover:border-[#3525cd]/40 hover:text-[#3525cd]'}`}>
            {f === 'all' ? `All (${requests.length})` : `${f} (${counts[f] || 0})`}
          </button>
        ))}
      </div>

      {/* Filter bar: search + date range + sort + clear */}
      <div className="flex flex-wrap items-center gap-2 mb-5 p-3 bg-[#f9f9ff] border border-[#e7eefe] rounded-xl">
        {/* Search */}
        <div className="relative flex-1 min-w-[160px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#777587] pointer-events-none" />
          <input
            type="text"
            className="form-control pl-8 py-1.5 text-sm"
            placeholder="Search reason, date, name…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#777587] hover:text-[#3525cd]"
              onClick={() => setSearchQuery('')}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Date From */}
        <div className="flex items-center gap-1.5">
          <CalendarRange size={13} className="text-[#777587] flex-shrink-0" />
          <input
            type="date"
            className="form-control py-1.5 text-xs w-[130px]"
            title="From date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
          />
          <span className="text-xs text-[#777587]">to</span>
          <input
            type="date"
            className="form-control py-1.5 text-xs w-[130px]"
            title="To date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
          />
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1.5">
          <SortDesc size={13} className="text-[#777587] flex-shrink-0" />
          <select
            className="form-control py-1.5 text-xs pr-7"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="date_asc">Date asc</option>
            <option value="date_desc">Date desc</option>
          </select>
        </div>

        {/* Clear all */}
        {isFilterActive && (
          <button
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 border border-rose-200 bg-rose-50 hover:bg-rose-100 transition-colors flex-shrink-0"
            onClick={clearAllFilters}
          >
            <X size={12} />
            Clear All
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="loading"><div className="spinner" />Loading…</div>
      ) : filtered.length === 0 ? (
        isFilterActive ? (
          /* No results with active filters */
          <div className="empty-state">
            <Search size={44} className="mx-auto mb-3 text-[#c7c4d8]" />
            <p className="font-semibold text-[#464555] mb-1">No results found</p>
            <p className="text-sm text-[#777587]">No requests match your current filters</p>
            <button className="btn btn-outline mt-4" onClick={clearAllFilters}>
              <X size={14} />Clear Filters
            </button>
          </div>
        ) : (
          /* Completely empty */
          <div className="empty-state">
            <ClipboardList size={48} className="mx-auto mb-3 text-[#c7c4d8]" />
            <p className="font-semibold text-[#464555] mb-1">No regularization requests</p>
            <p className="text-sm text-[#777587]">{isAdmin ? 'Employees have not submitted any correction requests yet' : 'You have not submitted any correction requests yet'}</p>
            {!isAdmin && (
              <button className="btn btn-primary mt-4" onClick={() => setApplyOpen(true)}>
                <Plus size={14} />Submit First Request
              </button>
            )}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {/* Count row */}
          <p className="text-xs text-[#777587] font-medium">
            Showing {Math.min(visibleCount, filtered.length)} of {filtered.length} request{filtered.length !== 1 ? 's' : ''}
          </p>

          {visibleRows.map(r => {
            const cfg        = STATUS_CFG[r.status] || STATUS_CFG.pending;
            const borderCls  = STATUS_BORDER[r.status] || STATUS_BORDER.pending;
            const updatedAt  = r.updated_at || r.created_at;
            const submittedLabel = r.created_at
              ? new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
              : '—';
            const updatedLabel = fmtUpdated(updatedAt);

            return (
              <div key={r.id} className={`card p-4 hover:shadow-card-hover transition-all duration-200 ${borderCls}`}>
                <div className="flex items-start gap-4">
                  <Avatar name={r.user_name || 'Employee'} color={r.user_avatar_color} size={38} />
                  <div className="flex-1 min-w-0">
                    {/* Name + dept + badge */}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="font-bold text-[#151c27]">{r.user_name || 'Employee'}</span>
                      {r.user_department && <span className="text-xs text-[#777587]">· {r.user_department}</span>}
                      <span className={`badge ${cfg.cls} flex items-center gap-1 font-semibold`}>
                        {cfg.icon}{cfg.label}
                      </span>
                    </div>

                    {/* Time fields grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-xs mb-2">
                      <div>
                        <span className="text-[#777587]">Date</span>
                        <p className="font-semibold text-[#151c27]">{fmtDate(r.date)}</p>
                      </div>
                      {r.requested_check_in && (
                        <div>
                          <span className="text-[#777587]">Req. In</span>
                          <p className="font-semibold text-[#151c27]">{r.requested_check_in}</p>
                        </div>
                      )}
                      {r.requested_check_out && (
                        <div>
                          <span className="text-[#777587]">Req. Out</span>
                          <p className="font-semibold text-[#151c27]">{r.requested_check_out}</p>
                        </div>
                      )}
                      {r.actual_check_in && (
                        <div>
                          <span className="text-[#777587]">Actual In</span>
                          <p className="font-semibold text-[#151c27]">{r.actual_check_in}</p>
                        </div>
                      )}
                      {r.actual_check_out && (
                        <div>
                          <span className="text-[#777587]">Actual Out</span>
                          <p className="font-semibold text-[#151c27]">{r.actual_check_out}</p>
                        </div>
                      )}
                      <div>
                        <span className="text-[#777587]">Submitted</span>
                        <p className="font-semibold text-[#151c27]">{submittedLabel}</p>
                      </div>
                    </div>

                    {/* Reason */}
                    <div className="text-xs text-[#777587] bg-[#f9f9ff] rounded-lg px-3 py-2 border border-[#f0f3ff] italic">
                      "{r.reason}"
                    </div>

                    {/* Reviewer notes */}
                    {r.reviewer_notes && (
                      <div className="text-xs mt-2 flex items-start gap-1.5">
                        <span className="text-[#777587] flex-shrink-0">HR Note:</span>
                        <span className="text-[#464555]">{r.reviewer_notes}</span>
                      </div>
                    )}

                    {/* Last updated */}
                    {updatedLabel && (
                      <p className="text-[0.65rem] text-[#a09fb5] mt-1.5">
                        Updated: {updatedLabel}
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 flex-shrink-0">
                    {isAdmin && r.status === 'pending' && (
                      <button className="btn btn-outline btn-sm" onClick={() => setReviewReq(r)}>
                        Review <ChevronRight size={13} />
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        className="p-1.5 rounded-lg text-[#c7c4d8] hover:text-rose-500 hover:bg-rose-50 transition-colors"
                        title="Delete request"
                        onClick={() => setConfirmDel(r)}
                        disabled={!isRootAdmin && r.status !== 'pending'}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Load More */}
          {remaining > 0 && (
            <button
              className="mt-2 w-full py-2.5 rounded-xl border border-[#c7c4d8] bg-white text-sm font-semibold text-[#464555] hover:border-[#3525cd]/50 hover:text-[#3525cd] hover:bg-[#f5f4ff] transition-all"
              onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            >
              Load More (+{remaining} remaining)
            </button>
          )}
        </div>
      )}

      {applyOpen && <ApplyModal open onClose={() => setApplyOpen(false)} />}
      {reviewReq && <ReviewModal open onClose={() => setReviewReq(null)} request={reviewReq} />}
      <ConfirmModal
        open={!!confirmDel}
        title="Delete Regularization Request"
        message={`Delete the regularization request from ${confirmDel?.user_name || 'this employee'} for ${confirmDel?.date ? fmtDate(confirmDel.date) : ''}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => delMut.mutate(confirmDel.id)}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}
