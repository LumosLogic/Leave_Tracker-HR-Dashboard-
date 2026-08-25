import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Fingerprint, Wifi, WifiOff, MapPin, Server, Eye, Trash2, History, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

function timeAgo(dateStr) {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  if (days < 7)   return `${days} day${days !== 1 ? 's' : ''} ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isOnline(lastSeen) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
}

// ── Register Device Modal ─────────────────────────────────────────────────────
function RegisterDeviceModal({ open, onClose, branches }) {
  const toast = useToast();
  const qc    = useQueryClient();
  const empty = { serial_number: '', device_name: '', location: '', area_code: '', device_ip: '', branch_id: '' };
  const [form, setForm] = useState(empty);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const mut = useMutation({
    mutationFn: () => apiPost('/biometric/devices', form),
    onSuccess: () => {
      toast('Device registered!', 'success');
      qc.invalidateQueries({ queryKey: ['biometric-devices'] });
      onClose();
      setForm(empty);
    },
    onError: e => toast(e.message, 'error'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Register Biometric Device" size="md"
      footer={
        <div className="flex justify-end gap-3">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => mut.mutate()}
            disabled={mut.isPending || !form.serial_number || !form.device_name}>
            {mut.isPending ? <><span className="spinner w-4 h-4" />Saving…</> : 'Register Device'}
          </button>
        </div>
      }>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Serial Number <span className="text-rose-500">*</span></label>
            <input className="form-control font-mono" placeholder="e.g. ZKT-001-ABC" value={form.serial_number} onChange={e => set('serial_number', e.target.value)} />
          </div>
          <div>
            <label className="form-label">Device Name <span className="text-rose-500">*</span></label>
            <input className="form-control" placeholder="e.g. Main Entrance" value={form.device_name} onChange={e => set('device_name', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Location</label>
            <input className="form-control" placeholder="e.g. Ground Floor Lobby" value={form.location} onChange={e => set('location', e.target.value)} />
          </div>
          <div>
            <label className="form-label">Area Code</label>
            <input className="form-control" placeholder="e.g. A1" value={form.area_code} onChange={e => set('area_code', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Device IP Address</label>
            <input className="form-control font-mono" placeholder="e.g. 192.168.1.100" value={form.device_ip} onChange={e => set('device_ip', e.target.value)} />
          </div>
          <div>
            <label className="form-label">Branch</label>
            <select className="form-control" value={form.branch_id} onChange={e => set('branch_id', e.target.value)}>
              <option value="">— Select branch —</option>
              {(branches || []).map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Historical Sync Modal ─────────────────────────────────────────────────────
function HistoricalSyncModal({ device, open, onClose }) {
  const toast = useToast();
  const qc    = useQueryClient();

  const prevMonthEnd   = new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().slice(0, 10);
  const prevMonthStart = prevMonthEnd.slice(0, 8) + '01';

  const [form,  setForm]  = useState({ from: prevMonthStart, to: prevMonthEnd, dry_run: false });
  const [jobId, setJobId] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleClose = () => {
    setJobId(null);
    setForm({ from: prevMonthStart, to: prevMonthEnd, dry_run: false });
    onClose();
  };

  // ── Start sync ────────────────────────────────────────────────────────────
  const startMut = useMutation({
    mutationFn: () => apiPost(`/biometric/devices/${device.id}/historical-sync`, {
      from:    form.from,
      to:      form.to,
      dry_run: form.dry_run,
    }),
    onSuccess: (res) => {
      setJobId(res.job_id);
      qc.invalidateQueries({ queryKey: ['biometric-devices'] });
      toast(
        form.dry_run
          ? 'Preview started — no data will be written'
          : 'Historical sync started — device will reset and re-upload in ~60–120 s',
        'success'
      );
    },
    onError: e => toast(e.message || 'Failed to start sync', 'error'),
  });

  // ── Poll job status (every 3 s while running) ─────────────────────────────
  const { data: job } = useQuery({
    queryKey: ['historical-sync-job', jobId],
    queryFn:  () => apiGet(`/biometric/historical-sync-jobs/${jobId}`),
    enabled:  !!jobId,
    refetchInterval: data =>
      (data?.status === 'running' || data?.status === 'pending') ? 3000 : false,
  });

  const isRunning   = !job || job.status === 'running' || job.status === 'pending';
  const isCompleted = job?.status === 'completed';
  const isFailed    = job?.status === 'failed';

  // While running, show live_stats from server; when done, show persisted stats
  const stats = isRunning
    ? (job?.live_stats || {})
    : { received: job?.records_received, in_range: job?.records_in_range, inserted: job?.records_inserted, duplicate: job?.records_duplicate };

  const today = new Date().toISOString().slice(0, 10);

  if (!device) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={form.dry_run && !jobId ? 'Historical Sync — Preview Mode' : 'Historical Sync'}
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          {!jobId ? (
            <>
              <button className="btn btn-outline" onClick={handleClose}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={() => startMut.mutate()}
                disabled={startMut.isPending || !form.from || !form.to || form.from > form.to}>
                {startMut.isPending
                  ? <><span className="spinner w-4 h-4" />Starting…</>
                  : form.dry_run ? 'Run Preview' : 'Start Historical Sync'}
              </button>
            </>
          ) : (isCompleted || isFailed) ? (
            <button className="btn btn-outline" onClick={handleClose}>Close</button>
          ) : (
            <button className="btn btn-outline" onClick={handleClose}>Close (sync continues in background)</button>
          )}
        </div>
      }>

      {/* ── Phase 1: Form ── */}
      {!jobId ? (
        <div className="space-y-4">
          {/* Device banner */}
          <div className="flex items-center gap-3 p-3 bg-[#f0f3ff] rounded-xl border border-[#d6d3f0]">
            <div className="w-9 h-9 rounded-lg bg-[#e7eefe] flex items-center justify-center flex-shrink-0">
              <Fingerprint size={18} className="text-[#3525cd]" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#151c27]">{device.device_name}</div>
              <div className="text-xs font-mono text-[#777587]">{device.serial_number}</div>
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">From Date <span className="text-rose-500">*</span></label>
              <input
                type="date"
                className="form-control"
                value={form.from}
                max={today}
                onChange={e => set('from', e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">To Date <span className="text-rose-500">*</span></label>
              <input
                type="date"
                className="form-control"
                value={form.to}
                max={today}
                onChange={e => set('to', e.target.value)}
              />
            </div>
          </div>
          {form.from && form.to && form.from > form.to && (
            <p className="text-xs text-rose-500">From date must be on or before To date.</p>
          )}

          {/* Dry run toggle */}
          <label className="flex items-start gap-3 cursor-pointer p-3.5 rounded-xl border border-[#e8e8f0] hover:border-[#3525cd] hover:bg-[#f9f9ff] transition-colors">
            <input
              type="checkbox"
              className="mt-0.5 w-4 h-4 rounded accent-[#3525cd]"
              checked={form.dry_run}
              onChange={e => set('dry_run', e.target.checked)}
            />
            <div>
              <div className="text-sm font-semibold text-[#151c27]">Dry Run (Preview only)</div>
              <div className="text-xs text-[#777587] mt-0.5">
                Count matching records without writing anything to the database. Safe to run first.
              </div>
            </div>
          </label>

          {/* How it works */}
          <div className="text-xs text-[#777587] bg-[#f9f9ff] rounded-lg p-3 border border-[#f0f3ff] space-y-1.5">
            <p><span className="font-semibold text-[#464555]">How it works (2 steps, ~60–120 s):</span></p>
            <p><span className="font-semibold text-[#464555]">Step 1:</span> Device upload-pointer is reset so the device treats ALL stored records as pending. Records are not deleted.</p>
            <p><span className="font-semibold text-[#464555]">Step 2:</span> Device re-uploads its full ATTLOG. Only records within the selected date range are imported; duplicates are automatically skipped.</p>
            <p>After sync completes, go to <span className="font-semibold">Biometric Logs → Reprocess All</span> to build attendance entries.</p>
          </div>
        </div>
      ) : (
        /* ── Phase 2: Job status ── */
        <div className="space-y-4">

          {/* Status banner */}
          {isRunning && (
            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
              <Loader size={20} className="text-blue-600 animate-spin flex-shrink-0" />
              <div>
                <div className="text-sm font-semibold text-blue-800">
                  {job ? 'Receiving records from device…' : 'Waiting for device heartbeat…'}
                </div>
                <div className="text-xs text-blue-600 mt-0.5">
                  Two-step sync: device pointer reset, then full upload (~60–120 s). Stats update automatically.
                </div>
              </div>
            </div>
          )}

          {isCompleted && !form.dry_run && (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
              <CheckCircle size={20} className="text-emerald-600 flex-shrink-0" />
              <div>
                <div className="text-sm font-semibold text-emerald-800">Sync completed</div>
                <div className="text-xs text-emerald-600 mt-0.5">
                  {parseInt(stats?.inserted ?? 0) > 0
                    ? `${stats.inserted} new record${stats.inserted !== 1 ? 's' : ''} imported. Run Reprocess All on Biometric Logs page to build attendance entries.`
                    : 'No new records found in the selected range — all records already exist in HRMS.'}
                </div>
              </div>
            </div>
          )}

          {isCompleted && form.dry_run && (
            <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-100">
              <AlertCircle size={20} className="text-amber-600 flex-shrink-0" />
              <div>
                <div className="text-sm font-semibold text-amber-800">Preview complete — zero writes made</div>
                <div className="text-xs text-amber-600 mt-0.5">
                  Run again without Dry Run to import the records.
                </div>
              </div>
            </div>
          )}

          {isFailed && (
            <div className="flex items-center gap-3 p-4 bg-red-50 rounded-xl border border-red-100">
              <AlertCircle size={20} className="text-red-600 flex-shrink-0" />
              <div>
                <div className="text-sm font-semibold text-red-800">Sync failed</div>
                <div className="text-xs text-red-600 mt-0.5">{job?.error || 'Unknown error — check server logs'}</div>
              </div>
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: 'Records Received',
                value: stats?.records_received ?? stats?.received ?? '—',
                sub:   'Total sent by device',
                color: 'text-[#3525cd]',
                bg:    'bg-[#f0f3ff]',
              },
              {
                label: 'In Date Range',
                value: stats?.records_in_range ?? stats?.in_range ?? '—',
                sub:   `${form.from} → ${form.to}`,
                color: 'text-[#3525cd]',
                bg:    'bg-[#f0f3ff]',
              },
              {
                label: form.dry_run ? 'Would Import' : 'Imported',
                value: stats?.records_inserted ?? stats?.inserted ?? '—',
                sub:   form.dry_run ? 'Not yet written' : 'New raw logs added',
                color: 'text-emerald-600',
                bg:    'bg-emerald-50',
              },
              {
                label: 'Already Existed',
                value: stats?.records_duplicate ?? stats?.duplicate ?? '—',
                sub:   'Skipped (no duplicate)',
                color: 'text-amber-600',
                bg:    'bg-amber-50',
              },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-xl p-3.5 border border-[#f0f0f5]`}>
                <div className={`text-2xl font-black leading-none ${s.color}`}>{s.value}</div>
                <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#777587] mt-1">{s.label}</div>
                <div className="text-[0.65rem] text-[#a0a0b0] mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Job meta */}
          <div className="text-center text-[0.68rem] text-[#a0a0b0] space-y-0.5">
            <div>{device.device_name} · {device.serial_number}</div>
            <div>{form.from} → {form.to} · {form.dry_run ? 'Dry run — no writes' : 'source: historical_recovery'}</div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BiometricDevices() {
  const { isAdmin } = useAuth();
  const toast       = useToast();
  const qc          = useQueryClient();
  const navigate    = useNavigate();
  const [regOpen,       setRegOpen]       = useState(false);
  const [deleteTarget,  setDeleteTarget]  = useState(null);
  const [historicalDev, setHistoricalDev] = useState(null); // device for historical sync

  const deleteMut = useMutation({
    mutationFn: id => apiDelete(`/biometric/devices/${id}`),
    onSuccess: () => {
      toast('Device removed', 'success');
      qc.invalidateQueries({ queryKey: ['biometric-devices'] });
      setDeleteTarget(null);
    },
    onError: e => toast(e.message, 'error'),
  });

  const { data: _devices, isLoading } = useQuery({
    queryKey: ['biometric-devices'],
    queryFn:  () => apiGet('/biometric/devices'),
    refetchInterval: 30000,
  });
  const { data: _branches } = useQuery({
    queryKey: ['branches'],
    queryFn:  () => apiGet('/branches'),
  });

  const devices  = Array.isArray(_devices)  ? _devices  : [];
  const branches = Array.isArray(_branches) ? _branches : [];

  const onlineCount  = devices.filter(d => isOnline(d.last_seen)).length;
  const offlineCount = devices.length - onlineCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Biometric Devices</h1>
          <p className="page-subtitle">{devices.length} device{devices.length !== 1 ? 's' : ''} registered · ZKTeco ADMS push</p>
        </div>
        {isAdmin && (
          <button
            className="flex items-center gap-2 bg-[#3525cd] hover:bg-[#2d1eb5] text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
            onClick={() => setRegOpen(true)}>
            <Plus size={16} /> Register Device
          </button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Devices', value: devices.length,  color: 'from-[#f0f3ff] to-[#e7eefe]', top: '#3525cd',  text: 'text-[#3525cd]' },
          { label: 'Online',        value: onlineCount,     color: 'from-emerald-50 to-emerald-100', top: '#10B981', text: 'text-emerald-700' },
          { label: 'Offline',       value: offlineCount,    color: 'from-red-50 to-red-100',          top: '#EF4444', text: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-5 bg-gradient-to-br ${s.color} border border-[#c7c4d8] shadow-sm relative overflow-hidden`}>
            <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: s.top }} />
            <div className={`text-3xl font-black leading-none ${s.text}`}>{s.value}</div>
            <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#777587] mt-1.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Devices grid */}
      {isLoading ? (
        <div className="loading"><div className="spinner" />Loading devices…</div>
      ) : devices.length === 0 ? (
        <div className="empty-state">
          <Fingerprint size={48} className="mx-auto mb-3 text-[#c7c4d8]" />
          <p className="font-semibold text-[#464555] mb-1">No devices registered</p>
          <p className="text-sm mb-4">Register your ZKTeco biometric devices to start tracking attendance</p>
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => setRegOpen(true)}>
              <Plus size={14} /> Register First Device
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {devices.map(device => {
            const online = isOnline(device.last_seen);
            return (
              <div key={device.id}
                className="bg-white rounded-2xl border border-[#c7c4d8] shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                <div className="p-5">
                  {/* Top row: icon + status badge */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-11 h-11 rounded-xl bg-[#f0f3ff] flex items-center justify-center flex-shrink-0">
                      <Fingerprint size={22} className="text-[#3525cd]" />
                    </div>
                    {online ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                        <Wifi size={10} /> Online
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                        <WifiOff size={10} /> Offline
                      </span>
                    )}
                  </div>

                  {/* Name + serial */}
                  <h3 className="font-black text-[#151c27] leading-tight">{device.device_name}</h3>
                  <p className="text-xs font-mono text-[#777587] mt-0.5">{device.serial_number}</p>

                  {/* Details */}
                  <div className="space-y-2 mt-4">
                    {device.location && (
                      <div className="flex items-center gap-2 text-xs text-[#464555]">
                        <MapPin size={12} className="text-[#777587] flex-shrink-0" />
                        <span>{device.location}</span>
                        {device.area_code && (
                          <span className="ml-auto font-mono text-[0.68rem] font-bold bg-[#f0f3ff] text-[#3525cd] px-1.5 py-0.5 rounded">
                            {device.area_code}
                          </span>
                        )}
                      </div>
                    )}
                    {device.device_ip && (
                      <div className="flex items-center gap-2 text-xs text-[#464555]">
                        <Server size={12} className="text-[#777587] flex-shrink-0" />
                        <span className="font-mono">{device.device_ip}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-xs text-[#777587] pt-1">
                      <span>Last seen:</span>
                      <span className={`font-semibold ml-0.5 ${online ? 'text-emerald-600' : 'text-[#464555]'}`}>
                        {timeAgo(device.last_seen)}
                      </span>
                    </div>
                    {/* Last sync status */}
                    {device.last_sync_requested_at && (
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <History size={11} className="text-[#777587] flex-shrink-0" />
                        <span className="text-[0.68rem] text-[#777587]">
                          Last sync: {timeAgo(device.last_sync_requested_at)}
                        </span>
                        {device.last_sync_status === 'requested' && (
                          <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            Waiting for device…
                          </span>
                        )}
                        {device.last_sync_status === 'clearing' && (
                          <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse inline-block" />
                            Clearing stamp…
                          </span>
                        )}
                        {device.last_sync_status === 'syncing' && (
                          <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
                            Syncing…
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer actions */}
                <div className="flex items-center px-4 py-3 border-t border-[#f0f3ff] bg-[#f9f9ff] gap-2">
                  <button
                    onClick={() => navigate(`/biometric/logs?device=${device.serial_number}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold text-[#3525cd] hover:bg-[#f0f3ff] transition-colors">
                    <Eye size={12} /> View Logs
                  </button>
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => setHistoricalDev(device)}
                        className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-[#3525cd] hover:bg-[#e7eefe] border border-transparent hover:border-[#c7c4d8] transition-colors"
                        title="Recover historical attendance records from device">
                        <History size={12} />
                        Historical Sync
                      </button>
                      <button
                        onClick={() => setDeleteTarget(device)}
                        className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-red-500 hover:bg-red-50 transition-colors"
                        title="Remove device">
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {regOpen && (
        <RegisterDeviceModal open onClose={() => setRegOpen(false)} branches={branches} />
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Remove Device"
        message={`Remove "${deleteTarget?.device_name}" (${deleteTarget?.serial_number}) from the system? This will also remove it from the IP allowlist.`}
        confirmLabel={deleteMut.isPending ? 'Removing…' : 'Remove'}
        variant="danger"
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        onCancel={() => !deleteMut.isPending && setDeleteTarget(null)}
      />

      <HistoricalSyncModal
        device={historicalDev}
        open={!!historicalDev}
        onClose={() => setHistoricalDev(null)}
      />
    </div>
  );
}
