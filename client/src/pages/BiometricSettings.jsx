import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Server, Copy, Info, RefreshCw, CheckCircle2,
  XCircle, Clock, ToggleLeft, ToggleRight, Play,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPut, apiPost } from '@/lib/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTs(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

function fmtDuration(start, end) {
  if (!start || !end) return null;
  const ms = new Date(end) - new Date(start);
  if (ms < 1000) return '<1s';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function StatusBadge({ status }) {
  const styles = {
    success: 'text-green-700 bg-green-50 border-green-200',
    completed:'text-green-700 bg-green-50 border-green-200',
    partial: 'text-yellow-700 bg-yellow-50 border-yellow-200',
    failed:  'text-red-700   bg-red-50   border-red-200',
    running: 'text-blue-700  bg-blue-50  border-blue-200',
    never:   'text-gray-500  bg-gray-50  border-gray-200',
  };
  const labels = {
    success: 'Success', completed: 'Completed',
    partial: 'Partial', failed: 'Failed',
    running: 'Running…', never: 'Never run',
  };
  const s = styles[status] || styles.never;
  const l = labels[status] || 'Unknown';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold border rounded-full px-2 py-0.5 ${s}`}>
      {(status === 'success' || status === 'completed') && <CheckCircle2 size={11} />}
      {status === 'failed'  && <XCircle size={11} />}
      {status === 'running' && <RefreshCw size={11} className="animate-spin" />}
      {l}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BiometricSettings() {
  const toast = useToast();
  const qc    = useQueryClient();

  // ── ADMS URL ─────────────────────────────────────────────────────────────────
  const { data: admsData, isLoading: admsLoading } = useQuery({
    queryKey: ['biometric-config'],
    queryFn:  () => apiGet('/settings/biometric-config'),
  });
  const serverUrl = admsData?.adms_url || admsData?.server_url || '—';

  function copyUrl() {
    if (serverUrl === '—') return;
    navigator.clipboard.writeText(serverUrl).then(() => toast('URL copied!', 'success'));
  }

  // ── Auto-sync config ──────────────────────────────────────────────────────────
  const { data: syncCfg, isLoading: cfgLoading } = useQuery({
    queryKey: ['biometric-auto-sync-config'],
    queryFn:  () => apiGet('/biometric/auto-sync/config'),
  });

  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (syncCfg !== undefined && form === null) {
      setForm(syncCfg
        ? { enabled: syncCfg.enabled, frequency: syncCfg.frequency, sync_time_1: syncCfg.sync_time_1, sync_time_2: syncCfg.sync_time_2 || '' }
        : { enabled: true, frequency: 'day', sync_time_1: '10:00', sync_time_2: '17:00' }
      );
    }
  }, [syncCfg, form]);

  // ── Sync history ──────────────────────────────────────────────────────────────
  const { data: history = [], isLoading: histLoading, refetch: refetchHistory } = useQuery({
    queryKey: ['biometric-auto-sync-history'],
    queryFn:  () => apiGet('/biometric/auto-sync/history', { limit: 15 }),
    refetchInterval: syncCfg?.last_sync_status === 'running' ? 4000 : false,
  });

  // ── Save config ───────────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: (payload) => apiPut('/biometric/auto-sync/config', payload),
    onSuccess: () => {
      toast('Schedule saved and applied immediately.', 'success');
      setDirty(false);
      qc.invalidateQueries(['biometric-auto-sync-config']);
    },
    onError: (err) => toast(err.message, 'error'),
  });

  // ── Manual trigger ────────────────────────────────────────────────────────────
  const triggerMut = useMutation({
    mutationFn: () => apiPost('/biometric/auto-sync/trigger', {}),
    onSuccess: () => {
      toast('Sync triggered — devices will upload on next heartbeat (~30–60 s).', 'success');
      setTimeout(() => {
        qc.invalidateQueries(['biometric-auto-sync-config']);
        qc.invalidateQueries(['biometric-auto-sync-history']);
      }, 5000);
    },
    onError: (err) => toast(err.message, 'error'),
  });

  function setField(key, val) {
    setForm(f => ({ ...f, [key]: val }));
    setDirty(true);
  }

  const loading = admsLoading || cfgLoading;

  // Latest auto-sync run (most recent job from history)
  const latestJob = history[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title">Biometric Settings</h1>
        <p className="page-subtitle">ZKTeco ADMS configuration and automatic biometric sync schedule</p>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" />Loading…</div>
      ) : (
        <div className="space-y-5 max-w-2xl">

          {/* ── ADMS Server URL ── */}
          <div className="bg-white rounded-2xl border border-[#c7c4d8] shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#e7eefe] bg-[#f8f9fe]">
              <div className="flex items-center gap-2">
                <Server size={16} className="text-[#3525cd]" />
                <h2 className="font-black text-[#151c27] text-sm">ADMS Server Configuration</h2>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="text-[0.68rem] font-black text-[#777587] uppercase tracking-wider mb-2 block">
                  ADMS Server URL
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 font-mono text-sm bg-[#f0f3ff] border border-[#c7c4d8] rounded-xl px-4 py-3 text-[#151c27] select-all break-all">
                    {serverUrl}
                  </div>
                  <button onClick={copyUrl}
                    className="flex items-center gap-1.5 border border-[#c7c4d8] bg-white hover:bg-[#f0f3ff] text-[#464555] text-xs font-bold px-3 py-3 rounded-xl transition-colors flex-shrink-0">
                    <Copy size={13} />Copy
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#f0f3ff] border border-[#c7c4d8]">
                <div className="flex items-start gap-2">
                  <Info size={14} className="text-[#3525cd] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-[#3525cd] mb-1">How to configure your ZKTeco device</p>
                    <ol className="text-xs text-[#464555] space-y-1 list-decimal list-inside">
                      <li>Open the device's web interface or use the ZKTeco configuration tool</li>
                      <li>Navigate to <strong>ADMS</strong> or <strong>Cloud Server Settings</strong></li>
                      <li>Set the <strong>Server Address</strong> to the URL shown above</li>
                      <li>Set <strong>HTTPS</strong> based on whether the URL uses <code className="bg-white px-1 rounded">https://</code></li>
                      <li>Save settings — the device will begin pushing punch data automatically</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs text-[#777587] px-1">
            <Info size={12} className="mt-0.5 flex-shrink-0" />
            <span>
              ADMS URL is managed via environment variables (<code className="bg-[#f0f3ff] px-1 rounded">ADMS_URL</code>).
              Contact your system administrator to update it.
            </span>
          </div>

          {/* ── Automatic Sync Schedule ── */}
          {form && (
            <div className="bg-white rounded-2xl border border-[#c7c4d8] shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-[#e7eefe] bg-[#f8f9fe]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RefreshCw size={16} className="text-[#3525cd]" />
                    <h2 className="font-black text-[#151c27] text-sm">Automatic Sync Schedule</h2>
                  </div>
                  <button
                    onClick={() => setField('enabled', !form.enabled)}
                    className="flex items-center gap-1.5 text-xs font-bold transition-colors"
                  >
                    {form.enabled
                      ? <><ToggleRight size={22} className="text-green-500" /><span className="text-green-700">Enabled</span></>
                      : <><ToggleLeft  size={22} className="text-gray-400"  /><span className="text-gray-500">Disabled</span></>
                    }
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">

                {/* Current status */}
                {syncCfg && (
                  <div className="rounded-xl bg-[#f8f9fe] border border-[#e7eefe] p-4">
                    <p className="text-[0.68rem] font-black text-[#777587] uppercase tracking-wider mb-3">
                      Last Sync Result
                    </p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                      <span className="text-[#777587]">Status</span>
                      <span><StatusBadge status={syncCfg.last_sync_status || 'never'} /></span>

                      <span className="text-[#777587]">Schedule</span>
                      <span className="font-semibold text-[#151c27] capitalize">
                        {syncCfg.frequency === 'day' ? 'Daily' : syncCfg.frequency === 'week' ? 'Weekly' : 'Monthly'}
                        {' — '}{syncCfg.sync_time_1}
                        {syncCfg.sync_time_2 ? `, ${syncCfg.sync_time_2}` : ''}
                      </span>

                      {syncCfg.last_sync_at && <>
                        <span className="text-[#777587]">Last Triggered</span>
                        <span className="font-semibold text-[#151c27]">{fmtTs(syncCfg.last_sync_at)}</span>
                      </>}

                      {latestJob && <>
                        <span className="text-[#777587]">Records Received</span>
                        <span className="font-semibold text-[#151c27]">{latestJob.records_received ?? '—'}</span>
                        <span className="text-[#777587]">New Records</span>
                        <span className="font-semibold text-green-700">{latestJob.records_inserted ?? '—'}</span>
                        <span className="text-[#777587]">Already Existing</span>
                        <span className="font-semibold text-[#777587]">{latestJob.records_duplicate ?? '—'}</span>
                      </>}

                      {syncCfg.last_sync_error && <>
                        <span className="text-[#777587]">Error</span>
                        <span className="text-red-600 font-mono text-[0.63rem] break-all">{syncCfg.last_sync_error}</span>
                      </>}
                    </div>
                  </div>
                )}

                {/* Frequency */}
                <div>
                  <label className="text-[0.68rem] font-black text-[#777587] uppercase tracking-wider mb-2 block">
                    Frequency
                  </label>
                  <div className="flex gap-2">
                    {[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']].map(([val, label]) => (
                      <button key={val}
                        onClick={() => setField('frequency', val)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors
                          ${form.frequency === val
                            ? 'bg-[#3525cd] text-white border-[#3525cd]'
                            : 'bg-white text-[#464555] border-[#c7c4d8] hover:bg-[#f0f3ff]'
                          }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Times */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[0.68rem] font-black text-[#777587] uppercase tracking-wider mb-1.5 block">
                      Sync Time 1
                    </label>
                    <input
                      type="time"
                      value={form.sync_time_1}
                      onChange={e => setField('sync_time_1', e.target.value)}
                      className="w-full border border-[#c7c4d8] rounded-xl px-3 py-2.5 text-sm text-[#151c27] bg-white focus:outline-none focus:border-[#3525cd]"
                    />
                  </div>
                  {form.frequency === 'day' && (
                    <div>
                      <label className="text-[0.68rem] font-black text-[#777587] uppercase tracking-wider mb-1.5 block">
                        Sync Time 2 <span className="normal-case font-normal text-[#aaa]">(optional)</span>
                      </label>
                      <input
                        type="time"
                        value={form.sync_time_2 || ''}
                        onChange={e => setField('sync_time_2', e.target.value)}
                        className="w-full border border-[#c7c4d8] rounded-xl px-3 py-2.5 text-sm text-[#151c27] bg-white focus:outline-none focus:border-[#3525cd]"
                      />
                    </div>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-[#f0f3ff] border border-[#c7c4d8]">
                  <div className="flex items-start gap-2">
                    <Info size={13} className="text-[#3525cd] mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-[#464555]">
                      {form.frequency === 'day' && 'Runs at the configured time(s) every day — syncs yesterday + today\'s records.'}
                      {form.frequency === 'week' && 'Runs every Sunday at the configured time — syncs the full week (Monday → Sunday).'}
                      {form.frequency === 'month' && 'Runs on the 1st of each month — syncs the entire previous month\'s records.'}
                      {' '}The device uploads automatically via ADMS — no manual steps required. Times are in IST.
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2 border-t border-[#e7eefe]">
                  <button
                    onClick={() => saveMut.mutate(form)}
                    disabled={saveMut.isLoading || !dirty}
                    className="flex items-center gap-2 bg-[#3525cd] hover:bg-[#2a1db5] text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50"
                  >
                    {saveMut.isLoading
                      ? <><RefreshCw size={13} className="animate-spin" />Saving…</>
                      : 'Save Schedule'
                    }
                  </button>

                  <button
                    onClick={() => triggerMut.mutate()}
                    disabled={triggerMut.isLoading}
                    className="flex items-center gap-2 border border-[#c7c4d8] bg-white hover:bg-[#f0f3ff] text-[#464555] text-xs font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
                    title="Run sync immediately without waiting for schedule"
                  >
                    <Play size={12} />
                    {triggerMut.isLoading ? 'Triggering…' : 'Run Now'}
                  </button>

                  <button
                    onClick={() => { refetchHistory(); qc.invalidateQueries(['biometric-auto-sync-config']); }}
                    className="ml-auto flex items-center gap-1.5 text-xs text-[#777587] hover:text-[#3525cd] font-semibold transition-colors"
                  >
                    <RefreshCw size={12} />Refresh
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Sync History ── */}
          {(history.length > 0 || histLoading) && (
            <div className="bg-white rounded-2xl border border-[#c7c4d8] shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-[#e7eefe] bg-[#f8f9fe]">
                <div className="flex items-center gap-2">
                  <Clock size={15} className="text-[#3525cd]" />
                  <h2 className="font-black text-[#151c27] text-sm">Sync History</h2>
                  {history.length > 0 && (
                    <span className="text-xs text-[#777587]">— last {history.length} runs</span>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#e7eefe] bg-[#f8f9fe]">
                      {['Date / Time (IST)', 'Device', 'Range', 'Received', 'New', 'Existing', 'Duration', 'Status'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-[0.65rem] font-black text-[#777587] uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0f3ff]">
                    {histLoading
                      ? <tr><td colSpan={8} className="px-4 py-4 text-center text-[#777587]">Loading…</td></tr>
                      : history.map(row => (
                        <tr key={row.id} className="hover:bg-[#f8f9fe] transition-colors">
                          <td className="px-4 py-2.5 font-mono text-[#464555] whitespace-nowrap">{fmtTs(row.created_at)}</td>
                          <td className="px-4 py-2.5 text-[#464555]">{row.device_name || row.serial_number || '—'}</td>
                          <td className="px-4 py-2.5 text-[#777587] whitespace-nowrap font-mono text-[0.65rem]">
                            {row.from_date?.slice(0,10)} → {row.to_date?.slice(0,10)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-[#464555]">{row.records_received ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-green-700">{row.records_inserted ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right text-[#777587]">{row.records_duplicate ?? '—'}</td>
                          <td className="px-4 py-2.5 text-[#777587] whitespace-nowrap">
                            {fmtDuration(row.created_at, row.completed_at) || (row.status === 'running' ? '…' : '—')}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col gap-0.5">
                              <StatusBadge status={row.status} />
                              {row.error && (
                                <span className="text-[0.6rem] text-red-500 font-mono max-w-[140px] truncate" title={row.error}>
                                  {row.error}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
