import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Plus, ClipboardList, CheckCircle2, XCircle, Clock, ChevronRight, Trash2, Search, Download, SortDesc, X, CalendarRange, Send } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Avatar } from '@/components/ui/Avatar';
import { fmtDate } from '@/lib/utils';

function fmtRecordDate(dateStr) {
  if (!dateStr) return '--';
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return dateStr; }
}

function fmtTime12(t) {
  if (!t) return '--:--';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

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

function ApplyModal({ open, onClose, initialDate }) {
  const toast = useToast();
  const qc    = useQueryClient();
  const [form, setForm] = useState({ date: initialDate || '', requested_check_in: '', requested_check_out: '', reason: '' });
  const [timeErr, setTimeErr] = useState('');

  useEffect(() => {
    if (open && initialDate) setForm(f => ({ ...f, date: initialDate }));
  }, [open, initialDate]);
  const set = (k, v) => {
    setForm(f => {
      const updated = { ...f, [k]: v };
      if (k === 'requested_check_in' || k === 'requested_check_out') {
        const ci = k === 'requested_check_in' ? v : updated.requested_check_in;
        const co = k === 'requested_check_out' ? v : updated.requested_check_out;
        if (ci && co && co <= ci) {
          setTimeErr('Check-Out time cannot be earlier than or equal to Check-In time.');
        } else {
          setTimeErr('');
        }
      }
      return updated;
    });
  };

  const mut = useMutation({
    mutationFn: () => apiPost('/regularization', form),
    onSuccess: () => { toast('Request submitted!', 'success'); qc.invalidateQueries({ queryKey: ['regularization'] }); onClose(); },
    onError: e => toast(e.message, 'error'),
  });

  function handleSubmit() {
    if (form.requested_check_in && form.requested_check_out && form.requested_check_out <= form.requested_check_in) {
      toast('Check-Out time cannot be earlier than or equal to Check-In time.', 'error');
      return;
    }
    mut.mutate();
  }

  return (
    <Modal open={open} onClose={onClose} title="Request Attendance Correction" size="md"
      footer={
        <div className="flex justify-end gap-3">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={mut.isPending || !form.date || !form.reason || !!timeErr}>
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
            <input type="time" className={`form-control ${timeErr ? 'border-rose-400' : ''}`} value={form.requested_check_out} onChange={e => set('requested_check_out', e.target.value)} />
          </div>
        </div>
        {timeErr && (
          <p className="text-xs text-rose-600 flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-rose-100 flex items-center justify-center text-[0.6rem] shrink-0">!</span>
            {timeErr}
          </p>
        )}
        <div>
          <label className="form-label">Reason *</label>
          <textarea className="form-control" rows={3} placeholder="Explain why the attendance needs correction…" value={form.reason} onChange={e => set('reason', e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

// ─── Multi-day Regularization Modal (Relitrade / biometric orgs only) ─────────
function MultiDayApplyModal({ open, onClose, initialDate }) {
  const toast = useToast();
  const qc    = useQueryClient();

  const makeRecord = (id, date) => ({
    id, date: date || '', requested_check_in: '', requested_check_out: '', reason: '', saved: false,
  });

  const [records,  setRecords]  = useState([makeRecord(1, initialDate)]);
  const [activeId, setActiveId] = useState(1);
  const [nextId,   setNextId]   = useState(2);
  const [timeErr,  setTimeErr]  = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Re-seed when opened with a different initialDate
  useEffect(() => {
    if (open) {
      setRecords([makeRecord(1, initialDate)]);
      setActiveId(1);
      setNextId(2);
      setTimeErr('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const activeRecord = records.find(r => r.id === activeId) || records[0];

  function addDay() {
    if (records.length >= 30) return;
    const id = nextId;
    setRecords(prev => [...prev, makeRecord(id, '')]);
    setActiveId(id);
    setNextId(n => n + 1);
  }

  function updateField(field, value) {
    setRecords(prev => prev.map(r => {
      if (r.id !== activeId) return r;
      const updated = { ...r, [field]: value, saved: false };
      if (field === 'requested_check_in' || field === 'requested_check_out') {
        const ci = field === 'requested_check_in' ? value : r.requested_check_in;
        const co = field === 'requested_check_out' ? value : r.requested_check_out;
        setTimeErr(ci && co && co <= ci ? 'Check-Out must be after Check-In' : '');
      }
      return updated;
    }));
  }

  function saveCurrentRecord() {
    if (!activeRecord.date || !activeRecord.reason) {
      toast('Date and reason are required', 'error');
      return;
    }
    // Prevent duplicate dates within the same batch
    const isDuplicate = records.some(r => r.id !== activeId && r.date === activeRecord.date);
    if (isDuplicate) {
      toast(`${activeRecord.date} is already added in another record in this batch`, 'error');
      return;
    }
    if (activeRecord.requested_check_in && activeRecord.requested_check_out
        && activeRecord.requested_check_out <= activeRecord.requested_check_in) {
      toast('Check-Out must be after Check-In', 'error');
      return;
    }
    setRecords(prev => prev.map(r => r.id === activeId ? { ...r, saved: true } : r));
    setTimeErr('');
    const unsaved = records.filter(r => r.id !== activeId && !r.saved);
    if (unsaved.length > 0) setActiveId(unsaved[0].id);
  }

  function deleteRecord(id) {
    if (records.length <= 1) return;
    setRecords(prev => {
      const next = prev.filter(r => r.id !== id);
      if (activeId === id) setActiveId(next[0].id);
      return next;
    });
  }

  const completedRecords = records.filter(r => r.saved && r.date && r.reason);
  const canSubmit = completedRecords.length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    let succeeded = 0;
    let failed    = 0;
    for (const rec of completedRecords) {
      try {
        await apiPost('/regularization', {
          date:                  rec.date,
          requested_check_in:    rec.requested_check_in  || null,
          requested_check_out:   rec.requested_check_out || null,
          reason:                rec.reason,
        });
        succeeded++;
      } catch (err) {
        failed++;
        toast(`${rec.date}: ${err.message}`, 'error');
      }
    }
    if (succeeded > 0) {
      toast(`${succeeded} request${succeeded > 1 ? 's' : ''} submitted!`, 'success');
      qc.invalidateQueries({ queryKey: ['regularization'] });
    }
    setSubmitting(false);
    if (failed === 0) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{ background: 'rgba(21,28,39,.6)', backdropFilter: 'blur(14px) saturate(180%)' }}
    >
      <div className="bg-white rounded-xl w-full max-w-5xl flex flex-col border border-[#c7c4d8] shadow-[0_32px_80px_rgba(0,0,0,.18)] overflow-hidden" style={{ maxHeight: '92vh' }}>
        {/* Accent bar */}
        <div className="h-[3px] shrink-0 rounded-t-xl" style={{ background: 'linear-gradient(90deg,#3525cd,#4f46e5,#712ae2,#8a4cfc)' }} />

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-[#f0f3ff] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#f0f3ff] border border-[#c7c4d8] flex items-center justify-center shrink-0">
              <CalendarRange size={18} className="text-[#3525cd]" />
            </div>
            <div>
              <h2 className="text-base font-black text-[#151c27]">Attendance Regularization</h2>
              <p className="text-xs text-[#777587]">Submit attendance corrections for one or more working days.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={addDay}
              disabled={records.length >= 30}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#3525cd] border border-[#3525cd] rounded-lg px-3 py-1.5 hover:bg-[#f0f3ff] disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <Plus size={13} /> Add Another Day
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-[#777587] hover:text-[#151c27] hover:bg-[#f0f3ff] transition ml-1">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body: two-panel */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left panel — record list */}
          <div className="w-[270px] shrink-0 border-r border-[#f0f3ff] flex flex-col">
            <div className="px-4 py-2.5 border-b border-[#f0f3ff] bg-[#f9f9ff]">
              <p className="text-[0.65rem] font-bold text-[#777587] uppercase tracking-wide">Requested Days ({records.length})</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {records.map((rec, idx) => {
                const isActive    = rec.id === activeId;
                const isCompleted = rec.saved && rec.date && rec.reason;
                return (
                  <div
                    key={rec.id}
                    onClick={() => setActiveId(rec.id)}
                    className={`rounded-xl border p-3 cursor-pointer transition-all ${
                      isActive
                        ? 'border-[#3525cd] bg-[#f0f3ff]'
                        : 'border-[#e7eefe] bg-white hover:border-[#3525cd]/40 hover:bg-[#f8f9ff]'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-[#3525cd] flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[0.55rem] font-bold text-white">{idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5 flex-wrap">
                          <p className="text-xs font-bold text-[#151c27] truncate">
                            {rec.date ? fmtRecordDate(rec.date) : '— Not set —'}
                          </p>
                          {isCompleted ? (
                            <span className="flex items-center gap-0.5 text-[0.55rem] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5 shrink-0">
                              <CheckCircle2 size={7} /> Completed
                            </span>
                          ) : (
                            <span className="flex items-center gap-0.5 text-[0.55rem] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 shrink-0">
                              ⚠ Draft
                            </span>
                          )}
                        </div>
                        <p className="text-[0.6rem] text-[#777587]">
                          {rec.requested_check_in ? fmtTime12(rec.requested_check_in) : '--:--'}
                          {' – '}
                          {rec.requested_check_out ? fmtTime12(rec.requested_check_out) : '--:--'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Note */}
            <div className="px-4 py-3 border-t border-[#f0f3ff] bg-[#f9f9ff] shrink-0">
              <div className="flex items-start gap-1.5 text-[0.6rem] text-[#777587]">
                <span className="text-[#3525cd] shrink-0 mt-0.5">ℹ</span>
                <span>You can add up to 30 days in a single request.</span>
              </div>
            </div>
          </div>

          {/* Right panel — form */}
          <div className="flex-1 overflow-y-auto">
            {activeRecord ? (
              <div className="p-5">
                {/* Record header */}
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#f0f3ff]">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[#3525cd]">
                      Record {records.findIndex(r => r.id === activeId) + 1}
                    </span>
                    {activeRecord.date && (
                      <>
                        <span className="text-[#c7c4d8]">•</span>
                        <span className="text-sm font-semibold text-[#151c27]">{fmtRecordDate(activeRecord.date)}</span>
                      </>
                    )}
                  </div>
                  {records.length > 1 && (
                    <button
                      onClick={() => deleteRecord(activeId)}
                      className="flex items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-700 transition"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  )}
                </div>

                {/* Form fields */}
                <div className="space-y-4">
                  <div>
                    <label className="form-label">Date *</label>
                    <input
                      type="date"
                      className={`form-control ${records.some(r => r.id !== activeId && r.date === activeRecord.date && activeRecord.date) ? 'border-rose-400' : ''}`}
                      value={activeRecord.date}
                      onChange={e => updateField('date', e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                    />
                    {records.some(r => r.id !== activeId && r.date === activeRecord.date && activeRecord.date) && (
                      <p className="text-xs text-rose-600 mt-1 flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-rose-100 flex items-center justify-center text-[0.6rem] shrink-0">!</span>
                        This date is already used in another record in this batch.
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">Correct Check-In</label>
                      <input
                        type="time"
                        className="form-control"
                        value={activeRecord.requested_check_in}
                        onChange={e => updateField('requested_check_in', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label">Correct Check-Out</label>
                      <input
                        type="time"
                        className={`form-control ${timeErr ? 'border-rose-400' : ''}`}
                        value={activeRecord.requested_check_out}
                        onChange={e => updateField('requested_check_out', e.target.value)}
                      />
                    </div>
                  </div>
                  {timeErr && (
                    <p className="text-xs text-rose-600 flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-rose-100 flex items-center justify-center text-[0.6rem] shrink-0">!</span>
                      {timeErr}
                    </p>
                  )}
                  <div>
                    <label className="form-label">Reason *</label>
                    <textarea
                      className="form-control"
                      rows={4}
                      placeholder="Explain why the attendance needs correction…"
                      value={activeRecord.reason}
                      onChange={e => updateField('reason', e.target.value)}
                    />
                  </div>
                </div>

                {/* Record-level actions */}
                <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-[#f0f3ff]">
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      setRecords(prev => prev.map(r => r.id === activeId ? { ...r, saved: false } : r));
                      setTimeErr('');
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={saveCurrentRecord}
                    disabled={
                      !activeRecord.date || !activeRecord.reason || !!timeErr ||
                      records.some(r => r.id !== activeId && r.date === activeRecord.date && !!activeRecord.date)
                    }
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-[#777587] text-sm">
                Select a record to edit
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#f0f3ff] shrink-0 bg-[#fafaff]">
          <p className="text-sm font-semibold text-[#151c27]">
            Total Records: <span className="text-[#3525cd] font-black">{records.length}</span>
          </p>
          <div className="flex items-center gap-3">
            <p className="text-xs text-[#777587]">All records must be valid to submit.</p>
            <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {submitting
                ? <><span className="spinner w-4 h-4" />Submitting…</>
                : <><Send size={14} />Submit Request</>}
            </button>
          </div>
        </div>
      </div>
    </div>
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
  const dateParam = searchParams.get('date') || '';

  const [applyOpen,   setApplyOpen]   = useState(false);
  const [reviewReq,   setReviewReq]   = useState(null);
  const [confirmDel,  setConfirmDel]  = useState(null);
  const [filter,      setFilter]      = useState(() => {
    const s = searchParams.get('status');
    return s && ['pending', 'approved', 'rejected'].includes(s) ? s : 'all';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');
  const [sortBy,      setSortBy]      = useState('newest');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const toast = useToast();
  const qc    = useQueryClient();

  // Check if the org has biometric (Relitrade / biometric orgs get multi-day modal)
  const { data: biometricData, isSuccess: biometricResolved } = useQuery({
    queryKey: ['org-has-biometric'],
    queryFn: () => apiGet('/biometric/has-biometric').catch(() => ({ has_biometric: false })),
    staleTime: 10 * 60 * 1000,
    enabled: !isAdmin,
  });
  const hasBiometric = biometricData?.has_biometric === true;

  // Auto-open apply modal only after the biometric check resolves,
  // so we open the correct modal type from the start (no flash/switch).
  useEffect(() => {
    if (!isAdmin && biometricResolved && searchParams.get('action') === 'apply') {
      setApplyOpen(true);
    }
  }, [biometricResolved]);

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

      {applyOpen && !isAdmin && hasBiometric && (
        <MultiDayApplyModal open onClose={() => setApplyOpen(false)} initialDate={dateParam} />
      )}
      {applyOpen && !isAdmin && !hasBiometric && (
        <ApplyModal open onClose={() => setApplyOpen(false)} initialDate={dateParam} />
      )}
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
