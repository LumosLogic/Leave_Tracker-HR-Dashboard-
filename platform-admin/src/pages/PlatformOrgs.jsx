import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Building2, Users, Search, Calendar, ChevronRight, X,
  Mail, Briefcase, ClipboardList, Clock, Globe, AtSign, Settings,
} from 'lucide-react';
import { paGet } from '@/lib/platformApi';

function StatusBadge({ status }) {
  const map = {
    active:    { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    inactive:  { cls: 'bg-[#f0f3ff] text-[#464555] border-[#c7c4d8]' },
    suspended: { cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  };
  const s = map[status] || map.active;
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold capitalize border ${s.cls}`}>{status || 'active'}</span>
  );
}

function RoleBadge({ role }) {
  const map = {
    root_admin: { cls: 'bg-[#f0f3ff] text-[#3525cd] border-[#c7c4d8]',       label: 'Root Admin' },
    admin:      { cls: 'bg-amber-50 text-amber-700 border-amber-200',         label: 'HR Admin' },
    employee:   { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',   label: 'Employee' },
  };
  const s = map[role] || { cls: 'bg-[#f0f3ff] text-[#464555] border-[#c7c4d8]', label: role };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[0.65rem] font-bold border ${s.cls}`}>{s.label}</span>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function initials(name = '') {
  return name.split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '?';
}

function OrgDetailPanel({ orgId, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-org-members', orgId],
    queryFn: () => paGet(`/organizations/${orgId}/members`),
    enabled: !!orgId,
  });

  const { org, members = [], stats = {} } = data || {};

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-xl h-full overflow-y-auto border-l border-[#c7c4d8] flex flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-[#e7eefe] flex-shrink-0 bg-white sticky top-0 z-10">
          <div>
            {isLoading
              ? <div className="h-5 w-40 bg-[#f0f3ff] rounded animate-pulse mb-1.5" />
              : <h2 className="text-lg font-black text-[#151c27]">{org?.name}</h2>
            }
            {org && <code className="text-xs text-[#777587] font-mono">{org.slug}</code>}
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-[#777587] hover:text-[#151c27] hover:bg-[#f0f3ff] transition-colors mt-0.5">
            <X size={18} />
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center flex-1 py-20">
            <div className="w-7 h-7 border-2 border-[#e7eefe] border-t-[#3525cd] rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && org && (
          <div className="flex-1">
            {/* Stats row */}
            <div className="grid grid-cols-3 border-b border-[#e7eefe]">
              {[
                { label: 'Members',     value: members.length,          icon: <Users size={14} />,         cls: 'text-[#3525cd]', bg: 'bg-[#f0f3ff]' },
                { label: 'Leaves',      value: stats.leaveCount ?? 0,   icon: <ClipboardList size={14} />, cls: 'text-amber-600',  bg: 'bg-amber-50' },
                { label: 'Attendance',  value: stats.attendanceCount ?? 0, icon: <Clock size={14} />,      cls: 'text-emerald-600', bg: 'bg-emerald-50' },
              ].map(s => (
                <div key={s.label} className="px-4 py-4 text-center border-r border-[#e7eefe] last:border-0">
                  <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center mx-auto mb-2 ${s.cls}`}>{s.icon}</div>
                  <div className="text-xl font-black text-[#151c27]">{s.value}</div>
                  <div className="text-[0.62rem] text-[#777587] uppercase tracking-widest font-semibold mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Org config details */}
            <div className="px-6 py-4 border-b border-[#e7eefe]">
              <p className="text-[0.62rem] font-black text-[#777587] uppercase tracking-widest mb-3">Organization Details</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: <Settings size={13} />,   label: 'Plan',          value: org.plan || 'free' },
                  { icon: <Calendar size={13} />,   label: 'Created',       value: fmtDate(org.created_at) },
                  { icon: <ClipboardList size={13} />, label: 'Annual Leaves', value: org.total_annual_leaves ?? '—' },
                  ...(org.domain          ? [{ icon: <Globe size={13} />,   label: 'Domain',       value: org.domain }] : []),
                  ...(org.smtp_user       ? [{ icon: <AtSign size={13} />,  label: 'SMTP',         value: org.smtp_user }] : []),
                  ...(org.google_calendar_id ? [{ icon: <Calendar size={13} />, label: 'Google Cal', value: '✓ Connected' }] : []),
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl bg-[#f9f9ff] border border-[#e7eefe]">
                    <span className="text-[#777587] mt-0.5 flex-shrink-0">{item.icon}</span>
                    <div className="min-w-0">
                      <p className="text-[0.6rem] text-[#777587] uppercase tracking-widest font-bold">{item.label}</p>
                      <p className="text-xs text-[#151c27] font-semibold mt-0.5 truncate">{item.value}</p>
                    </div>
                  </div>
                ))}
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-[#f9f9ff] border border-[#e7eefe]">
                  <StatusBadge status={org.status} />
                </div>
              </div>
            </div>

            {/* Members */}
            <div className="px-6 py-4">
              <p className="text-[0.62rem] font-black text-[#777587] uppercase tracking-widest mb-3">
                Members ({members.length})
              </p>

              {members.length === 0 && (
                <p className="text-sm text-[#777587] py-6 text-center">No members yet</p>
              )}

              <div className="space-y-2">
                {members.map(m => (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border border-[#e7eefe] hover:border-[#c7c4d8] hover:bg-[#f9f9ff] transition-colors">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                      style={{ background: m.avatar_color || '#3525cd' }}>
                      {initials(m.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-bold text-[#151c27] truncate">{m.name}</span>
                        <RoleBadge role={m.role} />
                      </div>
                      <div className="flex items-center gap-1 text-xs text-[#777587] truncate">
                        <Mail size={11} className="flex-shrink-0" />
                        <span className="truncate">{m.email}</span>
                      </div>
                      {(m.department || m.position) && (
                        <div className="flex items-center gap-1 mt-0.5 text-[0.65rem] text-[#777587]">
                          <Briefcase size={10} className="flex-shrink-0" />
                          {[m.position, m.department].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[0.62rem] text-[#c7c4d8]">Joined</p>
                      <p className="text-[0.62rem] text-[#777587] font-semibold">{fmtDate(m.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlatformOrgs() {
  const [search, setSearch] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState(null);

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ['platform-orgs'],
    queryFn: () => paGet('/organizations'),
    refetchInterval: 60000,
  });

  const filtered = orgs.filter(o =>
    o.name?.toLowerCase().includes(search.toLowerCase()) ||
    o.slug?.toLowerCase().includes(search.toLowerCase()) ||
    (o.domain || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-[#151c27] tracking-tight">Organizations</h1>
            <p className="text-sm text-[#464555] mt-0.5">
              {isLoading ? 'Loading…' : `${orgs.length} organization${orgs.length !== 1 ? 's' : ''} · Click any row to view members`}
            </p>
          </div>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#777587]" />
          <input
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border border-[#c7c4d8] text-[#151c27] placeholder-[#777587] bg-white focus:outline-none focus:border-[#3525cd] focus:ring-2 focus:ring-[#3525cd]/20 transition-all"
            placeholder="Search by name, slug or domain…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#e7eefe] border-t-[#3525cd] rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-[#e7eefe]">
            <div className="w-14 h-14 rounded-2xl bg-[#f0f3ff] flex items-center justify-center mx-auto mb-3">
              <Building2 size={28} className="text-[#3525cd]/40" />
            </div>
            <p className="text-[#464555] font-bold">{search ? 'No results found' : 'No organizations yet'}</p>
            <p className="text-[#777587] text-sm mt-1">
              {search ? 'Try a different search term' : 'Approve a registration request to create one'}
            </p>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#e7eefe] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#f0f3ff]">
                    {['Organization', 'Slug', 'Plan', 'Status', 'Users', 'Created', ''].map(h => (
                      <th key={h} className={`px-5 py-3.5 text-[0.63rem] font-black text-[#777587] uppercase tracking-widest whitespace-nowrap bg-[#f9f9ff]
                        ${h === 'Users' || h === 'Created' ? 'text-right' : 'text-left'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(org => (
                    <tr key={org.id}
                      onClick={() => setSelectedOrgId(org.id)}
                      className="border-b border-[#f0f3ff] last:border-0 hover:bg-[#f9f9ff] transition-colors cursor-pointer group">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-black text-white"
                            style={{ background: `hsl(${(org.id * 47) % 360}, 65%, 45%)` }}>
                            {org.name?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-[#151c27]">{org.name}</p>
                            {org.domain && <p className="text-xs text-[#777587]">{org.domain}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <code className="text-xs font-mono text-[#464555] bg-[#f0f3ff] px-2 py-1 rounded-lg">{org.slug}</code>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs font-bold capitalize text-[#777587]">{org.plan || 'free'}</span>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={org.status} />
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Users size={12} className="text-[#c7c4d8]" />
                          <span className="text-sm font-bold text-[#151c27]">{org.userCount ?? 0}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Calendar size={12} className="text-[#c7c4d8]" />
                          <span className="text-xs text-[#777587] whitespace-nowrap">{fmtDate(org.created_at)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <ChevronRight size={15} className="text-[#c7c4d8] group-hover:text-[#3525cd] transition-colors" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {selectedOrgId && (
        <OrgDetailPanel orgId={selectedOrgId} onClose={() => setSelectedOrgId(null)} />
      )}
    </>
  );
}
