import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Plus, ClipboardList, CheckCircle2, XCircle, Clock, ChevronRight, Trash2 } from 'lucide-react';
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

export default function Regularization() {
  const { isAdmin, isEmployee, isRootAdmin } = useAuth();
  const wrap = '';
  const [searchParams] = useSearchParams();
  const [applyOpen,   setApplyOpen]   = useState(false);
  const [reviewReq,   setReviewReq]   = useState(null);
  const [confirmDel,  setConfirmDel]  = useState(null);
  const [filter,      setFilter]      = useState('all');
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

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);
  const counts   = { pending: requests.filter(r => r.status === 'pending').length, approved: requests.filter(r => r.status === 'approved').length, rejected: requests.filter(r => r.status === 'rejected').length };

  return (
    <div className={wrap}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance Regularization</h1>
          <p className="page-subtitle">{isAdmin ? 'Review and approve employee attendance correction requests' : 'Request a correction to your attendance record'}</p>
        </div>
        {!isAdmin && (
          <button className="btn btn-primary" onClick={() => setApplyOpen(true)}>
            <Plus size={16} />Request Correction
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { key: 'pending',  label: 'Pending Review', color: 'from-amber-50 to-amber-100',     top: '#F59E0B', text: 'text-amber-700' },
          { key: 'approved', label: 'Approved',        color: 'from-emerald-50 to-emerald-100', top: '#10B981', text: 'text-emerald-700' },
          { key: 'rejected', label: 'Rejected',        color: 'from-rose-50 to-rose-100',       top: '#EF4444', text: 'text-rose-700' },
        ].map(s => (
          <div key={s.key} onClick={() => setFilter(f => f === s.key ? 'all' : s.key)}
            className={`rounded-xl p-4 bg-gradient-to-br ${s.color} border border-[#c7c4d8] shadow-card relative overflow-hidden cursor-pointer hover:shadow-card-hover transition-all ${filter === s.key ? 'ring-2 ring-[#3525cd]' : ''}`}>
            <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: s.top }} />
            <div className={`text-2xl font-black ${s.text}`}>{counts[s.key]}</div>
            <div className="text-[0.68rem] font-bold uppercase tracking-wider text-[#777587] mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {['all','pending','approved','rejected'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold capitalize border transition-all ${filter === f ? 'bg-[#3525cd] text-white border-[#3525cd] shadow-sm' : 'bg-white text-[#464555] border-[#c7c4d8] hover:border-[#3525cd]/40 hover:text-[#3525cd]'}`}>
            {f === 'all' ? `All (${requests.length})` : `${f} (${counts[f] || 0})`}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="loading"><div className="spinner" />Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <ClipboardList size={48} className="mx-auto mb-3 text-[#c7c4d8]" />
          <p className="font-semibold text-[#464555] mb-1">No regularization requests</p>
          <p className="text-sm">{filter !== 'all' ? `No ${filter} requests` : isAdmin ? 'Employees have not submitted any correction requests yet' : 'You have not submitted any correction requests'}</p>
          {!isAdmin && filter === 'all' && <button className="btn btn-primary mt-4" onClick={() => setApplyOpen(true)}><Plus size={14} />Submit First Request</button>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(r => {
            const cfg = STATUS_CFG[r.status] || STATUS_CFG.pending;
            return (
              <div key={r.id} className="card p-4 hover:shadow-card-hover transition-all duration-200">
                <div className="flex items-start gap-4">
                  <Avatar name={r.user_name || 'Employee'} color={r.user_avatar_color} size={38} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="font-bold text-[#151c27]">{r.user_name || 'Employee'}</span>
                      {r.user_department && <span className="text-xs text-[#777587]">· {r.user_department}</span>}
                      <span className={`badge ${cfg.cls} flex items-center gap-1`}>{cfg.icon}{cfg.label}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-xs mb-2">
                      <div><span className="text-[#777587]">Date</span><p className="font-semibold text-[#151c27]">{fmtDate(r.date)}</p></div>
                      {r.requested_check_in  && <div><span className="text-[#777587]">Req. In</span><p className="font-semibold text-[#151c27]">{r.requested_check_in}</p></div>}
                      {r.requested_check_out && <div><span className="text-[#777587]">Req. Out</span><p className="font-semibold text-[#151c27]">{r.requested_check_out}</p></div>}
                      <div><span className="text-[#777587]">Submitted</span><p className="font-semibold text-[#151c27]">{new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p></div>
                    </div>
                    <div className="text-xs text-[#777587] bg-[#f9f9ff] rounded-lg px-3 py-2 border border-[#f0f3ff] italic">
                      "{r.reason}"
                    </div>
                    {r.reviewer_notes && (
                      <div className="text-xs mt-2 flex items-start gap-1.5">
                        <span className="text-[#777587] flex-shrink-0">HR Note:</span>
                        <span className="text-[#464555]">{r.reviewer_notes}</span>
                      </div>
                    )}
                  </div>
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
