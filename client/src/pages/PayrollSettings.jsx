import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings, Save, Info,
  Calendar, Clock, Users, Shield,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPut } from '@/lib/api';
import { cn } from '@/lib/utils';

const DEFAULTS = {
  payroll_cycle:                'monthly',
  payroll_date:                 1,
  working_days_rule:            'calendar',
  fixed_working_days:           26,
  weekend_policy:               'sat_sun',
  count_holidays_as_paid:       true,
  grace_minutes:                15,
  late_allowance_per_month:     3,
  early_exit_allowance_minutes: 30,
  half_day_after_lates:         3,
  lop_after_half_days:          2,
  pf_enabled:                   true,
  esi_enabled:                  true,
  professional_tax_enabled:     true,
  tds_enabled:                  false,
  payslip_auto_email:           true,
  auto_generate_payroll:        false,
  auto_publish:                 false,
  timezone:                     'Asia/Kolkata',
  // Phase 3.5 — per-org configurable schedule
  payroll_generation_day:       null,
  payroll_generation_time:      '01:00',
  payroll_generate_for:         'PREVIOUS',
  payroll_publish_day:          null,
  payroll_publish_time:         '09:00',
  payroll_payout_day:           null,
  payroll_payout_time:          null,
};

const TIMEZONES = [
  { value: 'Asia/Kolkata',       label: 'Asia/Kolkata (IST, UTC+5:30)' },
  { value: 'Asia/Dubai',         label: 'Asia/Dubai (GST, UTC+4)' },
  { value: 'Asia/Singapore',     label: 'Asia/Singapore (SGT, UTC+8)' },
  { value: 'Asia/Kuala_Lumpur',  label: 'Asia/Kuala_Lumpur (MYT, UTC+8)' },
  { value: 'Asia/Bangkok',       label: 'Asia/Bangkok (ICT, UTC+7)' },
  { value: 'Asia/Hong_Kong',     label: 'Asia/Hong_Kong (HKT, UTC+8)' },
  { value: 'Asia/Tokyo',         label: 'Asia/Tokyo (JST, UTC+9)' },
  { value: 'Europe/London',      label: 'Europe/London (GMT/BST)' },
  { value: 'Europe/Berlin',      label: 'Europe/Berlin (CET/CEST)' },
  { value: 'America/New_York',   label: 'America/New_York (EST/EDT)' },
  { value: 'America/Los_Angeles',label: 'America/Los_Angeles (PST/PDT)' },
  { value: 'UTC',                label: 'UTC' },
];

// ── Toggle Switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none',
        checked ? 'bg-[#3525cd]' : 'bg-[#c7c4d8]',
        disabled && 'opacity-50 cursor-not-allowed'
      )}>
      <span className={cn(
        'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm',
        checked ? 'translate-x-4' : 'translate-x-1'
      )} />
    </button>
  );
}

// ── Section Card ──────────────────────────────────────────────────────────────
function Section({ icon, title, subtitle, children }) {
  return (
    <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#f0f3ff] bg-[#fafaff]">
        <div className="w-8 h-8 rounded-lg bg-[#f0f3ff] flex items-center justify-center">
          {icon}
        </div>
        <div>
          <p className="text-sm font-bold text-[#151c27]">{title}</p>
          {subtitle && <p className="text-[0.68rem] text-[#777587]">{subtitle}</p>}
        </div>
      </div>
      <div className="px-5 py-5 space-y-5">{children}</div>
    </div>
  );
}

function Row({ label, hint, children }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#151c27]">{label}</p>
        {hint && <p className="text-[0.68rem] text-[#777587] mt-0.5">{hint}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function NumInput({ value, onChange, min, max, step = 1 }) {
  return (
    <input
      type="number" min={min} max={max} step={step}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-20 border border-[#c7c4d8] rounded-lg px-2.5 py-1.5 text-sm text-center text-[#151c27] focus:outline-none focus:border-[#3525cd] focus:ring-1 focus:ring-[#3525cd]/20"
    />
  );
}

// Day-of-month picker — supports 1–28 and two special values
function DayPicker({ value, onChange }) {
  const days = Array.from({ length: 28 }, (_, i) => i + 1);
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      className="border border-[#c7c4d8] rounded-lg px-3 py-1.5 text-sm text-[#151c27] focus:outline-none focus:border-[#3525cd] bg-white">
      <option value="">— same as payroll date —</option>
      {days.map(d => (
        <option key={d} value={String(d)}>{d}{['th','st','nd','rd'][([11,12,13].includes(d%100)?0:d%10)] || 'th'} of month</option>
      ))}
      <option value="LAST_DAY">Last day of month</option>
      <option value="LAST_WORKING_DAY">Last working day</option>
    </select>
  );
}

// HH:MM time input
function TimeInput({ value, onChange }) {
  return (
    <input
      type="time"
      value={value || ''}
      onChange={e => onChange(e.target.value || null)}
      className="border border-[#c7c4d8] rounded-lg px-2.5 py-1.5 text-sm text-[#151c27] focus:outline-none focus:border-[#3525cd] focus:ring-1 focus:ring-[#3525cd]/20 w-32"
    />
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PayrollSettings() {
  const toast = useToast();
  const qc    = useQueryClient();
  const [form, setForm]   = useState(DEFAULTS);
  const [dirty, setDirty] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['payroll-settings'],
    queryFn:  () => apiGet('/payroll/settings'),
  });

  useEffect(() => {
    if (settings) {
      setForm({ ...DEFAULTS, ...settings });
      setDirty(false);
    }
  }, [settings]);

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const saveMut = useMutation({
    mutationFn: () => apiPut('/payroll/settings', form),
    onSuccess: () => {
      toast('Payroll settings saved', 'success');
      qc.invalidateQueries({ queryKey: ['payroll-settings'] });
      setDirty(false);
    },
    onError: e => toast(e.message, 'error'),
  });

  const ordinalDay = d => {
    const s = ['th','st','nd','rd'];
    const v = d % 100;
    return d + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="page-header">
          <div className="page-title">Payroll Settings</div>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#3525cd]/30 border-t-[#3525cd] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Payroll Settings</div>
          <div className="page-subtitle">
            <span className="text-[#777587]">Payroll</span>
            <span className="mx-1.5 text-[#c7c4d8]">›</span>
            Settings
          </div>
        </div>
        <button
          onClick={() => saveMut.mutate()}
          disabled={!dirty || saveMut.isPending}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all',
            dirty
              ? 'bg-[#3525cd] text-white hover:bg-[#2a1fb0] shadow-sm'
              : 'bg-[#f0f3ff] text-[#777587] cursor-not-allowed'
          )}>
          <Save size={15} />
          {saveMut.isPending ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      {/* Payroll Cycle */}
      <Section
        icon={<Calendar size={15} className="text-[#3525cd]" />}
        title="Payroll Cycle"
        subtitle="When payroll is calculated and payslips are generated">

        <Row label="Payroll Cycle" hint="Only monthly is supported in this version">
          <select
            value={form.payroll_cycle}
            onChange={e => set('payroll_cycle', e.target.value)}
            className="border border-[#c7c4d8] rounded-lg px-3 py-1.5 text-sm text-[#151c27] focus:outline-none focus:border-[#3525cd] bg-white">
            <option value="monthly">Monthly</option>
          </select>
        </Row>

        <Row
          label="Payroll Date"
          hint={`Payroll runs on the ${ordinalDay(form.payroll_date)} of each month`}>
          <NumInput value={form.payroll_date} onChange={v => set('payroll_date', v)} min={1} max={28} />
        </Row>
      </Section>

      {/* Working Days */}
      <Section
        icon={<Users size={15} className="text-[#3525cd]" />}
        title="Working Days Rules"
        subtitle="Controls how expected working days are calculated for LOP">

        <Row label="Working Days Calculation" hint="Calendar: count from actual weekdays. Fixed: use a set number.">
          <div className="flex gap-2">
            {[['calendar','Calendar'], ['fixed','Fixed']].map(([val, label]) => (
              <button key={val} onClick={() => set('working_days_rule', val)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                  form.working_days_rule === val
                    ? 'bg-[#3525cd] text-white border-[#3525cd]'
                    : 'bg-white text-[#464555] border-[#c7c4d8] hover:border-[#3525cd]/40'
                )}>
                {label}
              </button>
            ))}
          </div>
        </Row>

        {form.working_days_rule === 'fixed' && (
          <Row label="Fixed Working Days / Month" hint="Used as the denominator for per-day salary calculation">
            <NumInput value={form.fixed_working_days} onChange={v => set('fixed_working_days', v)} min={1} max={31} />
          </Row>
        )}

        <Row label="Weekend Policy" hint="Determines which days are weekends (unpaid)">
          <select
            value={form.weekend_policy}
            onChange={e => set('weekend_policy', e.target.value)}
            className="border border-[#c7c4d8] rounded-lg px-3 py-1.5 text-sm text-[#151c27] focus:outline-none focus:border-[#3525cd] bg-white">
            <option value="sat_sun">Saturday + Sunday</option>
            <option value="sun_only">Sunday Only</option>
            <option value="alternate_sat">Alternate Saturday + Sunday</option>
            <option value="none">No Weekends (6-day work week)</option>
          </select>
        </Row>

        <Row label="Count Holidays as Paid" hint="Public/org holidays will not count as LOP">
          <Toggle checked={form.count_holidays_as_paid} onChange={v => set('count_holidays_as_paid', v)} />
        </Row>
      </Section>

      {/* Attendance Rules */}
      <Section
        icon={<Clock size={15} className="text-[#3525cd]" />}
        title="Attendance Rules"
        subtitle="Controls how late arrivals, half days, and LOP are calculated">

        <Row label="Grace Period (minutes)" hint="Arrivals within grace window are not counted as late">
          <NumInput value={form.grace_minutes} onChange={v => set('grace_minutes', v)} min={0} max={60} />
        </Row>

        <Row label="Late Allowances per Month" hint="First N late arrivals are forgiven before counting toward half-day">
          <NumInput value={form.late_allowance_per_month} onChange={v => set('late_allowance_per_month', v)} min={0} max={31} />
        </Row>

        <Row label="Early Exit Allowance (minutes)" hint="Leaving early by less than this is not penalized">
          <NumInput value={form.early_exit_allowance_minutes} onChange={v => set('early_exit_allowance_minutes', v)} min={0} max={120} />
        </Row>

        <Row
          label="Lates Before Half Day"
          hint={`Every ${form.half_day_after_lates} additional lates (after allowance) = 1 half day`}>
          <NumInput value={form.half_day_after_lates} onChange={v => set('half_day_after_lates', v)} min={1} max={10} />
        </Row>

        <Row
          label="Half Days Before LOP"
          hint={`Every ${form.lop_after_half_days} half days = 1 LOP day`}>
          <NumInput value={form.lop_after_half_days} onChange={v => set('lop_after_half_days', v)} min={1} max={10} />
        </Row>
      </Section>

      {/* Statutory */}
      <Section
        icon={<Shield size={15} className="text-[#3525cd]" />}
        title="Statutory Components"
        subtitle="Enable or disable statutory deductions. Amounts are set per employee in salary structures.">

        {[
          ['pf_enabled',                'Provident Fund (PF)',       'Employee and employer PF contributions'],
          ['esi_enabled',               'ESI',                       'Employee State Insurance contributions'],
          ['professional_tax_enabled',  'Professional Tax (PT)',      'State-level professional tax deduction'],
          ['tds_enabled',               'TDS',                       'Tax Deducted at Source on salary'],
        ].map(([key, label, hint]) => (
          <Row key={key} label={label} hint={hint}>
            <Toggle checked={form[key]} onChange={v => set(key, v)} />
          </Row>
        ))}
      </Section>

      {/* Automation */}
      <Section
        icon={<Settings size={15} className="text-[#3525cd]" />}
        title="Automation"
        subtitle="Control automatic payroll generation, publishing, and payslip delivery">

        <Row label="Auto-generate Payroll" hint="Platform scheduler evaluates this organization's policy every hour">
          <Toggle checked={form.auto_generate_payroll} onChange={v => set('auto_generate_payroll', v)} />
        </Row>

        {form.auto_generate_payroll && (
          <>
            {/* ── Generation schedule ─────────────────────────────── */}
            <div className="border-t border-[#f0f3ff] pt-4 space-y-4">
              <p className="text-xs font-bold text-[#464555] uppercase tracking-wide">Generation Schedule</p>

              <Row
                label="Generate On"
                hint="Day of month the scheduler generates payroll. Leave blank to use the Payroll Date above.">
                <DayPicker
                  value={form.payroll_generation_day}
                  onChange={v => set('payroll_generation_day', v)}
                />
              </Row>

              <Row label="Generate Time" hint="Earliest hour (in org timezone) the scheduler may generate payroll">
                <TimeInput
                  value={form.payroll_generation_time}
                  onChange={v => set('payroll_generation_time', v || '01:00')}
                />
              </Row>

              <Row
                label="Generate For"
                hint="Which month's payroll to generate on the configured day">
                <div className="flex gap-2">
                  {[['PREVIOUS', 'Previous month'], ['CURRENT', 'Current month']].map(([val, label]) => (
                    <button key={val} onClick={() => set('payroll_generate_for', val)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                        form.payroll_generate_for === val
                          ? 'bg-[#3525cd] text-white border-[#3525cd]'
                          : 'bg-white text-[#464555] border-[#c7c4d8] hover:border-[#3525cd]/40'
                      )}>
                      {label}
                    </button>
                  ))}
                </div>
              </Row>
            </div>

            {/* ── Publish schedule ────────────────────────────────── */}
            <div className="border-t border-[#f0f3ff] pt-4 space-y-4">
              <p className="text-xs font-bold text-[#464555] uppercase tracking-wide">Publish Schedule</p>

              <Row
                label="Auto-publish Payslips"
                hint="Automatically publish payslips on the configured publish date (skips draft review)">
                <Toggle checked={form.auto_publish} onChange={v => set('auto_publish', v)} />
              </Row>

              {form.auto_publish && (
                <>
                  <Row
                    label="Publish On"
                    hint="Day of month to publish generated payslips. Leave blank to publish on the same day as generation.">
                    <DayPicker
                      value={form.payroll_publish_day}
                      onChange={v => set('payroll_publish_day', v)}
                    />
                  </Row>

                  <Row label="Publish Time" hint="Earliest hour the scheduler may publish payslips">
                    <TimeInput
                      value={form.payroll_publish_time}
                      onChange={v => set('payroll_publish_time', v || '09:00')}
                    />
                  </Row>
                </>
              )}
            </div>

            {/* ── Email & payout ──────────────────────────────────── */}
            <div className="border-t border-[#f0f3ff] pt-4 space-y-4">
              <p className="text-xs font-bold text-[#464555] uppercase tracking-wide">Delivery & Payout</p>

              <Row
                label="Auto-email Payslips"
                hint="Email PDF payslips to each employee after publication">
                <Toggle checked={form.payslip_auto_email} onChange={v => set('payslip_auto_email', v)} />
              </Row>

              <Row
                label="Expected Payout Day"
                hint="Informational — shown to employees as expected salary credit date">
                <DayPicker
                  value={form.payroll_payout_day}
                  onChange={v => set('payroll_payout_day', v)}
                />
              </Row>
            </div>

            {/* ── Timezone ────────────────────────────────────────── */}
            <div className="border-t border-[#f0f3ff] pt-4">
              <Row label="Timezone" hint="All schedule day/time comparisons are evaluated in this timezone">
                <select
                  value={form.timezone}
                  onChange={e => set('timezone', e.target.value)}
                  className="border border-[#c7c4d8] rounded-lg px-3 py-1.5 text-sm text-[#151c27] focus:outline-none focus:border-[#3525cd] bg-white max-w-xs">
                  {TIMEZONES.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </Row>
            </div>

            <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
              <Info size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                The platform scheduler runs every hour and evaluates each organization independently.
                Actions execute only when today's date and time match this organization's configuration.
                Duplicate protection ensures payroll is never generated twice for the same period.
              </p>
            </div>
          </>
        )}

        {!form.auto_generate_payroll && (
          <Row
            label="Auto-email Payslips"
            hint="Email PDF payslips to each employee when payroll is manually published">
            <Toggle checked={form.payslip_auto_email} onChange={v => set('payslip_auto_email', v)} />
          </Row>
        )}
      </Section>

      {/* Info footer */}
      <div className="rounded-xl border border-[#e7eefe] bg-[#f9f9ff] px-5 py-4 flex items-start gap-3">
        <Info size={14} className="text-[#3525cd] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#777587]">
          These settings apply to all payroll calculations for this organization.
          Changes take effect from the next payroll run. Existing payslips are not recalculated.
        </p>
      </div>

      {/* Fixed save bar when dirty */}
      {dirty && (
        <div className="fixed bottom-0 left-0 md:left-64 right-0 z-20 bg-white border-t border-[#e7eefe] py-3 px-4 md:px-7 flex items-center justify-between shadow-lg">
          <p className="text-xs text-[#777587] font-semibold">You have unsaved changes.</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setForm({ ...DEFAULTS, ...settings }); setDirty(false); }}
              className="text-xs font-semibold text-[#777587] hover:text-[#464555] px-3 py-2">
              Discard
            </button>
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="flex items-center gap-1.5 bg-[#3525cd] text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#2a1fb0] disabled:opacity-60">
              <Save size={13} /> {saveMut.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
