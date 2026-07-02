import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, CheckCircle2, XCircle, Clock, Inbox, AlertTriangle,
  Trash2, X, Info, Loader2, RotateCcw, BookOpen, Home, MapPin, Phone,
} from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/context/ToastContext';
import { countWorkingDaysInRange } from '@/lib/utils';


const LEAVE_TYPES = [
  { value: 'annual',    label: 'Annual Leave',    quota: 'annual' },
  { value: 'casual',    label: 'Casual Leave',    quota: 'casual' },
  { value: 'sick',      label: 'Sick Leave',      quota: 'sick'   },
  { value: 'emergency', label: 'Emergency Leave', quota: null     },
  { value: 'other',     label: 'Other / Unpaid',  quota: null     },
];

const STATUS_STYLES = {
  pending:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   icon: <Clock size={13} /> },
  approved:  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: <CheckCircle2 size={13} /> },
  rejected:  { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    icon: <XCircle size={13} /> },
  cancelled: { bg: 'bg-slate-50',   text: 'text-slate-700',   border: 'border-slate-200',   icon: <XCircle size={13} /> },
};

const TYPE_COLORS = {
  annual:    'bg-[#f0f3ff] text-[#3525cd] border-[#c7c4d8]',
  sick:      'bg-rose-50 text-rose-700 border-rose-200',
  casual:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  emergency: 'bg-amber-50 text-amber-700 border-amber-200',
  other:     'bg-[#f0f3ff] text-[#464555] border-[#c7c4d8]',
};

const INIT_FORM = {
  request_type:   'leave',
  leave_type:     'casual',
  start_date:     '',
  end_date:       '',
  wfh_date:       '',
  reason:         '',
  leave_time:     'full',
  half_type:      'first_half',
  work_location:  '',
  contact_number: '',
};

// ── Segmented control button ───────────────────────────────────────────────────
function SegBtn({ value, current, onChange, children }) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`flex-1 py-2 px-3 text-sm font-semibold rounded-lg transition-all duration-150 ${
        active
          ? 'bg-[#3525cd] text-white shadow-sm'
          : 'bg-white text-[#464555] border border-[#c7c4d8] hover:border-[#3525cd] hover:text-[#3525cd]'
      }`}
    >
      {children}
    </button>
  );
}

// ── Slide-out Apply Panel ─────────────────────────────────────────────────────
function LeaveApplyPanel({ open, onClose, onSubmit, loading: submitting, policies, leaves }) {
  const [form,        setForm]       = useState(INIT_FORM);
  const [checking,    setChecking]   = useState(false);
  const [check,       setCheck]      = useState(null);
  const [wfhChecking, setWfhChecking] = useState(false);
  const [wfhCheck,    setWfhCheck]   = useState(null);
  const checkTimer    = useRef(null);
  const wfhCheckTimer = useRef(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function handleStartDate(val) {
    set('start_date', val);
    if (!form.end_date || form.end_date < val) set('end_date', val);
  }

  // Conflict / balance check for leave requests only
  useEffect(() => {
    if (form.request_type !== 'leave' || !form.start_date || !form.end_date) {
      setCheck(null);
      return;
    }
    clearTimeout(checkTimer.current);
    setChecking(true);
    checkTimer.current = setTimeout(async () => {
      try {
        const data = await apiGet('/leaves/date-check', { startDate: form.start_date, endDate: form.end_date });
        setCheck(data);
      } catch { setCheck(null); }
      finally   { setChecking(false); }
    }, 400);
    return () => clearTimeout(checkTimer.current);
  }, [form.start_date, form.end_date, form.request_type]);

  // Conflict check for WFH date
  useEffect(() => {
    if (form.request_type !== 'wfh' || !form.wfh_date) {
      setWfhCheck(null);
      return;
    }
    clearTimeout(wfhCheckTimer.current);
    setWfhChecking(true);
    wfhCheckTimer.current = setTimeout(async () => {
      try {
        const data = await apiGet('/leaves/date-check', { startDate: form.wfh_date, endDate: form.wfh_date });
        setWfhCheck(data);
      } catch { setWfhCheck(null); }
      finally   { setWfhChecking(false); }
    }, 400);
    return () => clearTimeout(wfhCheckTimer.current);
  }, [form.wfh_date, form.request_type]);

  // Reset on close
  useEffect(() => {
    if (!open) { setForm(INIT_FORM); setCheck(null); setWfhCheck(null); }
  }, [open]);

  // Human-readable date: "02 Jul 2026"
  function fmtConflictDate(d) {
    if (!d) return d;
    const [y, m, day] = d.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${day} ${months[parseInt(m, 10) - 1]} ${y}`;
  }

  // Friendly label for a conflict record
  function conflictLabel(c) {
    const isWfh = c.leave_time === 'wfh' || c.leave_type === 'wfh';
    if (isWfh) return 'Work From Home';
    const map = { casual: 'Casual Leave', sick: 'Sick Leave', annual: 'Annual Leave', earned: 'Earned Leave', emergency: 'Emergency Leave', other: 'Unpaid / Other Leave' };
    return map[c.leave_type] || (c.leave_type ? c.leave_type.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase()) : 'Leave');
  }

  // Build leave types from configured policies (excluding WFH), fallback to hardcoded list
  const isWFHRecord = (l) => l.leave_time === 'wfh' || l.leave_type === 'wfh';
  const activePolicies = (policies || []).filter(p => p.active && p.leave_type !== 'wfh');
  const leaveTypeOptions = activePolicies.length > 0
    ? activePolicies.map(p => ({ value: p.leave_type, label: p.label, quota: p.annual_quota }))
    : LEAVE_TYPES.map(t => ({ ...t, quota: t.quota ? 12 : null }));

  // Compute leave balance from actual leaves data (always visible, not just after date check)
  function getStaticBalance(typeVal) {
    const policy = activePolicies.find(p => p.leave_type === typeVal);
    if (!policy || !policy.annual_quota) return null;
    const total = policy.annual_quota;
    const used  = (leaves || [])
      .filter(l => l.leave_type === typeVal && l.status === 'approved' && !isWFHRecord(l))
      .reduce((sum, l) => sum + (l.leave_time === 'half' ? 0.5 : countWorkingDaysInRange(l.start_date, l.end_date)), 0);
    const pending = (leaves || [])
      .filter(l => l.leave_type === typeVal && l.status === 'pending' && !isWFHRecord(l))
      .reduce((sum, l) => sum + (l.leave_time === 'half' ? 0.5 : countWorkingDaysInRange(l.start_date, l.end_date)), 0);
    return { used, pending, total, remaining: Math.max(0, total - used) };
  }

  const isWFH            = form.request_type === 'wfh';
  const hasConflict      = (check?.conflicts?.length ?? 0) > 0;
  const hasAttendance    = check?.hasAttendance;
  const wfhHasConflict   = (wfhCheck?.conflicts?.length ?? 0) > 0;

  // Balance for the selected leave type (for footer warning)
  const selectedBalance = !isWFH ? getStaticBalance(form.leave_type) : null;
  const noBalance       = selectedBalance !== null && selectedBalance.remaining <= 0;

  // Count of leave days selected
  const leaveDayCount = (!isWFH && form.start_date && form.end_date)
    ? (form.leave_time === 'half' ? 0.5 : countWorkingDaysInRange(form.start_date, form.end_date))
    : 0;

  const canSubmit = isWFH
    ? !!form.wfh_date && !submitting && !wfhHasConflict
    : !!form.start_date && !!form.end_date && !submitting;

  function handleSubmit() {
    if (isWFH) {
      const reasonParts = [
        form.reason,
        form.work_location  ? `Work Location: ${form.work_location}`  : '',
        form.contact_number ? `Contact: ${form.contact_number}` : '',
      ].filter(Boolean);
      onSubmit({
        leave_type: 'wfh',
        leave_time: 'wfh',
        start_date: form.wfh_date,
        end_date:   form.wfh_date,
        reason:     reasonParts.join(' | '),
      });
    } else {
      onSubmit({
        leave_type: form.leave_type,
        leave_time: form.leave_time,
        start_date: form.start_date,
        end_date:   form.end_date,
        reason:     form.reason,
        half_type:  form.leave_time === 'half' ? form.half_type : undefined,
      });
    }
  }

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
        className="fixed top-0 right-0 h-full z-[901] w-full max-w-[420px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out"
        style={{ transform: open ? 'translateX(0)' : 'translateX(100%)' }}
      >
        {/* Top accent */}
        <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #3525cd, #4f46e5, #712ae2)' }} />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f3ff]">
          <div>
            <h2 className="font-black text-[#151c27] text-lg">Apply Request</h2>
            <p className="text-xs text-[#777587] mt-0.5">HR will be notified by email on submission</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-[#777587] hover:text-[#151c27] hover:bg-[#f0f3ff] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* ── Request Type ── */}
          <div>
            <label className="form-label">Request Type</label>
            <div className="flex gap-2 p-1 bg-[#f0f3ff] rounded-xl border border-[#c7c4d8]">
              <SegBtn value="leave" current={form.request_type} onChange={v => set('request_type', v)}>
                Leave
              </SegBtn>
              <SegBtn value="wfh" current={form.request_type} onChange={v => set('request_type', v)}>
                Work From Home
              </SegBtn>
            </div>
          </div>

          {/* ── LEAVE FORM ── */}
          {!isWFH && (
            <>
              {/* Leave Type — shown first so user knows their balance before picking dates */}
              <div>
                <label className="form-label">Leave Type</label>
                <div className="space-y-2">
                  {leaveTypeOptions.map(t => {
                    const bal        = getStaticBalance(t.value);
                    const isSelected = form.leave_type === t.value;
                    const nobal      = bal !== null && bal.remaining <= 0;
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
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-bold ${isSelected ? 'text-[#3525cd]' : 'text-[#151c27]'}`}>{t.label}</div>
                          <div className="text-[0.67rem] mt-0.5">
                            {bal !== null ? (
                              nobal
                                ? <span className="text-rose-500">No balance left — {bal.remaining} day(s) remaining</span>
                                : <span className={nobal ? 'text-rose-500' : bal.remaining <= 2 ? 'text-amber-600' : 'text-emerald-600'}>
                                    {bal.remaining} of {bal.total} day(s) remaining
                                    {bal.pending > 0 && <span className="text-amber-500 ml-1">· {bal.pending} pending</span>}
                                  </span>
                            ) : (
                              <span className="text-[#777587]">Unlimited / no quota</span>
                            )}
                            {hasConflict && isSelected && (
                              <span className="text-rose-600 ml-1">· Conflict on selected dates</span>
                            )}
                          </div>
                        </div>
                        {isSelected && (
                          <div className="w-4 h-4 rounded-full bg-[#3525cd] flex items-center justify-center flex-shrink-0 ml-2">
                            <CheckCircle2 size={10} className="text-white" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Duration — segmented buttons */}
              <div>
                <label className="form-label">Duration</label>
                <div className="flex gap-2 p-1 bg-[#f0f3ff] rounded-xl border border-[#c7c4d8]">
                  <SegBtn value="full" current={form.leave_time} onChange={v => set('leave_time', v)}>Full Day</SegBtn>
                  <SegBtn value="half" current={form.leave_time} onChange={v => set('leave_time', v)}>Half Day</SegBtn>
                </div>
              </div>

              {form.leave_time === 'half' && (
                <div>
                  <label className="form-label">Which Half</label>
                  <div className="flex gap-2 p-1 bg-[#f0f3ff] rounded-xl border border-[#c7c4d8]">
                    <SegBtn value="first_half"  current={form.half_type} onChange={v => set('half_type', v)}>First Half (Morning)</SegBtn>
                    <SegBtn value="second_half" current={form.half_type} onChange={v => set('half_type', v)}>Second Half (Afternoon)</SegBtn>
                  </div>
                </div>
              )}

              <div>
                <label className="form-label">From Date</label>
                <input type="date" className="form-control" value={form.start_date} onChange={e => handleStartDate(e.target.value)} />
              </div>
              <div>
                <label className="form-label">To Date</label>
                <input type="date" className="form-control" value={form.end_date} min={form.start_date} onChange={e => set('end_date', e.target.value)} />
              </div>

              {/* Total days chip */}
              {leaveDayCount > 0 && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#f0f3ff] border border-[#c7c4d8]">
                  <CheckCircle2 size={13} className="text-[#3525cd] flex-shrink-0" />
                  <span className="text-xs font-bold text-[#3525cd]">
                    {leaveDayCount} working day{leaveDayCount !== 1 ? 's' : ''} selected
                  </span>
                </div>
              )}

              {/* Conflict / Attendance Alerts */}
              {form.start_date && form.end_date && (
                <>
                  {checking && (
                    <div className="flex items-center gap-2 text-xs text-[#777587] bg-[#f0f3ff] rounded-xl px-4 py-3">
                      <Loader2 size={13} className="animate-spin" /> Checking selected dates…
                    </div>
                  )}
                  {!checking && hasConflict && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                      <div className="flex items-start gap-2.5 mb-3">
                        <div className="w-7 h-7 rounded-lg bg-rose-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <AlertTriangle size={13} className="text-rose-600" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-rose-700">Date conflict detected</p>
                          <p className="text-[0.72rem] text-rose-500 mt-0.5">
                            You already have a request on {check.conflicts.length === 1 ? 'this date' : 'these dates'}. Please choose different dates.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2 pl-1">
                        {check.conflicts.map(c => {
                          const label  = conflictLabel(c);
                          const single = c.start_date === c.end_date;
                          const dateStr = single
                            ? fmtConflictDate(c.start_date)
                            : `${fmtConflictDate(c.start_date)} → ${fmtConflictDate(c.end_date)}`;
                          const statusColor = c.status === 'approved' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-amber-600 bg-amber-50 border-amber-200';
                          return (
                            <div key={c.id} className="flex items-center gap-2.5 bg-white rounded-lg border border-rose-100 px-3 py-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <span className="text-xs font-bold text-rose-700">{label}</span>
                                <span className="text-[0.68rem] text-rose-400 ml-1.5">{dateStr}</span>
                              </div>
                              <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full border capitalize ${statusColor}`}>
                                {c.status}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {!checking && hasAttendance && !hasConflict && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
                      <Info size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-[0.72rem] text-amber-700">You have attendance recorded on the selected dates. HR will still review your request.</p>
                    </div>
                  )}
                </>
              )}

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
            </>
          )}

          {/* ── WFH FORM ── */}
          {isWFH && (
            <>
              <div>
                <label className="form-label">WFH Date</label>
                <input type="date" className="form-control" value={form.wfh_date} onChange={e => set('wfh_date', e.target.value)} />
              </div>

              {/* WFH date conflict alerts */}
              {form.wfh_date && (
                <>
                  {wfhChecking && (
                    <div className="flex items-center gap-2 text-xs text-[#777587] bg-[#f0f3ff] rounded-xl px-4 py-3">
                      <Loader2 size={13} className="animate-spin" /> Checking selected date…
                    </div>
                  )}
                  {!wfhChecking && wfhHasConflict && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                      <div className="flex items-start gap-2.5 mb-3">
                        <div className="w-7 h-7 rounded-lg bg-rose-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <AlertTriangle size={13} className="text-rose-600" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-rose-700">Date conflict detected</p>
                          <p className="text-[0.72rem] text-rose-500 mt-0.5">
                            You already have a request on this date. WFH cannot be applied on a day that is already covered.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2 pl-1">
                        {wfhCheck.conflicts.map(c => {
                          const label       = conflictLabel(c);
                          const single      = c.start_date === c.end_date;
                          const dateStr     = single
                            ? fmtConflictDate(c.start_date)
                            : `${fmtConflictDate(c.start_date)} → ${fmtConflictDate(c.end_date)}`;
                          const statusColor = c.status === 'approved'
                            ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                            : 'text-amber-600 bg-amber-50 border-amber-200';
                          return (
                            <div key={c.id} className="flex items-center gap-2.5 bg-white rounded-lg border border-rose-100 px-3 py-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <span className="text-xs font-bold text-rose-700">{label}</span>
                                <span className="text-[0.68rem] text-rose-400 ml-1.5">{dateStr}</span>
                              </div>
                              <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full border capitalize ${statusColor}`}>
                                {c.status}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {!wfhChecking && !wfhHasConflict && wfhCheck && (
                    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                      <CheckCircle2 size={13} className="flex-shrink-0" /> Date is available — no existing requests on this day
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="form-label">Duration</label>
                <div className="flex gap-2 p-1 bg-[#f0f3ff] rounded-xl border border-[#c7c4d8]">
                  <SegBtn value="full" current={form.leave_time} onChange={v => set('leave_time', v)}>Full Day</SegBtn>
                  <SegBtn value="half" current={form.leave_time} onChange={v => set('leave_time', v)}>Half Day</SegBtn>
                </div>
              </div>

              <div>
                <label className="form-label">Reason <span className="text-[#777587] font-normal">(optional)</span></label>
                <textarea
                  className="form-control resize-none"
                  rows={3}
                  value={form.reason}
                  onChange={e => set('reason', e.target.value)}
                  placeholder="Briefly describe why you need to work from home…"
                />
              </div>

              <div>
                <label className="form-label flex items-center gap-1.5">
                  <MapPin size={13} className="text-[#777587]" />
                  Work Location <span className="text-[#777587] font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={form.work_location}
                  onChange={e => set('work_location', e.target.value)}
                  placeholder="e.g. Home, Client Office…"
                />
              </div>

              <div>
                <label className="form-label flex items-center gap-1.5">
                  <Phone size={13} className="text-[#777587]" />
                  Contact Number <span className="text-[#777587] font-normal">(optional)</span>
                </label>
                <input
                  type="tel"
                  className="form-control"
                  value={form.contact_number}
                  onChange={e => set('contact_number', e.target.value)}
                  placeholder="Your reachable number during WFH…"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#f0f3ff] space-y-2">
          {!isWFH && noBalance && (
            <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <AlertTriangle size={12} className="inline mr-1" />
              Insufficient leave balance. HR may still review at their discretion.
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn btn-outline flex-1">Cancel</button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="btn btn-primary flex-1"
            >
              {submitting
                ? <span className="flex items-center gap-1.5 justify-center"><span className="spinner w-3.5 h-3.5" /> Submitting…</span>
                : isWFH ? 'Submit WFH Request' : 'Submit Leave Request'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main MyLeaves Page ────────────────────────────────────────────────────────
export default function MyLeaves() {
  const qc    = useQueryClient();
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
    mutationFn: (payload) => apiPost('/leaves', payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['my-leaves'] });
      qc.invalidateQueries({ queryKey: ['my-leaves-recent'] });
      const msg = vars.leave_type === 'wfh'
        ? 'WFH request submitted. HR will be notified by email.'
        : 'Leave request submitted. HR will be notified by email.';
      toast(msg, 'success');
      setApplyOpen(false);
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const del = useMutation({
    mutationFn: (id) => apiDelete(`/leaves/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-leaves'] });
      qc.invalidateQueries({ queryKey: ['my-leaves-recent'] });
      toast('Request cancelled.', 'success');
      setDelTarget(null);
    },
    onError: (e) => toast(e.message, 'error'),
  });

  // WFH records are separate from leave — identified by leave_time or leave_type
  const isWFHRecord = (l) => l.leave_time === 'wfh' || l.leave_type === 'wfh';

  // Stat counts exclude WFH (WFH is not a leave)
  const counts = { pending: 0, approved: 0, rejected: 0 };
  leaves.filter(l => !isWFHRecord(l)).forEach(l => {
    if (counts[l.status] !== undefined) counts[l.status]++;
  });

  const activePolicies = policies.filter(p => p.active && p.annual_quota > 0);

  // Descending order: latest start_date first
  const sortedLeaves = [...leaves].sort((a, b) => b.start_date.localeCompare(a.start_date));

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
          <Plus size={15} /> Apply Request
        </button>
      </div>

      {/* Summary — leave counts only (WFH excluded) */}
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
          {/* Request list */}
          {isLoading ? (
            <div className="flex justify-center py-16"><div className="spinner w-7 h-7" /></div>
          ) : sortedLeaves.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-[#c7c4d8]">
              <Inbox size={36} className="mx-auto text-[#c7c4d8] mb-3" />
              <p className="text-[#464555] font-semibold">No requests yet</p>
              <p className="text-[#777587] text-sm mt-1">Apply for leave or WFH to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedLeaves.map(l => {
                const s   = STATUS_STYLES[l.status] || STATUS_STYLES.pending;
                const wfh = isWFHRecord(l);
                return (
                  <div
                    key={l.id}
                    className={`bg-white rounded-xl border border-[#c7c4d8] p-4 shadow-card hover:shadow-card-hover transition-all
                      ${l.status === 'pending'  ? 'border-l-4 border-l-amber-400'   : ''}
                      ${l.status === 'approved' ? 'border-l-4 border-l-emerald-400' : ''}
                      ${l.status === 'rejected' ? 'border-l-4 border-l-rose-400'    : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {/* WFH badge only — never show leave_type for WFH records */}
                          {wfh ? (
                            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <Home size={10} /> WFH
                            </span>
                          ) : (
                            <span className={`text-xs px-2.5 py-0.5 rounded-full border font-bold capitalize ${TYPE_COLORS[l.leave_type] || TYPE_COLORS.other}`}>
                              {l.leave_type}
                            </span>
                          )}
                          {!wfh && l.leave_time === 'half' && (
                            <span className="text-xs bg-purple-50 text-purple-600 border border-purple-200 px-2.5 py-0.5 rounded-full font-medium">
                              Half Day
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-[#151c27]">
                            {l.start_date === l.end_date ? l.start_date : `${l.start_date} → ${l.end_date}`}
                          </p>
                          <span className="text-[0.68rem] font-bold px-2 py-0.5 rounded bg-[#f0f3ff] text-[#3525cd] border border-[#c7c4d8]">
                            {wfh ? 'WFH Day' : l.leave_time === 'half' ? '0.5 Working Day' : `${countWorkingDaysInRange(l.start_date, l.end_date)} Working Days`}
                          </span>
                        </div>
                        {l.reason && <p className="text-xs text-[#777587] mt-1 italic">"{l.reason}"</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-bold ${s.bg} ${s.text} ${s.border}`}>
                          {s.icon} {l.status}
                        </span>
                        {l.status === 'pending' && (
                          <button
                            onClick={() => setDelTarget(l)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#c7c4d8] hover:text-rose-500 hover:bg-rose-50 transition-colors"
                          >
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

        {/* Right sidebar */}
        <div className="space-y-4 self-start">

        {/* Leave Balance sidebar — WFH is excluded from balance calculations */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm">
          <div className="px-5 py-4 border-b border-[#f0f3ff] flex items-center gap-2">
            <BookOpen size={14} className="text-[#3525cd]" />
            <span className="font-black text-[#151c27] text-sm">Leave Balance</span>
          </div>
          <div className="p-4 space-y-0">
            {activePolicies.length === 0 ? (
              <p className="text-xs text-[#777587] text-center py-4">No policies configured</p>
            ) : activePolicies.map(p => {
              const used = leaves
                .filter(l => l.leave_type === p.leave_type && l.status === 'approved' && !isWFHRecord(l))
                .reduce((sum, l) => sum + (l.leave_time === 'half' ? 0.5 : countWorkingDaysInRange(l.start_date, l.end_date)), 0);
              const pending = leaves
                .filter(l => l.leave_type === p.leave_type && l.status === 'pending' && !isWFHRecord(l))
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
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: pct >= 80 ? '#ef4444' : pct >= 50 ? '#f59e0b' : '#10b981' }}
                    />
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

        {/* WFH Summary */}
        {(() => {
          const wfhLeaves    = leaves.filter(isWFHRecord);
          const wfhApproved  = wfhLeaves.filter(l => l.status === 'approved');
          const wfhPending   = wfhLeaves.filter(l => l.status === 'pending');
          const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
          const wfhThisMonth = wfhApproved.filter(l => l.start_date.startsWith(currentMonth));
          return (
            <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm">
              <div className="px-5 py-4 border-b border-[#f0f3ff] flex items-center gap-2">
                <Home size={14} className="text-blue-600" />
                <span className="font-black text-[#151c27] text-sm">WFH Summary</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-[#f0f3ff]">
                  <span className="text-xs text-[#464555] font-medium">Total Approved</span>
                  <span className="text-sm font-black text-blue-600">{wfhApproved.length} <span className="text-xs font-normal text-[#777587]">days</span></span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-[#f0f3ff]">
                  <span className="text-xs text-[#464555] font-medium">This Month</span>
                  <span className="text-sm font-black text-blue-600">{wfhThisMonth.length} <span className="text-xs font-normal text-[#777587]">days</span></span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-xs text-[#464555] font-medium">Pending Approval</span>
                  {wfhPending.length > 0
                    ? <span className="text-sm font-black text-amber-600">{wfhPending.length} <span className="text-xs font-normal text-[#777587]">request{wfhPending.length > 1 ? 's' : ''}</span></span>
                    : <span className="text-xs text-[#9ca3af]">None</span>
                  }
                </div>
              </div>
            </div>
          );
        })()}

        </div>{/* end right sidebar */}
      </div>

      {/* Apply Request Slide-out */}
      <LeaveApplyPanel
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        onSubmit={(payload) => apply.mutate(payload)}
        loading={apply.isPending}
        policies={policies}
        leaves={leaves}
      />

      {/* Cancel confirm modal */}
      <Modal
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        title="Cancel Request"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setDelTarget(null)} className="btn btn-outline btn-sm">No, Keep</button>
            <button onClick={() => del.mutate(delTarget.id)} disabled={del.isPending} className="btn btn-danger btn-sm">
              {del.isPending ? 'Cancelling…' : 'Yes, Cancel Request'}
            </button>
          </div>
        }
      >
        {delTarget && (
          isWFHRecord(delTarget)
            ? <p className="text-[#464555] text-sm">Cancel your WFH request for <strong>{delTarget.start_date}</strong>?</p>
            : <p className="text-[#464555] text-sm">Cancel your <strong className="capitalize">{delTarget.leave_type}</strong> leave request from {delTarget.start_date} to {delTarget.end_date}?</p>
        )}
      </Modal>
    </div>
  );
}
