import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Mail, Calendar, Clock, Bell, Shield, Save, Eye, EyeOff, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { apiGet, apiPut } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';

function Section({ icon, title, subtitle, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#f9f9ff] transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#f0f3ff] flex items-center justify-center text-[#3525cd]">
            {icon}
          </div>
          <div>
            <div className="font-black text-[#151c27] text-sm">{title}</div>
            {subtitle && <div className="text-xs text-[#777587] mt-0.5">{subtitle}</div>}
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-[#777587]" /> : <ChevronDown size={16} className="text-[#777587]" />}
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-[#f0f3ff]">
          <div className="pt-4">{children}</div>
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, inlineHint, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <label className="form-label !mb-0">{label}</label>
        {inlineHint && <span className="text-[0.7rem] text-[#777587] font-normal normal-case tracking-normal">{inlineHint}</span>}
      </div>
      {hint && <p className="text-xs text-[#777587] mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

function PasswordField({ label, hint, value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          className="form-control pr-10"
          value={value}
          onChange={onChange}
          placeholder={placeholder || ''}
          autoComplete="new-password"
        />
        <button type="button" onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777587] hover:text-[#151c27]">
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </Field>
  );
}

export default function OrgSettings() {
  const toast = useToast();
  const qc    = useQueryClient();
  const { user } = useAuth();

  const { data: org, isLoading } = useQuery({
    queryKey: ['org-settings'],
    queryFn:  () => apiGet('/org/settings'),
  });

  const [form, setForm] = useState({});
  const [saved, setSaved] = useState(false);

  // Sync loaded data into form once
  React.useEffect(() => {
    if (org && Object.keys(form).length === 0) {
      setForm({
        name:                org.name || '',
        domain:              org.domain || '',
        smtp_host:           org.smtp_host || '',
        smtp_port:           org.smtp_port || 587,
        smtp_user:           org.smtp_user || '',
        smtp_pass:           '',
        smtp_from:           org.smtp_from || '',
        google_client_id:    org.google_client_id || '',
        google_client_secret:'',
        google_refresh_token:'',
        google_calendar_id:  org.google_calendar_id || '',
        clockify_api_key:    '',
        clockify_workspace_id: org.clockify_workspace_id || '',
        vapid_public_key:    org.vapid_public_key || '',
        vapid_private_key:   '',
        total_annual_leaves: org.total_annual_leaves || 18,
      });
    }
  }, [org]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const saveMut = useMutation({
    mutationFn: () => apiPut('/org/settings', form),
    onSuccess: () => {
      toast('Organization settings saved!', 'success');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      qc.invalidateQueries({ queryKey: ['org-settings'] });
    },
    onError: err => toast(err.message, 'error'),
  });

  if (isLoading) return <div className="flex items-center justify-center py-20"><div className="spinner w-6 h-6" /></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="page-header mb-2">
        <div>
          <div className="page-title">Organization Settings</div>
          <div className="page-subtitle">Configure integrations and policies for <strong>{org?.name}</strong></div>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="flex items-center gap-1.5 text-emerald-700 text-sm font-semibold">
              <CheckCircle2 size={14} /> Saved
            </span>
          )}
          <button
            className="btn btn-primary"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
          >
            {saveMut.isPending ? <><span className="spinner w-4 h-4" /> Saving…</> : <><Save size={15} /> Save Changes</>}
          </button>
        </div>
      </div>

      {/* Org Profile */}
      <Section icon={<Building2 size={18} />} title="Organization Profile" subtitle="Basic company information" defaultOpen>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Company Name">
            <input className="form-control" value={form.name || ''} onChange={e => set('name', e.target.value)} placeholder="Acme Corp" />
          </Field>
          <Field label="Company Domain" inlineHint="Used for email auto-detection">
            <input className="form-control" value={form.domain || ''} onChange={e => set('domain', e.target.value)} placeholder="acmecorp.com" />
          </Field>
        </div>
        <div className="mt-4 p-3 bg-[#f0f3ff] rounded-xl">
          <p className="text-xs text-[#464555]">
            <span className="font-bold">Organization Slug:</span>{' '}
            <span className="font-mono text-[#3525cd]">{org?.slug}</span>
            {' — '}Share this with employees so they can select the right organization on login.
          </p>
          <p className="text-xs text-[#464555] mt-1">
            <span className="font-bold">Plan:</span>{' '}
            <span className="capitalize font-semibold text-[#3525cd]">{org?.plan}</span>
          </p>
        </div>
      </Section>

      {/* Leave Policy */}
      <Section icon={<Shield size={18} />} title="Leave Policy" subtitle="Annual leave allocation per employee">
        <Field label="Total Annual Leave Days" hint="Number of leave days each employee gets per year">
          <input
            type="number" className="form-control w-32" min="1" max="60"
            value={form.total_annual_leaves || 18}
            onChange={e => set('total_annual_leaves', parseInt(e.target.value) || 18)}
          />
        </Field>
      </Section>

      {/* Email / SMTP */}
      <Section icon={<Mail size={18} />} title="Email (SMTP)" subtitle="Configure transactional email for leave notifications, birthday wishes, and welcome emails">
        <div className="grid grid-cols-2 gap-4">
          <Field label="SMTP Host">
            <input className="form-control" value={form.smtp_host || ''} onChange={e => set('smtp_host', e.target.value)} placeholder="smtp.gmail.com" />
          </Field>
          <Field label="SMTP Port">
            <input type="number" className="form-control" value={form.smtp_port || 587} onChange={e => set('smtp_port', e.target.value)} placeholder="587" />
          </Field>
          <Field label="SMTP Username / Email">
            <input className="form-control" value={form.smtp_user || ''} onChange={e => set('smtp_user', e.target.value)} placeholder="hr@acmecorp.com" />
          </Field>
          <PasswordField label="SMTP Password" hint="Leave blank to keep current" value={form.smtp_pass || ''} onChange={e => set('smtp_pass', e.target.value)} placeholder="Leave blank to keep" />
          <div className="col-span-2">
            <Field label="From Address" hint="Display name and address for outgoing emails">
              <input className="form-control" value={form.smtp_from || ''} onChange={e => set('smtp_from', e.target.value)} placeholder="HR Team <hr@acmecorp.com>" />
            </Field>
          </div>
        </div>
      </Section>

      {/* Google Calendar */}
      <Section icon={<Calendar size={18} />} title="Google Calendar Integration" subtitle="Auto-sync approved leaves and holidays to your Google Calendar">
        <div className="space-y-4">
          <Field label="Google OAuth2 Client ID">
            <input className="form-control" value={form.google_client_id || ''} onChange={e => set('google_client_id', e.target.value)} placeholder="xxxx.apps.googleusercontent.com" />
          </Field>
          <PasswordField label="Google OAuth2 Client Secret" hint="Leave blank to keep current" value={form.google_client_secret || ''} onChange={e => set('google_client_secret', e.target.value)} placeholder="Leave blank to keep" />
          <PasswordField label="Google Refresh Token" hint="Leave blank to keep current" value={form.google_refresh_token || ''} onChange={e => set('google_refresh_token', e.target.value)} placeholder="Leave blank to keep" />
          <Field label="Google Calendar ID" hint="The calendar to sync to (e.g. primary or your calendar email)">
            <input className="form-control" value={form.google_calendar_id || ''} onChange={e => set('google_calendar_id', e.target.value)} placeholder="primary" />
          </Field>
        </div>
      </Section>

      {/* Clockify */}
      <Section icon={<Clock size={18} />} title="Clockify Integration" subtitle="Track employee working hours via Clockify time entries">
        <div className="grid grid-cols-2 gap-4">
          <PasswordField label="Clockify API Key" hint="Leave blank to keep current" value={form.clockify_api_key || ''} onChange={e => set('clockify_api_key', e.target.value)} placeholder="Leave blank to keep" />
          <Field label="Workspace ID" hint="Your Clockify workspace ID">
            <input className="form-control" value={form.clockify_workspace_id || ''} onChange={e => set('clockify_workspace_id', e.target.value)} placeholder="Workspace ID from Clockify" />
          </Field>
        </div>
      </Section>

      {/* Web Push / VAPID */}
      <Section icon={<Bell size={18} />} title="Web Push Notifications (VAPID Keys)" subtitle="Enable browser push notifications for leave updates and announcements">
        <div className="space-y-4">
          <Field label="VAPID Public Key">
            <input className="form-control font-mono text-xs" value={form.vapid_public_key || ''} onChange={e => set('vapid_public_key', e.target.value)} placeholder="BxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxA=" />
          </Field>
          <PasswordField label="VAPID Private Key" hint="Leave blank to keep current" value={form.vapid_private_key || ''} onChange={e => set('vapid_private_key', e.target.value)} placeholder="Leave blank to keep" />
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
            Generate VAPID keys at <strong>web-push-codelab.glitch.me</strong> or run <code className="bg-amber-100 px-1 rounded">npx web-push generate-vapid-keys</code>
          </div>
        </div>
      </Section>

      {/* Save button (sticky at bottom too) */}
      <div className="flex justify-end pb-6">
        <button
          className="btn btn-primary px-8"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
        >
          {saveMut.isPending ? <><span className="spinner w-4 h-4" /> Saving…</> : <><Save size={15} /> Save All Changes</>}
        </button>
      </div>
    </div>
  );
}
