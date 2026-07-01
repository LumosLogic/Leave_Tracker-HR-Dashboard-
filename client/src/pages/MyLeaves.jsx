import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, CheckCircle2, XCircle, Clock, Inbox, AlertTriangle, Trash2, X, Info, Loader2, RotateCcw, BookOpen } from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/context/ToastContext';
import { countWorkingDaysInRange } from '@/lib/utils';


const LEAVE_TYPES = [
  { value: 'annual',    label: 'Annual Leave',    quota: 'annual'     },
  { value: 'casual',    label: 'Casual Leave',    quota: 'casual'     },
  { value: 'sick',      label: 'Sick Leave',      quota: 'sick'       },
  { value: 'emergency', label: 'Emergency Leave', quota: null         },
  { value: 'other',     label: 'Other / Unpaid',  quota: null         },
];

const STATUS_STYLES = {
  pending:   { bg:'bg-amber-50',   text:'text-amber-700',   border:'border-amber-200',   icon:<Clock size={13} /> },
  approved:  { bg:'bg-emerald-50', text:'text-emerald-700', border:'border-emerald-200', icon:<CheckCircle2 size={13} /> },
  rejected:  { bg:'bg-rose-50',    text:'text-rose-700',    border:'border-rose-200',    icon:<XCircle size={13} /> },
  cancelled: { bg:'bg-slate-50',   text:'text-slate-700',   border:'border-slate-200',   icon:<XCircle size={13} /> },
};


const TYPE_COLORS = {
  annual:    'bg-[#f0f3ff] text-[#3525cd] border-[#c7c4d8]',
  sick:      'bg-rose-50 text-rose-700 border-rose-200',
  casual:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  emergency: 'bg-amber-50 text-amber-700 border-amber-200',
  other:     'bg-[#f0f3ff] text-[#464555] border-[#c7c4d8]',
};

const INIT_FORM = { leave_type: 'casual', start_date: '', end_date: '', reason: '', leave_time: 'full', half_type: 'first_half' };

// ── Slide-out Apply Panel ─────────────────────────────────────────────────────
function LeaveApplyPanel({ open, onClose, onSubmit, loading: submitting }) {
  const [form,     setForm]    = useState(INIT_FORM);
  const [checking, setChecking] = useState(false);
  const [check,    setCheck]   = useState(null);   // { conflicts, hasAttendance, usedByType, totalAnnual }
  const checkTimer = useRef(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Auto-fill end_date when start_date is chosen
  function handleStartDate(val) {
    set('start_date', val);
    if (!form.end_date || form.end_date < val) set('end_date', val);
  }

  // Trigger conflict/balance check whenever dates change
  useEffect(() => {
    if (!form.start_date || !form.end_date) { setCheck(null); return; }
    clearTimeout(checkTimer.current);
    setChecking(true);
    checkTimer.current = setTimeout(async () => {
      try {
        const data = await apiGet('/leaves/date-check', { startDate: form.start_date, endDate: form.end_date });
        setCheck(data);
      } catch { setCheck(null); }
      finally { setChecking(false); }
    }, 400);
    return () => clearTimeout(checkTimer.current);
  }, [form.start_date, form.end_date]);

  // Reset on close
  useEffect(() => { if (!open) { setForm(INIT_FORM); setCheck(null); } }, [open]);

  // Compute balance for the selected leave type
  function getBalance(typeVal) {
    if (!check) return null;
    const typeInfo = LEAVE_TYPES.find(t => t.value === typeVal);
    if (!typeInfo?.quota) return null;   // unlimited / no quota
    const used = check.usedByType?.[typeVal] || 0;
    const total = typeVal === 'annual' ? (check.totalAnnual || 18) : 12; // casual/sick default
    return { used, total, remaining: Math.max(0, total - used) };
  }

  const hasConflict   = (check?.conflicts?.length ?? 0) > 0;
  const hasAttendance = check?.hasAttendance;
  const balance       = check ? getBalance(form.leave_type) : null;
  const noBalance     = balance !== null && balance.remaining <= 0;

  const canSubmit = form.start_date && form.end_date && !submitting;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[900] transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(4,6,14,.5)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full z-[901] w-full max-w-[420px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out`}
        style={{ transform: open ? 'translateX(0)' : 'translateX(100%)' }}
      >
        {/* Top accent */}
        <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #3525cd, #4f46e5, #712ae2)' }} />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f3ff]">
          <div>
            <h2 className="font-black text-[#151c27] text-lg">Request Leave</h2>
            <p className="text-xs text-[#777587] mt-0.5">HR will be notified by email on submission</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-[#777587] hover:text-[#151c27] hover:bg-[#f0f3ff] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* ── Date Selection ── */}
          <div>
            <label className="form-label">From Date</label>
            <input
              type="date"
              className="form-control"
              value={form.start_date}
              onChange={e => handleStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">To Date</label>
            <input
              type="date"
              className="form-control"
              value={form.end_date}
              min={form.start_date}
              onChange={e => set('end_date', e.target.value)}
            />
          </div>

          {/* ── Conflict / Attendance Alerts ── */}
          {form.start_date && form.end_date && (
            <>
              {checking && (
                <div className="flex items-center gap-2 text-xs text-[#777587] bg-[#f0f3ff] rounded-xl px-4 py-3">
                  <Loader2 size={13} className="animate-spin" /> Checking for conflicts…
                </div>
              )}

              {!checking && hasConflict && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700">
                    <AlertTriangle size={13} /> Leave already pending / approved for the selected dates
                  </div>
                  {check.conflicts.map(c => (
                    <div key={c.id} className="text-[0.7rem] text-rose-600 flex items-center gap-1.5 pl-4">
                      <span className="capitalize">{c.leave_type}</span> leave is <strong>{c.status}</strong>
                      <span className="text-rose-400">({c.start_date}{c.end_date !== c.start_date ? ` → ${c.end_date}` : ''})</span>
                    </div>
                  ))}
                </div>
              )}

              {!checking && hasAttendance && !hasConflict && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
                  <Info size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[0.72rem] text-amber-700">Attendance logs are present on selected dates. Your request will still be reviewed by HR.</p>
                </div>
              )}
            </>
          )}

          {/* ── Leave Type ── */}
          <div>
            <label className="form-label">Leave Type</label>
            <div className="space-y-2">
              {LEAVE_TYPES.map(t => {
                const bal = check ? getBalance(t.value) : null;
                const typeConflict = hasConflict;
                const isSelected   = form.leave_type === t.value;
                const nobal        = bal !== null && bal.remaining <= 0;

                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => set('leave_type', t.value)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 text-left transition-all duration-150 ${
                      isSelected
                        ? 'border-[#3525cd] bg-[#f0f3ff]'
                        : 'border-[#e7eefe] bg-white hover:border-[#c7c4d8] hover:bg-[#f9f9ff]'
                    }`}
                  >
                    <div>
                      <div className={`text-sm font-bold ${isSelected ? 'text-[#3525cd]' : 'text-[#151c27]'}`}>{t.label}</div>
                      {check && (
                        <div className="text-[0.67rem] mt-0.5">
                          {typeConflict && isSelected && (
                            <span className="text-rose-600">A leave request is already pending / approved for the selected dates.</span>
                          )}
                          {!typeConflict && bal !== null && (
                            nobal
                              ? <span className="text-rose-500">Not enough balance — {bal.remaining} day(s) remaining</span>
                              : <span className="text-emerald-600">{bal.remaining} of {bal.total} day(s) remaining</span>
                          )}
                          {!typeConflict && bal === null && (
                            <span className="text-[#777587]">Unlimited / no quota</span>
                          )}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <div className="w-4 h-4 rounded-full bg-[#3525cd] flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 size={10} className="text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Duration ── */}
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
                <option value="first_half">First Half (Morning)</option>
                <option value="second_half">Second Half (Afternoon)</option>
              </select>
            </div>
          )}

          {/* ── Reason ── */}
          <div>
            <label className="form-label">Reason <span className="text-[#777587] font-normal">(optional)</span></label>
            <textarea
              className="form-control resize-none"
              rows={3}
              value={form.reason}
              onChange={e => set('reason', e.target.value)}
              placeholder="Briefly describe the reason for your leave…"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#f0f3ff] space-y-2">
          {noBalance && (
            <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <AlertTriangle size={12} className="inline mr-1" />
              Insufficient leave balance for the selected type. HR may still review at their discretion.
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn btn-outline flex-1">Cancel</button>
            <button
              onClick={() => onSubmit(form)}
              disabled={!canSubmit}
              className="btn btn-primary flex-1"
            >
              {submitting
                ? <span className="flex items-center gap-1.5 justify-center"><span className="spinner w-3.5 h-3.5" /> Submitting…</span>
                : 'Submit Request'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main MyLeaves Page ────────────────────────────────────────────────────────
export default function MyLeaves() {
  const qc = useQueryClient();
  const toast = useToast();
  const [applyOpen, setApplyOpen] = useState(false);
  const [delTarget, setDelTarget] = useState(null);

  const { data: leaves = [], isLoading } = useQuery({
    queryKey: ['my-leaves'],
    queryFn:  () => apiGet('/leaves'),
  });

  const { data: policies = [] } = useQuery({
    queryKey: ['leave-policies'],
    queryFn:  () => apiGet('/leave-policies'),
  });

  const apply = useMutation({
    mutationFn: (form) => apiPost('/leaves', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-leaves'] });
      qc.invalidateQueries({ queryKey: ['my-leaves-recent'] });
      toast('Leave request submitted. HR will be notified by email.', 'success');
      setApplyOpen(false);
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const revert = useMutation({
    mutationFn: (id) => apiPut(`/leaves/${id}/revert`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-leaves'] });
      qc.invalidateQueries({ queryKey: ['my-leaves-recent'] });
      toast('Leave reverted successfully.', 'info');
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

  const counts = { pending: 0, approved: 0, rejected: 0 };
  leaves.filter(l => l.leave_time !== 'wfh').forEach(l => { if (counts[l.status] !== undefined) counts[l.status]++; });

  const activePolicies = policies.filter(p => p.active && p.annual_quota > 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Leaves</h1>
          <p className="page-subtitle">Apply and track your leave requests</p>
        </div>
        <button
          onClick={() => setApplyOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
          style={{ background: 'linear-gradient(135deg, #3525cd, #4f46e5)' }}
        >
          <Plus size={15} /> Apply for Leave
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Pending',  count: counts.pending,  style: STATUS_STYLES.pending  },
          { label: 'Approved', count: counts.approved, style: STATUS_STYLES.approved },
          { label: 'Rejected', count: counts.rejected, style: STATUS_STYLES.rejected },
        ].map(({ label, count, style }) => (
          <div key={label} className={`${style.bg} ${style.border} border rounded-2xl p-4 text-center`}>
            <p className={`text-2xl font-black ${style.text}`}>{count}</p>
            <p className="text-xs text-[#464455] mt-0.5 font-medium">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5 items-start">
        <div>
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
              <div key={l.id} className={`bg-white rounded-xl border border-[#c7c4d8] p-4 shadow-card hover:shadow-card-hover transition-all ${l.status === 'pending' ? 'border-l-4 border-l-amber-400' : l.status === 'approved' ? 'border-l-4 border-l-emerald-400' : l.status === 'rejected' ? 'border-l-4 border-l-rose-400' : ''}`}>
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
                      {l.leave_time === 'wfh' && l.leave_type !== 'casual' && (
                        <span className="text-xs bg-[#f0f3ff] text-[#464555] border border-[#c7c4d8] px-2.5 py-0.5 rounded-full font-medium">
                          WFH
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-[#151c27]">
                        {l.start_date === l.end_date ? l.start_date : `${l.start_date} → ${l.end_date}`}
                      </p>
                      <span className="text-[0.68rem] font-bold px-2 py-0.5 rounded bg-[#f0f3ff] text-[#3525cd] border border-[#c7c4d8]">
                        {l.leave_time === 'half' ? '0.5 Working Day' : `${countWorkingDaysInRange(l.start_date, l.end_date)} Working Days`}
                      </span>
                    </div>

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
        </div>

        {/* Leave Balance Summary sidebar */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm self-start">
          <div className="px-5 py-4 border-b border-[#f0f3ff] flex items-center gap-2">
            <BookOpen size={14} className="text-[#3525cd]" />
            <span className="font-black text-[#151c27] text-sm">Leave Balance</span>
          </div>
          <div className="p-4 space-y-0">
            {activePolicies.length === 0 ? (
              <p className="text-xs text-[#777587] text-center py-4">No policies configured</p>
            ) : activePolicies.map(p => {
              const used    = leaves
                .filter(l => l.leave_type === p.leave_type && l.status === 'approved' && l.leave_time !== 'wfh')
                .reduce((sum, l) => sum + (l.leave_time === 'half' ? 0.5 : countWorkingDaysInRange(l.start_date, l.end_date)), 0);
              const pending = leaves
                .filter(l => l.leave_type === p.leave_type && l.status === 'pending' && l.leave_time !== 'wfh')
                .reduce((sum, l) => sum + (l.leave_time === 'half' ? 0.5 : countWorkingDaysInRange(l.start_date, l.end_date)), 0);
              const total     = p.annual_quota;
              const remaining = Math.max(0, total - used);
              const pct       = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
              return (
                <div key={p.leave_type} className="py-3 border-b border-[#f0f3ff] last:border-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-[#151c27] capitalize">{p.label}</span>
                    <span className="text-xs font-black text-[#3525cd]">{used} <span className="font-normal text-[#777587]">/ {total} days</span></span>
                  </div>
                  <div className="h-1.5 bg-[#f0f3ff] rounded-full overflow-hidden mb-1">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: pct >= 80 ? '#ef4444' : pct >= 50 ? '#f59e0b' : '#10b981' }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[0.65rem] text-[#9ca3af]">{remaining} days remaining</span>
                    {pending > 0 && <span className="text-[0.65rem] font-bold text-amber-600">{pending} pending</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Leave Apply Slide-out */}
      <LeaveApplyPanel
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        onSubmit={(form) => apply.mutate(form)}
        loading={apply.isPending}
      />

      {/* Cancel confirm modal */}
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
