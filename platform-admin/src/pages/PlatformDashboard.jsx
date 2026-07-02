import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Building2, ClipboardList, Users, CheckCircle2, ChevronRight,
  ShieldCheck, TrendingUp, Activity, Crown,
} from 'lucide-react';
import { paGet } from '@/lib/platformApi';
import { usePlatformAuth } from '@/context/PlatformAuthContext';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }) {
  const map = {
    pending:  'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200',
    active:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[0.68rem] font-bold border capitalize ${map[status] || map.active}`}>
      {status}
    </span>
  );
}

// CSS-only mini bar chart
function MiniBarChart({ data, maxVal }) {
  const max = maxVal || Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex items-end gap-1.5 h-16">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-0">
          <div className="w-full rounded-t-md transition-all duration-500 relative group"
            style={{ height: `${Math.max(4, (d.count / max) * 52)}px`, background: d.count > 0 ? '#3525cd' : '#e7eefe' }}>
            {d.count > 0 && (
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[0.6rem] font-black text-[#3525cd] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {d.count}
              </div>
            )}
          </div>
          <span className="text-[0.55rem] text-[#777587] truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// Horizontal bar for plan/status distribution
function HBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#464555] capitalize">{label}</span>
        <span className="text-xs font-black text-[#151c27]">{count} <span className="font-normal text-[#777587]">({pct}%)</span></span>
      </div>
      <div className="h-2 bg-[#f0f3ff] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

const PLAN_COLORS = { free: '#777587', gold: '#f59e0b', platinum: '#3525cd', pro: '#10b981' };
const STATUS_COLORS = { active: '#10b981', inactive: '#c7c4d8', suspended: '#ef4444' };

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

  const {
    totalOrgs = 0, pendingRequests = 0, totalUsers = 0, approvedOrgs = 0,
    recentOrgs = [], recentRequests = [],
    planDistribution = {}, statusDistribution = {}, monthlyGrowth = [],
  } = data || {};

  const totalPlanOrgs = Object.values(planDistribution).reduce((a, b) => a + b, 0);

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
        {/* Quick summary strip */}
        <div className="relative z-10 flex flex-wrap gap-5 mt-5 pt-5 border-t border-white/20">
          {[
            { label: 'Total Orgs', value: totalOrgs },
            { label: 'Total Users', value: totalUsers },
            { label: 'Pending', value: pendingRequests },
            { label: 'Active Orgs', value: approvedOrgs },
          ].map(s => (
            <div key={s.label}>
              <div className="text-2xl font-black text-white">{s.value}</div>
              <div className="text-white/50 text-[0.68rem] font-semibold uppercase tracking-widest">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Stat cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Organizations', value: totalOrgs,       icon: <Building2 size={20} />,    iconBg: 'bg-[#f0f3ff]', iconCls: 'text-[#3525cd]',  onClick: () => navigate('/orgs') },
          { label: 'Pending Reviews', value: pendingRequests, icon: <ClipboardList size={20} />, iconBg: 'bg-amber-50',   iconCls: 'text-amber-600',  onClick: () => navigate('/requests') },
          { label: 'Total Members',  value: totalUsers,      icon: <Users size={20} />,         iconBg: 'bg-emerald-50', iconCls: 'text-emerald-600', onClick: null },
          { label: 'Approved Orgs',  value: approvedOrgs,    icon: <CheckCircle2 size={20} />,  iconBg: 'bg-purple-50',  iconCls: 'text-purple-600',  onClick: null },
        ].map(s => (
          <div key={s.label} onClick={s.onClick}
            className={`bg-white rounded-2xl border border-[#e7eefe] p-5 transition-all duration-150 ${s.onClick ? 'cursor-pointer hover:shadow-md hover:border-[#c7c4d8]' : ''}`}>
            <div className="flex items-start justify-between mb-4">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${s.iconBg}`}>
                <span className={s.iconCls}>{s.icon}</span>
              </div>
              {s.onClick && <ChevronRight size={16} className="text-[#c7c4d8] mt-0.5" />}
            </div>
            <div className="text-3xl font-black text-[#151c27] mb-1 tracking-tight">{s.value}</div>
            <div className="text-xs text-[#777587] font-semibold uppercase tracking-widest">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Org growth chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#e7eefe] p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-[#f0f3ff] flex items-center justify-center">
              <TrendingUp size={15} className="text-[#3525cd]" />
            </div>
            <div>
              <h3 className="text-sm font-black text-[#151c27]">Organization Growth</h3>
              <p className="text-[0.65rem] text-[#777587]">New orgs registered per month (last 6 months)</p>
            </div>
          </div>
          {monthlyGrowth.length > 0 ? (
            <MiniBarChart data={monthlyGrowth} />
          ) : (
            <div className="h-16 flex items-center justify-center text-xs text-[#777587]">No data yet</div>
          )}
        </div>

        {/* Plan distribution */}
        <div className="bg-white rounded-2xl border border-[#e7eefe] p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
              <Crown size={15} className="text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-black text-[#151c27]">Plan Distribution</h3>
              <p className="text-[0.65rem] text-[#777587]">Orgs by subscription plan</p>
            </div>
          </div>
          <div className="space-y-3">
            {Object.keys(planDistribution).length === 0 ? (
              <p className="text-xs text-[#777587] text-center py-4">No orgs yet</p>
            ) : (
              Object.entries(planDistribution).map(([plan, count]) => (
                <HBar key={plan} label={plan} count={count} total={totalPlanOrgs}
                  color={PLAN_COLORS[plan.toLowerCase()] || '#94a3b8'} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Status distribution + recent panels */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Org status breakdown */}
        <div className="bg-white rounded-2xl border border-[#e7eefe] p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Activity size={15} className="text-emerald-600" />
            </div>
            <h3 className="text-sm font-black text-[#151c27]">Org Status</h3>
          </div>
          <div className="space-y-3">
            {Object.keys(statusDistribution).length === 0 ? (
              <p className="text-xs text-[#777587] text-center py-4">No orgs yet</p>
            ) : (
              Object.entries(statusDistribution).map(([st, count]) => (
                <HBar key={st} label={st} count={count} total={totalOrgs}
                  color={STATUS_COLORS[st.toLowerCase()] || '#94a3b8'} />
              ))
            )}
          </div>
        </div>

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
              <div key={o.id} onClick={() => navigate(`/orgs/${o.id}`)}
                className="flex items-center justify-between px-5 py-3.5 border-b border-[#f0f3ff] last:border-0 hover:bg-[#f9f9ff] transition-colors cursor-pointer">
                <div className="flex items-center gap-3 flex-1 min-w-0 mr-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-black text-white"
                    style={{ background: `hsl(${(o.id * 47) % 360}, 65%, 45%)` }}>
                    {o.name?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#151c27] truncate">{o.name}</p>
                    <span className="text-[0.65rem] font-bold capitalize px-1.5 py-0.5 rounded-full border"
                      style={{ background: (PLAN_COLORS[(o.plan||'free').toLowerCase()] || '#777587') + '15', color: PLAN_COLORS[(o.plan||'free').toLowerCase()] || '#777587', borderColor: (PLAN_COLORS[(o.plan||'free').toLowerCase()] || '#777587') + '40' }}>
                      {o.plan || 'free'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <StatusBadge status={o.status} />
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}
