import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Zap, Info, Palette, User, Timer, Check, RefreshCw, Mail, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { RoleBadge } from '@/components/ui/Badge';
import { todayStr, initials } from '@/lib/utils';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
            <input type="time" className="form-control" value={form.start_time}
              disabled={!isAdmin} onChange={e => set('start_time', e.target.value)} />
          </div>
          <div>
            <label className="form-label">Work End Time</label>
            <input type="time" className="form-control" value={form.end_time}
              disabled={!isAdmin} onChange={e => set('end_time', e.target.value)} />
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
          <input type="number" className="form-control" value={form.half_day_hours}
            step="0.5" min="1" max="8" disabled={!isAdmin}
            onChange={e => set('half_day_hours', e.target.value)} />
          <p className="form-hint">Work hours below this = Half Day</p>
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

        {isAdmin ? (
          <button className="btn btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? <><span className="spinner w-4 h-4" /> Saving…</> : 'Save Schedule'}
          </button>
        ) : (
          <p className="text-xs text-[#777587]">Only admins can modify schedule settings.</p>
        )}
      </div>
    </div>
  );
}

// ── Clockify Integration Card ─────────────────────────────────────────────────
function ClockifyCard({ clockify, isAdmin, onSaved }) {
  const toast = useToast();
  const [apiKey, setApiKey]   = useState('');
  const [wsId,   setWsId]     = useState(clockify?.workspace_id || '');
  const [saving,  setSaving]  = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing,  setSyncing] = useState(false);

  async function saveConfig() {
    // Need at least a workspace ID; API key can be omitted if one is already stored
    if (!wsId) { toast('Enter Workspace ID', 'warning'); return; }
    if (!apiKey && !clockify?.api_key) { toast('Enter API key', 'warning'); return; }
    setSaving(true);
    try {
      // Only send api_key when the user actually typed a new one
      const payload = { workspace_id: wsId };
      if (apiKey.trim()) payload.api_key = apiKey.trim();
      await apiPut('/settings/clockify', payload);
      toast('Clockify settings saved!', 'success');
      onSaved?.();
    } catch (err) { toast(err.message, 'error'); }
    finally { setSaving(false); }
  }

  async function testConnection() {
    // Save first only if a new API key was entered; otherwise just test what's stored
    if (apiKey.trim()) await saveConfig();
    setTesting(true);
    try {
      const workspaces = await apiGet('/clockify/workspaces');
      toast(`Connected! Found ${workspaces.length} workspace(s)`, 'success');
    } catch (err) { toast('Connection failed: ' + err.message, 'error'); }
    finally { setTesting(false); }
  }

  async function syncToday() {
    setSyncing(true);
    try {
      toast('Syncing Clockify data for today…', 'info');
      const result = await apiPost('/clockify/sync', { date: todayStr() });
      toast(`Synced ${result.synced} users from Clockify`, 'success');
    } catch (err) { toast('Sync failed: ' + err.message, 'error'); }
    finally { setSyncing(false); }
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-[#3525cd]" />
          <span className="font-bold text-[#151c27]">Clockify Integration</span>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#f0f3ff] text-[#3525cd] border border-[#c7c4d8]">
          <Timer size={11} /> Clockify
        </span>
      </div>

      <div className="space-y-4">
        <div className="flex items-start gap-2 p-3 rounded-xl bg-[#f0f3ff] border border-[#c7c4d8] text-sm text-[#3525cd]">
          <Info size={15} className="mt-0.5 flex-shrink-0" />
          <span>
            Connect your Clockify workspace to automatically sync work hours.
            Get your API key from <strong>clockify.me → Profile Settings → API</strong>
          </span>
        </div>

        <div>
          <label className="form-label">Clockify API Key</label>
          <input className="form-control" type="password"
            placeholder={clockify?.api_key ? '••••••••••' : 'Enter your API key'}
            value={apiKey} disabled={!isAdmin}
            onChange={e => setApiKey(e.target.value)} />
        </div>

        <div>
          <label className="form-label">Workspace ID</label>
          <input className="form-control"
            placeholder="Enter workspace ID"
            value={wsId} disabled={!isAdmin}
            onChange={e => setWsId(e.target.value)} />
          <p className="form-hint">
            Found in Clockify URL: clockify.me/workspaces/<strong>[ID]</strong>/settings
          </p>
        </div>

        {clockify?.last_synced && (
          <p className="text-xs text-[#777587]">
            Last synced: {new Date(clockify.last_synced).toLocaleString()}
          </p>
        )}

        {isAdmin ? (
          <div className="flex gap-2 flex-wrap">
            <button className="btn btn-primary btn-sm" onClick={saveConfig} disabled={saving}>
              {saving ? <><span className="spinner w-3 h-3" /> Saving…</> : <><Check size={14} /> Save Config</>}
            </button>
            <button className="btn btn-outline btn-sm" onClick={testConnection} disabled={testing}>
              {testing ? <><span className="spinner w-3 h-3" /> Testing…</> : <><RefreshCw size={14} /> Test Connection</>}
            </button>
            <button className="btn btn-outline btn-sm" onClick={syncToday} disabled={syncing}>
              {syncing ? <><span className="spinner w-3 h-3" /> Syncing…</> : <><RefreshCw size={14} /> Sync Today</>}
            </button>
          </div>
        ) : (
          <p className="text-xs text-[#777587]">Only admins can configure Clockify.</p>
        )}
      </div>
    </div>
  );
}

// ── Status Legend Card ────────────────────────────────────────────────────────
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

  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ['notify-recipients'],
    queryFn:  () => apiGet('/root/notify-recipients'),
  });

  async function addRecipient() {
    if (!newEmail.trim()) { toast('Email is required', 'warning'); return; }
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

  async function removeRecipient(id) {
    if (!confirm('Remove this recipient?')) return;
    try {
      await apiDelete(`/root/notify-recipients/${id}`);
      qc.invalidateQueries({ queryKey: ['notify-recipients'] });
      toast('Recipient removed', 'success');
    } catch (err) { toast(err.message, 'error'); }
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
              <button onClick={() => removeRecipient(r.id)} className="p-1.5 rounded-lg hover:bg-rose-50 transition-colors text-rose-400 hover:text-rose-600">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
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
  const clockify = data?.clockify;

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
        <ClockifyCard     clockify={clockify} isAdmin={isAdmin} onSaved={refetch} />
        <StatusLegendCard />
        <MyProfileCard user={user} />
        {isRootAdmin && <NotificationRecipientsCard />}
      </div>
    </div>
  );
}
