import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardCheck, CheckCircle2, Clock, Users, ChevronRight,
  AlertCircle, FileText, Calendar,
} from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/utils';

// Fallback map for common types — used when leave_policies haven't loaded yet.
const LEAVE_TYPE_LABELS_FALLBACK = {
  annual: 'Annual Leave', casual: 'Casual Leave', sick: 'Sick Leave', emergency: 'Emergency Leave',
  maternity: 'Maternity Leave', paternity: 'Paternity Leave', bereavement: 'Bereavement Leave',
  comp_off: 'Comp Off', earned: 'Earned Leave', unpaid: 'Unpaid Leave', other: 'Other Leave',
};

// policyMap: { [leave_type]: label } built from live leave_policies data.
function leaveLabel(type, policyMap = {}) {
  return policyMap[type] || LEAVE_TYPE_LABELS_FALLBACK[type] || (type ? type.replace(/_/g, ' ') : 'Leave');
}

function Avatar({ name = '', color }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center text-[0.72rem] font-black text-white flex-shrink-0 border-2 border-white shadow-sm"
      style={{ background: color || '#3525cd' }}>
      {initials}
    </div>
  );
}

function ConfirmModal({ leave, onConfirm, onCancel, loading, policyMap = {} }) {
  const empName  = leave.name || 'Employee';
  const leaveStr = `${leaveLabel(leave.leave_type, policyMap)} — ${leave.start_date}${leave.start_date !== leave.end_date ? ` to ${leave.end_date}` : ''}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(4,6,14,.6)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-[#c7c4d8] p-6">
        <div className="w-12 h-12 rounded-2xl bg-[#3525cd]/10 flex items-center justify-center mx-auto mb-4">
          <ClipboardCheck size={22} className="text-[#3525cd]" />
        </div>
        <h3 className="text-center font-black text-[#151c27] mb-1 text-base">Forward for Final Approval</h3>
        <p className="text-center text-sm text-[#777587] mb-5">
          Forward <strong className="text-[#151c27]">{empName}</strong>'s {leaveStr} to the Root Admin for final decision?
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-5 text-xs text-blue-700 font-semibold">
          Once forwarded, the leave goes to the Root Admin. You cannot undo this action.
        </div>
        <div className="flex gap-2.5">
          <button onClick={onCancel}
            className="flex-1 border border-[#c7c4d8] rounded-xl py-2.5 text-sm font-semibold text-[#464555] hover:bg-[#f0f3ff]">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 bg-[#3525cd] text-white rounded-xl py-2.5 text-sm font-bold hover:bg-[#2a1fb0] disabled:opacity-60">
            {loading ? 'Forwarding…' : 'Forward to Root Admin'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LeaveCard({ leave, onApprove, busy, policyMap = {} }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [approving, setApproving]     = useState(false);

  const empName = leave.name || 'Employee';
  const isHalf  = leave.leave_time === 'half';
  const dateStr = leave.start_date === leave.end_date
    ? leave.start_date
    : `${leave.start_date} → ${leave.end_date}`;

  async function handleConfirm() {
    setApproving(true);
    await onApprove(leave.id);
    setApproving(false);
    setShowConfirm(false);
  }

  return (
    <>
      <div className="bg-white border border-[#e7eefe] rounded-xl p-4 hover:border-[#3525cd]/30 hover:shadow-sm transition-all">
        {/* Employee row */}
        <div className="flex items-start gap-3">
          <Avatar name={empName} color={leave.avatar_color} />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[0.9rem] text-[#151c27] truncate">{empName}</p>
            <p className="text-xs text-[#777587] truncate">{leave.department || leave.position || 'Employee'}</p>
          </div>
          <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0">
            <Clock size={10} /> Pending Dept Approval
          </span>
        </div>

        {/* Leave details */}
        <div className="mt-3 pt-3 border-t border-[#f0f3ff] grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1.5 text-xs text-[#464555]">
            <FileText size={12} className="text-[#777587]" />
            <span className="font-semibold">{leaveLabel(leave.leave_type, policyMap)}</span>
            {isHalf && <span className="text-[0.6rem] bg-amber-50 text-amber-600 px-1 rounded">Half Day</span>}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#464555]">
            <Calendar size={12} className="text-[#777587]" />
            <span>{dateStr}</span>
          </div>
        </div>

        {leave.reason && (
          <p className="mt-2 text-xs text-[#777587] bg-[#f9f9ff] rounded-lg px-3 py-2 line-clamp-2 border border-[#f0f3ff]">
            {leave.reason}
          </p>
        )}

        {/* Applied date + action */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[0.68rem] text-[#777587]">
            Applied {new Date(leave.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={busy || approving}
            className="flex items-center gap-1.5 bg-[#3525cd] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#2a1fb0] transition-colors disabled:opacity-60"
          >
            <ChevronRight size={14} /> Forward to Root Admin
          </button>
        </div>
      </div>

      {showConfirm && (
        <ConfirmModal
          leave={{ ...leave, name: empName }}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
          loading={approving}
          policyMap={policyMap}
        />
      )}
    </>
  );
}

export default function DeptHeadApprovals() {
  const qc   = useQueryClient();
  const toast = useToast();

  const { data: pending = [], isLoading, isError } = useQuery({
    queryKey: ['dept-pending-leaves'],
    queryFn:  () => apiGet('/leaves/pending-department'),
    refetchInterval: 30000,
  });

  // Build dynamic label map from live leave policies — falls back to LEAVE_TYPE_LABELS_FALLBACK
  const { data: leavePolicies = [] } = useQuery({
    queryKey: ['leave-policies'],
    queryFn:  () => apiGet('/leave-policies'),
    staleTime: 10 * 60 * 1000,
  });
  const policyMap = Object.fromEntries(
    leavePolicies.map(p => [p.leave_type, p.label]).filter(([k]) => !!k)
  );

  const { data: deptInfo } = useQuery({
    queryKey: ['is-dept-head'],
    queryFn:  () => apiGet('/leaves/is-dept-head'),
  });

  const approveMut = useMutation({
    mutationFn: (id) => apiPost(`/leaves/${id}/department-approve`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dept-pending-leaves'] });
      toast('Leave forwarded to Root Admin for final approval.', 'success');
    },
    onError: (err) => toast(err.message, 'error'),
  });

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle size={32} className="text-rose-400 mb-3" />
        <p className="font-bold text-[#151c27] mb-1">Failed to load</p>
        <button onClick={() => window.location.reload()} className="text-[#3525cd] text-sm font-bold hover:underline mt-2">Retry</button>
      </div>
    );
  }

  // Guard: only department heads should see this page
  if (deptInfo && deptInfo.is_dept_head === false) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center max-w-sm mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-[#f0f3ff] flex items-center justify-center mx-auto mb-4">
          <AlertCircle size={26} className="text-[#3525cd]" />
        </div>
        <h2 className="text-base font-black text-[#151c27] mb-1">Not a Department Head</h2>
        <p className="text-sm text-[#777587]">
          This page is only accessible to employees who are assigned as the head of a department.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl bg-[#3525cd]/10 flex items-center justify-center">
            <ClipboardCheck size={17} className="text-[#3525cd]" />
          </div>
          <h1 className="text-xl font-black text-[#151c27]">Team Leave Approvals</h1>
        </div>
        {deptInfo?.department_name && (
          <p className="text-sm text-[#777587] ml-10.5">
            Department Head — <span className="font-semibold text-[#464555]">{deptInfo.department_name}</span>
          </p>
        )}
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <AlertCircle size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-700">
          <p className="font-bold mb-0.5">Your role in the approval flow</p>
          <p>You can forward leave requests from your team to the Root Admin. Only the Root Admin can give final approval or rejection. You cannot reject a leave request.</p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-[#e7eefe] rounded-xl p-4">
          <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center mb-2">
            <Clock size={16} className="text-blue-600" />
          </div>
          <p className="text-2xl font-black text-[#151c27]">{pending.length}</p>
          <p className="text-xs text-[#777587] font-medium mt-0.5">Pending Your Review</p>
        </div>
        <div className="bg-white border border-[#e7eefe] rounded-xl p-4">
          <div className="w-8 h-8 rounded-xl bg-[#f0f3ff] flex items-center justify-center mb-2">
            <Users size={16} className="text-[#3525cd]" />
          </div>
          <p className="text-2xl font-black text-[#151c27]">
            {new Set(pending.map(l => l.user_id)).size}
          </p>
          <p className="text-xs text-[#777587] font-medium mt-0.5">Team Members</p>
        </div>
      </div>

      {/* Leave cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white border border-[#e7eefe] rounded-xl p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#f0f3ff]" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-[#f0f3ff] rounded" />
                  <div className="h-3 w-20 bg-[#f0f3ff] rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : pending.length === 0 ? (
        <div className="bg-white border border-[#e7eefe] rounded-2xl py-16 text-center">
          <CheckCircle2 size={40} className="mx-auto mb-3 text-emerald-400" />
          <p className="font-bold text-[#464555] mb-1">No pending leave requests</p>
          <p className="text-sm text-[#777587]">Your team has no leave requests waiting for your review.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map(leave => (
            <LeaveCard
              key={leave.id}
              leave={leave}
              onApprove={(id) => approveMut.mutateAsync(id)}
              busy={approveMut.isPending}
              policyMap={policyMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}
