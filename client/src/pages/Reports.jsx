import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, BarChart3, Users, FileText, CalendarDays, TrendingUp } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { MONTHS } from '@/lib/utils';

function downloadCSV(url, filename) {
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
}

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

export default function Reports() {
  const now   = new Date();
  const [year,   setYear]   = useState(now.getFullYear());
  const [month,  setMonth]  = useState(now.getMonth() + 1);
  const [active, setActive] = useState('attendance');

  const { data: headcount } = useQuery({ queryKey: ['headcount'], queryFn: () => apiGet('/reports/headcount') });
  const { data: _lvData, isLoading: lvLoading } = useQuery({
    queryKey: ['report-leaves', year, month],
    queryFn: () => apiGet('/reports/leaves', { year, month }),
  });
  const { data: _attData, isLoading: attLoading } = useQuery({
    queryKey: ['report-attendance', year, month],
    queryFn: () => apiGet('/reports/attendance', { year, month }),
  });
  const leaveRows = Array.isArray(_lvData)  ? _lvData  : [];
  const attRows   = Array.isArray(_attData) ? _attData : [];

  function getToken() { return localStorage.getItem('lt_token'); }
  function buildDownloadUrl(path, params) {
    const q = new URLSearchParams({ ...params, format: 'csv' }).toString();
    return `/api${path}?${q}`;
  }

  const tabs = [
    { key: 'attendance', label: 'Attendance', icon: <CalendarDays size={14} /> },
    { key: 'leaves',     label: 'Leaves',     icon: <FileText size={14} /> },
    { key: 'employees',  label: 'Employees',  icon: <Users size={14} /> },
  ];

  async function handleDownload(endpoint, params, filename) {
    const token = getToken();
    const q = new URLSearchParams({ ...params, format: 'csv' }).toString();
    const res = await fetch(`/api${endpoint}?${q}`, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

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
        <StatCard label="Total Employees"    value={headcount?.total}             icon={<Users size={18} />}     color="border-t-[#3525cd]" />
        <StatCard label="Active Employees"   value={headcount?.active}            icon={<TrendingUp size={18} />} color="border-t-emerald-500" />
        <StatCard label="Leave Records"      value={leaveRows.length}             icon={<FileText size={18} />}   color="border-t-amber-400" />
        <StatCard label="Attendance Records" value={attRows.length}               icon={<CalendarDays size={18} />} color="border-t-[#712ae2]" />
      </div>

      {/* Period picker */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <select className="form-control w-auto" value={month} onChange={e => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <div className="flex items-center gap-2 bg-white border border-[#c7c4d8] rounded-lg px-3 py-2">
          <button onClick={() => setYear(y => y - 1)} className="text-[#3525cd] font-bold">‹</button>
          <span className="font-bold text-[#151c27] min-w-[3rem] text-center">{year}</span>
          <button onClick={() => setYear(y => y + 1)} className="text-[#3525cd] font-bold">›</button>
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
        {active === 'attendance' && (
          <button className="btn btn-primary btn-sm" onClick={() => handleDownload('/reports/attendance', { year, month }, `attendance_${MONTHS[month-1]}_${year}.csv`)}>
            <Download size={14} /> Download CSV
          </button>
        )}
        {active === 'leaves' && (
          <button className="btn btn-primary btn-sm" onClick={() => handleDownload('/reports/leaves', { year, month }, `leaves_${MONTHS[month-1]}_${year}.csv`)}>
            <Download size={14} /> Download CSV
          </button>
        )}
        {active === 'employees' && (
          <button className="btn btn-primary btn-sm" onClick={() => handleDownload('/reports/employees', {}, 'employee_list.csv')}>
            <Download size={14} /> Download CSV
          </button>
        )}
      </div>

      {/* Table */}
      {active === 'attendance' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f0f3ff] border-b border-[#c7c4d8]">
                <tr>{['Employee','Department','Date','Status','Check In','Check Out','Hours','Late','Early Exit'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-black text-[#464555] whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-[#f0f3ff]">
                {attLoading ? (
                  <tr><td colSpan={9} className="text-center py-8 text-[#777587]"><div className="spinner mx-auto mb-2" />Loading…</td></tr>
                ) : attRows.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-[#777587]">No records for {MONTHS[month-1]} {year}</td></tr>
                ) : attRows.slice(0, 100).map((r, i) => (
                  <tr key={i} className="hover:bg-[#f9f9ff] transition-colors">
                    <td className="px-4 py-3 font-semibold text-[#151c27]">{r.name}</td>
                    <td className="px-4 py-3 text-[#464555]">{r.department || '—'}</td>
                    <td className="px-4 py-3 text-[#464555]">{r.date}</td>
                    <td className="px-4 py-3"><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                    <td className="px-4 py-3 text-[#464555]">{r.check_in || '—'}</td>
                    <td className="px-4 py-3 text-[#464555]">{r.check_out || '—'}</td>
                    <td className="px-4 py-3 text-[#464555]">{r.work_hours > 0 ? `${r.work_hours}h` : '—'}</td>
                    <td className="px-4 py-3">{r.is_late === 'Yes' ? <span className="badge badge-late">Late</span> : '—'}</td>
                    <td className="px-4 py-3">{r.early_exit === 'Yes' ? <span className="badge badge-early_exit">Early</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {attRows.length > 100 && <div className="px-4 py-3 text-xs text-[#777587] bg-[#f9f9ff] border-t border-[#f0f3ff]">Showing first 100 of {attRows.length} records. Download CSV for full data.</div>}
          </div>
        </div>
      )}

      {active === 'leaves' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f0f3ff] border-b border-[#c7c4d8]">
                <tr>{['Employee','Department','Type','From','To','Duration','Status','Approved By'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-black text-[#464555] whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-[#f0f3ff]">
                {lvLoading ? (
                  <tr><td colSpan={8} className="text-center py-8 text-[#777587]"><div className="spinner mx-auto mb-2" />Loading…</td></tr>
                ) : leaveRows.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-[#777587]">No leave records for {MONTHS[month-1]} {year}</td></tr>
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
          </div>
        </div>
      )}

      {active === 'employees' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f0f3ff] border-b border-[#c7c4d8]">
                <tr>{['ID','Name','Email','Department','Position','Type','Status','Joining Date'].map(h => (
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
    </div>
  );
}
