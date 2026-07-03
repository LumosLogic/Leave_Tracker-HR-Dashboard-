import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, ShieldCheck, Mail, Building2, Check, Inbox, Eye, EyeOff, AlertTriangle, UserMinus, Shield } from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { initials } from '@/lib/utils';

const AVATAR_COLORS = ['#3525cd','#4f46e5','#712ae2','#8a4cfc','#10B981','#F59E0B','#EF4444','#F97316'];
const INITIAL = { name:'', email:'', password:'', department:'Human Resources', position:'HR Manager', avatar_color:'#3525cd' };

// ── HR Admin Form Modal ───────────────────────────────────────────────────────
function HRFormModal({ open, onClose, editing }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(editing || INITIAL);
  const [showPw, setShowPw] = useState(false);

  React.useEffect(() => { setForm(editing ? { ...editing, password: '' } : INITIAL); }, [editing]);

  const save = useMutation({
    mutationFn: () => editing
      ? apiPut(`/root/hr/${editing.id}`, form)
      : apiPost('/root/hr', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['root-hr'] });
      qc.invalidateQueries({ queryKey: ['root-stats'] });
      toast(editing ? 'HR admin updated.' : 'HR admin created.', 'success');
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit HR Admin' : 'Add HR Admin'}
      footer={
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn btn-outline btn-sm">Cancel</button>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="btn btn-primary btn-sm">
            {save.isPending
              ? <span className="flex items-center gap-1.5"><span className="spinner w-3.5 h-3.5" /> Saving…</span>
              : <><Check size={14} /> {editing ? 'Update' : 'Create'}</>}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-black text-white flex-shrink-0"
            style={{ background: form.avatar_color }}>
            {initials(form.name || 'HR')}
          </div>
          <div className="flex gap-2 flex-wrap">
            {AVATAR_COLORS.map(c => (
              <button key={c} onClick={() => set('avatar_color', c)}
                className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                style={{ background: c, borderColor: form.avatar_color === c ? '#fff' : 'transparent', outline: form.avatar_color === c ? `2px solid ${c}` : 'none', outlineOffset: '1px' }} />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="form-label">Full Name</label>
            <input className="form-control" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Jane Smith" />
          </div>
          <div className="col-span-2">
            <label className="form-label">Official Email</label>
            <input className="form-control" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="hr@company.com" />
          </div>
          <div className="col-span-2">
            <label className="form-label">{editing ? 'New Password (leave blank to keep)' : 'Password'}</label>
            <div className="relative">
              <input className="form-control pr-10" type={showPw ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min. 6 characters" />
              <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777587] hover:text-[#151c27]">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="form-label">Department</label>
            <input className="form-control" value={form.department} onChange={e => set('department', e.target.value)} />
          </div>
          <div>
            <label className="form-label">Position</label>
            <input className="form-control" value={form.position} onChange={e => set('position', e.target.value)} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ManageHR() {
  const qc    = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();

  const [activeTab,    setActiveTab]    = useState('hr');   // 'hr' | 'root'
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editing,      setEditing]      = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [rootDelTarget, setRootDelTarget] = useState(null);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: hrList = [], isLoading: hrLoading } = useQuery({
    queryKey: ['root-hr'],
    queryFn:  () => apiGet('/root/hr'),
  });

  const { data: rootAdmins = [], isLoading: rootLoading } = useQuery({
    queryKey: ['root-admins'],
    queryFn:  () => apiGet('/root/root-admins'),
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const del = useMutation({
    mutationFn: (id) => apiDelete(`/root/hr/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['root-hr'] });
      qc.invalidateQueries({ queryKey: ['root-stats'] });
      toast('HR admin removed.', 'success');
      setDeleteTarget(null);
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const rootDel = useMutation({
    mutationFn: (id) => apiDelete(`/root/root-admins/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['root-admins'] });
      qc.invalidateQueries({ queryKey: ['root-dashboard'] });
      toast('Root admin access removed. Account demoted to employee.', 'success');
      setRootDelTarget(null);
    },
    onError: (e) => { toast(e.message, 'error'); setRootDelTarget(null); },
  });

  function openAdd()    { setEditing(null); setModalOpen(true); }
  function openEdit(hr) { setEditing(hr);   setModalOpen(true); }

  const canDeleteRoot = rootAdmins.length > 1;

  const TABS = [
    { id: 'hr',   label: 'HR Admins',       icon: <ShieldCheck size={14} />, count: hrList.length },
    { id: 'root', label: 'Root Admins',      icon: <Shield size={14} />,      count: rootAdmins.length },
  ];

  return (
    <div>
      {/* ── Hero Banner ─────────────────────────────────────────────────── */}
      <div className="rounded-xl p-6 mb-6 relative overflow-hidden"
        style={{ background: activeTab === 'root'
          ? 'linear-gradient(135deg, #7f1d1d 0%, #dc2626 50%, #f97316 100%)'
          : 'linear-gradient(135deg, #3525cd 0%, #4f46e5 50%, #712ae2 100%)' }}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {activeTab === 'root'
                ? <Shield size={14} className="text-white/70" />
                : <ShieldCheck size={14} className="text-white/70" />}
              <span className="text-xs font-bold text-white/70 uppercase tracking-widest">Manage Admins</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              {activeTab === 'root' ? 'Root Administrators' : 'HR Administrators'}
            </h1>
            <p className="text-white/75 text-sm mt-1">
              {activeTab === 'root'
                ? 'Manage root admin accounts. An organisation must always retain at least one root admin.'
                : 'Create, edit, or remove HR administrator accounts.'}
            </p>
          </div>
          {activeTab === 'hr' && (
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
              style={{ background: 'rgba(255,255,255,.15)', border: '1.5px solid rgba(255,255,255,.3)', color: 'white' }}>
              <Plus size={16} /> Add HR Admin
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-[#f0f3ff] border border-[#c7c4d8] p-1 rounded-xl mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-bold transition-all ${
              activeTab === t.id ? 'bg-white text-[#3525cd] shadow-sm' : 'text-[#777587] hover:text-[#151c27]'
            }`}>
            {t.icon}
            {t.label}
            <span className={`text-[0.6rem] font-black px-1.5 py-0.5 rounded-full ${
              activeTab === t.id ? 'bg-[#f0f3ff] text-[#3525cd]' : 'bg-[#e7eefe] text-[#777587]'
            }`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── HR Admins Tab ───────────────────────────────────────────────── */}
      {activeTab === 'hr' && (
        hrLoading ? (
          <div className="flex justify-center py-20"><div className="spinner w-8 h-8" /></div>
        ) : hrList.length === 0 ? (
          <div className="card">
            <div className="empty-state py-16">
              <Inbox size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-[#464555]">No HR admins yet</p>
              <p className="text-sm mt-1">Create the first HR admin account to get started.</p>
              <button onClick={openAdd} className="btn btn-primary btn-sm mt-4">
                <Plus size={14} /> Add First HR Admin
              </button>
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {hrList.map(hr => (
              <div key={hr.id}
                className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5 hover:border-[#3525cd]/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                <div className="h-[3px] -mx-5 -mt-5 mb-4 rounded-t-xl"
                  style={{ background: 'linear-gradient(90deg, #3525cd, #4f46e5, #712ae2)' }} />
                <div className="flex items-start gap-3 mb-4">
                  <Avatar name={hr.name} color={hr.avatar_color} size={48} />
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-[#151c27] text-[0.95rem] truncate">{hr.name}</p>
                    <p className="text-xs text-[#777587] truncate">{hr.position}</p>
                    <span className="inline-block mt-1.5 text-[0.65rem] bg-[#f0f3ff] text-[#3525cd] border border-[#c7c4d8] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                      HR Admin
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5 mb-4 bg-[#f9f9ff] rounded-lg p-3 border border-[#f0f3ff]">
                  <div className="flex items-center gap-2 text-xs text-[#464555]">
                    <Mail size={12} className="text-[#777587] flex-shrink-0" />
                    <span className="truncate">{hr.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#464555]">
                    <Building2 size={12} className="text-[#777587] flex-shrink-0" />
                    <span className="truncate">{hr.department}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(hr)} className="btn btn-outline btn-sm flex-1 text-xs">
                    <Pencil size={13} /> Edit
                  </button>
                  <button onClick={() => setDeleteTarget(hr)} className="btn btn-danger btn-sm px-3">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Root Admins Tab ─────────────────────────────────────────────── */}
      {activeTab === 'root' && (
        <div>
          {!canDeleteRoot && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
              <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-amber-800">
                Only one root admin exists in this organisation. Add another root admin before you can remove this account.
              </p>
            </div>
          )}

          {rootLoading ? (
            <div className="flex justify-center py-20"><div className="spinner w-8 h-8" /></div>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {rootAdmins.map(ra => {
                const isSelf = ra.id === user?.id;
                return (
                  <div key={ra.id}
                    className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5 hover:border-rose-200 hover:shadow-md transition-all duration-200">
                    <div className="h-[3px] -mx-5 -mt-5 mb-4 rounded-t-xl bg-gradient-to-r from-rose-600 via-rose-500 to-orange-400" />

                    <div className="flex items-start gap-3 mb-4">
                      <Avatar name={ra.name} color={ra.avatar_color} size={48} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <p className="font-black text-[#151c27] text-[0.95rem] truncate">{ra.name}</p>
                          {isSelf && (
                            <span className="text-[0.6rem] font-bold bg-[#f0f3ff] text-[#3525cd] border border-[#c7c4d8] px-1.5 py-0.5 rounded-full flex-shrink-0">You</span>
                          )}
                        </div>
                        <p className="text-xs text-[#777587] truncate">{ra.position || 'Root Administrator'}</p>
                        <span className="inline-block mt-1.5 text-[0.65rem] bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                          Root Admin
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5 mb-4 bg-[#f9f9ff] rounded-lg p-3 border border-[#f0f3ff]">
                      <div className="flex items-center gap-2 text-xs text-[#464555]">
                        <Mail size={12} className="text-[#777587] flex-shrink-0" />
                        <span className="truncate">{ra.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[#464555]">
                        <Building2 size={12} className="text-[#777587] flex-shrink-0" />
                        <span className="truncate">{ra.department || 'Administration'}</span>
                      </div>
                    </div>

                    {isSelf ? (
                      <p className="text-[0.72rem] text-[#9ca3af] text-center py-2 font-semibold bg-[#f9f9ff] rounded-lg border border-[#f0f3ff]">
                        You cannot remove your own access
                      </p>
                    ) : canDeleteRoot ? (
                      <button onClick={() => setRootDelTarget(ra)}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-all">
                        <UserMinus size={13} /> Remove Root Admin Access
                      </button>
                    ) : (
                      <p className="text-[0.72rem] text-amber-600 text-center py-2 font-semibold bg-amber-50 rounded-lg border border-amber-100">
                        Cannot remove — only admin in org
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      <HRFormModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} />

      {/* HR Admin delete */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remove HR Admin"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setDeleteTarget(null)} className="btn btn-outline btn-sm">Cancel</button>
            <button onClick={() => del.mutate(deleteTarget.id)} disabled={del.isPending} className="btn btn-danger btn-sm">
              {del.isPending ? 'Removing…' : 'Yes, Remove'}
            </button>
          </div>
        }>
        <p className="text-[#464555] text-sm">
          Are you sure you want to remove <strong>{deleteTarget?.name}</strong> from the HR admin role? This action cannot be undone.
        </p>
      </Modal>

      {/* Root Admin soft-delete */}
      <Modal open={!!rootDelTarget} onClose={() => setRootDelTarget(null)} title="Remove Root Admin Access"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setRootDelTarget(null)} className="btn btn-outline btn-sm">Cancel</button>
            <button onClick={() => rootDel.mutate(rootDelTarget.id)} disabled={rootDel.isPending} className="btn btn-danger btn-sm">
              {rootDel.isPending ? 'Removing…' : 'Yes, Remove Access'}
            </button>
          </div>
        }>
        <div className="space-y-3">
          <div className="flex items-center gap-3 bg-[#f9f9ff] rounded-xl p-3 border border-[#f0f3ff]">
            <Avatar name={rootDelTarget?.name} color={rootDelTarget?.avatar_color} size={40} />
            <div>
              <p className="font-bold text-[#151c27] text-sm">{rootDelTarget?.name}</p>
              <p className="text-xs text-[#777587]">{rootDelTarget?.email}</p>
            </div>
          </div>
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2">
            <AlertTriangle size={14} className="text-rose-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-rose-800 space-y-1">
              <p className="font-bold">This is a soft delete — the account is not permanently removed.</p>
              <ul className="list-disc pl-4 space-y-0.5 font-medium">
                <li>Their role will be demoted to <strong>Employee</strong></li>
                <li>Their account will be set to <strong>Inactive</strong></li>
                <li>All attendance, leave, and payroll records are preserved</li>
                <li>They will lose all root admin access immediately</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-[#777587]">
            Remaining root admins after this action: <strong className="text-[#151c27]">{rootAdmins.length - 1}</strong>
          </p>
        </div>
      </Modal>
    </div>
  );
}
