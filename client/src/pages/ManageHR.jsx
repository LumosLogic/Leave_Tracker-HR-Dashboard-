import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, ShieldCheck, Mail, Building2, X, Check } from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/context/ToastContext';
import { initials } from '@/lib/utils';

const AVATAR_COLORS = ['#3525cd','#4f46e5','#712ae2','#8a4cfc','#10B981','#F59E0B','#EF4444','#F97316'];

const INITIAL = { name:'', email:'', password:'', department:'Human Resources', position:'HR Manager', avatar_color:'#3525cd' };

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
      toast(editing ? 'HR admin updated.' : 'HR admin created. Welcome email sent.', 'success');
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
            {save.isPending ? <span className="flex items-center gap-1.5"><span className="spinner w-3.5 h-3.5" /> Saving…</span> : <><Check size={14} /> {editing ? 'Update' : 'Create'}</>}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Avatar preview + color picker */}
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
                {showPw ? '👁' : '🙈'}
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

export default function ManageHR() {
  const qc = useQueryClient();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: hrList = [], isLoading } = useQuery({
    queryKey: ['root-hr'],
    queryFn:  () => apiGet('/root/hr'),
  });

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

  function openAdd()  { setEditing(null); setModalOpen(true); }
  function openEdit(hr) { setEditing(hr);   setModalOpen(true); }

  return (
    <div className="p-6 md:p-8 min-h-screen bg-[#1a2030]">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={16} className="text-[#c3c0ff]" />
            <span className="text-xs font-bold text-[#c3c0ff] uppercase tracking-widest">Root Admin</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Manage HR Admins</h1>
          <p className="text-[#c7c4d8] text-sm mt-1">Create, edit, or remove HR administrator accounts.</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
          style={{ background: 'linear-gradient(135deg, #1E40AF, #2563EB)' }}>
          <Plus size={16} /> Add HR Admin
        </button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-20"><div className="spinner w-8 h-8" /></div>
      ) : hrList.length === 0 ? (
        <div className="text-center py-20">
          <ShieldCheck size={40} className="mx-auto text-[#464555] mb-3" />
          <p className="text-[#c7c4d8] font-semibold">No HR admins yet</p>
          <p className="text-[#777587] text-sm mt-1">Create the first HR admin account to get started.</p>
          <button onClick={openAdd} className="mt-4 px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #1E40AF, #2563EB)' }}>
            <Plus size={14} className="inline mr-1.5" /> Add First HR Admin
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {hrList.map(hr => (
            <div key={hr.id} className="bg-[#2a313d] border border-[#464555]/40 rounded-xl p-5 hover:border-[#4f46e5]/40 transition-all">
              <div className="flex items-start gap-3 mb-4">
                <Avatar name={hr.name} color={hr.avatar_color} size={48} />
                <div className="flex-1 min-w-0">
                  <p className="font-black text-white text-[0.95rem] truncate">{hr.name}</p>
                  <p className="text-xs text-[#c7c4d8] truncate">{hr.position}</p>
                  <span className="inline-block mt-1 text-[0.65rem] bg-[#3525cd]/20 text-[#c3c0ff] border border-[#4f46e5]/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                    HR Admin
                  </span>
                </div>
              </div>
              <div className="space-y-1.5 mb-4">
                <div className="flex items-center gap-2 text-xs text-[#c7c4d8]">
                  <Mail size={12} className="flex-shrink-0" /> <span className="truncate">{hr.email}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#c7c4d8]">
                  <Building2 size={12} className="flex-shrink-0" /> <span className="truncate">{hr.department}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(hr)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-[#c7c4d8] hover:text-white bg-[#151c27]/40 hover:bg-[#151c27]/70 transition-colors border border-[#464555]/40">
                  <Pencil size={13} /> Edit
                </button>
                <button onClick={() => setDeleteTarget(hr)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-400 hover:text-rose-300 bg-rose-900/20 hover:bg-rose-900/40 transition-colors border border-rose-900/30">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      <HRFormModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} />

      {/* Delete confirm modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remove HR Admin"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setDeleteTarget(null)} className="btn btn-outline btn-sm">Cancel</button>
            <button onClick={() => del.mutate(deleteTarget.id)} disabled={del.isPending}
              className="btn btn-danger btn-sm">
              {del.isPending ? 'Removing…' : 'Yes, Remove'}
            </button>
          </div>
        }
      >
        <p className="text-[#c7c4d8] text-sm">
          Are you sure you want to remove <strong>{deleteTarget?.name}</strong> from the HR admin role?
          This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
