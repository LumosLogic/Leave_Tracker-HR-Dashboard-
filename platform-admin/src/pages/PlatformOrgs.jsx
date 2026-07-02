import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Building2, Users, Search, Calendar, ChevronRight } from 'lucide-react';
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

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PlatformOrgs() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

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
              {isLoading ? 'Loading…' : `${orgs.length} organization${orgs.length !== 1 ? 's' : ''} · Click any row to manage`}
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
                      onClick={() => navigate(`/orgs/${org.id}`)}
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

    </>
  );
}
