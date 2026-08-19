import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Zap, Info, Palette, User, Timer, Check, RefreshCw, Mail, Plus, Trash2, ToggleLeft, ToggleRight, ShieldCheck, Building2, Briefcase, CalendarDays, Bell, BellOff, Wrench, Settings2, ChevronRight } from 'lucide-react';
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

const STATUS_LEGEND = [
  { label: 'Present',    color: '#10B981', desc: 'Full day attendance' },
  { label: 'Absent',     color: '#EF4444', desc: 'Not present, no leave applied' },
  { label: 'On Leave',   color: '#F59E0B', desc: 'Approved leave' },
  { label: 'Half Day',   color: '#3B82F6', desc: 'Work hours below threshold' },
  { label: 'Late Entry', color: '#F97316', desc: 'Check-in after late threshold' },
  { label: 'Early Exit', color: '#8B5CF6', desc: 'Check-out before early exit threshold' },
];

// ── Work Schedule Card ────────────────────────────────────────────────────────
function WorkScheduleCard({ schedule, isAdmin, onSaved }) {
  const toast = useToast();

  const [form, setForm] = useState({
    start_time:           schedule?.start_time           || '09:00',
    end_time:             schedule?.end_time             || '18:00',
    late_threshold:       schedule?.late_threshold       || '09:15',
    early_exit_threshold: schedule?.early_exit_threshold || '17:45',
    half_day_hours:       schedule?.half_day_hours       || 4,
    work_days:            (schedule?.work_days || '1,2,3,4,5').split(',').map(Number),
  });

  useEffect(() => {
    if (schedule) {
      setForm({
        start_time:           schedule.start_time,
        end_time:             schedule.end_time,
        late_threshold:       schedule.late_threshold,
        early_exit_threshold: schedule.early_exit_threshold,
        half_day_hours:       schedule.half_day_hours,
        work_days:            (schedule.work_days || '1,2,3,4,5').split(',').map(Number),
      });
    }
  }, [schedule]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [scheduleErrors, setScheduleErrors] = useState({});

  function validateSchedule() {
    const errs = {};
    const startMins = timeToMinutes(form.start_time);
    const endMins   = timeToMinutes(form.end_time);
    const lateMins  = timeToMinutes(form.late_threshold);
    const earlyMins = timeToMinutes(form.early_exit_threshold);
    const halfHours = parseFloat(form.half_day_hours);
    // BUG_097/098: start and end required, end must be after start
    if (!form.start_time) errs.start_time = 'Work Start Time is required.';
    if (!form.end_time)   errs.end_time   = 'Work End Time is required.';
    if (startMins !== null && endMins !== null && endMins <= startMins)
      errs.end_time = 'End time must be after start time.';
    // BUG_099: Late threshold must be between start and end
    if (lateMins !== null && startMins !== null && endMins !== null &&
        (lateMins <= startMins || lateMins >= endMins))
      errs.late_threshold = 'Late Entry Threshold must be between Start and End time.';
    // BUG_100: Early exit must be between late threshold and end
    if (earlyMins !== null && lateMins !== null && endMins !== null &&
        (earlyMins <= lateMins || earlyMins >= endMins))
      errs.early_exit_threshold = 'Early Exit Threshold must be between Late Threshold and End time.';
    // BUG_101/102: Half day threshold must be positive and <= total work hours
    if (isNaN(halfHours) || halfHours <= 0)
      errs.half_day_hours = 'Half Day Threshold must be a positive number.';
    else if (startMins !== null && endMins !== null) {
      const totalWorkHours = (endMins - startMins) / 60;
      if (halfHours > totalWorkHours)
        errs.half_day_hours = `Half Day Threshold cannot exceed total work hours (${totalWorkHours.toFixed(1)} hrs).`;
    }
    // BUG_103: At least one working day required
    if (form.work_days.length === 0)
      errs.work_days = 'Please select at least one working day.';
    setScheduleErrors(errs);
    return Object.keys(errs).length === 0;
  }

  const toggleDay = (idx) => setForm(f => ({
    ...f,
    work_days: f.work_days.includes(idx)
      ? f.work_days.filter(d => d !== idx)
      : [...f.work_days, idx].sort((a, b) => a - b),
  }));

  const mutation = useMutation({
    mutationFn: () => apiPut('/settings', {
      start_time:           form.start_time,
      end_time:             form.end_time,
      late_threshold:       form.late_threshold,
      early_exit_threshold: form.early_exit_threshold,
      half_day_hours:       parseFloat(form.half_day_hours),
      work_days:            form.work_days.join(','),
    }),
    onSuccess: () => { toast('Work schedule saved!', 'success'); onSaved?.(); },
    onError:   err => toast(err.message, 'error'),
  });

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-5">
        <Clock size={18} className="text-[#3525cd]" />
        <span className="font-bold text-[#151c27]">Work Schedule</span>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Work Start Time</label>
            <input type="time" className={`form-control ${scheduleErrors.start_time ? 'border-rose-400' : ''}`} value={form.start_time}
              disabled={!isAdmin} onChange={e => set('start_time', e.target.value)} />
            {scheduleErrors.start_time && <p className="text-xs text-rose-500 mt-1">{scheduleErrors.start_time}</p>}
          </div>
          <div>
            <label className="form-label">Work End Time</label>
            <input type="time" className={`form-control ${scheduleErrors.end_time ? 'border-rose-400' : ''}`} value={form.end_time}
              disabled={!isAdmin} onChange={e => set('end_time', e.target.value)} />
            {scheduleErrors.end_time && <p className="text-xs text-rose-500 mt-1">{scheduleErrors.end_time}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Late Entry Threshold</label>
            <input type="time" className="form-control" value={form.late_threshold}
              disabled={!isAdmin} onChange={e => set('late_threshold', e.target.value)} />
            <p className="form-hint">Check-in after this time = Late</p>
          </div>
          <div>
            <label className="form-label">Early Exit Threshold</label>
            <input type="time" className="form-control" value={form.early_exit_threshold}
              disabled={!isAdmin} onChange={e => set('early_exit_threshold', e.target.value)} />
            <p className="form-hint">Check-out before this time = Early Exit</p>
          </div>
        </div>

        <div>
          <label className="form-label">Half Day Threshold (hours)</label>
          <input type="number" className={`form-control ${scheduleErrors.half_day_hours ? 'border-rose-400' : ''}`} value={form.half_day_hours}
            step="0.5" min="0.5" disabled={!isAdmin}
            onChange={e => set('half_day_hours', e.target.value)} />
          {scheduleErrors.half_day_hours
            ? <p className="text-xs text-rose-500 mt-1">{scheduleErrors.half_day_hours}</p>
            : <p className="form-hint">Work hours below this = Half Day</p>}
        </div>

        <div>
          <label className="form-label">Working Days</label>
          <div className="flex gap-3 flex-wrap mt-2">
            {DAY_LABELS.map((d, i) => (
              <label key={i} className={`flex items-center gap-1.5 text-sm select-none ${isAdmin ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}>
                <input
                  type="checkbox"
                  checked={form.work_days.includes(i)}
                  disabled={!isAdmin}
                  onChange={() => toggleDay(i)}
                  className="accent-[#3525cd]"
                />
                {d}
              </label>
            ))}
          </div>
        </div>

        {scheduleErrors.work_days && <p className="text-xs text-rose-500 mt-1">{scheduleErrors.work_days}</p>}

        {isAdmin ? (
          <button className="btn btn-primary" onClick={() => { if (validateSchedule()) mutation.mutate(); }} disabled={mutation.isPending}>
            {mutation.isPending ? <><span className="spinner w-4 h-4" /> Saving…</> : 'Save Schedule'}
          </button>
        ) : (
          <p className="text-xs text-[#777587]">Only admins can modify schedule settings.</p>
        )}
      </div>
    </div>
  );
}


// ── Status Legend Card ────────────────────────────────────────────────────────
function AttendanceCleanupCard() {
  const toast = useToast();
  const [running,        setRunning]        = useState(false);
  const [result,         setResult]         = useState(null);
  const [confirmCleanup, setConfirmCleanup] = useState(false); // BUG_106

  async function runCleanup() {
    setRunning(true);
    setResult(null);
    try {
      const data = await apiPost('/attendance/cleanup-orphaned', {});
      setResult(data.removed);
      toast(
        data.removed > 0
          ? `Cleaned up ${data.removed} orphaned attendance record${data.removed !== 1 ? 's' : ''}.`
          : 'No orphaned records found — attendance data is clean.',
        data.removed > 0 ? 'success' : 'info',
      );
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-3">
        <Wrench size={18} className="text-[#3525cd]" />
        <span className="font-bold text-[#151c27]">Attendance Data Cleanup</span>
      </div>
      <p className="text-sm text-[#464555] mb-4 leading-relaxed">
        Removes attendance records marked as <strong>On Leave / WFH / Half Day</strong> that no longer have a matching approved leave.
        This can happen when a leave is reverted or a past sync ran incorrectly. Safe to run at any time.
      </p>
      {result !== null && (
        <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg mb-4 ${result > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-[#f0f3ff] text-[#3525cd] border border-[#c7c4d8]'}`}>
          <Check size={13} />
          {result > 0 ? `${result} orphaned record${result !== 1 ? 's' : ''} removed.` : 'Attendance data is already clean.'}
        </div>
      )}
      <button
        onClick={() => setConfirmCleanup(true)}
        disabled={running}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all shadow-sm disabled:opacity-60"
        style={{ background: 'linear-gradient(135deg, #3525cd, #4f46e5)' }}
      >
        {running ? <><span className="spinner w-3.5 h-3.5" /> Running…</> : <><RefreshCw size={14} /> Run Cleanup</>}
      </button>
      {/* BUG_106: confirm before destructive cleanup */}
      <ConfirmModal open={confirmCleanup} title="Run Attendance Cleanup"
        message="This will permanently delete orphaned attendance records. Are you sure you want to continue?"
        confirmLabel="Yes, Run Cleanup" onConfirm={() => { setConfirmCleanup(false); runCleanup(); }} onCancel={() => setConfirmCleanup(false)} />
    </div>
  );
}

function StatusLegendCard() {
  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-5">
        <Palette size={18} className="text-[#3525cd]" />
        <span className="font-bold text-[#151c27]">Status Legend</span>
      </div>
      <div className="flex flex-col gap-3">
        {STATUS_LEGEND.map(item => (
          <div key={item.label} className="flex items-center gap-3">
            <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
            <div>
              <strong className="text-sm text-[#151c27]">{item.label}</strong>
              <span className="text-xs text-[#777587] ml-2">{item.desc}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── My Profile Card ───────────────────────────────────────────────────────────
function MyProfileCard({ user }) {
  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-5">
        <User size={18} className="text-[#3525cd]" />
        <span className="font-bold text-[#151c27]">My Profile</span>
      </div>
      <div className="flex items-center gap-4 mb-5">
        <Avatar name={user.name} color={user.avatar_color} size={56} />
        <div>
          <div className="font-bold text-[#151c27]">{user.name}</div>
          <div className="text-sm text-[#777587]">{user.email}</div>
          <RoleBadge role={user.role} className="mt-1" />
        </div>
      </div>
      <div className="flex flex-col gap-2 text-sm text-[#151c27]">
        <div><span className="font-semibold">Department:</span> {user.department || '—'}</div>
        <div><span className="font-semibold">Position:</span> {user.position || '—'}</div>
      </div>
    </div>
  );
}

// ── Notification Recipients Card (Root Admin only) ────────────────────────────
function NotificationRecipientsCard() {
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
    // BUG_151: validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) { toast('Please enter a valid email address.', 'error'); return; }
    // BUG_152: validate label (name) — must contain at least one letter if provided, max 60 chars
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

  async function doRemoveRecipient(id) {
    try {
      await apiDelete(`/root/notify-recipients/${id}`);
      qc.invalidateQueries({ queryKey: ['notify-recipients'] });
      toast('Recipient removed', 'success');
    } catch (err) { toast(err.message, 'error'); }
    setConfirmRemove(null);
  }

  return (
    <div className="card p-6 lg:col-span-2">
      <div className="flex items-center gap-2 mb-2">
        <Mail size={18} className="text-[#3525cd]" />
        <span className="font-bold text-[#151c27]">Email Notification Recipients</span>
      </div>
      <p className="text-xs text-[#777587] mb-5">
        These email addresses receive notifications when employees apply for or get approved/rejected on leaves.
        If the list is empty, the system falls back to environment variables (HR_EMAIL, COMPANY_HEAD_*).
      </p>

      {/* Add new recipient */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <input className="form-control flex-1 min-w-[200px]" type="email" placeholder="recipient@company.com"
          value={newEmail} onChange={e => setNewEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addRecipient()} />
        <input className="form-control w-40" placeholder="Label (optional)"
          value={newName} onChange={e => setNewName(e.target.value)} />
        <button className="btn btn-primary btn-sm flex items-center gap-1.5" onClick={addRecipient} disabled={adding}>
          {adding ? <span className="spinner w-3.5 h-3.5" /> : <Plus size={14} />} Add
        </button>
      </div>

      {/* Recipient list */}
      {isLoading ? (
        <div className="flex justify-center py-4"><span className="spinner w-5 h-5" /></div>
      ) : recipients.length === 0 ? (
        <div className="text-center py-6 text-sm text-[#777587] bg-[#f0f3ff] rounded-xl border border-dashed border-[#c7c4d8]">
          No recipients configured. Add emails above to override the defaults.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {recipients.map(r => (
            <div key={r.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${r.active ? 'border-[#c7c4d8] bg-white' : 'border-dashed border-[#c7c4d8] bg-[#f0f3ff]/50 opacity-60'}`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${r.active ? 'bg-emerald-500' : 'bg-[#c7c4d8]'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#151c27] truncate">{r.email}</p>
                {r.name && <p className="text-xs text-[#777587] truncate">{r.name}</p>}
              </div>
              <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full border ${r.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-[#f0f3ff] text-[#777587] border-[#c7c4d8]'}`}>
                {r.active ? 'Active' : 'Paused'}
              </span>
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

      <ConfirmModal
        open={!!confirmRemove}
        title="Remove Recipient"
        message={`Remove ${confirmRemove?.name || confirmRemove?.email} from notification recipients?`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => doRemoveRecipient(confirmRemove.id)}
        onCancel={() => setConfirmRemove(null)}
      />
    </div>
  );
}

// ── Push Notifications Card ───────────────────────────────────────────────────
function PushNotificationsCard({ userId }) {
  const { permission, subscribed, requestAndSubscribe, unsubscribe, isSupported } = usePushNotification(userId);
  const toast = useToast();
  const [showPushConfirm, setShowPushConfirm] = useState(false); // BUG_104

  if (!isSupported) return null;

  const isEnabled = permission === 'granted' && subscribed;

  async function handleEnableClick() {
    if (isEnabled) {
      toast('Push notifications are already enabled in your browser.', 'info');
      return;
    }
    // BUG_104: show confirmation modal before triggering the browser permission prompt
    setShowPushConfirm(true);
  }

  async function handleConfirmEnable() {
    setShowPushConfirm(false);
    await requestAndSubscribe();
    toast('Push notifications enabled!', 'success');
  }

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-2">
        <Bell size={18} className="text-[#3525cd]" />
        <span className="font-bold text-[#151c27]">Push Notifications</span>
        <span className={`ml-auto text-[0.65rem] font-black px-2 py-0.5 rounded-full border ${
          isEnabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}>
          {isEnabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>
      <p className="text-xs text-[#777587] mb-4">
        Receive browser push notifications for leave approvals, rejections, and important HR alerts even when you're not on the dashboard.
      </p>
      <button
        onClick={isEnabled ? unsubscribe : handleEnableClick}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold border transition-all ${
          isEnabled
            ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'
            : 'bg-[#3525cd] text-white border-transparent hover:bg-[#4f46e5]'
        }`}
      >
        {isEnabled ? <BellOff size={15} /> : <Bell size={15} />}
        {isEnabled ? 'Disable Push Notifications' : 'Enable Push Notifications'}
      </button>
      {permission === 'denied' && (
        <p className="text-xs text-rose-500 mt-2">
          Notifications are blocked by your browser. Please update your browser settings to allow notifications for this site.
        </p>
      )}

      {/* BUG_104: Push notifications confirmation modal */}
      {showPushConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 border border-[#c7c4d8]">
            <div className="flex items-center gap-2 mb-3">
              <Bell size={20} className="text-[#3525cd]" />
              <h3 className="font-bold text-[#151c27] text-base">Enable Push Notifications</h3>
            </div>
            <p className="text-sm text-[#464555] mb-5 leading-relaxed">
              You'll receive real-time updates for leave approvals, rejections, and important HR alerts in your browser.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowPushConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-[#464555] border border-[#c7c4d8] hover:bg-[#f0f3ff] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmEnable}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-[#3525cd] hover:bg-[#4f46e5] transition-colors"
              >
                Yes, Enable
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Root Admins Card (Root Admin only) ───────────────────────────────────────
function RootAdminsCard() {
  const { data: rootAdmins = [], isLoading } = useQuery({
    queryKey: ['root-admins'],
    queryFn:  () => apiGet('/root/root-admins'),
  });

  return (
    <div className="card p-6 lg:col-span-2">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck size={18} className="text-[#3525cd]" />
        <span className="font-bold text-[#151c27]">Root Administrators</span>
        <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-[#f0f3ff] text-[#3525cd] border border-[#c7c4d8]">
          {rootAdmins.length} total
        </span>
      </div>
      <p className="text-xs text-[#777587] mb-5">
        All root admin accounts for this organization. Root admins have full access to all settings and data.
        To add or remove root admins, use the <strong>Employees</strong> page and set the role to Root Admin.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-4"><span className="spinner w-5 h-5" /></div>
      ) : rootAdmins.length === 0 ? (
        <div className="text-center py-6 text-sm text-[#777587] bg-[#f0f3ff] rounded-xl border border-dashed border-[#c7c4d8]">
          No root admins found.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rootAdmins.map(admin => (
            <div key={admin.id} className="flex items-center gap-3 p-3 rounded-xl border border-[#c7c4d8] bg-white hover:bg-[#f9f9ff] transition-colors">
              <Avatar name={admin.name} color={admin.avatar_color} size={40} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-[#151c27] truncate">{admin.name}</span>
                  <span className="text-[0.6rem] font-black px-1.5 py-0.5 rounded-full bg-[#3525cd]/10 text-[#3525cd] border border-[#3525cd]/20 uppercase tracking-wide">
                    Root Admin
                  </span>
                </div>
                <p className="text-xs text-[#777587] truncate mt-0.5">{admin.email}</p>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {admin.department && (
                    <span className="flex items-center gap-1 text-[0.68rem] text-[#464555]">
                      <Building2 size={10} className="text-[#3525cd]" /> {admin.department}
                    </span>
                  )}
                  {admin.position && (
                    <span className="flex items-center gap-1 text-[0.68rem] text-[#464555]">
                      <Briefcase size={10} className="text-[#3525cd]" /> {admin.position}
                    </span>
                  )}
                  {admin.created_at && (
                    <span className="flex items-center gap-1 text-[0.68rem] text-[#777587]">
                      <CalendarDays size={10} /> Joined {new Date(admin.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Workflow Settings Link Card ───────────────────────────────────────────────
function WorkflowSettingsCard() {
  const navigate  = useNavigate();
  const { pathname } = useLocation();
  const { data: workflow } = useQuery({
    queryKey: ['leave-workflow-config-summary'],
    queryFn:  () => apiGet('/leaves/workflow-config'),
    staleTime: 5 * 60 * 1000,
  });
  const targetPath = pathname.startsWith('/root') ? '/root/leave-workflow' : '/leave-workflow';
  const levelCount = workflow?.levels?.length || 0;

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Settings2 size={18} className="text-[#3525cd]" />
        <span className="font-bold text-[#151c27]">Leave Approval Workflow</span>
      </div>
      <p className="text-sm text-[#777587] mb-4">
        Configure the multi-level approval chain for leave requests. Currently{' '}
        <strong className="text-[#151c27]">{levelCount} approval level{levelCount !== 1 ? 's' : ''}</strong> configured.
      </p>
      {workflow?.levels?.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#3525cd]/10 text-[#3525cd] border border-[#3525cd]/20">Employee</span>
          {workflow.levels.map((l, i) => (
            <React.Fragment key={i}>
              <ChevronRight size={12} className="text-[#c7c4d8]" />
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                {l.level_label || l.role_type.replace(/_/g, ' ')}
              </span>
            </React.Fragment>
          ))}
          <ChevronRight size={12} className="text-[#c7c4d8]" />
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">✓ Approved</span>
        </div>
      )}
      <button
        onClick={() => navigate(targetPath)}
        className="flex items-center gap-2 px-4 py-2 bg-[#3525cd] text-white rounded-xl text-sm font-bold hover:bg-[#2a1fb0] transition-colors"
      >
        <Settings2 size={14} /> Configure Workflow
      </button>
    </div>
  );
}

// ── Settings Page ─────────────────────────────────────────────────────────────
export default function Settings() {
  const { user, isAdmin, isRootAdmin } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn:  () => apiGet('/settings'),
  });

  const schedule = data?.schedule;

  if (isLoading) {
    return <div className="loading"><div className="spinner" /> Loading…</div>;
  }

  return (
    <div>
      <div className="page-header mb-6">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-subtitle">Configure work schedule and integrations</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WorkScheduleCard schedule={schedule} isAdmin={isAdmin} onSaved={refetch} />
        <PushNotificationsCard userId={user?.id} />
        {isAdmin && <WorkflowSettingsCard />}
        <StatusLegendCard />
        <MyProfileCard user={user} />
        {isAdmin && <AttendanceCleanupCard />}
        {isRootAdmin && <RootAdminsCard />}
        {isRootAdmin && <NotificationRecipientsCard />}
      </div>
    </div>
  );
}
