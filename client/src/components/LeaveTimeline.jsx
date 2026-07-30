/**
 * LeaveTimeline — shows the approval stage of a leave request.
 * Used in MyLeaves (employee view) and DeptHeadApprovals.
 */

import React from 'react';
import { CheckCircle2, Clock, XCircle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_LABELS = {
  pending:      'Pending Review',
  pending_dept: 'Pending Department Approval',
  pending_root: 'Pending Final Approval',
  approved:     'Approved',
  rejected:     'Rejected',
  cancelled:    'Cancelled',
};

export function StatusBadge({ status, small = false }) {
  const cfg = {
    pending:      { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-400' },
    pending_dept: { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-400' },
    pending_root: { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200',  dot: 'bg-violet-400' },
    approved:     { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-400' },
    rejected:     { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-400' },
    cancelled:    { bg: 'bg-slate-50',   text: 'text-slate-600',   border: 'border-slate-200',   dot: 'bg-slate-400' },
  }[status] || { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', dot: 'bg-slate-400' };

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 font-bold rounded-full border',
      cfg.bg, cfg.text, cfg.border,
      small ? 'text-[0.6rem] px-1.5 py-0.5' : 'text-xs px-2.5 py-1'
    )}>
      <span className={cn('rounded-full flex-shrink-0', cfg.dot, small ? 'w-1.5 h-1.5' : 'w-2 h-2')} />
      {STATUS_LABELS[status] || status}
    </span>
  );
}

// Shows a 3-step progress bar for new-flow leaves (pending_dept / pending_root / final).
// Falls back silently for old 'pending' leaves.
export function LeaveTimeline({ leave }) {
  const { status, dept_head_status, root_admin_status } = leave;

  // Only render timeline for new-flow leaves
  if (!['pending_dept', 'pending_root', 'approved', 'rejected'].includes(status)) return null;

  // Old leaves approved/rejected before the two-tier system have both tracking cols as 'pending'.
  // Treat them as fully complete rather than showing wrong pending states.
  const isOldFlow = (status === 'approved' || status === 'rejected')
    && dept_head_status === 'pending'
    && root_admin_status === 'pending';

  const deptDone     = dept_head_status === 'approved' || isOldFlow;
  const rootDone     = root_admin_status === 'approved' || (isOldFlow && status === 'approved');
  const rootRejected = root_admin_status === 'rejected' || status === 'rejected';

  const steps = [
    {
      label:  'Submitted',
      done:   true,
      active: false,
    },
    {
      label:    'Department Head',
      sublabel: deptDone ? 'Approved & Forwarded' : 'Pending Review',
      done:     deptDone,
      active:   status === 'pending_dept',
      rejected: false,
    },
    {
      label:    'Root Admin',
      sublabel: rootDone    ? 'Approved'
               : rootRejected ? 'Rejected'
               : 'Pending Final Decision',
      done:     rootDone,
      active:   status === 'pending_root',
      rejected: rootRejected,
    },
  ];

  return (
    <div className="flex items-center gap-1 mt-2">
      {steps.map((step, i) => (
        <React.Fragment key={i}>
          <div className="flex flex-col items-center min-w-0">
            {/* Circle */}
            <div className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border-2',
              step.rejected
                ? 'bg-rose-100 border-rose-400 text-rose-600'
                : step.done
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : step.active
                    ? 'bg-[#3525cd] border-[#3525cd] text-white'
                    : 'bg-white border-[#c7c4d8] text-[#c7c4d8]'
            )}>
              {step.rejected
                ? <XCircle size={12} />
                : step.done || i === 0
                  ? <CheckCircle2 size={12} />
                  : step.active
                    ? <Clock size={11} />
                    : <span className="w-2 h-2 rounded-full bg-[#c7c4d8]" />
              }
            </div>
            {/* Label */}
            <p className={cn(
              'text-[0.58rem] font-bold mt-0.5 text-center leading-tight max-w-[60px]',
              step.rejected ? 'text-rose-600'
              : step.done ? 'text-emerald-600'
              : step.active ? 'text-[#3525cd]'
              : 'text-[#c7c4d8]'
            )}>
              {step.label}
            </p>
          </div>
          {i < steps.length - 1 && (
            <div className={cn(
              'flex-1 h-0.5 min-w-[12px] mx-0.5 rounded-full',
              step.done ? 'bg-emerald-400' : 'bg-[#e7eefe]'
            )} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
