import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Lock, Unlock, CheckCircle2, AlertCircle, AlertTriangle,
  Clock, ChevronRight, Users, IndianRupee,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { apiGet, apiPost } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { MONTHS } from '@/lib/utils';

const fmt  = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 });
const fmtD = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const STATUS_META = {
  draft:                  { label: 'Draft',               cls: 'bg-[#f0f3ff] text-[#3525cd]', Icon: Clock },
  processing:             { label: 'Processing',          cls: 'bg-amber-50 text-amber-700',   Icon: Clock },
  completed:              { label: 'Completed',           cls: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 },
  completed_with_errors:  { label: 'Completed w/ Errors', cls: 'bg-orange-50 text-orange-700',  Icon: AlertTriangle },
  failed:                 { label: 'Failed',              cls: 'bg-red-50 text-red-700',        Icon: AlertCircle },
  locked:                 { label: 'Locked',              cls: 'bg-slate-100 text-slate-600',   Icon: Lock },
};

const EMP_STATUS_META = {
  success: { label: 'Success', cls: 'text-emerald-600' },
  failed:  { label: 'Failed',  cls: 'text-red-500' },
  pending: { label: 'Pending', cls: 'text-amber-600' },
  skipped: { label: 'Skipped', cls: 'text-slate-400' },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, cls: 'bg-gray-100 text-gray-600', Icon: Clock };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${m.cls}`}>
      <m.Icon size={12} />
      {m.label}
    </span>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className="bg-white border border-[#e2e0f0] rounded-xl p-4">
      <p className="text-[0.65rem] font-black uppercase tracking-widest text-[#777587]">{label}</p>
      <p className={`text-xl font-black mt-1 ${accent || 'text-[#151c27]'}`}>{value}</p>
    </div>
  );
}

export default function PayrollRunDetails() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const toast    = useToast();
  const qc       = useQueryClient();
  const { user } = useAuth();

  const isRootAdmin = user?.role === 'root_admin';
  const basePath    = isRootAdmin ? '/root' : '';

  const { data: run, isLoading, error } = useQuery({
    queryKey: ['payroll-run', id],
    queryFn:  () => apiGet(`/payroll/runs/${id}`),
    enabled:  Boolean(id),
  });

  const lockMut = useMutation({
    mutationFn: () => apiPost(`/payroll/lock/${id}`),
    onSuccess:  () => {
      toast('Payroll run locked', 'success');
      qc.invalidateQueries({ queryKey: ['payroll-run', id] });
      qc.invalidateQueries({ queryKey: ['payroll-runs'] });
    },
    onError: e => toast(e.message, 'error'),
  });

  const unlockMut = useMutation({
    mutationFn: () => apiPost(`/payroll/unlock/${id}`),
    onSuccess:  () => {
      toast('Payroll run unlocked', 'success');
      qc.invalidateQueries({ queryKey: ['payroll-run', id] });
      qc.invalidateQueries({ queryKey: ['payroll-runs'] });
    },
    onError: e => toast(e.message, 'error'),
  });

  const canLock   = run && ['completed', 'completed_with_errors'].includes(run.status);
  const canUnlock = run?.status === 'locked' && isRootAdmin;

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <span className="w-7 h-7 border-2 border-[#3525cd]/20 border-t-[#3525cd] rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="text-center py-24">
        <AlertCircle size={36} className="text-red-400 mx-auto mb-3" />
        <p className="text-sm text-[#777587]">{error?.message || 'Payroll run not found'}</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm text-[#3525cd] font-bold hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const employees = run.employees || [];
  const failed    = employees.filter(e => e.employee_status === 'failed');

  return (
    <div className="space-y-6">
      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => navigate(`${basePath}/payroll/generate`)}
          className="flex items-center gap-1.5 text-[#777587] hover:text-[#3525cd] font-medium transition-colors"
        >
          <ArrowLeft size={15} />
          Payroll Generation
        </button>
        <span className="text-[#c7c4d8]">/</span>
        <span className="font-bold text-[#151c27]">{MONTHS[run.month - 1]} {run.year}</span>
      </div>

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-black text-[#151c27]">{MONTHS[run.month - 1]} {run.year}</h1>
            <StatusBadge status={run.status} />
          </div>
          <p className="text-sm text-[#777587]">
            Generated by {run.generated_by_name || 'System'} ·{' '}
            {new Date(run.generated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            {run.status === 'locked' && run.locked_by_name && (
              <> · Locked by {run.locked_by_name}</>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {canLock && (
            <button
              onClick={() => {
                if (window.confirm('Lock this payroll run? Payslips will become immutable and cannot be regenerated without unlocking first.')) {
                  lockMut.mutate();
                }
              }}
              disabled={lockMut.isPending}
              className="inline-flex items-center gap-2 bg-slate-800 text-white rounded-lg px-4 py-2 text-sm font-bold hover:bg-slate-900 transition-colors disabled:opacity-50"
            >
              {lockMut.isPending ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Lock size={14} />}
              Lock Run
            </button>
          )}
          {canUnlock && (
            <button
              onClick={() => {
                if (window.confirm('Unlock this payroll run? This will allow regeneration of payslips.')) {
                  unlockMut.mutate();
                }
              }}
              disabled={unlockMut.isPending}
              className="inline-flex items-center gap-2 bg-amber-600 text-white rounded-lg px-4 py-2 text-sm font-bold hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {unlockMut.isPending ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Unlock size={14} />}
              Unlock Run
            </button>
          )}
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Employees" value={run.employee_count} />
        <StatCard label="Total Gross"     value={fmt(run.total_gross)} />
        <StatCard label="Total Deductions" value={fmt(run.total_deductions)} accent="text-rose-600" />
        <StatCard label="Total Net Pay"    value={fmt(run.total_net)}  accent="text-emerald-700" />
      </div>

      {/* ── Failed employees alert ── */}
      {failed.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700">{failed.length} employee(s) failed processing</p>
            <ul className="mt-1.5 space-y-0.5">
              {failed.map(e => (
                <li key={e.user_id} className="text-xs text-red-600">
                  <span className="font-bold">{e.name}</span>: {e.error_message || 'Unknown error'}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── Employee Breakdown ── */}
      <div className="bg-white border border-[#e2e0f0] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e2e0f0] flex items-center justify-between">
          <p className="font-black text-[#151c27]">Employee Payslips</p>
          <span className="text-xs text-[#777587]">{employees.length} employees</span>
        </div>
        {employees.length === 0 ? (
          <p className="text-center text-sm text-[#777587] py-12">No employees processed.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f9f9ff] border-b border-[#e2e0f0]">
                {['Employee', 'Gross', 'Deductions', 'Net Pay', 'LOP', 'Status', ''].map(h => (
                  <th key={h} className={`text-[0.65rem] font-black uppercase tracking-widest text-[#777587] px-4 py-2.5 ${h === '' ? '' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0eef8]">
              {employees.map(emp => {
                const em = EMP_STATUS_META[emp.employee_status] || { label: emp.employee_status, cls: 'text-gray-500' };
                const canView = emp.employee_status === 'success' && emp.payslip_id;
                return (
                  <tr
                    key={emp.user_id}
                    className={`hover:bg-[#f9f9ff] ${canView ? 'cursor-pointer' : ''}`}
                    onClick={() => canView && navigate(`${basePath}/payroll/payslips/${emp.payslip_id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={emp.name} size={28} color={emp.avatar_color} />
                        <div>
                          <p className="font-bold text-[#151c27] text-xs">{emp.name}</p>
                          <p className="text-[0.65rem] text-[#777587]">{emp.department || emp.employee_id || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-[#151c27]">
                      {emp.gross_salary != null ? fmtD(emp.gross_salary) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-rose-600 font-bold">
                      {emp.total_deductions != null ? fmtD(emp.total_deductions) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs font-black text-emerald-700">
                      {emp.net_salary != null ? fmtD(emp.net_salary) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#777587]">
                      {emp.lop_days != null ? emp.lop_days : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-bold ${em.cls}`}>{em.label}</span>
                        {emp.locked && <Lock size={10} className="text-slate-400" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canView && <ChevronRight size={14} className="text-[#c7c4d8] ml-auto" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
