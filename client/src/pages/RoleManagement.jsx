import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield, Plus, Trash2, ChevronRight, Users, Lock,
  Settings, AlertCircle, CheckCircle2, X,
} from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { cn } from '@/lib/utils';

// ─── Create Role Modal ────────────────────────────────────────────────────────

function CreateRoleModal({ onClose, onCreate }) {
  const [name, setName]     = useState('');
  const [desc, setDesc]     = useState('');
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Role name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const role = await apiPost('/roles', { name: name.trim(), description: desc.trim() });
      onCreate(role);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(4,6,14,.6)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-[#c7c4d8]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e7eefe]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#3525cd]/10 flex items-center justify-center">
              <Shield size={16} className="text-[#3525cd]" />
            </div>
            <h2 className="font-black text-[#151c27] text-base">Create Custom Role</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[#f0f3ff] flex items-center justify-center transition-colors">
            <X size={16} className="text-[#777587]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#464555] mb-1.5">Role Name *</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Finance Manager"
              className="w-full border border-[#c7c4d8] rounded-lg px-3 py-2.5 text-sm text-[#151c27] focus:outline-none focus:border-[#3525cd] focus:ring-1 focus:ring-[#3525cd]/20"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#464555] mb-1.5">Description</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="What does this role do?"
              rows={3}
              className="w-full border border-[#c7c4d8] rounded-lg px-3 py-2.5 text-sm text-[#151c27] resize-none focus:outline-none focus:border-[#3525cd] focus:ring-1 focus:ring-[#3525cd]/20"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={13} /> {error}
            </div>
          )}

          <div className="flex gap-2.5 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-[#c7c4d8] rounded-lg py-2.5 text-sm font-semibold text-[#464555] hover:bg-[#f0f3ff] transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-[#3525cd] text-white rounded-lg py-2.5 text-sm font-bold hover:bg-[#2a1fb0] transition-colors disabled:opacity-60">
              {saving ? 'Creating…' : 'Create Role'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ role, onCancel, onConfirm, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(4,6,14,.6)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-[#c7c4d8] p-6">
        <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
          <Trash2 size={22} className="text-red-500" />
        </div>
        <h3 className="text-center font-black text-[#151c27] mb-1">Delete Role</h3>
        <p className="text-center text-sm text-[#777587] mb-6">
          Are you sure you want to delete <strong className="text-[#151c27]">{role.name}</strong>?
          This action cannot be undone.
        </p>
        <div className="flex gap-2.5">
          <button onClick={onCancel}
            className="flex-1 border border-[#c7c4d8] rounded-lg py-2.5 text-sm font-semibold text-[#464555] hover:bg-[#f0f3ff]">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 bg-red-500 text-white rounded-lg py-2.5 text-sm font-bold hover:bg-red-600 disabled:opacity-60">
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Role Card ────────────────────────────────────────────────────────────────

function RoleCard({ role, onDelete, onClick }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting]           = useState(false);

  const SYSTEM_COLORS = {
    root_admin: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', dot: 'bg-purple-400' },
    hr_admin:   { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   dot: 'bg-blue-400'   },
    dept_head:  { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  dot: 'bg-amber-400'  },
    employee:   { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  dot: 'bg-green-400'  },
  };
  const colors = SYSTEM_COLORS[role.slug] || {
    bg: 'bg-[#f0f3ff]', border: 'border-[#c7c4d8]', text: 'text-[#3525cd]', dot: 'bg-[#3525cd]',
  };

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(role.id);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <div
        className="bg-white border border-[#e7eefe] rounded-xl p-4 hover:border-[#3525cd]/30 hover:shadow-sm transition-all cursor-pointer group relative"
        onClick={() => onClick(role)}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', colors.bg, 'border', colors.border)}>
              {role.is_system_role
                ? <Lock size={15} className={colors.text} />
                : <Shield size={15} className="text-[#3525cd]" />
              }
            </div>
            <div>
              <p className="font-bold text-[0.88rem] text-[#151c27] leading-tight">{role.name}</p>
              <span className={cn(
                'inline-flex items-center gap-1 text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full mt-0.5',
                role.is_system_role ? cn(colors.bg, colors.text) : 'bg-[#f0f3ff] text-[#3525cd]'
              )}>
                <span className={cn('w-1.5 h-1.5 rounded-full', role.is_system_role ? colors.dot : 'bg-[#3525cd]')} />
                {role.is_system_role ? 'System' : 'Custom'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {!role.is_system_role && (
              <button
                onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
                className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors"
              >
                <Trash2 size={13} className="text-red-400" />
              </button>
            )}
            <ChevronRight size={16} className="text-[#777587]" />
          </div>
        </div>

        {/* Description */}
        {role.description && (
          <p className="text-xs text-[#777587] mb-3 line-clamp-2 leading-relaxed">{role.description}</p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 pt-2.5 border-t border-[#f0f3ff]">
          <div className="flex items-center gap-1.5 text-[#777587]">
            <Shield size={12} />
            <span className="text-xs font-semibold">{role.permission_count || 0} permissions</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#777587]">
            <Users size={12} />
            <span className="text-xs font-semibold">{role.member_count || 0} members</span>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <DeleteConfirm
          role={role}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
          loading={deleting}
        />
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RoleManagement() {
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast]           = useState(null);

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => apiGet('/roles'),
  });

  const deleteMutation = useMutation({
    mutationFn: (roleId) => apiDelete(`/roles/${roleId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      showToast('Role deleted successfully', 'success');
    },
    onError: (err) => showToast(err.message, 'error'),
  });

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  function handleRoleClick(role) {
    navigate(`/root/roles/${role.id}/permissions`);
  }

  function handleCreated(role) {
    queryClient.invalidateQueries({ queryKey: ['roles'] });
    showToast(`Role "${role.name}" created`, 'success');
  }

  const systemRoles = roles.filter(r => r.is_system_role);
  const customRoles = roles.filter(r => !r.is_system_role);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl bg-[#3525cd]/10 flex items-center justify-center">
              <Shield size={17} className="text-[#3525cd]" />
            </div>
            <h1 className="text-xl font-black text-[#151c27]">Role Management</h1>
          </div>
          <p className="text-sm text-[#777587] ml-10.5">
            Define roles and assign permissions to control what users can access.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-[#3525cd] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#2a1fb0] transition-colors shadow-sm"
        >
          <Plus size={16} /> Create Role
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-[#f0f3ff] border border-[#c7c4d8] rounded-xl px-4 py-3 mb-6 flex items-start gap-3">
        <Settings size={16} className="text-[#3525cd] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-[#3525cd] mb-0.5">Click any role to manage its permissions</p>
          <p className="text-xs text-[#777587]">
            System roles are seeded automatically and cannot be deleted. Custom roles can be created for your organization's specific needs.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-white border border-[#e7eefe] rounded-xl p-4 animate-pulse">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-9 h-9 rounded-xl bg-[#f0f3ff]" />
                <div className="space-y-1.5">
                  <div className="h-4 w-28 bg-[#f0f3ff] rounded" />
                  <div className="h-3 w-14 bg-[#f0f3ff] rounded" />
                </div>
              </div>
              <div className="h-3 w-full bg-[#f0f3ff] rounded mb-4" />
              <div className="h-3 w-2/3 bg-[#f0f3ff] rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* System Roles */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Lock size={14} className="text-[#777587]" />
              <h2 className="text-xs font-black uppercase tracking-widest text-[#777587]">System Roles</h2>
              <span className="text-xs text-[#777587] font-medium">— seeded automatically, cannot be deleted</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {systemRoles.map(role => (
                <RoleCard
                  key={role.id}
                  role={role}
                  onDelete={(id) => deleteMutation.mutateAsync(id)}
                  onClick={handleRoleClick}
                />
              ))}
            </div>
          </div>

          {/* Custom Roles */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Shield size={14} className="text-[#777587]" />
              <h2 className="text-xs font-black uppercase tracking-widest text-[#777587]">Custom Roles</h2>
            </div>
            {customRoles.length === 0 ? (
              <div className="bg-white border border-dashed border-[#c7c4d8] rounded-xl p-8 text-center">
                <div className="w-12 h-12 rounded-2xl bg-[#f0f3ff] flex items-center justify-center mx-auto mb-3">
                  <Plus size={22} className="text-[#3525cd]/40" />
                </div>
                <p className="text-sm font-bold text-[#151c27] mb-1">No custom roles yet</p>
                <p className="text-xs text-[#777587] mb-4">Create a custom role for specific job functions in your organization.</p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="text-[#3525cd] text-xs font-bold hover:underline"
                >
                  + Create your first custom role
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {customRoles.map(role => (
                  <RoleCard
                    key={role.id}
                    role={role}
                    onDelete={(id) => deleteMutation.mutateAsync(id)}
                    onClick={handleRoleClick}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showCreate && (
        <CreateRoleModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreated}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-semibold border',
          toast.type === 'success'
            ? 'bg-white border-green-200 text-green-700'
            : 'bg-white border-red-200 text-red-600'
        )}>
          {toast.type === 'success'
            ? <CheckCircle2 size={16} className="text-green-500" />
            : <AlertCircle size={16} className="text-red-500" />
          }
          {toast.message}
        </div>
      )}
    </div>
  );
}
