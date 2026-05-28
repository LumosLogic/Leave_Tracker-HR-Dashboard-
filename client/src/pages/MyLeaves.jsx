import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, FileText, CheckCircle2, XCircle, Clock, Inbox, AlertTriangle, Trash2 } from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/context/ToastContext';

const LEAVE_TYPES = [
  { value:'annual',    label:'Annual Leave' },
  { value:'sick',      label:'Sick Leave' },
  { value:'casual',    label:'Casual Leave' },
  { value:'emergency', label:'Emergency Leave' },
  { value:'other',     label:'Other' },
];

const STATUS_STYLES = {
  pending:  { bg:'bg-amber-50',   text:'text-amber-700',   border:'border-amber-200',   icon:<Clock size={13} /> },
  approved: { bg:'bg-emerald-50', text:'text-emerald-700', border:'border-emerald-200', icon:<CheckCircle2 size={13} /> },
  rejected: { bg:'bg-rose-50',    text:'text-rose-700',    border:'border-rose-200',    icon:<XCircle size={13} /> },
};

const TYPE_COLORS = {
  annual:'bg-[#f0f3ff] text-[#3525cd] border-[#c7c4d8]',
  sick:'bg-rose-50 text-rose-700 border-rose-200',
  casual:'bg-emerald-50 text-emerald-700 border-emerald-200',
  emergency:'bg-amber-50 text-amber-700 border-amber-200',
  other:'bg-[#f0f3ff] text-[#464555] border-[#c7c4d8]',
};

const INIT_FORM = { leave_type:'casual', start_date:'', end_date:'', reason:'', leave_time:'full', half_type:'first_half' };

export default function MyLeaves() {
  const qc = useQueryClient();
  const toast = useToast();
  const [applyOpen, setApplyOpen] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const [form, setForm] = useState(INIT_FORM);

  const { data: leaves = [], isLoading } = useQuery({
    queryKey: ['my-leaves'],
    queryFn:  () => apiGet('/leaves'),
  });

  const apply = useMutation({
    mutationFn: () => apiPost('/leaves', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-leaves'] });
      qc.invalidateQueries({ queryKey: ['my-leaves-recent'] });
      toast('Leave request submitted. HR will be notified by email.', 'success');
      setForm(INIT_FORM);
      setApplyOpen(false);
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const del = useMutation({
    mutationFn: (id) => apiDelete(`/leaves/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-leaves'] });
      qc.invalidateQueries({ queryKey: ['my-leaves-recent'] });
      toast('Leave request cancelled.', 'success');
      setDelTarget(null);
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const counts = { pending: 0, approved: 0, rejected: 0 };
  leaves.forEach(l => { if (counts[l.status] !== undefined) counts[l.status]++; });

  return (
    <div className="p-5 md:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-[#151c27] tracking-tight">My Leaves</h1>
          <p className="text-[#777587] text-sm mt-0.5">Apply for leave and track your requests.</p>
        </div>
        <button onClick={() => setApplyOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
          style={{ background: 'linear-gradient(135deg, #3525cd, #4f46e5)' }}>
          <Plus size={15} /> Apply for Leave
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label:'Pending',  count: counts.pending,  style: STATUS_STYLES.pending  },
          { label:'Approved', count: counts.approved, style: STATUS_STYLES.approved },
          { label:'Rejected', count: counts.rejected, style: STATUS_STYLES.rejected },
        ].map(({ label, count, style }) => (
          <div key={label} className={`${style.bg} ${style.border} border rounded-2xl p-4 text-center`}>
            <p className={`text-2xl font-black ${style.text}`}>{count}</p>
            <p className="text-xs text-[#464455] mt-0.5 font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* Leave list */}
      {isLoading ? (
        <div className="flex justify-center py-16"><div className="spinner w-7 h-7" /></div>
      ) : leaves.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-[#c7c4d8]">
          <Inbox size={36} className="mx-auto text-[#c7c4d8] mb-3" />
          <p className="text-[#464555] font-semibold">No leave requests yet</p>
          <p className="text-[#777587] text-sm mt-1">Apply for your first leave to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leaves.map(l => {
            const s = STATUS_STYLES[l.status] || STATUS_STYLES.pending;
            return (
              <div key={l.id} className="bg-white rounded-xl border border-[#c7c4d8] p-4 shadow-card hover:shadow-card-hover transition-all">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full border font-bold capitalize ${TYPE_COLORS[l.leave_type] || TYPE_COLORS.other}`}>
                        {l.leave_type}
                      </span>
                      {l.leave_time === 'half' && (
                        <span className="text-xs bg-purple-50 text-purple-600 border border-purple-200 px-2.5 py-0.5 rounded-full font-medium">
                          Half Day
                        </span>
                      )}
                      {l.leave_time === 'wfh' && (
                        <span className="text-xs bg-[#f0f3ff] text-[#464555] border border-[#c7c4d8] px-2.5 py-0.5 rounded-full font-medium">
                          WFH
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-[#151c27]">
                      {l.start_date === l.end_date ? l.start_date : `${l.start_date} → ${l.end_date}`}
                    </p>
                    {l.reason && <p className="text-xs text-[#777587] mt-1 italic">"{l.reason}"</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-bold ${s.bg} ${s.text} ${s.border}`}>
                      {s.icon} {l.status}
                    </span>
                    {l.status === 'pending' && (
                      <button onClick={() => setDelTarget(l)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-[#c7c4d8] hover:text-rose-500 hover:bg-rose-50 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Apply Modal */}
      <Modal open={applyOpen} onClose={() => setApplyOpen(false)} title="Apply for Leave"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setApplyOpen(false)} className="btn btn-outline btn-sm">Cancel</button>
            <button onClick={() => apply.mutate()} disabled={apply.isPending || !form.start_date || !form.end_date} className="btn btn-primary btn-sm">
              {apply.isPending ? <span className="flex items-center gap-1.5"><span className="spinner w-3.5 h-3.5" /> Submitting…</span> : 'Submit Request'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-[#f0f3ff] border border-[#c7c4d8] rounded-xl text-xs text-[#3525cd] flex items-start gap-2">
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
            HR and company management will be notified by email once you submit.
          </div>

          <div>
            <label className="form-label">Leave Type</label>
            <select className="form-control" value={form.leave_type} onChange={e => set('leave_type', e.target.value)}>
              {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className="form-label">Duration</label>
            <select className="form-control" value={form.leave_time} onChange={e => set('leave_time', e.target.value)}>
              <option value="full">Full Day(s)</option>
              <option value="half">Half Day</option>
              <option value="wfh">Work from Home</option>
            </select>
          </div>

          {form.leave_time === 'half' && (
            <div>
              <label className="form-label">Which Half</label>
              <select className="form-control" value={form.half_type} onChange={e => set('half_type', e.target.value)}>
                <option value="first_half">First Half</option>
                <option value="second_half">Second Half</option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">From Date</label>
              <input type="date" className="form-control" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div>
              <label className="form-label">To Date</label>
              <input type="date" className="form-control" value={form.end_date} min={form.start_date} onChange={e => set('end_date', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="form-label">Reason <span className="text-[#777587]">(optional)</span></label>
            <textarea className="form-control resize-none" rows={3} value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="Briefly describe the reason for your leave…" />
          </div>
        </div>
      </Modal>

      {/* Cancel confirm */}
      <Modal open={!!delTarget} onClose={() => setDelTarget(null)} title="Cancel Leave Request"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setDelTarget(null)} className="btn btn-outline btn-sm">No, Keep</button>
            <button onClick={() => del.mutate(delTarget.id)} disabled={del.isPending} className="btn btn-danger btn-sm">
              {del.isPending ? 'Cancelling…' : 'Yes, Cancel Request'}
            </button>
          </div>
        }
      >
        <p className="text-[#464555] text-sm">Cancel your <strong className="capitalize">{delTarget?.leave_type}</strong> leave request from {delTarget?.start_date} to {delTarget?.end_date}?</p>
      </Modal>
    </div>
  );
}
