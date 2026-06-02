import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, ClipboardList, Users, CheckCircle2, ChevronRight, ShieldCheck } from 'lucide-react';
import { paGet } from '@/lib/platformApi';
import { usePlatformAuth } from '@/context/PlatformAuthContext';

function StatCard({ label, value, icon, iconBg, iconColor, onClick }) {
  return (
    <div onClick={onClick}
      className={`bg-white rounded-2xl border border-[#e7eefe] p-5 transition-all duration-150 ${onClick ? 'cursor-pointer hover:shadow-md hover:border-[#c7c4d8]' : ''}`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${iconBg}`}>
          <span className={iconColor}>{icon}</span>
        </div>
        {onClick && <ChevronRight size={16} className="text-[#c7c4d8] mt-0.5" />}
      </div>
      <div className="text-3xl font-black text-[#151c27] mb-1 tracking-tight">{value ?? '—'}</div>
      <div className="text-xs text-[#777587] font-semibold uppercase tracking-widest">{label}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending:  { cls: 'bg-amber-50 text-amber-700 border-amber-200',   label: 'Pending' },
    approved: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Approved' },
    rejected: { cls: 'bg-rose-50 text-rose-700 border-rose-200',      label: 'Rejected' },
    active:   { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Active' },
  };
  const s = map[status] || map.pending;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[0.68rem] font-bold border ${s.cls}`}>
      {s.label}
    </span>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PlatformDashboard() {
  const navigate = useNavigate();
  const { admin } = usePlatformAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['platform-stats'],
    queryFn: () => paGet('/stats'),
    refetchInterval: 60000,
  });

  const hr = new Date().getHours();
  const greeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-[#e7eefe] border-t-[#3525cd] rounded-full animate-spin" />
      </div>
    );
  }

  const { totalOrgs = 0, pendingRequests = 0, totalUsers = 0, approvedOrgs = 0, recentOrgs = [], recentRequests = [] } = data || {};

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-2xl p-6 relative overflow-hidden shadow-sm"
        style={{ background: 'linear-gradient(135deg, #3525cd 0%, #4f46e5 50%, #712ae2 100%)' }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="relative z-10 flex items-center gap-3 mb-2">
          <ShieldCheck size={16} className="text-white/70" />
          <span className="text-white/70 text-xs font-bold uppercase tracking-widest">Platform Admin Console</span>
        </div>
        <h1 className="relative z-10 text-2xl font-black text-white tracking-tight">
          {greeting}, {admin?.name?.split(' ')[0] || 'Admin'} 👋
        </h1>
        <p className="relative z-10 text-white/60 text-sm mt-1">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Orgs"       value={totalOrgs}       icon={<Building2 size={20} />}     iconBg="bg-[#f0f3ff]" iconColor="text-[#3525cd]"
          onClick={() => navigate('/orgs')} />
        <StatCard label="Pending Requests" value={pendingRequests} icon={<ClipboardList size={20} />} iconBg="bg-amber-50"   iconColor="text-amber-600"
          onClick={() => navigate('/requests')} />
        <StatCard label="Total Users"      value={totalUsers}      icon={<Users size={20} />}         iconBg="bg-emerald-50" iconColor="text-emerald-600" />
        <StatCard label="Approved Orgs"    value={approvedOrgs}    icon={<CheckCircle2 size={20} />}  iconBg="bg-purple-50"  iconColor="text-purple-600" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Recent Requests */}
        <div className="bg-white rounded-2xl border border-[#e7eefe] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f3ff]">
            <h2 className="text-sm font-black text-[#151c27]">Recent Requests</h2>
            <button onClick={() => navigate('/requests')}
              className="flex items-center gap-1 text-xs font-bold text-[#3525cd] hover:text-[#4f46e5] transition-colors">
              View all <ChevronRight size={12} />
            </button>
          </div>
          {recentRequests.length === 0
            ? <p className="px-5 py-8 text-sm text-[#777587] text-center">No requests yet</p>
            : recentRequests.map(r => (
              <div key={r.id} className="flex items-center justify-between px-5 py-3.5 border-b border-[#f0f3ff] last:border-0 hover:bg-[#f9f9ff] transition-colors">
                <div className="flex-1 min-w-0 mr-3">
                  <p className="text-sm font-bold text-[#151c27] truncate">{r.company_name}</p>
                  <p className="text-xs text-[#777587] truncate">{r.contact_name}</p>
                </div>
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <StatusBadge status={r.status} />
                  <span className="text-xs text-[#c7c4d8] whitespace-nowrap hidden sm:block">{fmtDate(r.created_at)}</span>
                </div>
              </div>
            ))
          }
        </div>

        {/* Recent Organizations */}
        <div className="bg-white rounded-2xl border border-[#e7eefe] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f3ff]">
            <h2 className="text-sm font-black text-[#151c27]">Organizations</h2>
            <button onClick={() => navigate('/orgs')}
              className="flex items-center gap-1 text-xs font-bold text-[#3525cd] hover:text-[#4f46e5] transition-colors">
              View all <ChevronRight size={12} />
            </button>
          </div>
          {recentOrgs.length === 0
            ? <p className="px-5 py-8 text-sm text-[#777587] text-center">No organizations yet</p>
            : recentOrgs.map(o => (
              <div key={o.id} className="flex items-center justify-between px-5 py-3.5 border-b border-[#f0f3ff] last:border-0 hover:bg-[#f9f9ff] transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0 mr-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-black text-white"
                    style={{ background: `hsl(${(o.id * 47) % 360}, 65%, 45%)` }}>
                    {o.name?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#151c27] truncate">{o.name}</p>
                    <code className="text-xs text-[#777587]">{o.slug}</code>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <StatusBadge status={o.status} />
                  <span className="text-xs text-[#c7c4d8] whitespace-nowrap hidden sm:block">{fmtDate(o.created_at)}</span>
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}
