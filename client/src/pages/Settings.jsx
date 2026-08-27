import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock, Zap, Info, Palette, User, Timer, Check, RefreshCw, Mail,
  Plus, Trash2, ToggleLeft, ToggleRight, ShieldCheck, Building2,
  Briefcase, CalendarDays, Bell, BellOff, Wrench, Settings2,
  ChevronRight, MailCheck, Star, BarChart3, AlarmClock,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { RoleBadge } from '@/components/ui/Badge';
import { todayStr, initials } from '@/lib/utils';
import { usePushNotification } from '@/hooks/usePushNotification';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// ── Work Schedule Card ────────────────────────────────────────────────────────
function WorkSchedulePanel({ schedule, isAdmin, onSaved }) {
  const toast = useToast();

  const [form, setForm] = useState({
    start_time:             schedule?.start_time             || '09:00',
    end_time:               schedule?.end_time               || '18:00',
    late_threshold:         schedule?.late_threshold         || '09:15',
    early_exit_threshold:   schedule?.early_exit_threshold   || '17:45',
    half_day_hours:         schedule?.half_day_hours         || 4,
    full_day_hours:         schedule?.full_day_hours         || 8,
    max_early_leave_count:  schedule?.max_early_leave_count  || 3,
    work_days:              (schedule?.work_days || '1,2,3,4,5').split(',').map(Number),
  });

  useEffect(() => {
    if (schedule) {
      setForm({
        start_time:             schedule.start_time,
        end_time:               schedule.end_time,
        late_threshold:         schedule.late_threshold,
        early_exit_threshold:   schedule.early_exit_threshold,
        half_day_hours:         schedule.half_day_hours,
        full_day_hours:         schedule.full_day_hours ?? 8,
        max_early_leave_count:  schedule.max_early_leave_count ?? 3,
        work_days:              (schedule.work_days || '1,2,3,4,5').split(',').map(Number),
      });
    }
  }, [schedule]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [errs, setErrs] = useState({});

  function validate() {
    const e = {};
    const startMins = timeToMinutes(form.start_time);
    const endMins   = timeToMinutes(form.end_time);
    const lateMins  = timeToMinutes(form.late_threshold);
    const earlyMins = timeToMinutes(form.early_exit_threshold);
    const halfHours = parseFloat(form.half_day_hours);
    const fullHours = parseFloat(form.full_day_hours);
    const maxELC    = parseInt(form.max_early_leave_count, 10);

    if (!form.start_time) e.start_time = 'Work Start Time is required.';
    if (!form.end_time)   e.end_time   = 'Work End Time is required.';
    if (startMins !== null && endMins !== null && endMins <= startMins)
      e.end_time = 'End time must be after start time.';
    if (lateMins !== null && startMins !== null && endMins !== null &&
        (lateMins <= startMins || lateMins >= endMins))
      e.late_threshold = 'Late Entry Threshold must be between Start and End time.';
    if (earlyMins !== null && lateMins !== null && endMins !== null &&
        (earlyMins <= lateMins || earlyMins >= endMins))
      e.early_exit_threshold = 'Early Exit Threshold must be between Late Threshold and End time.';
    if (isNaN(halfHours) || halfHours <= 0)
      e.half_day_hours = 'Half Day Threshold must be a positive number.';
    else if (startMins !== null && endMins !== null) {
      const total = (endMins - startMins) / 60;
      if (halfHours >= total) e.half_day_hours = `Must be less than total work hours (${total.toFixed(1)} hrs).`;
    }
    if (isNaN(fullHours) || fullHours <= 0)
      e.full_day_hours = 'Full Day Threshold must be a positive number.';
    else if (!isNaN(halfHours) && fullHours <= halfHours)
      e.full_day_hours = `Must be greater than Half Day Threshold (${halfHours} hrs).`;
    else if (startMins !== null && endMins !== null) {
      const total = (endMins - startMins) / 60;
      if (fullHours > total) e.full_day_hours = `Cannot exceed total work hours (${total.toFixed(1)} hrs).`;
    }
    if (isNaN(maxELC) || maxELC < 1)
      e.max_early_leave_count = 'Must be at least 1.';
    if (form.work_days.length === 0)
      e.work_days = 'Please select at least one working day.';
    setErrs(e);
    return Object.keys(e).length === 0;
  }

  const toggleDay = (idx) => setForm(f => ({
    ...f,
    work_days: f.work_days.includes(idx)
      ? f.work_days.filter(d => d !== idx)
      : [...f.work_days, idx].sort((a, b) => a - b),
  }));

  const mutation = useMutation({
    mutationFn: () => apiPut('/settings', {
      start_time:            form.start_time,
      end_time:              form.end_time,
      late_threshold:        form.late_threshold,
      early_exit_threshold:  form.early_exit_threshold,
      half_day_hours:        parseFloat(form.half_day_hours),
      full_day_hours:        parseFloat(form.full_day_hours),
      max_early_leave_count: parseInt(form.max_early_leave_count, 10),
      work_days:             form.work_days.join(','),
    }),
    onSuccess: () => { toast('Work schedule saved!', 'success'); onSaved?.(); },
    onError:   err => toast(err.message, 'error'),
  });

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-[#151c27] flex items-center gap-2">
          <Clock size={20} className="text-[#3525cd]" /> Work Schedule
        </h2>
        <p className="text-sm text-[#777587] mt-1">Configure working hours, late entry, early exit and attendance rules.</p>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <label className="form-label">Work Start Time</label>
          <input type="time" className={`form-control ${errs.start_time ? 'border-rose-400' : ''}`}
            value={form.start_time} disabled={!isAdmin} onChange={e => set('start_time', e.target.value)} />
          {errs.start_time && <p className="text-xs text-rose-500 mt-1">{errs.start_time}</p>}
        </div>
        <div>
          <label className="form-label">Work End Time</label>
          <input type="time" className={`form-control ${errs.end_time ? 'border-rose-400' : ''}`}
            value={form.end_time} disabled={!isAdmin} onChange={e => set('end_time', e.target.value)} />
          {errs.end_time && <p className="text-xs text-rose-500 mt-1">{errs.end_time}</p>}
        </div>

        <div>
          <label className="form-label">Late Entry Threshold</label>
          <input type="time" className={`form-control ${errs.late_threshold ? 'border-rose-400' : ''}`}
            value={form.late_threshold} disabled={!isAdmin} onChange={e => set('late_threshold', e.target.value)} />
          {errs.late_threshold
            ? <p className="text-xs text-rose-500 mt-1">{errs.late_threshold}</p>
            : <p className="form-hint">Check-in after this time = Late</p>}
        </div>
        <div>
          <label className="form-label">Early Exit Threshold</label>
          <input type="time" className={`form-control ${errs.early_exit_threshold ? 'border-rose-400' : ''}`}
            value={form.early_exit_threshold} disabled={!isAdmin} onChange={e => set('early_exit_threshold', e.target.value)} />
          {errs.early_exit_threshold
            ? <p className="text-xs text-rose-500 mt-1">{errs.early_exit_threshold}</p>
            : <p className="form-hint">Check-out before this time = Early Exit</p>}
        </div>

        <div>
          <label className="form-label">Half Day Threshold (hours)</label>
          <input type="number" step="0.5" min="0.5" className={`form-control ${errs.half_day_hours ? 'border-rose-400' : ''}`}
            value={form.half_day_hours} disabled={!isAdmin}
            onChange={e => set('half_day_hours', e.target.value)} onWheel={e => e.target.blur()} />
          {errs.half_day_hours
            ? <p className="text-xs text-rose-500 mt-1">{errs.half_day_hours}</p>
            : <p className="form-hint">Work hours below this = Half Day</p>}
        </div>
        <div>
          <label className="form-label">Full Day Hours</label>
          <input type="number" step="0.5" min="0.5" className={`form-control ${errs.full_day_hours ? 'border-rose-400' : ''}`}
            value={form.full_day_hours} disabled={!isAdmin}
            onChange={e => set('full_day_hours', e.target.value)} onWheel={e => e.target.blur()} />
          {errs.full_day_hours
            ? <p className="text-xs text-rose-500 mt-1">{errs.full_day_hours}</p>
            : <p className="form-hint">Work hours at or above this = Full Day</p>}
        </div>

        <div>
          <label className="form-label">Max Early Leave Count</label>
          <input type="number" step="1" min="1" className={`form-control ${errs.max_early_leave_count ? 'border-rose-400' : ''}`}
            value={form.max_early_leave_count} disabled={!isAdmin}
            onChange={e => set('max_early_leave_count', e.target.value)} onWheel={e => e.target.blur()} />
          {errs.max_early_leave_count
            ? <p className="text-xs text-rose-500 mt-1">{errs.max_early_leave_count}</p>
            : <p className="form-hint">Excess early leaves per period → LOP</p>}
        </div>
        <div /> {/* spacer */}

        <div className="col-span-2">
          <label className="form-label">Working Days</label>
          <div className="flex gap-3 flex-wrap mt-2">
            {DAY_LABELS.map((d, i) => (
              <label key={i} className={`flex items-center gap-1.5 text-sm select-none ${isAdmin ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}>
                <input type="checkbox" checked={form.work_days.includes(i)} disabled={!isAdmin}
                  onChange={() => toggleDay(i)} className="accent-[#3525cd]" />
                {d}
              </label>
            ))}
          </div>
          {errs.work_days && <p className="text-xs text-rose-500 mt-1">{errs.work_days}</p>}
        </div>
      </div>

      {/* Status legend */}
      <div className="mt-8 pt-6 border-t border-[#f0f3ff]">
        <p className="text-xs font-bold text-[#464555] uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Palette size={13} className="text-[#3525cd]" /> Status Legend
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Present',     color: '#10B981', desc: 'Full day (≥ Full Day Hours)' },
            { label: 'Early Leave', color: '#F97316', desc: 'Between Half Day & Full Day Hours' },
            { label: 'Half Day',    color: '#3B82F6', desc: 'Below Half Day Threshold' },
            { label: 'On Leave',    color: '#F59E0B', desc: 'Approved leave' },
            { label: 'Late Entry',  color: '#6366F1', desc: 'Check-in after late threshold' },
            { label: 'Early Exit',  color: '#8B5CF6', desc: 'Check-out before early exit threshold' },
            { label: 'Absent',      color: '#EF4444', desc: 'Not present, no leave applied' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
              <span className="text-xs font-semibold text-[#151c27]">{item.label}</span>
              <span className="text-xs text-[#777587]">— {item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {isAdmin && (
        <div className="mt-6 pt-5 border-t border-[#f0f3ff] flex justify-end">
          <button className="btn btn-primary" onClick={() => { if (validate()) mutation.mutate(); }} disabled={mutation.isPending}>
            {mutation.isPending ? <><span className="spinner w-4 h-4" /> Saving…</> : 'Save Schedule'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Email Automation Panel ────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${checked ? 'bg-[#3525cd]' : 'bg-[#c7c4d8]'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function EmailAutomationPanel({ schedule }) {
  const toast = useToast();
  const qc    = useQueryClient();

  const { data: emailSettings, isLoading } = useQuery({
    queryKey: ['email-automation-settings'],
    queryFn:  () => apiGet('/settings/email-automation'),
    retry: false,
  });

  const [form, setForm] = useState({
    late_email_enabled:           false,
    daily_summary_enabled:        false,
    daily_summary_time:           '18:30',
    appreciation_email_enabled:   false,
    appreciation_threshold_hours: 8,
  });

  useEffect(() => {
    if (emailSettings) {
      setForm({
        late_email_enabled:           !!emailSettings.late_email_enabled,
        daily_summary_enabled:        !!emailSettings.daily_summary_enabled,
        daily_summary_time:           emailSettings.daily_summary_time?.slice(0,5) || '18:30',
        appreciation_email_enabled:   !!emailSettings.appreciation_email_enabled,
        appreciation_threshold_hours: parseFloat(emailSettings.appreciation_threshold_hours) || 8,
      });
    }
  }, [emailSettings]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => apiPut('/settings/email-automation', form),
    onSuccess: () => {
      toast('Email automation settings saved!', 'success');
      qc.invalidateQueries({ queryKey: ['email-automation-settings'] });
    },
    onError: err => toast(err.message, 'error'),
  });

  if (isLoading) return <div className="flex justify-center py-10"><span className="spinner w-6 h-6" /></div>;

  const lateThresholdLabel = schedule?.late_threshold || '—';

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-[#151c27] flex items-center gap-2">
          <MailCheck size={20} className="text-[#3525cd]" /> Email Automation
        </h2>
        <p className="text-sm text-[#777587] mt-1">Configure automated attendance email notifications for employees.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Late Check-in */}
        <div className="border border-[#e7eefe] rounded-xl p-5 bg-white">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                <AlarmClock size={18} className="text-orange-500" />
              </div>
              <div>
                <p className="font-bold text-sm text-[#151c27]">Late Check-in Email</p>
                <p className="text-xs text-[#777587] mt-0.5">Send when employee checks in after late threshold</p>
              </div>
            </div>
            <Toggle checked={form.late_email_enabled} onChange={v => set('late_email_enabled', v)} />
          </div>
          <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-4">
            <Info size={12} className="text-orange-600 flex-shrink-0" />
            <p className="text-xs text-orange-700">Uses Late Entry Threshold: <strong>{lateThresholdLabel}</strong></p>
          </div>
          <p className="text-xs font-semibold text-[#464555] mb-2">Email Content Includes:</p>
          <ul className="space-y-1">
            {['Employee name', 'Check-in time', 'Late duration (exact minutes)', 'Work start time'].map(i => (
              <li key={i} className="flex items-center gap-1.5 text-xs text-[#464555]">
                <Check size={11} className="text-emerald-500 flex-shrink-0" /> {i}
              </li>
            ))}
          </ul>
        </div>

        {/* Daily Summary */}
        <div className="border border-[#e7eefe] rounded-xl p-5 bg-white">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <BarChart3 size={18} className="text-emerald-600" />
              </div>
              <div>
                <p className="font-bold text-sm text-[#151c27]">Daily Attendance Summary</p>
                <p className="text-xs text-[#777587] mt-0.5">Send daily attendance summary to all employees</p>
              </div>
            </div>
            <Toggle checked={form.daily_summary_enabled} onChange={v => set('daily_summary_enabled', v)} />
          </div>
          {form.daily_summary_enabled && (
            <div className="mb-4">
              <label className="form-label text-xs">Send Time</label>
              <input type="time" className="form-control text-sm"
                value={form.daily_summary_time} onChange={e => set('daily_summary_time', e.target.value)} />
            </div>
          )}
          <p className="text-xs font-semibold text-[#464555] mb-2">Email Includes:</p>
          <div className="grid grid-cols-2 gap-x-3">
            {['Check-in time', 'Check-out time', 'Working hours', 'Non-working hours', 'Total hours', 'Late duration (if any)', 'Early exit duration (if any)', 'Status'].map(i => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-[#464555] mb-1">
                <Check size={11} className="text-emerald-500 flex-shrink-0" /> {i}
              </div>
            ))}
          </div>
        </div>

        {/* Appreciation */}
        <div className="border border-[#e7eefe] rounded-xl p-5 bg-white">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                <Star size={18} className="text-amber-500" />
              </div>
              <div>
                <p className="font-bold text-sm text-[#151c27]">Work Appreciation Email</p>
                <p className="text-xs text-[#777587] mt-0.5">Send appreciation when employee exceeds threshold</p>
              </div>
            </div>
            <Toggle checked={form.appreciation_email_enabled} onChange={v => set('appreciation_email_enabled', v)} />
          </div>
          {form.appreciation_email_enabled && (
            <div className="mb-4">
              <label className="form-label text-xs">Appreciation Threshold (hours)</label>
              <div className="flex gap-2">
                <input type="number" step="0.5" min="1" className="form-control text-sm flex-1"
                  value={form.appreciation_threshold_hours}
                  onChange={e => set('appreciation_threshold_hours', e.target.value)}
                  onWheel={e => e.target.blur()} />
                <span className="flex items-center text-xs text-[#777587] font-semibold px-3 bg-[#f0f3ff] border border-[#c7c4d8] rounded-lg">hrs</span>
              </div>
            </div>
          )}
          <p className="text-xs font-semibold text-[#464555] mb-2">Email Content Includes:</p>
          <ul className="space-y-1">
            {['Employee name', 'Total working hours', 'Appreciation message', 'Work date'].map(i => (
              <li key={i} className="flex items-center gap-1.5 text-xs text-[#464555]">
                <Check size={11} className="text-emerald-500 flex-shrink-0" /> {i}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Info note */}
      <div className="mt-5 flex items-start gap-2 bg-[#f0f3ff] border border-[#c7c4d8] rounded-xl px-4 py-3">
        <Info size={14} className="text-[#3525cd] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#464555]">
          All email automations use the organization's default email configuration and templates.
          Manage email recipients in the <strong>Email Recipients</strong> section.
        </p>
      </div>

      <div className="mt-6 pt-5 border-t border-[#f0f3ff] flex justify-end">
        <button className="btn btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? <><span className="spinner w-4 h-4" /> Saving…</> : 'Save Automation Settings'}
        </button>
      </div>
    </div>
  );
}

// ── Attendance Cleanup Panel ──────────────────────────────────────────────────
function CleanupPanel() {
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState(null);
  const [confirm, setConfirm] = useState(false);

  async function runCleanup() {
    setRunning(true); setResult(null);
    try {
      const data = await apiPost('/attendance/cleanup-orphaned', {});
      setResult(data.removed);
      toast(data.removed > 0
        ? `Cleaned up ${data.removed} orphaned attendance record${data.removed !== 1 ? 's' : ''}.`
        : 'No orphaned records found — attendance data is clean.', data.removed > 0 ? 'success' : 'info');
    } catch (err) { toast(err.message, 'error'); }
    finally { setRunning(false); }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-[#151c27] flex items-center gap-2">
          <Wrench size={20} className="text-[#3525cd]" /> Attendance Data Cleanup
        </h2>
        <p className="text-sm text-[#777587] mt-1">Remove orphaned attendance records that no longer have a matching approved leave.</p>
      </div>
      <div className="max-w-lg">
        <p className="text-sm text-[#464555] mb-5 leading-relaxed">
          This removes attendance records marked as <strong>On Leave / WFH / Half Day</strong> that no longer have a matching approved leave.
          This can happen when a leave is reverted or a past sync ran incorrectly. Safe to run at any time.
        </p>
        {result !== null && (
          <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg mb-4 ${result > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-[#f0f3ff] text-[#3525cd] border border-[#c7c4d8]'}`}>
            <Check size={13} />
            {result > 0 ? `${result} orphaned record${result !== 1 ? 's' : ''} removed.` : 'Attendance data is already clean.'}
          </div>
        )}
        <button onClick={() => setConfirm(true)} disabled={running}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all shadow-sm disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #3525cd, #4f46e5)' }}>
          {running ? <><span className="spinner w-3.5 h-3.5" /> Running…</> : <><RefreshCw size={14} /> Run Cleanup</>}
        </button>
        <ConfirmModal open={confirm} title="Run Attendance Cleanup"
          message="This will permanently delete orphaned attendance records. Are you sure you want to continue?"
          confirmLabel="Yes, Run Cleanup" onConfirm={() => { setConfirm(false); runCleanup(); }} onCancel={() => setConfirm(false)} />
      </div>
    </div>
  );
}

// ── Push Notifications Panel ──────────────────────────────────────────────────
function PushPanel({ userId }) {
  const { permission, subscribed, requestAndSubscribe, unsubscribe, isSupported } = usePushNotification(userId);
  const toast = useToast();
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: vapidStatus } = useQuery({
    queryKey: ['vapid-status'],
    queryFn: () => apiGet('/push/vapid-status').catch(() => ({ configured: false })),
    staleTime: 5 * 60 * 1000,
  });
  const serverConfigured = vapidStatus?.configured !== false;
  const isEnabled = permission === 'granted' && subscribed;

  if (!isSupported) return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-[#151c27] flex items-center gap-2"><Bell size={20} className="text-[#3525cd]" /> Push Notifications</h2>
      </div>
      <p className="text-sm text-[#777587]">Push notifications are not supported in this browser.</p>
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-[#151c27] flex items-center gap-2"><Bell size={20} className="text-[#3525cd]" /> Push Notifications</h2>
        <p className="text-sm text-[#777587] mt-1">Receive browser push notifications for HR alerts even when you're not on the dashboard.</p>
      </div>
      <div className="max-w-lg">
        <div className={`inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-full border mb-4 ${isEnabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
          {isEnabled ? 'Enabled' : 'Disabled'}
        </div>
        <p className="text-sm text-[#464555] mb-5 leading-relaxed">
          Receive real-time browser notifications for leave approvals, rejections, and important HR alerts.
        </p>
        <button onClick={isEnabled ? unsubscribe : () => setShowConfirm(true)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold border transition-all ${isEnabled ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100' : 'bg-[#3525cd] text-white border-transparent hover:bg-[#4f46e5]'}`}>
          {isEnabled ? <BellOff size={15} /> : <Bell size={15} />}
          {isEnabled ? 'Disable Push Notifications' : 'Enable Push Notifications'}
        </button>
        {!serverConfigured && (
          <p className="text-xs text-amber-600 mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Push notifications are not configured on the server. Contact your platform administrator to set up VAPID keys.
          </p>
        )}
        {permission === 'denied' && (
          <p className="text-xs text-rose-500 mt-3">
            Notifications are blocked by your browser. Please update your browser settings to allow notifications for this site.
          </p>
        )}
      </div>
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 border border-[#c7c4d8]">
            <div className="flex items-center gap-2 mb-3"><Bell size={20} className="text-[#3525cd]" />
              <h3 className="font-bold text-[#151c27] text-base">Enable Push Notifications</h3>
            </div>
            <p className="text-sm text-[#464555] mb-5 leading-relaxed">You'll receive real-time updates for leave approvals, rejections, and important HR alerts in your browser.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-[#464555] border border-[#c7c4d8] hover:bg-[#f0f3ff] transition-colors">Cancel</button>
              <button onClick={async () => { setShowConfirm(false); await requestAndSubscribe(); toast('Push notifications enabled!', 'success'); }}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-[#3525cd] hover:bg-[#4f46e5] transition-colors">Yes, Enable</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Email Recipients Panel ────────────────────────────────────────────────────
function EmailRecipientsPanel() {
  const toast = useToast();
  const qc    = useQueryClient();
  const [newEmail, setNewEmail] = useState('');
  const [newName,  setNewName]  = useState('');
  const [adding,   setAdding]   = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);

  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ['notify-recipients'],
    queryFn:  () => apiGet('/root/notify-recipients'),
  });

  async function addRecipient() {
    if (!newEmail.trim()) { toast('Email is required', 'warning'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) { toast('Please enter a valid email address.', 'error'); return; }
    if (newName.trim() && !/[a-zA-Z]/.test(newName.trim())) { toast('Label must contain at least one letter.', 'error'); return; }
    if (newName.trim().length > 60) { toast('Label must be 60 characters or fewer.', 'error'); return; }
    setAdding(true);
    try {
      await apiPost('/root/notify-recipients', { email: newEmail.trim(), name: newName.trim() });
      toast('Recipient added', 'success');
      qc.invalidateQueries({ queryKey: ['notify-recipients'] });
      setNewEmail(''); setNewName('');
    } catch (err) { toast(err.message, 'error'); }
    finally { setAdding(false); }
  }

  async function toggleActive(r) {
    try {
      await apiPut(`/root/notify-recipients/${r.id}`, { active: !r.active });
      qc.invalidateQueries({ queryKey: ['notify-recipients'] });
      toast(r.active ? 'Recipient paused' : 'Recipient activated', 'success');
    } catch (err) { toast(err.message, 'error'); }
  }

  async function doRemove(id) {
    try {
      await apiDelete(`/root/notify-recipients/${id}`);
      qc.invalidateQueries({ queryKey: ['notify-recipients'] });
      toast('Recipient removed', 'success');
    } catch (err) { toast(err.message, 'error'); }
    setConfirmRemove(null);
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-[#151c27] flex items-center gap-2"><Mail size={20} className="text-[#3525cd]" /> Email Notification Recipients</h2>
        <p className="text-sm text-[#777587] mt-1">These addresses receive notifications for leave applications and approvals.</p>
      </div>
      <div className="max-w-2xl">
        <p className="text-xs text-[#777587] mb-5">If the list is empty, the system falls back to environment variables (HR_EMAIL, COMPANY_HEAD_*).</p>
        <div className="flex gap-2 mb-5 flex-wrap">
          <input className="form-control flex-1 min-w-[200px]" type="email" placeholder="recipient@company.com"
            value={newEmail} onChange={e => setNewEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && addRecipient()} />
          <input className="form-control w-40" placeholder="Label (optional)" value={newName} onChange={e => setNewName(e.target.value)} />
          <button className="btn btn-primary btn-sm flex items-center gap-1.5" onClick={addRecipient} disabled={adding}>
            {adding ? <span className="spinner w-3.5 h-3.5" /> : <Plus size={14} />} Add
          </button>
        </div>
        {isLoading ? <div className="flex justify-center py-4"><span className="spinner w-5 h-5" /></div>
          : recipients.length === 0 ? (
            <div className="text-center py-6 text-sm text-[#777587] bg-[#f0f3ff] rounded-xl border border-dashed border-[#c7c4d8]">No recipients configured.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {recipients.map(r => (
                <div key={r.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${r.active ? 'border-[#c7c4d8] bg-white' : 'border-dashed border-[#c7c4d8] bg-[#f0f3ff]/50 opacity-60'}`}>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${r.active ? 'bg-emerald-500' : 'bg-[#c7c4d8]'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#151c27] truncate">{r.email}</p>
                    {r.name && <p className="text-xs text-[#777587] truncate">{r.name}</p>}
                  </div>
                  <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full border ${r.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-[#f0f3ff] text-[#777587] border-[#c7c4d8]'}`}>{r.active ? 'Active' : 'Paused'}</span>
                  <button onClick={() => toggleActive(r)} className="p-1.5 rounded-lg hover:bg-[#f0f3ff] transition-colors text-[#464555]">
                    {r.active ? <ToggleRight size={16} className="text-emerald-600" /> : <ToggleLeft size={16} />}
                  </button>
                  <button onClick={() => setConfirmRemove(r)} className="p-1.5 rounded-lg hover:bg-rose-50 transition-colors text-rose-400 hover:text-rose-600">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        <ConfirmModal open={!!confirmRemove} title="Remove Recipient"
          message={`Remove ${confirmRemove?.name || confirmRemove?.email} from notification recipients?`}
          confirmLabel="Remove" variant="danger"
          onConfirm={() => doRemove(confirmRemove.id)} onCancel={() => setConfirmRemove(null)} />
      </div>
    </div>
  );
}

// ── Root Admins Panel ─────────────────────────────────────────────────────────
function RootAdminsPanel() {
  const { data: rootAdmins = [], isLoading } = useQuery({
    queryKey: ['root-admins'],
    queryFn:  () => apiGet('/root/root-admins'),
  });
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-[#151c27] flex items-center gap-2"><ShieldCheck size={20} className="text-[#3525cd]" /> Root Administrators</h2>
        <p className="text-sm text-[#777587] mt-1">All root admin accounts for this organization. To add or remove, use the <strong>Employees</strong> page.</p>
      </div>
      {isLoading ? <div className="flex justify-center py-4"><span className="spinner w-5 h-5" /></div>
        : rootAdmins.length === 0 ? (
          <div className="text-center py-6 text-sm text-[#777587] bg-[#f0f3ff] rounded-xl border border-dashed border-[#c7c4d8]">No root admins found.</div>
        ) : (
          <div className="flex flex-col gap-3 max-w-2xl">
            {rootAdmins.map(admin => (
              <div key={admin.id} className="flex items-center gap-3 p-3 rounded-xl border border-[#c7c4d8] bg-white hover:bg-[#f9f9ff] transition-colors">
                <Avatar name={admin.name} color={admin.avatar_color} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-[#151c27] truncate">{admin.name}</span>
                    <span className="text-[0.6rem] font-black px-1.5 py-0.5 rounded-full bg-[#3525cd]/10 text-[#3525cd] border border-[#3525cd]/20 uppercase tracking-wide">Root Admin</span>
                  </div>
                  <p className="text-xs text-[#777587] truncate mt-0.5">{admin.email}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {admin.department && <span className="flex items-center gap-1 text-[0.68rem] text-[#464555]"><Building2 size={10} className="text-[#3525cd]" /> {admin.department}</span>}
                    {admin.position   && <span className="flex items-center gap-1 text-[0.68rem] text-[#464555]"><Briefcase size={10} className="text-[#3525cd]" /> {admin.position}</span>}
                    {admin.created_at && <span className="flex items-center gap-1 text-[0.68rem] text-[#777587]"><CalendarDays size={10} /> Joined {new Date(admin.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

// ── My Profile Panel ──────────────────────────────────────────────────────────
function MyProfilePanel({ user }) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-[#151c27] flex items-center gap-2"><User size={20} className="text-[#3525cd]" /> My Profile</h2>
        <p className="text-sm text-[#777587] mt-1">Your account information.</p>
      </div>
      <div className="max-w-sm">
        <div className="flex items-center gap-4 mb-5 p-4 bg-[#f9f9ff] border border-[#e7eefe] rounded-xl">
          <Avatar name={user.name} color={user.avatar_color} size={56} />
          <div>
            <div className="font-bold text-[#151c27]">{user.name}</div>
            <div className="text-sm text-[#777587]">{user.email}</div>
            <RoleBadge role={user.role} className="mt-1" />
          </div>
        </div>
        <div className="space-y-2 text-sm text-[#151c27]">
          <div className="flex gap-2"><span className="font-semibold w-28 flex-shrink-0">Department:</span> {user.department || '—'}</div>
          <div className="flex gap-2"><span className="font-semibold w-28 flex-shrink-0">Position:</span> {user.position || '—'}</div>
        </div>
      </div>
    </div>
  );
}

// ── Leave Workflow Panel ──────────────────────────────────────────────────────
function LeaveWorkflowPanel() {
  const navigate   = useNavigate();
  const { pathname } = useLocation();
  const { data: workflow } = useQuery({
    queryKey: ['leave-workflow-config-summary'],
    queryFn:  () => apiGet('/leaves/workflow-config'),
    staleTime: 5 * 60 * 1000,
  });
  const targetPath = pathname.startsWith('/root') ? '/root/leave-workflow' : '/leave-workflow';
  const levelCount = workflow?.levels?.length || 0;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-[#151c27] flex items-center gap-2"><Settings2 size={20} className="text-[#3525cd]" /> Leave Approval Workflow</h2>
        <p className="text-sm text-[#777587] mt-1">Configure the multi-level approval chain for leave requests.</p>
      </div>
      <div className="max-w-lg">
        <p className="text-sm text-[#777587] mb-4">Currently <strong className="text-[#151c27]">{levelCount} approval level{levelCount !== 1 ? 's' : ''}</strong> configured.</p>
        {workflow?.levels?.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mb-5">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#3525cd]/10 text-[#3525cd] border border-[#3525cd]/20">Employee</span>
            {workflow.levels.map((l, i) => (
              <React.Fragment key={i}>
                <ChevronRight size={12} className="text-[#c7c4d8]" />
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">{l.level_label || l.role_type.replace(/_/g, ' ')}</span>
              </React.Fragment>
            ))}
            <ChevronRight size={12} className="text-[#c7c4d8]" />
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">✓ Approved</span>
          </div>
        )}
        <button onClick={() => navigate(targetPath)}
          className="flex items-center gap-2 px-4 py-2 bg-[#3525cd] text-white rounded-xl text-sm font-bold hover:bg-[#2a1fb0] transition-colors">
          <Settings2 size={14} /> Configure Workflow
        </button>
      </div>
    </div>
  );
}

// ─── Settings Console Navigation ──────────────────────────────────────────────
const NAV_SECTIONS = [
  {
    group: 'ATTENDANCE',
    items: [
      { id: 'work_schedule',    label: 'Work Schedule',    icon: Clock,       roles: ['admin','root_admin'] },
      { id: 'email_automation', label: 'Email Automation', icon: MailCheck,   roles: ['root_admin'] },
    ],
  },
  {
    group: 'LEAVE & ATTENDANCE',
    items: [
      { id: 'leave_workflow', label: 'Leave Approval Workflow', icon: Settings2, roles: ['admin','root_admin'] },
      { id: 'cleanup',        label: 'Attendance Data Cleanup', icon: Wrench,    roles: ['admin','root_admin'] },
    ],
  },
  {
    group: 'NOTIFICATIONS',
    items: [
      { id: 'push',             label: 'Push Notifications', icon: Bell, roles: ['employee','admin','root_admin'] },
      { id: 'email_recipients', label: 'Email Recipients',   icon: Mail, roles: ['root_admin'] },
    ],
  },
  {
    group: 'ADMINISTRATION',
    items: [
      { id: 'root_admins', label: 'Root Administrators', icon: ShieldCheck, roles: ['root_admin'] },
      { id: 'my_profile',  label: 'My Profile',           icon: User,        roles: ['employee','admin','root_admin'] },
    ],
  },
];

function navAllowed(item, role) {
  return item.roles.includes(role);
}

function firstAllowed(role) {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (navAllowed(item, role)) return item.id;
    }
  }
  return 'my_profile';
}

// ─── Settings Page ─────────────────────────────────────────────────────────────
export default function Settings() {
  const { user, isAdmin, isRootAdmin } = useAuth();
  const role = user?.role || 'employee';

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn:  () => apiGet('/settings'),
  });
  const schedule = data?.schedule;

  const [activeSection, setActiveSection] = useState(() => firstAllowed(role));

  if (isLoading) return <div className="loading"><div className="spinner" /> Loading…</div>;

  // Employees that aren't admin see a simplified view
  if (!isAdmin) {
    return (
      <div>
        <div className="page-header mb-6">
          <div><div className="page-title">Settings</div><div className="page-subtitle">Your account preferences</div></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6"><PushPanel userId={user?.id} /></div>
          <div className="card p-6"><MyProfilePanel user={user} /></div>
        </div>
      </div>
    );
  }

  function renderContent() {
    switch (activeSection) {
      case 'work_schedule':    return <WorkSchedulePanel schedule={schedule} isAdmin={isAdmin} onSaved={refetch} />;
      case 'email_automation': return <EmailAutomationPanel schedule={schedule} />;
      case 'leave_workflow':   return <LeaveWorkflowPanel />;
      case 'cleanup':          return <CleanupPanel />;
      case 'push':             return <PushPanel userId={user?.id} />;
      case 'email_recipients': return <EmailRecipientsPanel />;
      case 'root_admins':      return <RootAdminsPanel />;
      case 'my_profile':       return <MyProfilePanel user={user} />;
      default:                 return null;
    }
  }

  return (
    <div>
      <div className="page-header mb-6">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-subtitle">Configure organization-wide preferences and automation</div>
        </div>
      </div>

      <div className="flex gap-5 items-start">
        {/* ── Left settings navigation ── */}
        <div className="w-56 flex-shrink-0 sticky top-4">
          <div className="card overflow-hidden py-2">
            {NAV_SECTIONS.map(section => {
              const visibleItems = section.items.filter(item => navAllowed(item, role));
              if (!visibleItems.length) return null;
              return (
                <div key={section.group} className="mb-1">
                  <p className="text-[0.6rem] font-black uppercase tracking-widest text-[#a09fb5] px-4 pt-3 pb-1">{section.group}</p>
                  {visibleItems.map(item => {
                    const Icon   = item.icon;
                    const active = activeSection === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveSection(item.id)}
                        className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm font-semibold text-left transition-all ${
                          active
                            ? 'bg-[#3525cd]/8 text-[#3525cd] border-r-2 border-[#3525cd]'
                            : 'text-[#464555] hover:bg-[#f5f4ff] hover:text-[#3525cd]'
                        }`}
                      >
                        <Icon size={14} className={active ? 'text-[#3525cd]' : 'text-[#777587]'} />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right content area ── */}
        <div className="flex-1 min-w-0">
          <div className="card p-6 lg:p-8">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
