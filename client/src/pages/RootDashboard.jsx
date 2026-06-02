import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, UserCheck, ClipboardList, ShieldCheck, Plus, CalendarDays } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/context/AuthContext';

const LEAVE_TYPE_COLORS = {
  annual:    'bg-[#f0f3ff] text-[#3525cd] border-[#c7c4d8]',
  sick:      'bg-rose-50 text-rose-700 border-rose-200',
  casual:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  emergency: 'bg-amber-50 text-amber-700 border-amber-200',
  other:     'bg-[#f0f3ff] text-[#464555] border-[#c7c4d8]',
};
const STATUS_COLORS = {
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function RootDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['root-stats'],
    queryFn:  () => apiGet('/root/stats'),
    refetchInterval: 60000,
  });

  const { data: yearlyData } = useQuery({
    queryKey: ['root-yearly-leaves', new Date().getFullYear()],
    queryFn:  () => apiGet('/root/yearly-leaves'),
    refetchInterval: 300000,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><div className="spinner w-8 h-8" /></div>;
  }

  const { totalEmployees = 0, totalHR = 0, pendingLeaves = 0, presentToday = 0, recentLeaves = [], hrAdmins = [] } = data || {};
  const yearlyEmployees = [...(yearlyData?.employees || [])].sort((a, b) => b.usedDays - a.usedDays);

  const stats = [
    { label: 'Total Employees', value: totalEmployees, icon: <Users size={20} />,        bg: 'bg-[#f0f3ff]', text: 'text-[#3525cd]',     onClick: () => navigate('/root/employees') },
    { label: 'HR Admins',       value: totalHR,        icon: <ShieldCheck size={20} />,  bg: 'bg-purple-50', text: 'text-purple-600',    onClick: () => navigate('/root/employees') },
    { label: 'Pending Leaves',  value: pendingLeaves,  icon: <ClipboardList size={20} />, bg: 'bg-amber-50', text: 'text-amber-600',     onClick: () => navigate('/root/leaves') },
    { label: 'Present Today',   value: presentToday,   icon: <UserCheck size={20} />,    bg: 'bg-emerald-50', text: 'text-emerald-600',  onClick: () => navigate('/root/employees') },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-2xl p-6 relative overflow-hidden shadow-sm"
        style={{ background: 'linear-gradient(135deg, #3525cd 0%, #4f46e5 50%, #712ae2 100%)' }}>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={16} className="text-white/70" />
          <span className="text-white/70 text-xs font-bold uppercase tracking-widest">Root Console</span>
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">Good day, {user?.name?.split(' ')[0]}!</h1>
        <p className="text-white/75 text-sm mt-1">Full system control & oversight of all HR operations.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div
            key={s.label}
            onClick={s.onClick}
            className={`bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5 flex items-center gap-4 transition-all duration-200 ${s.onClick ? 'cursor-pointer hover:shadow-md hover:border-[#3525cd]/40 hover:-translate-y-0.5' : ''}`}
          >
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${s.bg} ${s.text}`}>
              {s.icon}
            </div>
            <div>
              <p className="text-2xl font-black text-[#151c27] leading-tight">{s.value}</p>
              <p className="text-xs text-[#777587] mt-0.5 font-medium">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* HR Admins */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e7eefe]">
            <h2 className="text-sm font-black text-[#151c27] uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck size={15} className="text-[#3525cd]" /> HR Admins ({totalHR})
            </h2>
            <button onClick={() => navigate('/root/employees')}
              className="flex items-center gap-1.5 text-xs font-bold text-[#3525cd] hover:text-[#4f46e5] transition-colors px-3 py-1.5 rounded-lg hover:bg-[#f0f3ff]">
              <Plus size={13} /> Add HR
            </button>
          </div>
          <div className="divide-y divide-[#f0f3ff]">
            {hrAdmins.length === 0 ? (
              <div className="py-12 text-center text-[#777587] text-sm">No HR admins yet</div>
            ) : hrAdmins.map(hr => (
              <div key={hr.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#f9f9ff] transition-colors">
                <Avatar name={hr.name} color={hr.avatar_color} size={38} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#151c27] truncate">{hr.name}</p>
                  <p className="text-xs text-[#777587] truncate">{hr.email}</p>
                </div>
                <span className="text-xs text-[#464555] bg-[#f0f3ff] border border-[#c7c4d8] px-2 py-0.5 rounded-full flex-shrink-0">
                  {hr.department}
                </span>
              </div>
            ))}
          </div>
          {hrAdmins.length > 0 && (
            <div className="px-5 py-3 border-t border-[#e7eefe]">
              <button onClick={() => navigate('/root/employees')}
                className="text-xs text-[#3525cd] hover:text-[#4f46e5] font-semibold transition-colors">
                Manage all users →
              </button>
            </div>
          )}
        </div>

        {/* Recent Leaves */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e7eefe]">
            <h2 className="text-sm font-black text-[#151c27] uppercase tracking-wider flex items-center gap-2">
              <ClipboardList size={15} className="text-amber-500" /> Recent Leaves
            </h2>
            <button onClick={() => navigate('/root/leaves')}
              className="text-xs font-bold text-[#3525cd] hover:text-[#4f46e5] transition-colors px-3 py-1.5 rounded-lg hover:bg-[#f0f3ff]">
              View all →
            </button>
          </div>
          <div className="divide-y divide-[#f0f3ff]">
            {recentLeaves.length === 0 ? (
              <div className="py-12 text-center text-[#777587] text-sm">No leave requests yet</div>
            ) : recentLeaves.map(l => (
              <div key={l.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#f9f9ff] transition-colors">
                <Avatar name={l.name} color={l.avatar_color} size={34} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#151c27] truncate">{l.name}</p>
                  <p className="text-xs text-[#777587]">{l.start_date} → {l.end_date}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-[0.65rem] px-2 py-0.5 rounded-full border font-bold capitalize ${LEAVE_TYPE_COLORS[l.leave_type] || LEAVE_TYPE_COLORS.other}`}>
                    {l.leave_type}
                  </span>
                  <span className={`text-[0.65rem] px-2 py-0.5 rounded-full border font-bold ${STATUS_COLORS[l.status] || ''}`}>
                    {l.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Yearly Leave Overview */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e7eefe] flex items-center gap-2">
          <CalendarDays size={15} className="text-[#3525cd]" />
          <h2 className="text-sm font-black text-[#151c27] uppercase tracking-wider">
            Yearly Leave Overview — {yearlyData?.year || new Date().getFullYear()}
          </h2>
          <span className="ml-auto text-xs text-[#777587]">{yearlyData?.totalLeaves || 18} days allocated per employee</span>
        </div>

        {yearlyEmployees.length === 0 ? (
          <div className="py-10 text-center text-[#777587] text-sm">No employees found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f9f9ff]">
                  <th className="px-5 py-3 text-left text-xs font-bold text-[#777587] uppercase tracking-wider">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-[#777587] uppercase tracking-wider hidden sm:table-cell">Department</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-[#777587] uppercase tracking-wider">Used</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-[#777587] uppercase tracking-wider">Remaining</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-[#777587] uppercase tracking-wider w-44 hidden md:table-cell">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f3ff]">
                {yearlyEmployees.map(emp => {
                  const pct = Math.min(100, Math.round((emp.usedDays / emp.totalDays) * 100));
                  const barColor = pct >= 90 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-400' : 'bg-emerald-500';
                  const remColor = emp.remainingDays <= 3 ? 'text-rose-600' : emp.remainingDays <= 7 ? 'text-amber-600' : 'text-emerald-600';
                  return (
                    <tr key={emp.id} className="hover:bg-[#f9f9ff] transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={emp.name} color={emp.avatar_color} size={32} />
                          <div>
                            <div className="font-bold text-[#151c27] text-sm leading-tight">{emp.name}</div>
                            {emp.position && <div className="text-xs text-[#777587]">{emp.position}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#464555] hidden sm:table-cell">{emp.department || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-black text-[#151c27]">{emp.usedDays}</span>
                        <span className="text-xs text-[#777587]"> / {emp.totalDays}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-sm font-black ${remColor}`}>{emp.remainingDays}</span>
                      </td>
                      <td className="px-5 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-[#e7eefe] rounded-full h-2 overflow-hidden">
                            <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-[#777587] w-8 text-right shrink-0">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
