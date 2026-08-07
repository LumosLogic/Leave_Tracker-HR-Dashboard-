/**
 * LeaveTimeline — dynamic multi-level approval timeline.
 *
 * For new workflow leaves (leave.workflow_id is set):
 *   Renders one stage per level in the org's workflow, driven by the
 *   approval history (from GET /leaves/:id/history).
 *
 * For legacy leaves (no workflow_id):
 *   Falls back to the original 3-step hardcoded display.
 */

import React from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Status badge map ──────────────────────────────────────────────────────────
export const STATUS_LABELS = {
  pending:          'Pending Review',
  pending_dept:     'Pending Dept. Approval',
  pending_root:     'Pending Final Approval',
  pending_approval: 'Pending Approval',
  approved:         'Approved',
  rejected:         'Rejected',
  cancelled:        'Cancelled',
  withdrawn:        'Withdrawn',
};

export function StatusBadge({ status, small = false }) {
  const cfg = {
    pending:          { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-400'   },
    pending_dept:     { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-400'    },
    pending_root:     { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200',  dot: 'bg-violet-400'  },
    pending_approval: { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500'    },
    approved:         { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-400' },
    rejected:         { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-400'    },
    cancelled:        { bg: 'bg-slate-50',   text: 'text-slate-600',   border: 'border-slate-200',   dot: 'bg-slate-400'   },
    withdrawn:        { bg: 'bg-slate-50',   text: 'text-slate-500',   border: 'border-slate-200',   dot: 'bg-slate-300'   },
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

// ── Step circle ───────────────────────────────────────────────────────────────
function StepCircle({ done, active, rejected }) {
  return (
    <div className={cn(
      'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border-2',
      rejected
        ? 'bg-rose-100 border-rose-400 text-rose-600'
        : done
          ? 'bg-emerald-500 border-emerald-500 text-white'
          : active
            ? 'bg-[#3525cd] border-[#3525cd] text-white'
            : 'bg-white border-[#c7c4d8] text-[#c7c4d8]'
    )}>
      {rejected
        ? <XCircle size={12} />
        : done
          ? <CheckCircle2 size={12} />
          : active
            ? <Clock size={11} />
            : <span className="w-2 h-2 rounded-full bg-[#c7c4d8]" />
      }
    </div>
  );
}

// ── New workflow timeline ─────────────────────────────────────────────────────
// orgWorkflow = { levels: [{ level_number, role_type, level_label }] }
// history     = [{ action, level, actor_name, created_at, notes }]
function WorkflowTimeline({ leave, orgWorkflow, history = [] }) {
  const levels = orgWorkflow?.levels || [];
  const isTerminal = ['approved','rejected','cancelled','withdrawn'].includes(leave.status);
  const isRejected  = leave.status === 'rejected';
  const isApproved  = leave.status === 'approved';

  // Build steps: Submitted + one per level + final outcome
  const steps = [
    {
      label:    'Submitted',
      sublabel: history.find(h => h.action === 'submitted')
        ? new Date(history.find(h => h.action === 'submitted').created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        : '',
      done:     true,
      active:   false,
      rejected: false,
    },
    ...levels.map(level => {
      const approvedEntry = history.find(
        h => h.level === level.level_number &&
          (h.action.endsWith('_approved') || h.action === `level_${level.level_number}_approved`)
      );
      const rejectedEntry = history.find(
        h => h.level === level.level_number &&
          (h.action.endsWith('_rejected') || h.action === `level_${level.level_number}_rejected`)
      );
      const skippedEntry = history.find(
        h => h.level === level.level_number && h.action.endsWith('_skipped')
      );

      const isDone     = !!approvedEntry || !!skippedEntry || (isApproved && !rejectedEntry);
      const isRej      = !!rejectedEntry;
      const isActive   = !isTerminal && leave.current_level === level.level_number;

      return {
        label:    level.level_label || level.role_type.replace(/_/g, ' '),
        sublabel: isRej      ? `Rejected${rejectedEntry?.actor_name ? ' by ' + rejectedEntry.actor_name : ''}`
                : skippedEntry ? 'Skipped (no approver)'
                : approvedEntry ? `Approved${approvedEntry?.actor_name ? ' by ' + approvedEntry.actor_name : ''}`
                : isActive  ? 'Awaiting approval'
                : 'Pending',
        done:     isDone && !isRej,
        active:   isActive,
        rejected: isRej,
      };
    }),
  ];

  // Final outcome step
  if (isApproved) {
    steps.push({ label: 'Approved', sublabel: 'Attendance updated', done: true, active: false, rejected: false });
  } else if (isRejected) {
    const rejEntry = history.find(h => h.action.endsWith('_rejected'));
    steps.push({ label: 'Rejected', sublabel: rejEntry?.notes ? `Reason: ${rejEntry.notes}` : '', done: false, active: false, rejected: true });
  } else if (leave.status === 'withdrawn') {
    steps.push({ label: 'Withdrawn', sublabel: 'By employee', done: false, active: false, rejected: true });
  }

  return <TimelineRenderer steps={steps} />;
}

// ── Legacy 3-step timeline (no workflow_id) ───────────────────────────────────
function LegacyTimeline({ leave }) {
  const { status, dept_head_status, root_admin_status } = leave;
  if (!['pending_dept','pending_root','approved','rejected'].includes(status)) return null;

  const isOldFlow = (status === 'approved' || status === 'rejected')
    && dept_head_status === 'pending'
    && root_admin_status === 'pending';

  const deptDone     = dept_head_status === 'approved' || isOldFlow;
  const rootDone     = root_admin_status === 'approved' || (isOldFlow && status === 'approved');
  const rootRejected = root_admin_status === 'rejected' || status === 'rejected';

  const steps = [
    { label: 'Submitted', sublabel: '', done: true, active: false, rejected: false },
    {
      label: 'Department Head', sublabel: deptDone ? 'Approved & Forwarded' : 'Pending Review',
      done: deptDone, active: status === 'pending_dept', rejected: false,
    },
    {
      label: 'Root Admin', sublabel: rootDone ? 'Approved' : rootRejected ? 'Rejected' : 'Pending Final Decision',
      done: rootDone, active: status === 'pending_root', rejected: rootRejected,
    },
  ];

  return <TimelineRenderer steps={steps} />;
}

// ── Shared renderer ───────────────────────────────────────────────────────────
function TimelineRenderer({ steps }) {
  return (
    <div className="flex items-start gap-1 mt-2 flex-wrap">
      {steps.map((step, i) => (
        <React.Fragment key={i}>
          <div className="flex flex-col items-center min-w-0">
            <StepCircle done={step.done} active={step.active} rejected={step.rejected} />
            <p className={cn(
              'text-[0.58rem] font-bold mt-0.5 text-center leading-tight max-w-[60px]',
              step.rejected ? 'text-rose-600'
              : step.done   ? 'text-emerald-600'
              : step.active ? 'text-[#3525cd]'
              : 'text-[#c7c4d8]'
            )}>
              {step.label}
            </p>
            {step.sublabel && (
              <p className={cn(
                'text-[0.5rem] text-center leading-tight max-w-[60px] mt-0.5',
                step.rejected ? 'text-rose-400'
                : step.done   ? 'text-emerald-500'
                : step.active ? 'text-[#3525cd]/70'
                : 'text-[#c7c4d8]'
              )}>
                {step.sublabel}
              </p>
            )}
          </div>
          {i < steps.length - 1 && (
            <div className={cn(
              'flex-1 h-0.5 min-w-[10px] mx-0.5 mt-3 rounded-full',
              step.done ? 'bg-emerald-400' : 'bg-[#e7eefe]'
            )} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
// Props:
//   leave       — leave record (must include workflow_id, current_level, status)
//   orgWorkflow — { levels: [...] } from GET /leaves/workflow-config (optional)
//   history     — array from GET /leaves/:id/history (optional, for richer sublabels)
export function LeaveTimeline({ leave, orgWorkflow, history }) {
  if (!leave) return null;

  // New workflow
  if (leave.workflow_id && orgWorkflow) {
    return <WorkflowTimeline leave={leave} orgWorkflow={orgWorkflow} history={history || []} />;
  }

  // Legacy (old leaves without workflow_id)
  return <LegacyTimeline leave={leave} />;
}
