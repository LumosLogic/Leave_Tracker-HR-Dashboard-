import React from 'react';
import { cn } from '@/lib/utils';

const STATUS_CLASS = {
  pending:    'badge-pending',
  approved:   'badge-approved',
  rejected:   'badge-rejected',
  cancelled:  'badge-cancelled',
  present:    'badge-present',
  absent:     'badge-absent',
  on_leave:   'badge-on_leave',
  half_day:   'badge-half_day',
  late:       'badge-late',
  early_exit: 'badge-early_exit',
  wfh:        'badge-wfh',
};

const LEAVE_CLASS = {
  sick:       'leave-badge-sick',
  annual:     'leave-badge-annual',
  casual:     'leave-badge-casual',
  maternity:  'leave-badge-maternity',
  paternity:  'leave-badge-paternity',
};

export function StatusBadge({ status, className }) {
  return (
    <span className={cn('badge', STATUS_CLASS[status] || 'badge-cancelled', className)}>
      {status?.replace('_', ' ') || '—'}
    </span>
  );
}

export function LeaveTypeBadge({ type, className }) {
  return (
    <span className={cn('leave-badge', LEAVE_CLASS[type] || 'leave-badge-default', className)}>
      {type}
    </span>
  );
}

export function RoleBadge({ role, className }) {
  const cls = role === 'admin'
    ? 'bg-[#f0f3ff] text-[#3525cd] border border-[#c7c4d8]'
    : 'bg-emerald-50 text-emerald-800 border border-emerald-200';
  return (
    <span className={cn('text-[0.62rem] font-black px-2 py-0.5 rounded-full uppercase tracking-widest', cls, className)}>
      {role}
    </span>
  );
}
