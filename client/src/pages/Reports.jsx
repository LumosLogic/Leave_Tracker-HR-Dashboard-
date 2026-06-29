import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, BarChart3, Users, FileText, CalendarDays, TrendingUp, ChevronDown } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { MONTHS } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';

function StatCard({ label, value, icon, color }) {
  return (
    <div className={`card p-5 border-t-4 ${color}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-2xl font-black text-[#151c27]">{value ?? '—'}</div>
          <div className="text-xs text-[#464555] mt-1">{label}</div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-[#f0f3ff] flex items-center justify-center text-[#3525cd]">{icon}</div>
      </div>
    </div>
  );
}

function DownloadModal({ open, onClose, active, onDownload }) {
  const now = new Date();
  const [type,  setType]  = useState('monthly');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  function handleDownload() {
    if (type === 'monthly') {
      onDownload({ year, month });
    } else {
      onDownload({ year });
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Export & Print Report" size="sm"
      footer={
        <div className="flex justify-end gap-2 flex-wrap">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-secondary" onClick={() => { window.print(); onClose(); }}>
            <FileText size={14} /> Print / Save PDF
          </button>
          <button className="btn btn-primary" onClick={handleDownload}>
            <Download size={14} /> Download CSV
          </button>
        </div>
      }>

      <div className="space-y-4">
        <div>
          <label className="form-label">Period Type</label>
          <div className="flex gap-2">
            {['monthly', 'yearly'].map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold border transition-all capitalize ${
                  type === t ? 'bg-[#3525cd] text-white border-[#3525cd]' : 'bg-white text-[#464555] border-[#c7c4d8] hover:border-[#3525cd]/50'
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {type === 'monthly' && (
          <div>
            <label className="form-label">Month</label>
            <select className="form-control" value={month} onChange={e => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="form-label">Year</label>
          <select className="form-control" value={year} onChange={e => setYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div className="text-xs text-[#777587] bg-[#f9f9ff] rounded-lg p-3 border border-[#f0f3ff]">
          {type === 'monthly'
            ? `Will download ${active} data for ${MONTHS[month - 1]} ${year}`
            : `Will download ${active} data for the full year ${year}`}
        </div>
      </div>
    </Modal>
  );
}

export default function Reports() {
  const now   = new Date();
  const [viewMode, setViewMode] = useState('monthly'); // 'monthly' | 'yearly'
  const [year,     setYear]     = useState(now.getFullYear());
  const [month,    setMonth]    = useState(now.getMonth() + 1);
  const [active,   setActive]   = useState('attendance');
  const [dlOpen,   setDlOpen]   = useState(false);

  const { data: headcount } = useQuery({
    queryKey: ['headcount'],
    queryFn: () => apiGet('/reports/headcount'),
  });

  const queryParams = viewMode === 'monthly' ? { year, month } : { year };

  const { data: _lvData,  isLoading: lvLoading  } = useQuery({
    queryKey: ['report-leaves', viewMode, year, month],
    queryFn:  () => apiGet('/reports/leaves', queryParams),
  });
  const { data: _attData, isLoading: attLoading } = useQuery({
    queryKey: ['report-attendance', viewMode, year, month],
    queryFn:  () => apiGet('/reports/attendance', queryParams),
  });
  const leaveRows = Array.isArray(_lvData)  ? _lvData  : [];
  const attRows   = Array.isArray(_attData) ? _attData : [];

  function getToken() { return localStorage.getItem('lt_token'); }

  async function handleDownload({ year: dlYear, month: dlMonth }) {
    const token = getToken();
    let endpoint, params, filename;

    if (active === 'attendance') {
      endpoint = '/reports/attendance';
      params   = dlMonth ? { year: dlYear, month: dlMonth } : { year: dlYear };
      filename = dlMonth
        ? `attendance_${MONTHS[dlMonth - 1]}_${dlYear}.csv`
        : `attendance_${dlYear}.csv`;
    } else if (active === 'leaves') {
      endpoint = '/reports/leaves';
      params   = dlMonth ? { year: dlYear, month: dlMonth } : { year: dlYear };
      filename = dlMonth
        ? `leaves_${MONTHS[dlMonth - 1]}_${dlYear}.csv`
        : `leaves_${dlYear}.csv`;
    } else {
      endpoint = '/reports/employees';
      params   = {};
      filename = 'employee_list.csv';
    }

    const q   = new URLSearchParams({ ...params, format: 'csv' }).toString();
    const res = await fetch(`/api${endpoint}?${q}`, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  const tabs = [
    { key: 'attendance', label: 'Attendance', icon: <CalendarDays size={14} /> },
    { key: 'leaves',     label: 'Leaves',     icon: <FileText size={14} /> },
    { key: 'employees',  label: 'Employees',  icon: <Users size={14} /> },
  ];

  const periodLabel = viewMode === 'monthly'
    ? `${MONTHS[month - 1]} ${year}`
    : `Year ${year}`;

  return (
    <div>
      <div className="page-header mb-6">
        <div>
          <div className="page-title">Reports & Analytics</div>
          <div className="page-subtitle">Export attendance, leave, and employee data</div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Employees"    value={headcount?.total}  icon={<Users size={18} />}        color="border-t-[#3525cd]" />
        <StatCard label="Active Employees"   value={headcount?.active} icon={<TrendingUp size={18} />}   color="border-t-emerald-500" />
        <StatCard label="Leave Records"      value={leaveRows.length}  icon={<FileText size={18} />}     color="border-t-amber-400" />
        <StatCard label="Attendance Records" value={attRows.length}    icon={<CalendarDays size={18} />} color="border-t-[#712ae2]" />
      </div>

      {/* Period picker */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {/* View mode toggle */}
        <div className="flex gap-1 bg-[#f0f3ff] p-1 rounded-xl border border-[#c7c4d8]">
          {['monthly', 'yearly'].map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg capitalize transition-colors ${
                viewMode === m ? 'bg-white text-[#3525cd] shadow-sm' : 'text-[#777587] hover:text-[#151c27]'
              }`}>
              {m}
            </button>
          ))}
        </div>

        {viewMode === 'monthly' && (
          <select className="form-control w-auto" value={month} onChange={e => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        )}

        <div className="flex items-center gap-2 bg-white border border-[#c7c4d8] rounded-lg px-3 py-2">
          <button onClick={() => setYear(y => y - 1)} className="text-[#3525cd] font-bold">‹</button>
          <span className="font-bold text-[#151c27] min-w-[3rem] text-center">{year}</span>
          <button onClick={() => setYear(y => Math.min(y + 1, now.getFullYear()))} className="text-[#3525cd] font-bold">›</button>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 bg-[#f0f3ff] border border-[#c7c4d8] p-1 rounded-xl mb-6">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActive(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all ${active === t.key ? 'bg-white text-[#3525cd] shadow-sm' : 'text-[#777587] hover:text-[#151c27]'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Download bar */}
      <div className="flex justify-end mb-4">
        <button className="btn btn-primary btn-sm" onClick={() => active === 'employees' ? handleDownload({ year }) : setDlOpen(true)}>
          <Download size={14} />
          {active === 'employees' ? 'Download CSV' : <><span>Download</span><ChevronDown size={12} /></>}
        </button>
      </div>

      {/* Attendance table */}
      {active === 'attendance' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f0f3ff] border-b border-[#c7c4d8]">
                <tr>{['Employee', 'Department', 'Date', 'Status', 'Check In', 'Check Out', 'Hours'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-black text-[#464555] whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-[#f0f3ff]">
                {attLoading ? (
                  <tr><td colSpan={7} className="text-center py-8 text-[#777587]"><div className="spinner mx-auto mb-2" />Loading…</td></tr>
                ) : attRows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-[#777587]">No records for {periodLabel}</td></tr>
                ) : attRows.slice(0, 100).map((r, i) => (
                  <tr key={i} className="hover:bg-[#f9f9ff] transition-colors">
                    <td className="px-4 py-3 font-semibold text-[#151c27]">{r.name}</td>
                    <td className="px-4 py-3 text-[#464555]">{r.department || '—'}</td>
                    <td className="px-4 py-3 text-[#464555]">{r.date}</td>
                    <td className="px-4 py-3"><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                    <td className="px-4 py-3 text-[#464555]">{r.check_in || '—'}</td>
                    <td className="px-4 py-3 text-[#464555]">{r.check_out || '—'}</td>
                    <td className="px-4 py-3 text-[#464555]">{r.work_hours > 0 ? `${r.work_hours}h` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {attRows.length > 100 && (
              <div className="px-4 py-3 text-xs text-[#777587] bg-[#f9f9ff] border-t border-[#f0f3ff]">
                Showing first 100 of {attRows.length} records. Download CSV for full data.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Leaves table */}
      {active === 'leaves' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f0f3ff] border-b border-[#c7c4d8]">
                <tr>{['Employee', 'Department', 'Type', 'From', 'To', 'Duration', 'Status', 'Approved By'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-black text-[#464555] whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-[#f0f3ff]">
                {lvLoading ? (
                  <tr><td colSpan={8} className="text-center py-8 text-[#777587]"><div className="spinner mx-auto mb-2" />Loading…</td></tr>
                ) : leaveRows.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-[#777587]">No leave records for {periodLabel}</td></tr>
                ) : leaveRows.slice(0, 100).map((r, i) => (
                  <tr key={i} className="hover:bg-[#f9f9ff] transition-colors">
                    <td className="px-4 py-3 font-semibold text-[#151c27]">{r.name}</td>
                    <td className="px-4 py-3 text-[#464555]">{r.department || '—'}</td>
                    <td className="px-4 py-3"><span className={`leave-badge leave-badge-${r.leave_type || 'default'}`}>{r.leave_type}</span></td>
                    <td className="px-4 py-3 text-[#464555]">{r.start_date}</td>
                    <td className="px-4 py-3 text-[#464555]">{r.end_date}</td>
                    <td className="px-4 py-3 text-[#464555] capitalize">{r.leave_time}</td>
                    <td className="px-4 py-3"><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                    <td className="px-4 py-3 text-[#464555]">{r.approved_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {leaveRows.length > 100 && (
              <div className="px-4 py-3 text-xs text-[#777587] bg-[#f9f9ff] border-t border-[#f0f3ff]">
                Showing first 100 of {leaveRows.length} records. Download CSV for full data.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Employees table */}
      {active === 'employees' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f0f3ff] border-b border-[#c7c4d8]">
                <tr>{['ID', 'Name', 'Email', 'Department', 'Position', 'Type', 'Status', 'Joining Date'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-black text-[#464555] whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-[#f0f3ff]">
                <tr><td colSpan={8} className="text-center py-8 text-[#777587] italic">Click "Download CSV" to export the full employee list.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {dlOpen && (
        <DownloadModal
          open={dlOpen}
          onClose={() => setDlOpen(false)}
          active={active}
          onDownload={handleDownload}
        />
      )}
    </div>
  );
}
