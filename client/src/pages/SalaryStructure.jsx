import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DollarSign, Plus, Clock, ChevronRight, CheckCircle2,
  AlertCircle, Search, History, X, TrendingUp, TrendingDown,
  Users, IndianRupee,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { cn, fmtDate } from '@/lib/utils';

const fmt  = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 });
const fmtD = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const EMPTY_FORM = {
  effective_from: new Date().toISOString().split('T')[0],
  ctc_override: '',
  basic: '', hra: '', da: '', transport_allowance: '',
  medical_allowance: '', special_allowance: '', other_allowance: '',
  employee_pf: '', employee_esi: '', professional_tax: '', tds: '', other_deductions: '', retention: '',
  employer_pf: '', employer_esi: '',
  notes: '',
};

// ── Salary Form Modal ─────────────────────────────────────────────────────────
function SalaryModal({ employee, onClose }) {
  const toast = useToast();
  const qc    = useQueryClient();
  const isRevising = !!employee.salary_id;

  const [form, setForm] = useState({
    ...EMPTY_FORM,
    user_id: employee.id,
    // Pre-fill from existing salary if revising
    ...(isRevising ? {
      basic: employee.basic || '',
      hra: employee.hra || '',
      da: employee.da || '',
      transport_allowance: employee.transport_allowance || '',
      medical_allowance: employee.medical_allowance || '',
      special_allowance: employee.special_allowance || '',
      other_allowance: employee.other_allowance || '',
      employee_pf: employee.employee_pf || '',
      employee_esi: employee.employee_esi || '',
      professional_tax: employee.professional_tax || '',
      tds: employee.tds || '',
      other_deductions: employee.other_deductions || '',
      retention: employee.retention || '',
      employer_pf: employee.employer_pf || '',
      employer_esi: employee.employer_esi || '',
      notes: employee.notes || '',
    } : {}),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const num = k => Number(form[k] || 0);

  const gross = num('basic') + num('hra') + num('da') +
    num('transport_allowance') + num('medical_allowance') +
    num('special_allowance') + num('other_allowance');
  const empDed = num('employee_pf') + num('employee_esi') +
    num('professional_tax') + num('tds') + num('other_deductions') + num('retention');
  const empContrib = num('employer_pf') + num('employer_esi');
  const netEstimate = Math.max(0, gross - empDed);
  const ctc = gross + empContrib;

  const mut = useMutation({
    mutationFn: () => apiPost('/payroll/salary-structures', {
      ...form,
      user_id: employee.id,
      basic: num('basic'), hra: num('hra'), da: num('da'),
      transport_allowance: num('transport_allowance'),
      medical_allowance: num('medical_allowance'),
      special_allowance: num('special_allowance'),
      other_allowance: num('other_allowance'),
      employee_pf: num('employee_pf'), employee_esi: num('employee_esi'),
      professional_tax: num('professional_tax'), tds: num('tds'),
      other_deductions: num('other_deductions'), retention: num('retention'),
      employer_pf: num('employer_pf'), employer_esi: num('employer_esi'),
      ctc_override: form.ctc_override ? Number(form.ctc_override) : null,
    }),
    onSuccess: () => {
      toast('Salary structure saved', 'success');
      qc.invalidateQueries({ queryKey: ['payroll-employees'] });
      onClose();
    },
    onError: e => toast(e.message, 'error'),
  });

  const field = (label, key, placeholder = '0') => (
    <div key={key}>
      <label className="block text-[0.7rem] font-bold text-[#464555] mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] text-xs">₹</span>
        <input
          type="number" min={0} step="0.01"
          placeholder={placeholder}
          value={form[key]}
          onChange={e => set(key, e.target.value)}
          className="w-full border border-[#c7c4d8] rounded-lg pl-6 pr-3 py-2 text-sm text-[#151c27] focus:outline-none focus:border-[#3525cd] focus:ring-1 focus:ring-[#3525cd]/20"
        />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(4,6,14,.55)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-[#c7c4d8] max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e7eefe] flex-shrink-0">
          <div className="flex items-center gap-3">
            <Avatar name={employee.name} color={employee.avatar_color} size={34} />
            <div>
              <h2 className="font-black text-[#151c27] text-sm">
                {isRevising ? 'Revise Salary' : 'Set Salary Structure'}
              </h2>
              <p className="text-xs text-[#777587]">{employee.name} · {employee.department || 'No Department'}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[#f0f3ff] flex items-center justify-center">
            <X size={16} className="text-[#777587]" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

          {/* Previous Salary Banner (Revise mode only) */}
          {isRevising && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-[0.65rem] font-black uppercase tracking-widest text-amber-700 mb-2">
                Previous Salary (will be superseded)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {[
                  ['Basic', employee.basic],
                  ['HRA', employee.hra],
                  ['DA', employee.da],
                  ['Transport', employee.transport_allowance],
                  ['Medical', employee.medical_allowance],
                  ['Special', employee.special_allowance],
                  ['Other Allow.', employee.other_allowance],
                  ['Gross', employee.gross_salary],
                ].filter(([, v]) => Number(v) > 0).map(([label, val]) => (
                  <div key={label} className="flex justify-between gap-1">
                    <span className="text-amber-600">{label}</span>
                    <span className="font-bold text-amber-900">{fmt(val)}</span>
                  </div>
                ))}
              </div>
              {employee.gross_salary ? (
                <p className="text-[0.6rem] text-amber-600 mt-2">
                  CTC: {fmt(employee.ctc)}/mo · Effective {fmtDate(employee.effective_from)}
                </p>
              ) : null}
            </div>
          )}

          {/* CTC Override */}
          <div>
            <label className="block text-[0.7rem] font-bold text-[#464555] mb-1">
              CTC (Total Cost to Company) <span className="font-normal text-[#9ca3af]">— optional override</span>
            </label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] text-xs">₹</span>
              <input
                type="number" min={0} step="1"
                placeholder="e.g. 50000"
                value={form.ctc_override}
                onChange={e => set('ctc_override', e.target.value)}
                className="w-full border border-[#c7c4d8] rounded-lg pl-6 pr-3 py-2 text-sm text-[#151c27] focus:outline-none focus:border-[#3525cd] focus:ring-1 focus:ring-[#3525cd]/20"
              />
            </div>
            <p className="text-[0.65rem] text-[#9ca3af] mt-1">
              Enter total CTC directly (e.g. ₹50,000). Leave blank to use the computed value from earnings + employer contributions below.
            </p>
          </div>

          {/* Effective Date */}
          <div>
            <label className="block text-[0.7rem] font-bold text-[#464555] mb-1">Effective From *</label>
            <input type="date" value={form.effective_from}
              onChange={e => set('effective_from', e.target.value)}
              className="border border-[#c7c4d8] rounded-lg px-3 py-2 text-sm text-[#151c27] focus:outline-none focus:border-[#3525cd] focus:ring-1 focus:ring-[#3525cd]/20"
            />
            <p className="text-[0.65rem] text-[#9ca3af] mt-1">
              Previous salary (if any) will be closed on the day before this date.
            </p>
          </div>

          {/* Earnings */}
          <div>
            <p className="text-[0.68rem] font-black uppercase tracking-widest text-[#777587] mb-3">
              Earnings (₹ / month)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {field('Basic *', 'basic')}
              {field('HRA', 'hra')}
              {field('Dearness Allowance', 'da')}
              {field('Transport Allowance', 'transport_allowance')}
              {field('Medical Allowance', 'medical_allowance')}
              {field('Special Allowance', 'special_allowance')}
              {field('Other Allowance', 'other_allowance')}
            </div>
            <div className="mt-3 flex items-center justify-end gap-2 bg-emerald-50 rounded-lg px-3 py-2">
              <TrendingUp size={14} className="text-emerald-500" />
              <span className="text-sm font-black text-emerald-700">Gross: {fmtD(gross)}</span>
            </div>
          </div>

          {/* Employee Deductions */}
          <div>
            <p className="text-[0.68rem] font-black uppercase tracking-widest text-[#777587] mb-3">
              Employee Deductions (₹ / month)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {field('PF (Employee)', 'employee_pf')}
              {field('ESI (Employee)', 'employee_esi')}
              {field('Professional Tax', 'professional_tax')}
              {field('TDS', 'tds')}
              {field('Retention', 'retention')}
              {field('Other Deductions', 'other_deductions')}
            </div>
            <div className="mt-3 flex items-center justify-between bg-rose-50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <TrendingDown size={14} className="text-rose-500" />
                <span className="text-sm font-bold text-rose-600">Deductions: {fmtD(empDed)}</span>
              </div>
              <span className="text-sm font-black text-[#151c27]">Est. Net: {fmtD(netEstimate)}</span>
            </div>
          </div>

          {/* Employer Contributions */}
          <div>
            <p className="text-[0.68rem] font-black uppercase tracking-widest text-[#777587] mb-3">
              Employer Contributions (₹ / month)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {field('PF (Employer)', 'employer_pf')}
              {field('ESI (Employer)', 'employer_esi')}
            </div>
            <div className="mt-3 flex items-center justify-end gap-2 bg-blue-50 rounded-lg px-3 py-2">
              <span className="text-sm font-bold text-blue-700">CTC / month: {fmtD(ctc)}</span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[0.7rem] font-bold text-[#464555] mb-1">Notes (optional)</label>
            <input className="w-full border border-[#c7c4d8] rounded-lg px-3 py-2 text-sm text-[#151c27] focus:outline-none focus:border-[#3525cd] focus:ring-1 focus:ring-[#3525cd]/20"
              placeholder="e.g. Revised per appraisal Apr 2026"
              value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#e7eefe] flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2.5 border border-[#c7c4d8] rounded-xl text-sm font-semibold text-[#464555] hover:bg-[#f0f3ff] transition-colors">
            Cancel
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !form.basic}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#3525cd] text-white rounded-xl text-sm font-bold hover:bg-[#2a1fb0] disabled:opacity-60 transition-colors">
            {mut.isPending
              ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
              : <><Plus size={14} /> {isRevising ? 'Revise Salary' : 'Save Structure'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── History Modal ─────────────────────────────────────────────────────────────
function HistoryModal({ employee, onClose }) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['salary-history', employee.id],
    queryFn: () => apiGet(`/payroll/salary-structures/history/${employee.id}`),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(4,6,14,.55)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl border border-[#c7c4d8] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e7eefe] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <History size={16} className="text-[#3525cd]" />
            <h2 className="font-black text-[#151c27] text-sm">Salary History — {employee.name}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[#f0f3ff] flex items-center justify-center">
            <X size={16} className="text-[#777587]" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-[#3525cd]/30 border-t-[#3525cd] rounded-full animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-10">
              <History size={32} className="text-[#c7c4d8] mx-auto mb-2" />
              <p className="text-sm text-[#777587]">No salary history yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((h, i) => (
                <div key={h.id} className={cn(
                  'rounded-xl border p-4',
                  h.effective_to === null
                    ? 'border-[#3525cd]/30 bg-[#f0f3ff]'
                    : 'border-[#e7eefe] bg-white'
                )}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full',
                        h.effective_to === null
                          ? 'bg-[#3525cd] text-white'
                          : 'bg-slate-100 text-slate-600'
                      )}>
                        {h.effective_to === null ? 'Active' : 'Past'}
                      </span>
                      <span className="text-xs font-semibold text-[#151c27]">
                        {fmtDate(h.effective_from)}
                        {h.effective_to && ` → ${fmtDate(h.effective_to)}`}
                        {!h.effective_to && ' → Present'}
                      </span>
                    </div>
                    <span className="text-sm font-black text-[#3525cd]">{fmt(h.gross_salary)}/mo</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {[
                      ['Basic', h.basic], ['HRA', h.hra], ['DA', h.da],
                      ['Transport', h.transport_allowance], ['Medical', h.medical_allowance],
                      ['Special', h.special_allowance], ['Other', h.other_allowance],
                    ].filter(([, v]) => Number(v) > 0).map(([label, val]) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-[#777587]">{label}</span>
                        <span className="font-semibold text-[#151c27]">{fmt(val)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#e7eefe]">
                    <span className="text-[0.65rem] text-[#9ca3af]">
                      CTC: {fmt(h.ctc)}/mo
                      {h.created_by_name && ` · By ${h.created_by_name}`}
                    </span>
                    {h.notes && (
                      <span className="text-[0.65rem] italic text-[#777587] max-w-[60%] truncate">
                        {h.notes}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SalaryStructure() {
  const toast = useToast();
  const [search,      setSearch]      = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [editEmp,     setEditEmp]     = useState(null);
  const [historyEmp,  setHistoryEmp]  = useState(null);

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['payroll-employees'],
    queryFn: () => apiGet('/payroll/employees'),
  });

  const withSalary    = employees.filter(e => e.salary_id);
  const withoutSalary = employees.filter(e => !e.salary_id);

  const filtered = employees.filter(e => {
    if (filterStatus === 'configured'   && !e.salary_id) return false;
    if (filterStatus === 'unconfigured' &&  e.salary_id) return false;
    if (search) {
      const q = search.toLowerCase();
      return (e.name || '').toLowerCase().includes(q) ||
             (e.department || '').toLowerCase().includes(q) ||
             (e.employee_id || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Salary Structures</div>
          <div className="page-subtitle">
            <span className="text-[#777587]">Payroll</span>
            <span className="mx-1.5 text-[#c7c4d8]">›</span>
            Salary Structures
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            label: 'Total Employees', value: employees.length,
            icon: <Users size={16} />, bg: 'bg-[#f0f3ff]', text: 'text-[#3525cd]',
            onClick: () => setFilterStatus('all'),
          },
          {
            label: 'Salary Configured', value: withSalary.length,
            icon: <CheckCircle2 size={16} />, bg: 'bg-emerald-50', text: 'text-emerald-700',
            onClick: () => setFilterStatus('configured'),
          },
          {
            label: 'Not Configured', value: withoutSalary.length,
            icon: <AlertCircle size={16} />, bg: 'bg-amber-50', text: 'text-amber-700',
            onClick: () => setFilterStatus('unconfigured'),
          },
        ].map(c => (
          <div key={c.label} onClick={c.onClick}
            className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-4 cursor-pointer hover:shadow-md hover:border-[#3525cd]/30 hover:-translate-y-0.5 transition-all">
            <div className={`w-9 h-9 rounded-xl ${c.bg} ${c.text} flex items-center justify-center mb-3`}>
              {c.icon}
            </div>
            <p className="text-2xl font-black text-[#151c27]">{c.value}</p>
            <p className="text-xs text-[#777587] font-medium mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-[#f0f3ff] bg-[#fafaff]">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            <input
              className="w-full border border-[#c7c4d8] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#151c27] focus:outline-none focus:border-[#3525cd] bg-white"
              placeholder="Search by name, department, employee ID…"
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="border border-[#c7c4d8] rounded-lg px-3 py-1.5 text-xs text-[#464555] bg-white focus:outline-none"
            value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All Employees</option>
            <option value="configured">Salary Configured</option>
            <option value="unconfigured">Not Configured</option>
          </select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-[#3525cd]/30 border-t-[#3525cd] rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <IndianRupee size={36} className="mx-auto mb-3 text-[#c7c4d8]" />
            <p className="font-semibold text-[#464555]">No employees found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#f0f3ff] bg-[#fafaff]">
                  {['Employee', 'Department', 'Basic', 'Gross / CTC', 'Effective From', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[0.65rem] font-black uppercase tracking-wider text-[#9ca3af]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f9f9ff]">
                {filtered.map(emp => (
                  <tr key={emp.id} className="hover:bg-[#fafaff] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={emp.name} color={emp.avatar_color} size={30} />
                        <div>
                          <p className="text-xs font-bold text-[#151c27]">{emp.name}</p>
                          {emp.employee_id && (
                            <p className="text-[0.6rem] text-[#9ca3af]">{emp.employee_id}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#464555]">{emp.department || '—'}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-[#151c27]">
                      {emp.basic ? fmt(emp.basic) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {emp.gross_salary ? (
                        <div>
                          <p className="font-bold text-emerald-700">{fmt(emp.gross_salary)}</p>
                          <p className="text-[0.65rem] text-[#9ca3af]">CTC: {fmt(emp.ctc)}</p>
                        </div>
                      ) : <span className="text-[#c7c4d8]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#777587]">
                      {emp.effective_from ? fmtDate(emp.effective_from) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {emp.salary_id ? (
                        <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Configured
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Not Set
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {emp.salary_id && (
                          <button
                            onClick={() => setHistoryEmp(emp)}
                            className="p-1.5 rounded-lg border border-[#c7c4d8] hover:bg-[#f0f3ff] transition-colors"
                            title="View history">
                            <History size={13} className="text-[#777587]" />
                          </button>
                        )}
                        <button
                          onClick={() => setEditEmp(emp)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[0.7rem] font-bold bg-[#3525cd] text-white hover:bg-[#2a1fb0] transition-colors">
                          <Plus size={11} />
                          {emp.salary_id ? 'Revise' : 'Set Salary'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="px-5 py-2.5 border-t border-[#f0f3ff] bg-[#fafaff]">
            <p className="text-xs text-[#777587]">
              Showing {filtered.length} of {employees.length} employees
            </p>
          </div>
        )}
      </div>

      {editEmp   && <SalaryModal   employee={editEmp}   onClose={() => setEditEmp(null)} />}
      {historyEmp && <HistoryModal  employee={historyEmp} onClose={() => setHistoryEmp(null)} />}
    </div>
  );
}
