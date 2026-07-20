import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ScrollText, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { apiGet } from '@/lib/api';

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

function fmtDateTime(str) {
  if (!str) return '—';
  return new Date(str).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

export default function BiometricLogs() {
  const [searchParams] = useSearchParams();
  const initDevice = searchParams.get('device') || '';

  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [device,     setDevice]     = useState(initDevice);
  const [pin,        setPin]        = useState('');
  const [processed,  setProcessed]  = useState('');
  const [page,       setPage]       = useState(1);

  const params = {
    page,
    limit: PAGE_SIZE,
    ...(dateFrom  ? { date_from: dateFrom }        : {}),
    ...(dateTo    ? { date_to: dateTo }            : {}),
    ...(device    ? { device_serial: device }      : {}),
    ...(pin       ? { employee_pin: pin }          : {}),
    ...(processed !== '' ? { processed }           : {}),
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

  const logs        = Array.isArray(_res?.logs)   ? _res.logs   : Array.isArray(_res) ? _res : [];
  const total       = _res?.total ?? logs.length;
  const totalPages  = Math.ceil(total / PAGE_SIZE);
  const devices     = Array.isArray(_devices) ? _devices : [];

  function resetFilters() {
    setDateFrom(''); setDateTo(''); setDevice(initDevice); setPin(''); setProcessed(''); setPage(1);
  }

  const hasFilter = dateFrom || dateTo || (device && device !== initDevice) || pin || processed !== '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Punch Logs</h1>
          <p className="page-subtitle">Raw biometric punch records from all devices</p>
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
          <div className="flex flex-col gap-1">
            <label className="text-[0.65rem] font-black text-[#777587] uppercase tracking-wider">Processed</label>
            <select className="form-control text-xs py-1.5"
              value={processed} onChange={e => { setProcessed(e.target.value); setPage(1); }}>
              <option value="">All</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
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
                    <th className="px-5 py-3.5 text-left text-xs font-black text-[#464555] uppercase tracking-wider whitespace-nowrap">Time</th>
                    <th className="px-5 py-3.5 text-left text-xs font-black text-[#464555] uppercase tracking-wider">PIN</th>
                    <th className="px-5 py-3.5 text-left text-xs font-black text-[#464555] uppercase tracking-wider whitespace-nowrap">Employee Name</th>
                    <th className="px-5 py-3.5 text-left text-xs font-black text-[#464555] uppercase tracking-wider">Device</th>
                    <th className="px-5 py-3.5 text-left text-xs font-black text-[#464555] uppercase tracking-wider whitespace-nowrap">Punch Type</th>
                    <th className="px-5 py-3.5 text-left text-xs font-black text-[#464555] uppercase tracking-wider whitespace-nowrap">Verify Type</th>
                    <th className="px-5 py-3.5 text-left text-xs font-black text-[#464555] uppercase tracking-wider">Processed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f3ff]">
                  {logs.map((log, idx) => (
                    <tr key={log.id ?? idx} className="hover:bg-[#f9f9ff] transition-colors">
                      <td className="px-5 py-3 text-xs text-[#464555] whitespace-nowrap font-mono">
                        {fmtDateTime(log.punch_time || log.timestamp)}
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs font-bold bg-[#f0f3ff] text-[#3525cd] px-2 py-0.5 rounded">
                          {log.pin}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs font-semibold text-[#151c27]">
                        {log.employee_name || log.user?.name || <span className="text-[#c7c4d8] italic">Unmatched</span>}
                      </td>
                      <td className="px-5 py-3 text-xs text-[#464555]">
                        {log.device_name || log.serial_number || '—'}
                      </td>
                      <td className="px-5 py-3">
                        <PunchTypeBadge type={log.punch_type ?? log.punch_state} />
                      </td>
                      <td className="px-5 py-3 text-xs text-[#777587]">
                        {log.verify_type !== undefined ? log.verify_type : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <ProcessedBadge processed={log.processed || log.is_processed} />
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
    </div>
  );
}
