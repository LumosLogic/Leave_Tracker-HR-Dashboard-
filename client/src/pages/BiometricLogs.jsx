import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ScrollText, ChevronLeft, ChevronRight, Filter, Upload, X, CheckCircle, AlertCircle } from 'lucide-react';
import { apiGet, apiUpload } from '@/lib/api';

const PAGE_SIZE = 20;

const PUNCH_TYPE_CFG = {
  0: { label: 'Check-In',  cls: 'bg-green-50 text-green-700 border-green-200' },
  1: { label: 'Check-Out', cls: 'bg-blue-50 text-blue-700 border-blue-200'   },
  4: { label: 'OT-In',     cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  5: { label: 'OT-Out',    cls: 'bg-purple-50 text-purple-700 border-purple-200' },
};

function PunchTypeBadge({ type }) {
  const cfg = PUNCH_TYPE_CFG[type] ?? { label: `Type ${type}`, cls: 'bg-slate-50 text-slate-600 border-slate-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function ProcessedBadge({ processed }) {
  return processed ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
      Yes
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      No
    </span>
  );
}

function fmtDateOnly(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function fmtTimeOnly(str) {
  if (!str) return '—';
  return new Date(str).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

const getToday = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

export default function BiometricLogs() {
  const [searchParams] = useSearchParams();
  const initDevice = searchParams.get('device') || '';
  const queryClient = useQueryClient();

  const [dateFrom,   setDateFrom]   = useState(getToday());
  const [dateTo,     setDateTo]     = useState(getToday());
  const [device,     setDevice]     = useState(initDevice);
  const [pin,        setPin]        = useState('');
  const [page,       setPage]       = useState(1);

  // ── Import modal state ─────────────────────────────────────────────────────
  const [showImport,    setShowImport]    = useState(false);
  const [importFile,    setImportFile]    = useState(null);
  const [importing,     setImporting]     = useState(false);
  const [importResult,  setImportResult]  = useState(null);
  const [importError,   setImportError]   = useState('');
  const fileInputRef = useRef(null);

  function openImport() {
    setShowImport(true);
    setImportFile(null);
    setImportResult(null);
    setImportError('');
  }
  function closeImport() {
    if (importing) return;
    setShowImport(false);
  }

  async function handleImport() {
    if (!importFile) return;
    setImporting(true);
    setImportError('');
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      const result = await apiUpload('/biometric/import-easywdms', fd);
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ['biometric-logs'] });
    } catch (err) {
      setImportError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  const params = {
    page,
    limit: PAGE_SIZE,
    ...(dateFrom  ? { date_from: dateFrom }        : {}),
    ...(dateTo    ? { date_to: dateTo }            : {}),
    ...(device    ? { device_serial: device }      : {}),
    ...(pin       ? { employee_pin: pin }          : {}),
  };

  const { data: _res, isLoading } = useQuery({
    queryKey: ['biometric-logs', params],
    queryFn:  () => apiGet('/biometric/logs', params),
    keepPreviousData: true,
  });

  const { data: _devices } = useQuery({
    queryKey: ['biometric-devices'],
    queryFn:  () => apiGet('/biometric/devices'),
  });

  const logs        = Array.isArray(_res?.data) ? _res.data : Array.isArray(_res?.logs) ? _res.logs : Array.isArray(_res) ? _res : [];
  const total       = _res?.total ?? logs.length;
  const totalPages  = Math.ceil(total / PAGE_SIZE);
  const devices     = Array.isArray(_devices) ? _devices : [];

  function resetFilters() {
    setDateFrom(getToday()); setDateTo(getToday()); setDevice(initDevice); setPin(''); setPage(1);
  }

  const hasFilter = dateFrom || dateTo || (device && device !== initDevice) || pin;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Punch Logs</h1>
          <p className="page-subtitle">Raw biometric punch records from all devices</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openImport}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#3525cd] text-white text-sm font-bold hover:bg-[#2a1eb0] transition-colors shadow-sm"
          >
            <Upload size={15} />
            Import EasyWDMS Data
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-[#c7c4d8] shadow-sm px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-[#777587]" />
          <span className="text-xs font-black text-[#464555] uppercase tracking-wider">Filters</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[0.65rem] font-black text-[#777587] uppercase tracking-wider">From</label>
            <input type="date" className="form-control text-xs py-1.5"
              value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[0.65rem] font-black text-[#777587] uppercase tracking-wider">To</label>
            <input type="date" className="form-control text-xs py-1.5"
              value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} />
          </div>
          <div className="flex flex-col gap-1 border-l border-[#e7eefe] pl-3 ml-1 mr-1">
            <label className="text-[0.65rem] font-black text-[#3525cd] uppercase tracking-wider">Quick Month</label>
            <input type="month" className="form-control text-xs py-1.5 w-32 cursor-pointer"
              onChange={e => {
                if (!e.target.value) return;
                const [y, m] = e.target.value.split('-');
                setDateFrom(`${y}-${m}-01`);
                const lastDay = new Date(y, m, 0);
                const dd = String(lastDay.getDate()).padStart(2, '0');
                setDateTo(`${y}-${m}-${dd}`);
                setPage(1);
              }} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[0.65rem] font-black text-[#777587] uppercase tracking-wider">Device</label>
            <select className="form-control text-xs py-1.5 min-w-[160px]"
              value={device} onChange={e => { setDevice(e.target.value); setPage(1); }}>
              <option value="">All Devices</option>
              {devices.map(d => (
                <option key={d.id} value={d.serial_number}>{d.device_name} ({d.serial_number})</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[0.65rem] font-black text-[#777587] uppercase tracking-wider">PIN</label>
            <input type="text" className="form-control font-mono text-xs py-1.5 w-24"
              placeholder="e.g. 1001" value={pin} onChange={e => { setPin(e.target.value); setPage(1); }} />
          </div>
          {hasFilter && (
            <div className="flex items-end">
              <button onClick={resetFilters}
                className="text-xs font-bold text-rose-500 hover:text-rose-600 px-3 py-1.5 rounded-lg hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-all">
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="loading"><div className="spinner" />Loading logs…</div>
      ) : logs.length === 0 ? (
        <div className="empty-state">
          <ScrollText size={48} className="mx-auto mb-3 text-[#c7c4d8]" />
          <p className="font-semibold text-[#464555] mb-1">No punch logs found</p>
          <p className="text-sm">Try adjusting your filters or check if devices are sending data</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-[#c7c4d8] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#f8f9fe] border-b border-[#e7eefe]">
                  <tr>
                    <th className="px-5 py-3.5 text-left text-xs font-black text-[#464555] uppercase tracking-wider whitespace-nowrap">Date</th>
                    <th className="px-5 py-3.5 text-left text-xs font-black text-[#464555] uppercase tracking-wider whitespace-nowrap">Time</th>
                    <th className="px-5 py-3.5 text-left text-xs font-black text-[#464555] uppercase tracking-wider">PIN</th>
                    <th className="px-5 py-3.5 text-left text-xs font-black text-[#464555] uppercase tracking-wider whitespace-nowrap">Employee Name</th>
                    {/* Device hidden from UI, Verify Type removed */}
                    <th className="px-5 py-3.5 text-left text-xs font-black text-[#464555] uppercase tracking-wider whitespace-nowrap">Punch Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f3ff]">
                  {logs.map((log, idx) => (
                    <tr key={log.id ?? idx} className="hover:bg-[#f9f9ff] transition-colors">
                      <td className="px-5 py-3 text-xs text-[#464555] whitespace-nowrap font-mono">
                        {fmtDateOnly(log.punch_time || log.timestamp)}
                      </td>
                      <td className="px-5 py-3 text-xs text-[#464555] whitespace-nowrap font-mono">
                        {fmtTimeOnly(log.punch_time || log.timestamp)}
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs font-bold bg-[#f0f3ff] text-[#3525cd] px-2 py-0.5 rounded">
                          {log.employee_pin || log.pin}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs font-semibold text-[#151c27]">
                        {log.employee_name || log.user?.name || <span className="text-[#c7c4d8] italic">Unmatched</span>}
                      </td>
                      {/* Device hidden from UI via exclusion of td */}
                      <td className="px-5 py-3">
                        <PunchTypeBadge type={log.punch_type ?? log.punch_state} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-white rounded-xl border border-[#c7c4d8] shadow-sm px-5 py-3">
              <span className="text-xs text-[#777587] font-semibold">
                Page {page} of {totalPages} · {total.toLocaleString()} total records
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1.5 rounded-lg hover:bg-[#f0f3ff] text-[#3525cd] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const p = totalPages <= 5 ? i + 1
                    : page <= 3 ? i + 1
                    : page >= totalPages - 2 ? totalPages - 4 + i
                    : page - 2 + i;
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${p === page ? 'bg-[#3525cd] text-white' : 'hover:bg-[#f0f3ff] text-[#464555]'}`}>
                      {p}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-1.5 rounded-lg hover:bg-[#f0f3ff] text-[#3525cd] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Import EasyWDMS Modal ─────────────────────────────────────────── */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e7eefe]">
              <div className="flex items-center gap-2">
                <Upload size={18} className="text-[#3525cd]" />
                <h2 className="text-base font-black text-[#151c27]">Import EasyWDMS Data</h2>
              </div>
              <button onClick={closeImport} disabled={importing}
                className="p-1.5 rounded-lg hover:bg-[#f0f3ff] text-[#777587] transition-colors disabled:opacity-40">
                <X size={16} />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              {!importResult ? (
                <>
                  <p className="text-xs text-[#777587] leading-relaxed">
                    Export the <strong className="text-[#464555]">Transaction Report</strong> from EasyWDMS
                    and upload it here. Supported formats: <code className="bg-[#f0f3ff] px-1 rounded text-[#3525cd]">.xlsx</code>,{' '}
                    <code className="bg-[#f0f3ff] px-1 rounded text-[#3525cd]">.xls</code>,{' '}
                    <code className="bg-[#f0f3ff] px-1 rounded text-[#3525cd]">.csv</code>,{' '}
                    <code className="bg-[#f0f3ff] px-1 rounded text-[#3525cd]">.tsv</code>,{' '}
                    <code className="bg-[#f0f3ff] px-1 rounded text-[#3525cd]">.txt</code>.
                    Duplicates are automatically skipped.
                  </p>

                  {/* File drop zone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
                      ${importFile ? 'border-[#3525cd] bg-[#f0f3ff]' : 'border-[#c7c4d8] hover:border-[#3525cd] hover:bg-[#fafafe]'}`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv,.tsv,.txt"
                      className="hidden"
                      onChange={e => {
                        setImportFile(e.target.files?.[0] || null);
                        setImportError('');
                      }}
                    />
                    {importFile ? (
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-[#3525cd]">{importFile.name}</p>
                        <p className="text-xs text-[#777587]">{(importFile.size / 1024).toFixed(1)} KB · Click to change</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Upload size={24} className="mx-auto text-[#c7c4d8]" />
                        <p className="text-sm font-semibold text-[#464555]">Click to select file</p>
                        <p className="text-xs text-[#777587]">EasyWDMS Transaction Report export</p>
                      </div>
                    )}
                  </div>

                  {importError && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      <span>{importError}</span>
                    </div>
                  )}
                </>
              ) : (
                /* Result view */
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle size={18} className="shrink-0" />
                    <span className="font-bold text-sm">Import completed</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Total rows',    value: importResult.total },
                      { label: 'Inserted',      value: importResult.inserted,    cls: 'text-green-700' },
                      { label: 'Skipped (dup)', value: importResult.skipped,     cls: 'text-amber-700' },
                      { label: 'Reprocessed',   value: importResult.reprocessed, cls: 'text-blue-700'  },
                    ].map(({ label, value, cls }) => (
                      <div key={label} className="bg-[#f8f9fe] rounded-xl px-4 py-3">
                        <p className="text-[0.65rem] font-black text-[#777587] uppercase tracking-wider">{label}</p>
                        <p className={`text-xl font-black mt-0.5 ${cls || 'text-[#151c27]'}`}>{value ?? '—'}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[0.65rem] text-[#777587]">
                    Batch ID: <span className="font-mono">{importResult.batch_id}</span>
                  </p>
                  {importResult.errors?.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
                      <p className="text-xs font-bold text-amber-700">Warnings ({importResult.errors.length})</p>
                      {importResult.errors.slice(0, 5).map((e, i) => (
                        <p key={i} className="text-xs text-amber-600 font-mono">{e}</p>
                      ))}
                      {importResult.errors.length > 5 && (
                        <p className="text-xs text-amber-500">…and {importResult.errors.length - 5} more</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#e7eefe]">
              {importResult ? (
                <button onClick={closeImport}
                  className="px-5 py-2 rounded-xl bg-[#3525cd] text-white text-sm font-bold hover:bg-[#2a1eb0] transition-colors">
                  Done
                </button>
              ) : (
                <>
                  <button onClick={closeImport} disabled={importing}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-[#464555] hover:bg-[#f0f3ff] border border-[#c7c4d8] transition-colors disabled:opacity-40">
                    Cancel
                  </button>
                  <button onClick={handleImport} disabled={!importFile || importing}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#3525cd] text-white text-sm font-bold hover:bg-[#2a1eb0] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {importing ? (
                      <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Importing…</>
                    ) : (
                      <><Upload size={14} /> Import</>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
