import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Building2, Users, Search, Calendar, ChevronRight, Trash2, Lock, AlertTriangle, X } from 'lucide-react';
import { paGet, paDelete } from '@/lib/platformApi';

// Must match backend PROTECTED_ORG_SLUGS
const PROTECTED_SLUGS = ['lumoslogic', 'sanghavi-association'];

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

function DeleteOrgModal({ org, onConfirm, onCancel, isPending }) {
  const [typed, setTyped] = useState('');
  const confirmed = typed.trim() === org.name.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(21,28,39,.7)', backdropFilter: 'blur(12px)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md border border-[#e7eefe] shadow-[0_32px_80px_rgba(0,0,0,.22)] overflow-hidden">
        <div className="h-1 bg-rose-500 rounded-t-2xl" />
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center">
                <AlertTriangle size={18} className="text-rose-600" />
              </div>
              <div>
                <h2 className="text-base font-black text-[#151c27]">Delete Organization</h2>
                <p className="text-xs text-[#777587]">This action is permanent and cannot be undone.</p>
              </div>
            </div>
            <button onClick={onCancel} className="p-1.5 rounded-lg text-[#777587] hover:text-[#151c27] hover:bg-[#f0f3ff] transition">
              <X size={16} />
            </button>
          </div>

          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4 space-y-1.5">
            <p className="text-xs font-bold text-rose-700">The following will be permanently deleted:</p>
            <ul className="text-xs text-rose-600 space-y-0.5 list-disc list-inside">
              <li>All {org.userCount ?? 0} user accounts and profiles</li>
              <li>All attendance, leave, and regularization records</li>
              <li>All payroll, documents, and assets</li>
              <li>All biometric devices, punch logs, and mappings</li>
              <li>All organization settings and feature flags</li>
            </ul>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-bold text-[#151c27] mb-1.5">
              Type <span className="font-black text-rose-600">{org.name}</span> to confirm deletion:
            </label>
            <input
              type="text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder={org.name}
              className="w-full px-3 py-2.5 rounded-xl text-sm border border-[#c7c4d8] text-[#151c27] placeholder-[#aaa9b8]
                focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-400/20 transition-all"
              autoFocus
            />
          </div>

          <div className="flex gap-2">
            <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-[#464555] border border-[#c7c4d8] hover:bg-[#f0f3ff] transition-all">
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={!confirmed || isPending}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {isPending ? (
                <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Deleting…</>
              ) : (
                <><Trash2 size={12} />Delete permanently</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PlatformOrgs() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search,    setSearch]    = useState('');
  const [deleteOrg, setDeleteOrg] = useState(null); // org object to confirm

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ['platform-orgs'],
    queryFn: () => paGet('/organizations'),
    refetchInterval: 60000,
  });

  const deleteMut = useMutation({
    mutationFn: (id) => paDelete(`/organizations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-orgs'] });
      qc.invalidateQueries({ queryKey: ['platform-stats'] });
      setDeleteOrg(null);
    },
    onError: (err) => {
      alert(err.message || 'Delete failed');
    },
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
                    {['Organization', 'Slug', 'Plan', 'Status', 'Users', 'Created', '', ''].map((h, i) => (
                      <th key={i} className={`px-5 py-3.5 text-[0.63rem] font-black text-[#777587] uppercase tracking-widest whitespace-nowrap bg-[#f9f9ff]
                        ${h === 'Users' || h === 'Created' ? 'text-right' : 'text-left'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(org => {
                    const isProtected = PROTECTED_SLUGS.includes(org.slug);
                    return (
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
                        <td className="px-2 py-4">
                          {isProtected ? (
                            <div title="Protected — cannot be deleted"
                              className="w-7 h-7 rounded-lg bg-[#f0f3ff] flex items-center justify-center">
                              <Lock size={12} className="text-[#c7c4d8]" />
                            </div>
                          ) : (
                            <button
                              onClick={e => { e.stopPropagation(); setDeleteOrg(org); }}
                              title="Delete organization"
                              className="w-7 h-7 rounded-lg text-[#c7c4d8] hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <ChevronRight size={15} className="text-[#c7c4d8] group-hover:text-[#3525cd] transition-colors" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {deleteOrg && (
        <DeleteOrgModal
          org={deleteOrg}
          onConfirm={() => deleteMut.mutate(deleteOrg.id)}
          onCancel={() => setDeleteOrg(null)}
          isPending={deleteMut.isPending}
        />
      )}
    </>
  );
}
