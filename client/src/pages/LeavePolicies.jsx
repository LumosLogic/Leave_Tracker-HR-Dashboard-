import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, RefreshCw, Info } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost } from '@/lib/api';

const LEAVE_ICONS = {
  annual:    '🌴',
  sick:      '🤒',
  casual:    '☕',
  emergency: '🚨',
  maternity: '👶',
  paternity: '👨‍👦',
  comp_off:  '⚖️',
};

const DEFAULT_POLICIES = [
  { leave_type: 'annual',    label: 'Annual Leave',    annual_quota: 18, carry_forward: true,  max_carry_forward: 5,  paid: true,  half_day_allowed: true,  min_notice_days: 1, max_consecutive_days: 0, active: true },
  { leave_type: 'sick',      label: 'Sick Leave',      annual_quota: 12, carry_forward: false, max_carry_forward: 0,  paid: true,  half_day_allowed: true,  min_notice_days: 0, max_consecutive_days: 0, active: true },
  { leave_type: 'casual',    label: 'Casual Leave',    annual_quota:  8, carry_forward: false, max_carry_forward: 0,  paid: true,  half_day_allowed: true,  min_notice_days: 1, max_consecutive_days: 3, active: true },
  { leave_type: 'emergency', label: 'Emergency Leave', annual_quota:  3, carry_forward: false, max_carry_forward: 0,  paid: true,  half_day_allowed: false, min_notice_days: 0, max_consecutive_days: 0, active: true },
  { leave_type: 'maternity', label: 'Maternity Leave', annual_quota: 180,carry_forward: false, max_carry_forward: 0,  paid: true,  half_day_allowed: false, min_notice_days: 7, max_consecutive_days: 0, active: true },
  { leave_type: 'paternity', label: 'Paternity Leave', annual_quota: 15, carry_forward: false, max_carry_forward: 0,  paid: true,  half_day_allowed: false, min_notice_days: 7, max_consecutive_days: 0, active: true },
  { leave_type: 'comp_off',  label: 'Comp Off',        annual_quota:  0, carry_forward: false, max_carry_forward: 0,  paid: true,  half_day_allowed: true,  min_notice_days: 0, max_consecutive_days: 0, active: true },
];

export default function LeavePolicies() {
  const toast = useToast();
  const qc    = useQueryClient();
  const [policies, setPolicies] = useState(DEFAULT_POLICIES);
  const [dirty,    setDirty]    = useState(false);

  const { data: _lpData, isLoading } = useQuery({ queryKey: ['leave-policies'], queryFn: () => apiGet('/leave-policies') });
  const data = Array.isArray(_lpData) ? _lpData : [];

  useEffect(() => {
    if (data.length) { setPolicies(data); setDirty(false); }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => apiPost('/leave-policies', { policies }),
    onSuccess: () => { toast('Leave policies saved!', 'success'); setDirty(false); qc.invalidateQueries({ queryKey: ['leave-policies'] }); },
    onError: e => toast(e.message, 'error'),
  });

  function update(idx, field, value) {
    setPolicies(p => p.map((item, i) => i === idx ? { ...item, [field]: value } : item));
    setDirty(true);
  }

  if (isLoading) return <div className="loading"><div className="spinner" /> Loading…</div>;

  return (
    <div>
      <div className="page-header mb-6">
        <div>
          <div className="page-title">Leave Policies</div>
          <div className="page-subtitle">Configure quotas, carry-forward rules and approval settings for each leave type</div>
        </div>
        <button className="btn btn-primary" onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending}>
          {saveMut.isPending ? <><span className="spinner w-4 h-4" />Saving…</> : <><Save size={15} />Save All</>}
        </button>
      </div>

      <div className="card p-1 mb-4 flex items-start gap-2.5 text-xs text-[#464555] bg-[#f0f3ff] border-[#c7c4d8]">
        <Info size={14} className="text-[#3525cd] flex-shrink-0 mt-0.5 ml-2.5 my-2.5" />
        <p className="py-2.5 pr-2.5">Changes apply to new leave requests. Existing approved leaves are not affected.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {policies.map((p, i) => (
          <div key={p.leave_type} className="card p-5">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">{LEAVE_ICONS[p.leave_type] || '📋'}</span>
              <div>
                <div className="font-black text-[#151c27]">{p.label}</div>
                <div className="text-xs text-[#777587] capitalize">{p.leave_type.replace('_', ' ')}</div>
              </div>
              <label className="ml-auto flex items-center gap-2 cursor-pointer">
                <span className="text-xs font-semibold text-[#464555]">Active</span>
                <div className={`relative w-10 h-5 rounded-full transition-colors ${p.active ? 'bg-[#3525cd]' : 'bg-[#c7c4d8]'}`}
                  onClick={() => update(i, 'active', !p.active)}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${p.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="form-label">Annual Quota (days)</label>
                <input type="number" className="form-control" min={0} value={p.annual_quota}
                  onChange={e => update(i, 'annual_quota', Number(e.target.value))} />
              </div>
              <div>
                <label className="form-label">Min Notice Days</label>
                <input type="number" className="form-control" min={0} value={p.min_notice_days || 0}
                  onChange={e => update(i, 'min_notice_days', Number(e.target.value))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="form-label">Max Consecutive Days <span className="text-[#777587]">(0=unlimited)</span></label>
                <input type="number" className="form-control" min={0} value={p.max_consecutive_days || 0}
                  onChange={e => update(i, 'max_consecutive_days', Number(e.target.value))} />
              </div>
              <div className="flex flex-col gap-2 pt-5">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" className="w-4 h-4 accent-[#3525cd]" checked={!!p.paid}
                    onChange={e => update(i, 'paid', e.target.checked)} />
                  <span className="font-semibold text-[#151c27]">Paid Leave</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" className="w-4 h-4 accent-[#3525cd]" checked={!!p.half_day_allowed}
                    onChange={e => update(i, 'half_day_allowed', e.target.checked)} />
                  <span className="font-semibold text-[#151c27]">Half-day Allowed</span>
                </label>
              </div>
            </div>

            <div className="border-t border-[#f0f3ff] pt-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm mb-3">
                <input type="checkbox" className="w-4 h-4 accent-[#3525cd]" checked={!!p.carry_forward}
                  onChange={e => update(i, 'carry_forward', e.target.checked)} />
                <span className="font-semibold text-[#151c27]">Allow Carry Forward</span>
              </label>
              {p.carry_forward && (
                <div>
                  <label className="form-label">Max Carry Forward Days</label>
                  <input type="number" className="form-control" min={0} value={p.max_carry_forward || 0}
                    onChange={e => update(i, 'max_carry_forward', Number(e.target.value))} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {dirty && (
        <div className="fixed bottom-6 right-6 z-50 flex gap-3">
          <button className="btn btn-outline" onClick={() => { setPolicies(data); setDirty(false); }}><RefreshCw size={14} />Discard</button>
          <button className="btn btn-primary shadow-lg" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            <Save size={15} />Save Changes
          </button>
        </div>
      )}
    </div>
  );
}
