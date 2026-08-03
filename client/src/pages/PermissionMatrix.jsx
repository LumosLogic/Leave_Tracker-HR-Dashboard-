import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Shield, Lock, Save, CheckSquare, Square,
  Users, AlertCircle, CheckCircle2, ChevronDown, ChevronUp,
  UserPlus, X, Search,
} from 'lucide-react';
import { apiGet, apiPut, apiDelete } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useFeature } from '@/context/FeatureFlagContext';

// ─── Module label map ─────────────────────────────────────────────────────────
const MODULE_LABELS = {
  dashboard:     'Dashboard',
  employees:     'Employees',
  departments:   'Departments',
  designations:  'Designations',
  attendance:    'Attendance',
  leaves:        'Leaves',
  payroll:       'Payroll',
  reports:       'Reports',
  settings:      'Settings',
  documents:     'Documents',
  onboarding:    'Onboarding',
  announcements: 'Announcements',
  holidays:      'Holidays',
  shifts:        'Shifts & Roster',
  biometric:     'Biometric',
  branches:      'Branches',
  assets:        'Assets',
  expenses:      'Expenses',
  performance:   'Performance',
  exit:          'Exit Management',
  roles:         'Role Management',
  notifications: 'Notifications',
};

const MODULE_ORDER = Object.keys(MODULE_LABELS);

// ─── Action badge colors ──────────────────────────────────────────────────────
const ACTION_COLORS = {
  view:                  'bg-slate-100 text-slate-600',
  create:                'bg-blue-50 text-blue-600',
  edit:                  'bg-amber-50 text-amber-600',
  delete:                'bg-red-50 text-red-600',
  export:                'bg-purple-50 text-purple-600',
  approve:               'bg-green-50 text-green-600',
  reject:                'bg-red-50 text-red-600',
  forward:               'bg-cyan-50 text-cyan-600',
  manage:                'bg-indigo-50 text-indigo-600',
  lock:                  'bg-orange-50 text-orange-600',
  generate:              'bg-emerald-50 text-emerald-600',
  broadcast:             'bg-pink-50 text-pink-600',
  assign:                'bg-violet-50 text-violet-600',
  logs:                  'bg-slate-50 text-slate-500',
  upload:                'bg-teal-50 text-teal-600',
  manage_structures:     'bg-indigo-50 text-indigo-600',
  manage_adjustments:    'bg-indigo-50 text-indigo-600',
  approve_regularization:'bg-green-50 text-green-600',
  complete_task:         'bg-emerald-50 text-emerald-600',
};

// ─── Permission Checkbox ──────────────────────────────────────────────────────
function PermissionCheckbox({ permission, checked, onChange, disabled }) {
  const actionStr = typeof permission?.action === 'string' ? permission.action : 'unknown';
  const labelStr = permission?.label || 'Unnamed permission';
  const permId = permission?.id;
  const colorClass = ACTION_COLORS[actionStr] || 'bg-slate-50 text-slate-600';
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onChange(permId, !checked)}
      onMouseDown={(e) => {
        // Prevent default browser focus algorithm to stop layout jumping in SPA layout
        e.preventDefault(); 
      }}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onChange(permId, !checked);
        }
      }}
      className={cn(
        'relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all select-none focus:outline-none focus:ring-2 focus:ring-[#3525cd]/20',
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#f0f3ff]',
        checked && !disabled ? 'bg-[#3525cd]/5 border border-[#3525cd]/20' : 'border border-transparent'
      )}
    >
      <div className="flex-shrink-0">
        {checked
          ? <CheckSquare size={16} className={disabled ? 'text-[#777587]' : 'text-[#3525cd]'} />
          : <Square size={16} className="text-[#c7c4d8]" />
        }
      </div>
      <div className="min-w-0">
        <span className={cn('text-[0.68rem] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide', colorClass)}>
          {actionStr.replace(/_/g, ' ')}
        </span>
        <p className="text-[0.7rem] text-[#777587] mt-0.5 leading-tight truncate" title={labelStr}>
          {labelStr}
        </p>
      </div>
    </div>
  );
}

// ─── Module Section ───────────────────────────────────────────────────────────
function ModuleSection({ module, permissions = [], selectedIds, onToggle, onToggleAll, isSystemRole }) {
  const [collapsed, setCollapsed] = useState(false);
  const safeSelectedIds = (selectedIds && typeof selectedIds.has === 'function') ? selectedIds : new Set();
  
  const modulePerms = permissions.filter(perm => perm.module_key === module);
  if (!modulePerms.length) return null;

  const allChecked    = modulePerms.every(perm => safeSelectedIds.has(perm.id));
  const someChecked   = modulePerms.some(perm => safeSelectedIds.has(perm.id));
  const checkedCount  = modulePerms.filter(perm => safeSelectedIds.has(perm.id)).length;

  return (
    <div className="bg-white border border-[#e7eefe] rounded-xl overflow-hidden">
      {/* Module header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-[#f9f9ff] border-b border-[#e7eefe] cursor-pointer hover:bg-[#f0f3ff] transition-colors"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={e => { e.stopPropagation(); !isSystemRole && onToggleAll(modulePerms, !allChecked); }}
            disabled={isSystemRole}
            className={cn(
              'flex-shrink-0 transition-colors',
              isSystemRole ? 'cursor-not-allowed' : 'cursor-pointer'
            )}
            title={allChecked ? 'Deselect all' : 'Select all'}
          >
            {allChecked
              ? <CheckSquare size={15} className={isSystemRole ? 'text-[#777587]' : 'text-[#3525cd]'} />
              : someChecked
                ? <CheckSquare size={15} className="text-[#3525cd]/40" />
                : <Square size={15} className="text-[#c7c4d8]" />
            }
          </button>
          <span className="font-bold text-sm text-[#151c27]">
            {MODULE_LABELS[module] || module || 'Unknown'}
          </span>
          <span className="text-[0.65rem] font-semibold text-[#777587] bg-[#f0f3ff] px-1.5 py-0.5 rounded-full">
            {checkedCount}/{modulePerms.length}
          </span>
        </div>
        {collapsed ? <ChevronDown size={14} className="text-[#777587]" /> : <ChevronUp size={14} className="text-[#777587]" />}
      </div>

      {/* Permissions grid */}
      {!collapsed && (
        <div className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-1">
          {modulePerms.map(permItem => (
            <PermissionCheckbox
              key={permItem.id || Math.random()}
              permission={permItem}
              checked={safeSelectedIds.has(permItem.id)}
              onChange={onToggle}
              disabled={isSystemRole && (module === 'roles' || true) /* root_admin always has all */}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Members Panel ────────────────────────────────────────────────────────────
function MembersPanel({ members = [], roleId, onRefetch }) {
  const qc             = useQueryClient();
  const [search, setSearch]     = useState('');
  const [showPicker, setShowPicker] = useState(false);

  // All employees in the org (for the picker)
  const { data: allUsers = [] } = useQuery({
    queryKey: ['employees-list'],
    queryFn:  () => apiGet('/employees'),
    enabled:  showPicker,
    select:   d => Array.isArray(d) ? d : (d?.employees || []),
  });

  // Remove a member from this role
  const removeMut = useMutation({
    mutationFn: userId => apiDelete(`/roles/${roleId}/members/${userId}`),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['role', String(roleId)] }); onRefetch?.(); },
  });

  // Add a user to this role: fetch their current roles → append this role → PUT
  const addMut = useMutation({
    mutationFn: async (user) => {
      const currentRoles = await apiGet(`/roles/user/${user.id}`);
      const currentIds   = (Array.isArray(currentRoles) ? currentRoles : []).map(r => r.id);
      if (currentIds.includes(Number(roleId))) return; // already assigned
      await apiPut(`/roles/user/${user.id}`, { role_ids: [...currentIds, Number(roleId)] });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['role', String(roleId)] });
      onRefetch?.();
      setShowPicker(false);
      setSearch('');
    },
  });

  const memberIds  = new Set(members.map(m => m.id));
  const pickable   = allUsers.filter(u =>
    !memberIds.has(u.id) &&
    (!search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-3">
      {/* Assign button */}
      <button
        onClick={() => setShowPicker(prev => !prev)}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border-2 border-dashed border-[#c7c4d8] text-[#3525cd] text-xs font-bold hover:border-[#3525cd] hover:bg-[#f0f3ff] transition-colors"
      >
        <UserPlus size={13} /> Assign Member
      </button>

      {/* User picker */}
      {showPicker && (
        <div className="border border-[#e2e0f0] rounded-xl overflow-hidden shadow-sm">
          <div className="p-2 border-b border-[#e2e0f0] bg-[#f8fafc] flex items-center gap-2">
            <Search size={12} className="text-[#777587] shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search employees…"
              className="flex-1 text-xs bg-transparent outline-none text-[#151c27] placeholder-[#c7c4d8]"
            />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {pickable.length === 0 ? (
              <p className="text-xs text-[#777587] text-center py-4">
                {allUsers.length === 0 ? 'Loading…' : 'No more employees to add'}
              </p>
            ) : pickable.map(u => (
              <button
                key={u.id}
                disabled={addMut.isPending}
                onClick={() => addMut.mutate(u)}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#f0f3ff] transition-colors text-left disabled:opacity-50"
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[0.6rem] font-black text-white shrink-0"
                  style={{ background: u.avatar_color || '#3525cd' }}
                >
                  {(u.name || '?').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#151c27] truncate">{u.name}</p>
                  <p className="text-[0.6rem] text-[#777587] truncate">{u.department || u.email}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Current members */}
      {members.length === 0 && !showPicker ? (
        <div className="text-center py-4">
          <Users size={20} className="text-[#c7c4d8] mx-auto mb-1.5" />
          <p className="text-xs text-[#777587]">No members assigned yet</p>
          <p className="text-[0.65rem] text-[#c7c4d8]">Click "Assign Member" above to add someone</p>
        </div>
      ) : (
        <div className="space-y-1">
          {members.map(m => (
            <div key={m.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[#f0f3ff] transition-colors group">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[0.65rem] font-black text-white flex-shrink-0"
                style={{ background: m.avatar_color || '#3525cd' }}
              >
                {(m.name || '?').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#151c27] truncate">{m.name}</p>
                <p className="text-[0.65rem] text-[#777587] truncate">{m.department || m.email}</p>
              </div>
              <button
                onClick={() => removeMut.mutate(m.id)}
                disabled={removeMut.isPending}
                title="Remove from role"
                className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-all shrink-0"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PermissionMatrix() {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [dirty, setDirty]             = useState(false);
  const [toast, setToast]             = useState(null);
  const [activeTab, setActiveTab]     = useState('permissions'); // 'permissions' | 'members'

  // Fetch role details (with current permissions + members)
  const { data: role, isLoading: roleLoading, isError: roleError, refetch: refetchRole } = useQuery({
    queryKey: ['role', id],
    queryFn: () => apiGet(`/roles/${id}`),
    retry: 1,
  });

  // Fetch all available permissions (grouped by module)
  const { data: modulesRaw = [], isLoading: permsLoading, isError: permsError } = useQuery({
    queryKey: ['all-permissions'],
    queryFn: () => apiGet('/permissions'),
    retry: 1,
  });

  // Fix M3: Warn user if they try to leave with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Flatten all permissions into a single array safely
  const allPermissions = (Array.isArray(modulesRaw) ? modulesRaw : []).flatMap(m =>
    Array.isArray(m?.permissions) ? m.permissions.map(perm => ({ ...perm, module_key: m.module_key })) : []
  );

  // Sort modules in defined order; hide biometric if not enabled for this org
  const sortedModules = [...new Set(allPermissions.map(perm => perm.module_key))]
    .filter(Boolean)
    .filter(m => m !== 'biometric' || biometricEnabled)
    .sort((a, b) => {
      const ai = MODULE_ORDER.indexOf(a);
      const bi = MODULE_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

  // Initialize selection from role's current permissions
  useEffect(() => {
    if (role && Array.isArray(role.permission_ids)) {
      setSelectedIds(new Set(role.permission_ids));
      setDirty(false);
    }
  }, [role?.permission_ids?.join(',')]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: () => apiPut(`/roles/${id}/permissions`, {
      permission_ids: Array.from(selectedIds),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role', id] });
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setDirty(false);
      showToast('Permissions saved', 'success');
    },
    onError: (err) => showToast(err.message, 'error'),
  });

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  function handleToggle(permId, checked) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      checked ? next.add(permId) : next.delete(permId);
      return next;
    });
    setDirty(true);
  }

  function handleToggleAll(perms, checked) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      perms.forEach(perm => checked ? next.add(perm.id) : next.delete(perm.id));
      return next;
    });
    setDirty(true);
  }

  function handleSelectAll() {
    setSelectedIds(new Set(allPermissions.map(perm => perm.id)));
    setDirty(true);
  }

  function handleDeselectAll() {
    setSelectedIds(new Set());
    setDirty(true);
  }

  const biometricEnabled = useFeature('biometric');
  const isSystemRole  = role?.is_system_role;
  const isRootAdmin   = role?.slug === 'root_admin';
  const isLoading     = roleLoading || permsLoading;
  const isError       = roleError || permsError;

  // Fix H4: Error state — show a clear error instead of blank page
  if (isError && !isLoading) {
    return (
      <div className="w-full">
        <button
          onClick={() => navigate('/root/roles')}
          className="flex items-center gap-1.5 text-xs text-[#777587] hover:text-[#3525cd] mb-6 transition-colors font-semibold"
        >
          <ArrowLeft size={13} /> Back to Roles
        </button>
        <div className="bg-white border border-red-200 rounded-2xl p-10 text-center">
          <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
          <h2 className="font-black text-[#151c27] mb-2">Failed to load role</h2>
          <p className="text-sm text-[#777587] mb-5">
            Could not connect to the server. Please check your connection and try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-[#3525cd] text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-[#2a1fb0] transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-[#f0f3ff] rounded-xl" />
          <div className="h-4 w-96 bg-[#f0f3ff] rounded" />
          {[1,2,3].map(i => <div key={i} className="h-24 bg-white border border-[#e7eefe] rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="w-full text-center py-16">
        <p className="text-[#777587]">Role not found.</p>
        <button onClick={() => navigate('/root/roles')} className="text-[#3525cd] text-sm font-bold mt-2 hover:underline">
          ← Back to Roles
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* ── HEADER ─────────────────────────────────────── */}
      <div className="mb-6">
        {/* Title row */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <button
              onClick={() => navigate('/root/roles')}
              className="flex items-center gap-1.5 text-xs text-[#777587] hover:text-[#3525cd] mb-3 transition-colors font-semibold"
            >
              <ArrowLeft size={13} /> Back to Roles
            </button>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-9 h-9 rounded-xl bg-[#3525cd]/10 flex items-center justify-center">
                {isSystemRole ? <Lock size={17} className="text-[#3525cd]" /> : <Shield size={17} className="text-[#3525cd]" />}
              </div>
              <div>
                <h1 className="text-xl font-black text-[#151c27]">{role.name}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn(
                    'text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full',
                    isSystemRole ? 'bg-purple-50 text-purple-600' : 'bg-[#f0f3ff] text-[#3525cd]'
                  )}>
                    {isSystemRole ? 'System Role' : 'Custom Role'}
                  </span>
                  <span className="text-xs text-[#777587]">{selectedIds.size} permissions selected</span>
                </div>
              </div>
            </div>
            {role.description && (
              <p className="text-sm text-[#777587] ml-11.5">{role.description}</p>
            )}
          </div>

          {!isRootAdmin && (
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!dirty || saveMutation.isPending}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all',
                dirty
                  ? 'bg-[#3525cd] text-white hover:bg-[#2a1fb0] shadow-sm'
                  : 'bg-[#f0f3ff] text-[#777587] cursor-not-allowed'
              )}
            >
              <Save size={15} />
              {saveMutation.isPending ? 'Saving…' : 'Save Permissions'}
            </button>
          )}
        </div>

        {/* Root Admin banner */}
        {isRootAdmin && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
            <Lock size={15} className="text-purple-500 flex-shrink-0" />
            <p className="text-xs text-purple-700 font-semibold">
              Root Admin has all permissions by default and cannot be restricted.
            </p>
          </div>
        )}

        {/* System role banner */}
        {isSystemRole && !isRootAdmin && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
            <AlertCircle size={15} className="text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700 font-semibold">
              This is a system role. You can modify its permissions, but it cannot be deleted or renamed.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-[#f0f3ff] p-1 rounded-xl w-fit">
          {[
            { key: 'permissions', label: 'Permissions', icon: Shield },
            { key: 'members', label: `Members (${role.members?.length || 0})`, icon: Users },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all',
                activeTab === tab.key
                  ? 'bg-white text-[#151c27] shadow-sm border border-[#c7c4d8]'
                  : 'text-[#777587] hover:text-[#464555]'
              )}
            >
              <tab.icon size={13} /> {tab.label}
            </button>
          ))}
        </div>

        {/* Quick select */}
        {activeTab === 'permissions' && !isRootAdmin && (
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs text-[#777587] font-semibold">Quick select:</span>
            <button onClick={handleSelectAll} className="text-xs font-bold text-[#3525cd] hover:underline">
              Select All
            </button>
            <span className="text-[#c7c4d8]">·</span>
            <button onClick={handleDeselectAll} className="text-xs font-bold text-[#777587] hover:underline">
              Deselect All
            </button>
          </div>
        )}
      </div>

      {/* ── BODY ──────────────────────────────────────────────────────── */}
      <div className="">
        {activeTab === 'permissions' ? (
          <div className={cn('space-y-3', dirty && !isRootAdmin ? 'pb-24' : 'pb-6')}>
            {sortedModules.map(module => (
              <ModuleSection
                key={module}
                module={module}
                permissions={allPermissions}
                selectedIds={isRootAdmin ? new Set(allPermissions.map(perm => perm.id)) : (selectedIds || new Set())}
                onToggle={handleToggle}
                onToggleAll={handleToggleAll}
                isSystemRole={isRootAdmin}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white border border-[#e7eefe] rounded-xl p-4">
            <MembersPanel members={role.members} roleId={id} onRefetch={refetchRole} />
          </div>
        )}
      </div>

      {/* Save bar — fixed to viewport bottom */}
      {!isRootAdmin && dirty && (
        <div className="fixed bottom-0 left-0 md:left-64 right-0 z-20 bg-white border-t border-[#e7eefe] py-3 px-4 md:px-7 flex items-center justify-between shadow-lg">
          <p className="text-xs text-[#777587] font-semibold">
            You have unsaved permission changes.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedIds(new Set(role.permission_ids || []));
                setDirty(false);
              }}
              className="text-xs font-semibold text-[#777587] hover:text-[#464555] px-3 py-2"
            >
              Discard
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1.5 bg-[#3525cd] text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#2a1fb0] disabled:opacity-60"
            >
              <Save size={13} /> {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
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
