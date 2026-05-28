import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Building2, Mail, UserCheck, Umbrella, XCircle, Clock, Home, AlarmClock, CheckCircle2, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Avatar } from '@/components/ui/Avatar';
import { RoleBadge, StatusBadge, LeaveTypeBadge } from '@/components/ui/Badge';
import {
  fmtDate, fmtDateRange,
  countWorkingDaysInRange, countLeaveDaysInRange,
  MONTHS,
} from '@/lib/utils';

const AVATAR_COLORS = ['#3525cd','#10B981','#F59E0B','#EF4444','#712ae2','#F97316','#4f46e5','#EC4899'];

// ── Employee Profile ──────────────────────────────────────────────────────────
function EmployeeProfile({ emp, onBack }) {
  const now = new Date();
  const [viewMode,    setViewMode]    = useState('monthly');
  const [year,        setYear]        = useState(now.getFullYear());
  const [month,       setMonth]       = useState(now.getMonth() + 1);
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');

  const today      = now.toISOString().split('T')[0];
  const monthValue = `${year}-${String(month).padStart(2, '0')}`;

  const isCustomReady = viewMode !== 'custom' || (!!customStart && !!customEnd && customStart <= customEnd);

  const attParams = viewMode === 'monthly' ? { year, month, userId: emp.id }
                  : viewMode === 'yearly'  ? { year, userId: emp.id }
                  : { startDate: customStart, endDate: customEnd, userId: emp.id };
  const lvParams  = viewMode === 'monthly' ? { userId: emp.id, year, month }
                  : viewMode === 'yearly'  ? { userId: emp.id, year }
                  : { userId: emp.id, startDate: customStart, endDate: customEnd };

  const { data: attendance = [] } = useQuery({
    queryKey: ['emp-att', emp.id, viewMode, year, month, customStart, customEnd],
    queryFn:  () => apiGet('/attendance', attParams),
    enabled:  isCustomReady,
  });
  const { data: leaves = [] } = useQuery({
    queryKey: ['emp-leaves', emp.id, viewMode, year, month, customStart, customEnd],
    queryFn:  () => apiGet('/leaves', lvParams),
    enabled:  isCustomReady,
  });

  // Compute range boundaries
  let rangeStart, rangeEnd;
  if (viewMode === 'monthly') {
    rangeStart = `${year}-${String(month).padStart(2,'0')}-01`;
    rangeEnd   = `${year}-${String(month).padStart(2,'0')}-${new Date(year, month, 0).getDate()}`;
  } else if (viewMode === 'yearly') {
    rangeStart = `${year}-01-01`;
    rangeEnd   = `${year}-12-31`;
  } else {
    rangeStart = customStart || today;
    rangeEnd   = customEnd   || today;
  }
  const effectiveEnd = today < rangeEnd ? today : rangeEnd;

  const workingDays  = isCustomReady ? countWorkingDaysInRange(rangeStart, effectiveEnd) : 0;
  const approved     = leaves.filter(l => l.status === 'approved');
  const onLeaveCount = approved.filter(l => l.leave_time === 'full').reduce((s, l) => s + countLeaveDaysInRange(l, rangeStart, effectiveEnd), 0);
  const halfDayCount = approved.filter(l => l.leave_time === 'half').reduce((s, l) => s + countLeaveDaysInRange(l, rangeStart, effectiveEnd), 0);
  const wfhCount     = approved.filter(l => l.leave_time === 'wfh').reduce((s, l)  => s + countLeaveDaysInRange(l, rangeStart, effectiveEnd), 0);
  const lateCount    = attendance.filter(r => r.is_late).length;
  const absentCount  = attendance.filter(r => r.status === 'absent').length;
  const presentCount = Math.max(0, workingDays - onLeaveCount - absentCount);

  const periodLabel = viewMode === 'monthly' ? `${MONTHS[month - 1]} ${year}`
                    : viewMode === 'yearly'  ? `${year}`
                    : (customStart && customEnd) ? `${fmtDate(customStart)} – ${fmtDate(customEnd)}` : '—';

  const stats = [
    { icon: <UserCheck size={18} />, label: 'Present Days',  value: presentCount,  variant: 'success' },
    { icon: <Umbrella size={18} />,  label: 'Leave Days',    value: onLeaveCount,  variant: 'danger'  },
    { icon: <XCircle size={18} />,   label: 'Absent Days',   value: absentCount,   variant: 'danger'  },
    { icon: <Clock size={18} />,     label: 'Half Days',     value: halfDayCount,  variant: 'info'    },
    { icon: <Home size={18} />,      label: 'WFH Days',      value: wfhCount,      variant: 'default' },
    { icon: <AlarmClock size={18} />,label: 'Late Entries',  value: lateCount,     variant: 'warning' },
  ];

  const variantBorder = {
    success: 'border-t-emerald-500',
    danger:  'border-t-rose-500',
    info:    'border-t-blue-500',
    warning: 'border-t-orange-400',
    default: 'border-t-cyan-400',
  };
  const variantIcon = {
    success: 'bg-emerald-50 text-emerald-600',
    danger:  'bg-rose-50 text-rose-600',
    info:    'bg-blue-50 text-blue-600',
    warning: 'bg-orange-50 text-orange-600',
    default: 'bg-cyan-50 text-cyan-700',
  };

  const absentRecords = attendance.filter(r => r.status === 'absent').sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      {/* Header */}
      <div className="page-header mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <button className="btn btn-outline btn-sm" onClick={onBack}>
            <ChevronLeft size={15} /> Back
          </button>
          <Avatar name={emp.name} color={emp.avatar_color} size={48} />
          <div>
            <div className="page-title">{emp.name}</div>
            <div className="page-subtitle">
              {emp.position || ''}{emp.department ? ` · ${emp.department}` : ''}
            </div>
          </div>
        </div>

        {/* View mode toggle + date picker */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 bg-[#f0f3ff] p-1 rounded-xl">
            {['monthly', 'yearly', 'custom'].map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg capitalize transition-colors ${
                  viewMode === m
                    ? 'bg-white text-[#3525cd] shadow-sm'
                    : 'text-[#777587] hover:text-[#151c27]'
                }`}>
                {m}
              </button>
            ))}
          </div>

          {viewMode === 'monthly' && (
            <input type="month" className="form-control w-auto" value={monthValue}
              onChange={e => {
                const [y, mo] = e.target.value.split('-').map(Number);
                setYear(y); setMonth(mo);
              }} />
          )}

          {viewMode === 'yearly' && (
            <div className="flex items-center gap-2 bg-white border border-[#c7c4d8] rounded-lg px-3 py-2">
              <button onClick={() => setYear(y => y - 1)} className="text-[#3525cd] hover:text-[#4f46e5]">
                <ChevronLeft size={15} />
              </button>
              <span className="font-bold text-[#151c27] min-w-[3.5rem] text-center">{year}</span>
              <button onClick={() => setYear(y => Math.min(y + 1, now.getFullYear()))}
                className="text-[#3525cd] hover:text-[#4f46e5] disabled:opacity-40"
                disabled={year >= now.getFullYear()}>
                <ChevronRight size={15} />
              </button>
            </div>
          )}

          {viewMode === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <input type="date" className="form-control w-auto" value={customStart}
                max={customEnd || today}
                onChange={e => setCustomStart(e.target.value)} />
              <span className="text-[#777587] text-sm font-medium">to</span>
              <input type="date" className="form-control w-auto" value={customEnd}
                min={customStart} max={today}
                onChange={e => setCustomEnd(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      {/* Custom mode — waiting for dates */}
      {viewMode === 'custom' && !isCustomReady && (
        <div className="empty-state py-12">
          <CheckCircle2 size={36} className="mx-auto mb-2 opacity-30" />
          <p>Select a start and end date to view leave records</p>
        </div>
      )}

      {isCustomReady && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            {stats.map(s => (
              <div key={s.label} className={`card border-t-4 ${variantBorder[s.variant]} p-4`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg mb-3 ${variantIcon[s.variant]}`}>{s.icon}</div>
                <div className="text-2xl font-black text-[#151c27]">{s.value}</div>
                <div className="text-xs text-[#464555] mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Records */}
          <div className="text-sm font-bold text-[#464555] uppercase tracking-wide mb-3">
            Leave Records — {periodLabel}
          </div>
          <div className="flex flex-col gap-3">
            {leaves.length === 0 && absentCount === 0 ? (
              <div className="empty-state">
                <CheckCircle2 size={36} className="mx-auto mb-2 opacity-30" />
                <p>No leave records for {periodLabel}</p>
              </div>
            ) : (
              <>
                {leaves.map(l => (
                  <div key={l.id} className="card p-4 flex items-start gap-3">
                    <Avatar name={emp.name} color={emp.avatar_color} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-sm text-[#151c27]">{emp.name}</span>
                        <LeaveTypeBadge type={l.leave_type} />
                        {l.leave_time === 'half' ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#f0f3ff] text-[#3525cd]">
                            {l.half_type === 'second_half' ? '🌙 Second Half' : '☀️ First Half'}
                          </span>
                        ) : l.leave_time === 'wfh' ? (
                          <StatusBadge status="wfh" />
                        ) : (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#f0f3ff] text-[#464555]">Full Day</span>
                        )}
                        <StatusBadge status={l.status} />
                      </div>
                      <div className="text-xs text-[#464555]">{fmtDateRange(l.start_date, l.end_date)}</div>
                      {l.reason && <div className="text-xs text-[#777587] italic mt-1">"{l.reason}"</div>}
                      {l.approver_name && <div className="text-xs text-[#777587] mt-1">By: {l.approver_name}</div>}
                    </div>
                  </div>
                ))}
                {absentRecords.map(r => (
                  <div key={r.id} className="card p-4 flex items-start gap-3">
                    <Avatar name={emp.name} color={emp.avatar_color} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-sm text-[#151c27]">{emp.name}</span>
                        <StatusBadge status="absent" />
                      </div>
                      <div className="text-xs text-[#464555]">{fmtDate(r.date)}</div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Add / Edit Employee Modal ─────────────────────────────────────────────────
function EmployeeFormModal({ open, onClose, employee, onSaved }) {
  const isEdit = !!employee;
  const toast  = useToast();
  const qc     = useQueryClient();

  const [form, setForm] = useState(() => isEdit ? {
    name:          employee.name,
    email:         employee.email,
    password:      '',
    department:    employee.department || '',
    position:      employee.position   || '',
    role:          employee.role,
    avatar_color:  employee.avatar_color || '#3525cd',
    date_of_birth: employee.date_of_birth || '',
  } : {
    name: '', email: '', password: '', department: '', position: '',
    role: 'employee', avatar_color: '#3525cd', date_of_birth: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        const body = { ...form };
        if (!body.password) delete body.password;
        return apiPut(`/employees/${employee.id}`, body);
      }
      return apiPost('/employees', form);
    },
    onSuccess: () => {
      toast(isEdit ? 'Employee updated!' : 'Employee added!', 'success');
      qc.invalidateQueries({ queryKey: ['employees'] });
      onSaved?.();
      onClose();
    },
    onError: err => toast(err.message, 'error'),
  });

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Employee' : 'Add Employee'} size="lg"
      footer={
        <div className="flex justify-end gap-3">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? <span className="flex gap-2 items-center"><span className="spinner w-4 h-4" /> Saving…</span>
              : isEdit ? 'Save Changes' : 'Add Employee'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Full Name</label>
            <input className="form-control" placeholder="John Doe" value={form.name}
              onChange={e => set('name', e.target.value)} required />
          </div>
          <div>
            <label className="form-label">Email</label>
            <input className="form-control" type="email" placeholder="john@company.com" value={form.email}
              onChange={e => set('email', e.target.value)} required />
          </div>
        </div>

        <div>
          <label className="form-label">
            {isEdit ? 'New Password (leave blank to keep current)' : 'Password'}
          </label>
          <input className="form-control" type="password"
            placeholder={isEdit ? 'Leave blank to keep' : 'Min 6 characters'}
            value={form.password} onChange={e => set('password', e.target.value)}
            required={!isEdit} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Department</label>
            <input className="form-control" placeholder="Engineering" value={form.department}
              onChange={e => set('department', e.target.value)} />
          </div>
          <div>
            <label className="form-label">Position</label>
            <input className="form-control" placeholder="Developer" value={form.position}
              onChange={e => set('position', e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Role</label>
            <select className="form-control" value={form.role} onChange={e => set('role', e.target.value)}>
              <option value="employee">Employee</option>
              <option value="admin">HR Admin</option>
            </select>
          </div>
          <div>
            <label className="form-label">Avatar Color</label>
            <div className="flex gap-2 flex-wrap mt-1">
              {AVATAR_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set('avatar_color', c)}
                  className="w-7 h-7 rounded-full border-2 flex-shrink-0"
                  style={{
                    background: c,
                    borderColor: form.avatar_color === c ? '#3525cd' : 'transparent',
                    outline: form.avatar_color === c ? '2px solid #BAE6FD' : 'none',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="form-label">
            Date of Birth <span className="text-xs text-[#777587]">(for birthday reminders)</span>
          </label>
          <input className="form-control" type="date" value={form.date_of_birth}
            onChange={e => set('date_of_birth', e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

// ── Main Employees Page ───────────────────────────────────────────────────────
export default function Employees() {
  const { user } = useAuth();
  const toast    = useToast();
  const qc       = useQueryClient();

  const [profileEmp,  setProfileEmp]  = useState(null);
  const [addOpen,     setAddOpen]     = useState(false);
  const [editEmp,     setEditEmp]     = useState(null);
  const [confirmDel,  setConfirmDel]  = useState(null); // { id, name }

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn:  () => apiGet('/employees'),
  });

  const deleteMut = useMutation({
    mutationFn: id => apiDelete(`/employees/${id}`),
    onSuccess: (_, id) => {
      const name = employees.find(e => e.id === id)?.name || 'Employee';
      toast(`${name} deleted`, 'warning');
      qc.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: err => toast(err.message, 'error'),
  });

  function handleDelete(emp) {
    setConfirmDel({ id: emp.id, name: emp.name });
  }

  if (profileEmp) {
    return <EmployeeProfile emp={profileEmp} onBack={() => setProfileEmp(null)} />;
  }

  return (
    <div>
      <div className="page-header mb-6">
        <div>
          <div className="page-title">Team Members</div>
          <div className="page-subtitle">{employees.length} total members</div>
        </div>
        <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
          <Plus size={16} /> Add Employee
        </button>
      </div>

      {isLoading ? (
        <div className="loading"><div className="spinner" /> Loading…</div>
      ) : employees.length === 0 ? (
        <div className="empty-state">
          <Users size={36} className="mx-auto mb-2 opacity-30" />
          <p>No employees found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {employees.map(emp => (
            <div
              key={emp.id}
              className={`card p-5 flex flex-col gap-4 ${emp.role !== 'admin' ? 'cursor-pointer hover:shadow-md' : ''}`}
              onClick={() => emp.role !== 'admin' && setProfileEmp(emp)}
            >
              {/* Card header */}
              <div className="flex items-center gap-3">
                <Avatar name={emp.name} color={emp.avatar_color} size={56} />
                <div className="min-w-0">
                  <div className="font-bold text-[#151c27] text-sm truncate">{emp.name}</div>
                  <div className="text-xs text-[#464555] truncate">{emp.position || ''}</div>
                  <RoleBadge role={emp.role} className="mt-1" />
                </div>
              </div>

              {/* Details */}
              <div className="space-y-1.5">
                {emp.department && (
                  <div className="flex items-center gap-2 text-xs text-[#464555]">
                    <Building2 size={13} className="flex-shrink-0" />
                    <span className="truncate">{emp.department}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-[#464555]">
                  <Mail size={13} className="flex-shrink-0" />
                  <span className="truncate">{emp.email}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1 border-t border-[#f0f3ff]" onClick={e => e.stopPropagation()}>
                <button className="btn btn-outline btn-sm flex-1"
                  onClick={() => setEditEmp(emp)}>
                  <Pencil size={13} /> Edit
                </button>
                {emp.id !== user?.id && (
                  <button className="btn btn-danger btn-sm btn-icon"
                    onClick={() => handleDelete(emp)}
                    disabled={deleteMut.isPending}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {addOpen && (
        <EmployeeFormModal open={addOpen} onClose={() => setAddOpen(false)} />
      )}
      {editEmp && (
        <EmployeeFormModal open={!!editEmp} onClose={() => setEditEmp(null)} employee={editEmp} />
      )}
      <ConfirmModal
        open={!!confirmDel}
        title="Delete Employee"
        message={`Delete ${confirmDel?.name}? This will also remove all their attendance and leave records.`}
        confirmLabel="Delete"
        onConfirm={() => { deleteMut.mutate(confirmDel.id); setConfirmDel(null); }}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}
