import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User, UserCircle, Users, BookOpen, Briefcase, Zap, CreditCard, Heart, Shield,
  Clock, Umbrella, BarChart3, FileText, Star, Settings, Lock, ExternalLink,
  Plus, Pencil, Trash2, X, Check, Eye, EyeOff, Save, AlertTriangle,
  ShieldCheck, ShieldAlert, Mail, ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { fmtDate, initials } from '@/lib/utils';

const AVATAR_COLORS = [
  '#3525cd','#4f46e5','#712ae2','#8a4cfc','#10B981','#EC4899','#F59E0B','#EF4444','#F97316',
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function maskAccount(num) {
  if (!num) return '—';
  const s = String(num);
  return '****' + s.slice(-4);
}

function proficiencyColor(level) {
  const map = {
    beginner: 'bg-slate-100 text-slate-700',
    intermediate: 'bg-blue-100 text-blue-700',
    advanced: 'bg-emerald-100 text-emerald-700',
    expert: 'bg-purple-100 text-purple-700',
  };
  return map[level] || 'bg-slate-100 text-slate-700';
}

function relationshipColor(rel) {
  if (!rel) return 'bg-[#f0f3ff] text-[#3525cd]';
  const r = rel.toLowerCase();
  if (r === 'spouse') return 'bg-emerald-50 text-emerald-700';
  if (r === 'child') return 'bg-amber-50 text-amber-700';
  if (r === 'father' || r === 'mother' || r === 'parent') return 'bg-blue-50 text-blue-700';
  return 'bg-[#f0f3ff] text-[#3525cd]';
}

function SectionHeader({ children }) {
  return (
    <h2 className="text-sm font-black text-[#151c27] uppercase tracking-wider">{children}</h2>
  );
}

function EmptyState({ icon: Icon, label, onAdd, addLabel }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#f0f3ff] flex items-center justify-center mb-3">
        <Icon size={24} className="text-[#3525cd]" />
      </div>
      <p className="text-sm font-semibold text-[#464555] mb-1">No {label} added yet</p>
      <p className="text-xs text-[#777587] mb-4">Add your {label} to complete your profile</p>
      {onAdd && (
        <button onClick={onAdd} className="btn btn-primary btn-sm flex items-center gap-1.5">
          <Plus size={14} /> {addLabel || `Add ${label}`}
        </button>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <span className="spinner w-6 h-6" />
    </div>
  );
}

// ─── Sidebar nav definition ──────────────────────────────────────────────────

const MY_PROFILE_SECTIONS = [
  { key: 'overview',    icon: User,       label: 'Overview' },
  { key: 'personal',   icon: UserCircle, label: 'Personal Info' },
  { key: 'family',     icon: Users,      label: 'Family' },
  { key: 'education',  icon: BookOpen,   label: 'Education' },
  { key: 'experience', icon: Briefcase,  label: 'Experience' },
  { key: 'skills',     icon: Zap,        label: 'Skills' },
  { key: 'banking',    icon: CreditCard, label: 'Banking' },
  { key: 'health',     icon: Heart,      label: 'Health' },
  { key: 'nominees',   icon: Shield,     label: 'Nominees' },
];

const WORKPLACE_LINKS = [
  { label: 'Attendance', icon: Clock,    path: '/portal/attendance' },
  { label: 'Leave',      icon: Umbrella, path: '/portal/leaves' },
  { label: 'Payroll',    icon: BarChart3,path: '/portal/payslips' },
  { label: 'Documents',  icon: FileText, path: '/portal/documents' },
  { label: 'Performance',icon: Star,     path: '/portal/performance' },
];

const ACCOUNT_SECTIONS = [
  { key: 'account', icon: Settings, label: 'Account Settings' },
  { key: 'privacy', icon: Lock,     label: 'Privacy & Security' },
];

// ─── OVERVIEW SECTION ────────────────────────────────────────────────────────

function OverviewSection({ empId, onNavigate }) {
  const { data, isLoading } = useQuery({
    queryKey: ['profile-overview', empId],
    queryFn: () => apiGet(`/profile/${empId}/overview`),
    enabled: !!empId,
  });

  if (isLoading) return <Spinner />;
  if (!data) return null;

  const completion = data.completionPercentage || data.completion_percentage || 0;
  const counts = data.sectionCounts || data.section_counts || {};

  const sectionStatus = [
    { label: 'Family',     done: (counts.family || 0) > 0 },
    { label: 'Education',  done: (counts.education || 0) > 0 },
    { label: 'Experience', done: (counts.experience || 0) > 0 },
    { label: 'Skills',     done: (counts.skills || 0) > 0 },
    { label: 'Banking',    done: (counts.banking || 0) > 0 },
    { label: 'Nominees',   done: (counts.nominees || 0) > 0 },
  ];

  return (
    <div className="space-y-5">
      {/* Hero card */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5">
        <div className="flex items-start gap-5">
          {/* Avatar with completion ring */}
          <div className="relative flex-shrink-0">
            <div style={{ width: 80, height: 80 }}>
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="36" fill="none" stroke="#e8e6f4" strokeWidth="5" />
                <circle
                  cx="40" cy="40" r="36" fill="none"
                  stroke="#3525cd" strokeWidth="5"
                  strokeDasharray={`${2 * Math.PI * 36 * completion / 100} ${2 * Math.PI * 36}`}
                  strokeLinecap="round"
                  transform="rotate(-90 40 40)"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-black text-xl"
                  style={{ background: '#3525cd' }}>
                  {initials(data.name || data.full_name || '')}
                </div>
              </div>
            </div>
            <div className="absolute -bottom-1 -right-1 bg-white rounded-full px-1.5 py-0.5 text-[10px] font-black text-[#3525cd] border border-[#c7c4d8] shadow-sm">
              {completion}%
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-black text-[#151c27] truncate">{data.name || data.full_name || '—'}</h2>
            <p className="text-sm text-[#464555]">{data.position || data.designation || '—'}</p>
            <p className="text-xs text-[#777587] mt-0.5">{data.department || '—'} {data.branch ? `· ${data.branch}` : ''}</p>

            <div className="flex flex-wrap gap-2 mt-3">
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#f0f3ff] text-[#3525cd] font-semibold border border-[#c7c4d8]">
                {data.employee_id || data.employeeId || 'EMP—'}
              </span>
              {data.employment_type && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                  {data.employment_type}
                </span>
              )}
              {data.status && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${
                  data.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}>
                  {data.status}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-4 mt-3 text-xs text-[#777587]">
              {data.joining_date && <span>Joined: <strong className="text-[#464555]">{fmtDate(data.joining_date)}</strong></span>}
              {data.manager_name && <span>Manager: <strong className="text-[#464555]">{data.manager_name}</strong></span>}
            </div>
          </div>
        </div>

        {/* Completion bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-[#151c27]">Profile Completion</span>
            <span className="text-xs font-black text-[#3525cd]">{completion}%</span>
          </div>
          <div className="h-2 bg-[#f0f3ff] rounded-full overflow-hidden">
            <div className="h-full bg-[#3525cd] rounded-full transition-all duration-500"
              style={{ width: `${completion}%` }} />
          </div>
        </div>
      </div>

      {/* Section completion */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5">
        <SectionHeader>Section Completion</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
          {sectionStatus.map(s => (
            <div key={s.label} className={`flex items-center gap-2 p-2.5 rounded-lg border ${
              s.done ? 'bg-emerald-50 border-emerald-200' : 'bg-[#f8f9ff] border-[#e8e6f4]'
            }`}>
              {s.done
                ? <Check size={14} className="text-emerald-600 flex-shrink-0" />
                : <div className="w-3.5 h-3.5 rounded-full border-2 border-[#c7c4d8] flex-shrink-0" />}
              <span className={`text-xs font-semibold ${s.done ? 'text-emerald-700' : 'text-[#777587]'}`}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5">
        <SectionHeader>Quick Actions</SectionHeader>
        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={() => onNavigate('personal')} className="btn btn-outline btn-sm flex items-center gap-1.5">
            <Pencil size={13} /> Edit Personal Info
          </button>
          <button onClick={() => onNavigate('family')} className="btn btn-outline btn-sm flex items-center gap-1.5">
            <Plus size={13} /> Add Family
          </button>
          <button onClick={() => onNavigate('skills')} className="btn btn-outline btn-sm flex items-center gap-1.5">
            <Plus size={13} /> Add Skills
          </button>
          <button onClick={() => onNavigate('banking')} className="btn btn-outline btn-sm flex items-center gap-1.5">
            <Plus size={13} /> Add Bank Account
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PERSONAL INFO SECTION ───────────────────────────────────────────────────

function PersonalSection({ empId }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['profile-personal', empId],
    queryFn: () => apiGet(`/profile/${empId}/personal`),
    enabled: !!empId,
  });

  const [form, setForm] = useState(null);
  React.useEffect(() => {
    if (data && !form) {
      setForm({
        phone: data.phone || '',
        personal_email: data.personal_email || '',
        current_address_line1: data.current_address_line1 || '',
        current_address_line2: data.current_address_line2 || '',
        current_city: data.current_city || '',
        current_state: data.current_state || '',
        current_country: data.current_country || '',
        current_postal_code: data.current_postal_code || '',
        permanent_address: data.permanent_address || '',
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => apiPut(`/profile/${empId}/personal`, form),
    onSuccess: () => {
      toast('Personal info updated.', 'success');
      queryClient.invalidateQueries({ queryKey: ['profile-personal', empId] });
      queryClient.invalidateQueries({ queryKey: ['profile-overview', empId] });
    },
    onError: e => toast(e.message, 'error'),
  });

  if (isLoading) return <Spinner />;

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-5">
      {/* Editable: Contact & Address */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm">
        <div className="flex items-center justify-between p-5 border-b border-[#f0f3ff]">
          <SectionHeader>Contact &amp; Address</SectionHeader>
        </div>
        {form && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Phone</label>
                <input className="form-control" value={form.phone} onChange={e => setF('phone', e.target.value)} placeholder="+91 98765 43210" />
              </div>
              <div>
                <label className="form-label">Personal Email</label>
                <input className="form-control" type="email" value={form.personal_email} onChange={e => setF('personal_email', e.target.value)} placeholder="personal@email.com" />
              </div>
            </div>
            <div>
              <label className="form-label">Address Line 1</label>
              <input className="form-control" value={form.current_address_line1} onChange={e => setF('current_address_line1', e.target.value)} placeholder="House/Flat no, Street" />
            </div>
            <div>
              <label className="form-label">Address Line 2</label>
              <input className="form-control" value={form.current_address_line2} onChange={e => setF('current_address_line2', e.target.value)} placeholder="Area, Landmark" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="form-label">City</label>
                <input className="form-control" value={form.current_city} onChange={e => setF('current_city', e.target.value)} placeholder="City" />
              </div>
              <div>
                <label className="form-label">State</label>
                <input className="form-control" value={form.current_state} onChange={e => setF('current_state', e.target.value)} placeholder="State" />
              </div>
              <div>
                <label className="form-label">Country</label>
                <input className="form-control" value={form.current_country} onChange={e => setF('current_country', e.target.value)} placeholder="Country" />
              </div>
              <div>
                <label className="form-label">PIN Code</label>
                <input className="form-control" value={form.current_postal_code} onChange={e => setF('current_postal_code', e.target.value)} placeholder="400001" />
              </div>
            </div>
            <div>
              <label className="form-label">Permanent Address</label>
              <textarea className="form-control" rows={3} value={form.permanent_address} onChange={e => setF('permanent_address', e.target.value)} placeholder="Permanent / native address" />
            </div>
            <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
              className="btn btn-primary btn-sm flex items-center gap-2">
              {saveMutation.isPending ? <><span className="spinner w-3.5 h-3.5" /> Saving…</> : <><Save size={14} /> Save Changes</>}
            </button>
          </div>
        )}
      </div>

      {/* Read-only: Identity */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm">
        <div className="flex items-center justify-between p-5 border-b border-[#f0f3ff]">
          <SectionHeader>Identity (HR Managed)</SectionHeader>
          <span className="text-xs text-[#777587] bg-amber-50 border border-amber-200 text-amber-700 rounded-md px-2 py-0.5">Contact HR to update</span>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: 'Full Name',        val: data?.full_name || data?.name },
              { label: 'Gender',           val: data?.gender },
              { label: 'Date of Birth',    val: data?.date_of_birth ? fmtDate(data.date_of_birth) : null },
              { label: 'Blood Group',      val: data?.blood_group },
              { label: 'Marital Status',   val: data?.marital_status },
              { label: 'Nationality',      val: data?.nationality },
              { label: 'Religion',         val: data?.religion },
            ].map(({ label, val }) => (
              <div key={label}>
                <label className="form-label">{label}</label>
                <input className="form-control bg-[#f8f9ff] text-[#464555]" readOnly value={val || '—'} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── FAMILY SECTION ──────────────────────────────────────────────────────────

const FAMILY_BLANK = { relationship: '', name: '', date_of_birth: '', gender: '', occupation: '', contact_number: '', dependent: false };

function FamilySection({ empId }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(FAMILY_BLANK);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['profile-family', empId],
    queryFn: () => apiGet(`/profile/${empId}/family`),
    enabled: !!empId,
  });

  const saveMut = useMutation({
    mutationFn: () => editing
      ? apiPut(`/profile/${empId}/family/${editing.id}`, form)
      : apiPost(`/profile/${empId}/family`, form),
    onSuccess: () => {
      toast(editing ? 'Family member updated.' : 'Family member added.', 'success');
      queryClient.invalidateQueries({ queryKey: ['profile-family', empId] });
      queryClient.invalidateQueries({ queryKey: ['profile-overview', empId] });
      setModalOpen(false);
    },
    onError: e => toast(e.message, 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: id => apiDelete(`/profile/${empId}/family/${id}`),
    onSuccess: () => {
      toast('Family member removed.', 'success');
      queryClient.invalidateQueries({ queryKey: ['profile-family', empId] });
      queryClient.invalidateQueries({ queryKey: ['profile-overview', empId] });
    },
    onError: e => toast(e.message, 'error'),
  });

  function openAdd() { setEditing(null); setForm(FAMILY_BLANK); setModalOpen(true); }
  function openEdit(m) { setEditing(m); setForm({ relationship: m.relationship || '', name: m.name || '', date_of_birth: m.date_of_birth || '', gender: m.gender || '', occupation: m.occupation || '', contact_number: m.contact_number || '', dependent: m.dependent || false }); setModalOpen(true); }
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  if (isLoading) return <Spinner />;

  return (
    <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm">
      <div className="flex items-center justify-between p-5 border-b border-[#f0f3ff]">
        <SectionHeader>Family Members</SectionHeader>
        <button onClick={openAdd} className="btn btn-primary btn-sm flex items-center gap-1.5">
          <Plus size={13} /> Add Member
        </button>
      </div>

      {members.length === 0 ? (
        <EmptyState icon={Users} label="family members" onAdd={openAdd} addLabel="Add Family Member" />
      ) : (
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {members.map(m => (
            <div key={m.id} className="border border-[#e8e6f4] rounded-xl p-4 bg-[#fafbff]">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${relationshipColor(m.relationship)}`}>
                    {m.relationship || '—'}
                  </span>
                  <p className="text-sm font-bold text-[#151c27] mt-2 truncate">{m.name}</p>
                  {m.date_of_birth && <p className="text-xs text-[#777587]">DOB: {fmtDate(m.date_of_birth)}</p>}
                  {m.occupation && <p className="text-xs text-[#777587]">{m.occupation}</p>}
                  {m.dependent && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 mt-1 inline-block">Dependent</span>}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(m)} className="btn btn-ghost btn-icon btn-sm text-[#777587] hover:text-[#3525cd]"><Pencil size={14} /></button>
                  <button onClick={() => setDeleteTarget(m)} className="btn btn-ghost btn-icon btn-sm text-[#777587] hover:text-rose-600"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Family Member' : 'Add Family Member'} size="md"
        footer={<><button className="btn btn-outline" onClick={() => setModalOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>{saveMut.isPending ? 'Saving…' : 'Save'}</button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Relationship *</label>
              <select className="form-control" value={form.relationship} onChange={e => setF('relationship', e.target.value)}>
                <option value="">Select…</option>
                {['father','mother','spouse','child','sibling','other'].map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Gender</label>
              <select className="form-control" value={form.gender} onChange={e => setF('gender', e.target.value)}>
                <option value="">Select…</option>
                {['male','female','other'].map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase()+g.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Full Name *</label>
            <input className="form-control" value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Full name" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Date of Birth</label>
              <input type="date" className="form-control" value={form.date_of_birth} onChange={e => setF('date_of_birth', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Contact Number</label>
              <input className="form-control" value={form.contact_number} onChange={e => setF('contact_number', e.target.value)} placeholder="+91 98765 43210" />
            </div>
          </div>
          <div>
            <label className="form-label">Occupation</label>
            <input className="form-control" value={form.occupation} onChange={e => setF('occupation', e.target.value)} placeholder="e.g. Teacher, Engineer" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="rounded" checked={form.dependent} onChange={e => setF('dependent', e.target.checked)} />
            <span className="text-sm text-[#464555]">Financial Dependent</span>
          </label>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        title="Remove Family Member"
        message={`Remove ${deleteTarget?.name} from your family list?`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ─── EDUCATION SECTION ───────────────────────────────────────────────────────

const EDU_BLANK = { degree_level: '', institution: '', board_university: '', specialization: '', year_of_passing: '', percentage: '', cgpa: '', degree_class: '' };
const DEGREE_LEVELS = ['10th','12th','diploma','bachelor','master','phd','other'];

function EducationSection({ empId }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EDU_BLANK);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['profile-education', empId],
    queryFn: () => apiGet(`/profile/${empId}/education`),
    enabled: !!empId,
  });

  const saveMut = useMutation({
    mutationFn: () => editing
      ? apiPut(`/profile/${empId}/education/${editing.id}`, form)
      : apiPost(`/profile/${empId}/education`, form),
    onSuccess: () => {
      toast(editing ? 'Education updated.' : 'Education added.', 'success');
      queryClient.invalidateQueries({ queryKey: ['profile-education', empId] });
      queryClient.invalidateQueries({ queryKey: ['profile-overview', empId] });
      setModalOpen(false);
    },
    onError: e => toast(e.message, 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: id => apiDelete(`/profile/${empId}/education/${id}`),
    onSuccess: () => {
      toast('Education record removed.', 'success');
      queryClient.invalidateQueries({ queryKey: ['profile-education', empId] });
      queryClient.invalidateQueries({ queryKey: ['profile-overview', empId] });
    },
    onError: e => toast(e.message, 'error'),
  });

  function openAdd() { setEditing(null); setForm(EDU_BLANK); setModalOpen(true); }
  function openEdit(r) {
    setEditing(r);
    setForm({ degree_level: r.degree_level || '', institution: r.institution || '', board_university: r.board_university || '', specialization: r.specialization || '', year_of_passing: r.year_of_passing || '', percentage: r.percentage || '', cgpa: r.cgpa || '', degree_class: r.degree_class || '' });
    setModalOpen(true);
  }
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  if (isLoading) return <Spinner />;

  return (
    <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm">
      <div className="flex items-center justify-between p-5 border-b border-[#f0f3ff]">
        <SectionHeader>Education &amp; Qualifications</SectionHeader>
        <button onClick={openAdd} className="btn btn-primary btn-sm flex items-center gap-1.5">
          <Plus size={13} /> Add
        </button>
      </div>

      {records.length === 0 ? (
        <EmptyState icon={BookOpen} label="education records" onAdd={openAdd} />
      ) : (
        <div className="p-5 space-y-3">
          {records.map((r, idx) => (
            <div key={r.id} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-[#3525cd] flex-shrink-0 mt-1" />
                {idx < records.length - 1 && <div className="w-px flex-1 bg-[#e8e6f4] mt-1" />}
              </div>
              <div className="flex-1 border border-[#e8e6f4] rounded-xl p-4 bg-[#fafbff] mb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#f0f3ff] text-[#3525cd] uppercase">{r.degree_level || 'Degree'}</span>
                    <p className="text-sm font-bold text-[#151c27] mt-1.5">{r.institution}</p>
                    {r.board_university && <p className="text-xs text-[#777587]">{r.board_university}</p>}
                    {r.specialization && <p className="text-xs text-[#464555]">{r.specialization}</p>}
                    <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-[#777587]">
                      {r.year_of_passing && <span>Year: <strong className="text-[#464555]">{r.year_of_passing}</strong></span>}
                      {r.percentage && <span>%: <strong className="text-[#464555]">{r.percentage}%</strong></span>}
                      {r.cgpa && <span>CGPA: <strong className="text-[#464555]">{r.cgpa}</strong></span>}
                      {r.degree_class && <span>Class: <strong className="text-[#464555]">{r.degree_class}</strong></span>}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(r)} className="btn btn-ghost btn-icon btn-sm text-[#777587] hover:text-[#3525cd]"><Pencil size={14} /></button>
                    <button onClick={() => setDeleteTarget(r)} className="btn btn-ghost btn-icon btn-sm text-[#777587] hover:text-rose-600"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Education' : 'Add Education'} size="md"
        footer={<><button className="btn btn-outline" onClick={() => setModalOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>{saveMut.isPending ? 'Saving…' : 'Save'}</button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Degree Level</label>
              <select className="form-control" value={form.degree_level} onChange={e => setF('degree_level', e.target.value)}>
                <option value="">Select…</option>
                {DEGREE_LEVELS.map(d => <option key={d} value={d}>{d.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Year of Passing</label>
              <input className="form-control" type="number" value={form.year_of_passing} onChange={e => setF('year_of_passing', e.target.value)} placeholder="2020" min="1950" max="2099" />
            </div>
          </div>
          <div>
            <label className="form-label">Institution *</label>
            <input className="form-control" value={form.institution} onChange={e => setF('institution', e.target.value)} placeholder="University / College / School name" />
          </div>
          <div>
            <label className="form-label">Board / University</label>
            <input className="form-control" value={form.board_university} onChange={e => setF('board_university', e.target.value)} placeholder="CBSE / Mumbai University" />
          </div>
          <div>
            <label className="form-label">Specialization / Stream</label>
            <input className="form-control" value={form.specialization} onChange={e => setF('specialization', e.target.value)} placeholder="Computer Science, Finance, etc." />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="form-label">Percentage</label>
              <input className="form-control" type="number" value={form.percentage} onChange={e => setF('percentage', e.target.value)} placeholder="85.5" step="0.01" />
            </div>
            <div>
              <label className="form-label">CGPA</label>
              <input className="form-control" type="number" value={form.cgpa} onChange={e => setF('cgpa', e.target.value)} placeholder="8.5" step="0.01" />
            </div>
            <div>
              <label className="form-label">Degree Class</label>
              <input className="form-control" value={form.degree_class} onChange={e => setF('degree_class', e.target.value)} placeholder="First / Distinction" />
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        title="Remove Education Record"
        message={`Remove ${deleteTarget?.institution} from your education history?`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ─── EXPERIENCE SECTION ──────────────────────────────────────────────────────

const EXP_BLANK = { company_name: '', designation: '', industry: '', department: '', employment_type: '', start_date: '', end_date: '', ctc: '', reason_leaving: '', currently_working: false };

function ExperienceSection({ empId }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EXP_BLANK);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['profile-experience', empId],
    queryFn: () => apiGet(`/profile/${empId}/experience`),
    enabled: !!empId,
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = { ...form, end_date: form.currently_working ? null : (form.end_date || null) };
      delete payload.currently_working;
      return editing
        ? apiPut(`/profile/${empId}/experience/${editing.id}`, payload)
        : apiPost(`/profile/${empId}/experience`, payload);
    },
    onSuccess: () => {
      toast(editing ? 'Experience updated.' : 'Experience added.', 'success');
      queryClient.invalidateQueries({ queryKey: ['profile-experience', empId] });
      queryClient.invalidateQueries({ queryKey: ['profile-overview', empId] });
      setModalOpen(false);
    },
    onError: e => toast(e.message, 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: id => apiDelete(`/profile/${empId}/experience/${id}`),
    onSuccess: () => {
      toast('Experience removed.', 'success');
      queryClient.invalidateQueries({ queryKey: ['profile-experience', empId] });
      queryClient.invalidateQueries({ queryKey: ['profile-overview', empId] });
    },
    onError: e => toast(e.message, 'error'),
  });

  function openAdd() { setEditing(null); setForm(EXP_BLANK); setModalOpen(true); }
  function openEdit(r) {
    setEditing(r);
    setForm({ company_name: r.company_name || '', designation: r.designation || '', industry: r.industry || '', department: r.department || '', employment_type: r.employment_type || '', start_date: r.start_date || '', end_date: r.end_date || '', ctc: r.ctc || '', reason_leaving: r.reason_leaving || '', currently_working: !r.end_date });
    setModalOpen(true);
  }
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  if (isLoading) return <Spinner />;

  return (
    <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm">
      <div className="flex items-center justify-between p-5 border-b border-[#f0f3ff]">
        <SectionHeader>Work Experience</SectionHeader>
        <button onClick={openAdd} className="btn btn-primary btn-sm flex items-center gap-1.5">
          <Plus size={13} /> Add
        </button>
      </div>

      {records.length === 0 ? (
        <EmptyState icon={Briefcase} label="work experience" onAdd={openAdd} />
      ) : (
        <div className="p-5 space-y-3">
          {records.map(r => (
            <div key={r.id} className="border border-[#e8e6f4] rounded-xl p-4 bg-[#fafbff]">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-[#151c27]">{r.designation || '—'}</p>
                  <p className="text-sm font-bold text-[#3525cd]">{r.company_name}</p>
                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-[#777587]">
                    {r.employment_type && <span className="bg-[#f0f3ff] text-[#3525cd] px-2 py-0.5 rounded-full font-semibold capitalize">{r.employment_type.replace('_',' ')}</span>}
                    <span>{r.start_date ? fmtDate(r.start_date) : '?'} — {r.end_date ? fmtDate(r.end_date) : <strong className="text-emerald-700">Present</strong>}</span>
                    {r.industry && <span>{r.industry}</span>}
                  </div>
                  {r.ctc && <p className="text-xs text-[#777587] mt-1">CTC: <strong className="text-[#464555]">₹{Number(r.ctc).toLocaleString()}</strong></p>}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(r)} className="btn btn-ghost btn-icon btn-sm text-[#777587] hover:text-[#3525cd]"><Pencil size={14} /></button>
                  <button onClick={() => setDeleteTarget(r)} className="btn btn-ghost btn-icon btn-sm text-[#777587] hover:text-rose-600"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Experience' : 'Add Experience'} size="lg"
        footer={<><button className="btn btn-outline" onClick={() => setModalOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>{saveMut.isPending ? 'Saving…' : 'Save'}</button></>}>
        <div className="space-y-4">
          <div>
            <label className="form-label">Company Name *</label>
            <input className="form-control" value={form.company_name} onChange={e => setF('company_name', e.target.value)} placeholder="Company Pvt. Ltd." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Designation</label>
              <input className="form-control" value={form.designation} onChange={e => setF('designation', e.target.value)} placeholder="Software Engineer" />
            </div>
            <div>
              <label className="form-label">Employment Type</label>
              <select className="form-control" value={form.employment_type} onChange={e => setF('employment_type', e.target.value)}>
                <option value="">Select…</option>
                {[['full_time','Full Time'],['part_time','Part Time'],['contract','Contract'],['internship','Internship']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Industry</label>
              <input className="form-control" value={form.industry} onChange={e => setF('industry', e.target.value)} placeholder="IT, Finance, Healthcare…" />
            </div>
            <div>
              <label className="form-label">Department</label>
              <input className="form-control" value={form.department} onChange={e => setF('department', e.target.value)} placeholder="Engineering, HR…" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Start Date</label>
              <input type="date" className="form-control" value={form.start_date} onChange={e => setF('start_date', e.target.value)} />
            </div>
            <div>
              <label className="form-label">End Date</label>
              <input type="date" className="form-control" value={form.end_date} onChange={e => setF('end_date', e.target.value)} disabled={form.currently_working} />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="rounded" checked={form.currently_working} onChange={e => setF('currently_working', e.target.checked)} />
            <span className="text-sm text-[#464555]">I currently work here</span>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">CTC / Annual Package</label>
              <input type="number" className="form-control" value={form.ctc} onChange={e => setF('ctc', e.target.value)} placeholder="600000" />
            </div>
            <div>
              <label className="form-label">Reason for Leaving</label>
              <input className="form-control" value={form.reason_leaving} onChange={e => setF('reason_leaving', e.target.value)} placeholder="Better opportunity…" />
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        title="Remove Experience"
        message={`Remove ${deleteTarget?.company_name} from your experience?`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ─── SKILLS SECTION ──────────────────────────────────────────────────────────

const SKILL_BLANK = { skill_name: '', skill_category: 'technical', proficiency_level: 'intermediate', years_of_experience: '' };
const SKILL_CATS = ['technical','soft','language','domain','tool','other'];
const PROFICIENCY_LEVELS = ['beginner','intermediate','advanced','expert'];

function SkillsSection({ empId }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(SKILL_BLANK);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: skills = [], isLoading } = useQuery({
    queryKey: ['profile-skills', empId],
    queryFn: () => apiGet(`/profile/${empId}/skills`),
    enabled: !!empId,
  });

  const saveMut = useMutation({
    mutationFn: () => editing
      ? apiPut(`/profile/${empId}/skills/${editing.id}`, form)
      : apiPost(`/profile/${empId}/skills`, form),
    onSuccess: () => {
      toast(editing ? 'Skill updated.' : 'Skill added.', 'success');
      queryClient.invalidateQueries({ queryKey: ['profile-skills', empId] });
      queryClient.invalidateQueries({ queryKey: ['profile-overview', empId] });
      setModalOpen(false);
    },
    onError: e => toast(e.message, 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: id => apiDelete(`/profile/${empId}/skills/${id}`),
    onSuccess: () => {
      toast('Skill removed.', 'success');
      queryClient.invalidateQueries({ queryKey: ['profile-skills', empId] });
      queryClient.invalidateQueries({ queryKey: ['profile-overview', empId] });
    },
    onError: e => toast(e.message, 'error'),
  });

  function openAdd() { setEditing(null); setForm(SKILL_BLANK); setModalOpen(true); }
  function openEdit(s) { setEditing(s); setForm({ skill_name: s.skill_name || '', skill_category: s.skill_category || 'technical', proficiency_level: s.proficiency_level || 'intermediate', years_of_experience: s.years_of_experience || '' }); setModalOpen(true); }
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  if (isLoading) return <Spinner />;

  const grouped = SKILL_CATS.reduce((acc, cat) => {
    const items = skills.filter(s => s.skill_category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  return (
    <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm">
      <div className="flex items-center justify-between p-5 border-b border-[#f0f3ff]">
        <SectionHeader>Skills</SectionHeader>
        <button onClick={openAdd} className="btn btn-primary btn-sm flex items-center gap-1.5">
          <Plus size={13} /> Add Skill
        </button>
      </div>

      {skills.length === 0 ? (
        <EmptyState icon={Zap} label="skills" onAdd={openAdd} />
      ) : (
        <div className="p-5 space-y-5">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <p className="text-xs font-bold text-[#777587] uppercase tracking-wider mb-2 capitalize">{cat}</p>
              <div className="flex flex-wrap gap-2">
                {items.map(s => (
                  <div key={s.id} className="flex items-center gap-2 bg-white border border-[#e8e6f4] rounded-full px-3 py-1.5 shadow-sm group">
                    <span className="text-sm font-semibold text-[#151c27]">{s.skill_name}</span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full capitalize ${proficiencyColor(s.proficiency_level)}`}>{s.proficiency_level}</span>
                    {s.years_of_experience && <span className="text-xs text-[#777587]">{s.years_of_experience}y</span>}
                    <button onClick={() => openEdit(s)} className="text-[#777587] hover:text-[#3525cd] opacity-0 group-hover:opacity-100 transition-opacity"><Pencil size={12} /></button>
                    <button onClick={() => setDeleteTarget(s)} className="text-[#777587] hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"><X size={12} /></button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Skill' : 'Add Skill'} size="sm"
        footer={<><button className="btn btn-outline" onClick={() => setModalOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>{saveMut.isPending ? 'Saving…' : 'Save'}</button></>}>
        <div className="space-y-4">
          <div>
            <label className="form-label">Skill Name *</label>
            <input className="form-control" value={form.skill_name} onChange={e => setF('skill_name', e.target.value)} placeholder="e.g. React, Python, Leadership" />
          </div>
          <div>
            <label className="form-label">Category</label>
            <select className="form-control" value={form.skill_category} onChange={e => setF('skill_category', e.target.value)}>
              {SKILL_CATS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Proficiency Level</label>
            <select className="form-control" value={form.proficiency_level} onChange={e => setF('proficiency_level', e.target.value)}>
              {PROFICIENCY_LEVELS.map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase()+l.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Years of Experience</label>
            <input type="number" className="form-control" value={form.years_of_experience} onChange={e => setF('years_of_experience', e.target.value)} placeholder="2" min="0" max="50" />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        title="Remove Skill"
        message={`Remove "${deleteTarget?.skill_name}" from your skills?`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ─── BANKING SECTION ─────────────────────────────────────────────────────────

const BANK_BLANK = { bank_name: '', branch_name: '', account_number: '', account_holder_name: '', account_type: 'savings', ifsc_code: '', is_primary: false };

function BankingSection({ empId }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BANK_BLANK);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['profile-banking', empId],
    queryFn: () => apiGet(`/profile/${empId}/banking`),
    enabled: !!empId,
  });

  const saveMut = useMutation({
    mutationFn: () => editing
      ? apiPut(`/profile/${empId}/banking/${editing.id}`, form)
      : apiPost(`/profile/${empId}/banking`, form),
    onSuccess: () => {
      toast(editing ? 'Bank account updated.' : 'Bank account added. Pending HR verification.', 'success');
      queryClient.invalidateQueries({ queryKey: ['profile-banking', empId] });
      queryClient.invalidateQueries({ queryKey: ['profile-overview', empId] });
      setModalOpen(false);
    },
    onError: e => toast(e.message, 'error'),
  });

  function openAdd() { setEditing(null); setForm(BANK_BLANK); setModalOpen(true); }
  function openEdit(a) {
    setEditing(a);
    setForm({ bank_name: a.bank_name || '', branch_name: a.branch_name || '', account_number: a.account_number || '', account_holder_name: a.account_holder_name || '', account_type: a.account_type || 'savings', ifsc_code: a.ifsc_code || '', is_primary: a.is_primary || false });
    setModalOpen(true);
  }
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  if (isLoading) return <Spinner />;

  return (
    <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm">
      <div className="flex items-center justify-between p-5 border-b border-[#f0f3ff]">
        <SectionHeader>Bank Accounts</SectionHeader>
        <button onClick={openAdd} className="btn btn-primary btn-sm flex items-center gap-1.5">
          <Plus size={13} /> Add Account
        </button>
      </div>

      {/* Notice */}
      <div className="mx-5 mt-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">Banking changes require HR verification. New accounts will be reviewed before use for payroll.</p>
      </div>

      {accounts.length === 0 ? (
        <EmptyState icon={CreditCard} label="bank accounts" onAdd={openAdd} />
      ) : (
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {accounts.map(a => (
            <div key={a.id} className="border border-[#e8e6f4] rounded-xl p-4 bg-[#fafbff]">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    {a.is_primary && <span className="text-xs bg-[#f0f3ff] text-[#3525cd] border border-[#c7c4d8] rounded-full px-2 py-0.5 font-bold">Primary</span>}
                    {a.hr_verified
                      ? <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-bold flex items-center gap-1"><ShieldCheck size={11} /> Verified</span>
                      : <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5 font-bold flex items-center gap-1"><ShieldAlert size={11} /> Pending HR Review</span>}
                    <span className="text-xs bg-slate-100 text-slate-700 rounded-full px-2 py-0.5 capitalize">{a.account_type}</span>
                  </div>
                  <p className="text-base font-black text-[#151c27] font-mono tracking-wider">{maskAccount(a.account_number)}</p>
                  <p className="text-sm font-semibold text-[#3525cd] truncate">{a.bank_name}</p>
                  {a.branch_name && <p className="text-xs text-[#777587] truncate">{a.branch_name}</p>}
                  {a.ifsc_code && <p className="text-xs text-[#464555] font-mono">{a.ifsc_code}</p>}
                  {a.account_holder_name && <p className="text-xs text-[#777587] mt-1">{a.account_holder_name}</p>}
                </div>
                <button onClick={() => openEdit(a)} className="btn btn-ghost btn-icon btn-sm text-[#777587] hover:text-[#3525cd] flex-shrink-0">
                  <Pencil size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Bank Account' : 'Add Bank Account'} size="md"
        footer={<><button className="btn btn-outline" onClick={() => setModalOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>{saveMut.isPending ? 'Saving…' : 'Save'}</button></>}>
        <div className="space-y-4">
          <div>
            <label className="form-label">Bank Name *</label>
            <input className="form-control" value={form.bank_name} onChange={e => setF('bank_name', e.target.value)} placeholder="State Bank of India" />
          </div>
          <div>
            <label className="form-label">Branch Name</label>
            <input className="form-control" value={form.branch_name} onChange={e => setF('branch_name', e.target.value)} placeholder="Andheri West Branch" />
          </div>
          <div>
            <label className="form-label">Account Number *</label>
            <input className="form-control" value={form.account_number} onChange={e => setF('account_number', e.target.value)} placeholder="1234567890" />
          </div>
          <div>
            <label className="form-label">Account Holder Name</label>
            <input className="form-control" value={form.account_holder_name} onChange={e => setF('account_holder_name', e.target.value)} placeholder="As per bank records" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Account Type</label>
              <select className="form-control" value={form.account_type} onChange={e => setF('account_type', e.target.value)}>
                {[['savings','Savings'],['current','Current'],['salary','Salary']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">IFSC Code</label>
              <input className="form-control font-mono uppercase" value={form.ifsc_code} onChange={e => setF('ifsc_code', e.target.value.toUpperCase())} placeholder="SBIN0001234" maxLength={11} />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="rounded" checked={form.is_primary} onChange={e => setF('is_primary', e.target.checked)} />
            <span className="text-sm text-[#464555]">Set as primary account for salary</span>
          </label>
        </div>
      </Modal>
    </div>
  );
}

// ─── HEALTH SECTION ──────────────────────────────────────────────────────────

function HealthSection({ empId }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['profile-health', empId],
    queryFn: () => apiGet(`/profile/${empId}/health`),
    enabled: !!empId,
  });

  const [form, setForm] = useState(null);
  React.useEffect(() => {
    if (data !== undefined && !form) {
      setForm({
        blood_group: data?.blood_group || '',
        height: data?.height || '',
        weight: data?.weight || '',
        allergies: data?.allergies || '',
        medical_conditions: data?.medical_conditions || '',
        disabilities: data?.disabilities || '',
        emergency_medical_notes: data?.emergency_medical_notes || '',
      });
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => apiPut(`/profile/${empId}/health`, form),
    onSuccess: () => {
      toast('Health info saved.', 'success');
      queryClient.invalidateQueries({ queryKey: ['profile-health', empId] });
      queryClient.invalidateQueries({ queryKey: ['profile-overview', empId] });
    },
    onError: e => toast(e.message, 'error'),
  });

  if (isLoading) return <Spinner />;
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm">
      <div className="p-5 border-b border-[#f0f3ff]">
        <SectionHeader>Health Information</SectionHeader>
        <p className="text-xs text-[#777587] mt-1">This information is kept confidential and used only for emergency purposes.</p>
      </div>
      {form && (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="form-label">Blood Group</label>
              <select className="form-control" value={form.blood_group} onChange={e => setF('blood_group', e.target.value)}>
                <option value="">Select…</option>
                {['A+','A-','B+','B-','AB+','AB-','O+','O-','unknown'].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Height (cm)</label>
              <input type="number" className="form-control" value={form.height} onChange={e => setF('height', e.target.value)} placeholder="170" min="50" max="300" />
            </div>
            <div>
              <label className="form-label">Weight (kg)</label>
              <input type="number" className="form-control" value={form.weight} onChange={e => setF('weight', e.target.value)} placeholder="65" min="20" max="500" />
            </div>
          </div>
          <div>
            <label className="form-label">Allergies</label>
            <textarea className="form-control" rows={2} value={form.allergies} onChange={e => setF('allergies', e.target.value)} placeholder="List any known allergies (food, medicine, environment)…" />
          </div>
          <div>
            <label className="form-label">Medical Conditions</label>
            <textarea className="form-control" rows={2} value={form.medical_conditions} onChange={e => setF('medical_conditions', e.target.value)} placeholder="Any chronic conditions, medications…" />
          </div>
          <div>
            <label className="form-label">Disabilities</label>
            <textarea className="form-control" rows={2} value={form.disabilities} onChange={e => setF('disabilities', e.target.value)} placeholder="Any disabilities that may require accommodation…" />
          </div>
          <div>
            <label className="form-label">Emergency Medical Notes</label>
            <textarea className="form-control" rows={2} value={form.emergency_medical_notes} onChange={e => setF('emergency_medical_notes', e.target.value)} placeholder="Important notes for emergency responders…" />
          </div>
          <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
            className="btn btn-primary btn-sm flex items-center gap-2">
            {saveMut.isPending ? <><span className="spinner w-3.5 h-3.5" /> Saving…</> : <><Save size={14} /> Save Health Info</>}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── NOMINEES SECTION ────────────────────────────────────────────────────────

const NOM_BLANK = { nominee_name: '', relationship: '', date_of_birth: '', percentage_share: '', address: '', contact_number: '', is_primary: false };

function NomineesSection({ empId }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(NOM_BLANK);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: nominees = [], isLoading } = useQuery({
    queryKey: ['profile-nominees', empId],
    queryFn: () => apiGet(`/profile/${empId}/nominees`),
    enabled: !!empId,
  });

  const saveMut = useMutation({
    mutationFn: () => editing
      ? apiPut(`/profile/${empId}/nominees/${editing.id}`, form)
      : apiPost(`/profile/${empId}/nominees`, form),
    onSuccess: () => {
      toast(editing ? 'Nominee updated.' : 'Nominee added.', 'success');
      queryClient.invalidateQueries({ queryKey: ['profile-nominees', empId] });
      queryClient.invalidateQueries({ queryKey: ['profile-overview', empId] });
      setModalOpen(false);
    },
    onError: e => toast(e.message, 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: id => apiDelete(`/profile/${empId}/nominees/${id}`),
    onSuccess: () => {
      toast('Nominee removed.', 'success');
      queryClient.invalidateQueries({ queryKey: ['profile-nominees', empId] });
      queryClient.invalidateQueries({ queryKey: ['profile-overview', empId] });
    },
    onError: e => toast(e.message, 'error'),
  });

  function openAdd() { setEditing(null); setForm(NOM_BLANK); setModalOpen(true); }
  function openEdit(n) { setEditing(n); setForm({ nominee_name: n.nominee_name || '', relationship: n.relationship || '', date_of_birth: n.date_of_birth || '', percentage_share: n.percentage_share || '', address: n.address || '', contact_number: n.contact_number || '', is_primary: n.is_primary || false }); setModalOpen(true); }
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const totalShare = nominees.reduce((s, n) => s + (n.percentage_share || 0), 0);

  if (isLoading) return <Spinner />;

  return (
    <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm">
      <div className="flex items-center justify-between p-5 border-b border-[#f0f3ff]">
        <SectionHeader>Nominees</SectionHeader>
        <button onClick={openAdd} className="btn btn-primary btn-sm flex items-center gap-1.5">
          <Plus size={13} /> Add Nominee
        </button>
      </div>

      {nominees.length > 0 && (
        <div className="mx-5 mt-4 p-3 bg-[#f0f3ff] rounded-lg border border-[#c7c4d8]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-[#151c27]">Total Share Allocated</span>
            <span className={`text-xs font-black ${totalShare > 100 ? 'text-rose-600' : totalShare === 100 ? 'text-emerald-600' : 'text-[#3525cd]'}`}>{totalShare}%</span>
          </div>
          <div className="h-2 bg-white/60 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${totalShare > 100 ? 'bg-rose-500' : 'bg-[#3525cd]'}`}
              style={{ width: `${Math.min(totalShare, 100)}%` }} />
          </div>
          {totalShare < 100 && <p className="text-xs text-[#777587] mt-1">{100 - totalShare}% remaining to allocate</p>}
          {totalShare === 100 && <p className="text-xs text-emerald-600 mt-1">100% fully allocated</p>}
        </div>
      )}

      {nominees.length === 0 ? (
        <EmptyState icon={Shield} label="nominees" onAdd={openAdd} />
      ) : (
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {nominees.map(n => (
            <div key={n.id} className="border border-[#e8e6f4] rounded-xl p-4 bg-[#fafbff]">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    {n.is_primary && <span className="text-xs bg-[#f0f3ff] text-[#3525cd] border border-[#c7c4d8] rounded-full px-2 py-0.5 font-bold">Primary</span>}
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${relationshipColor(n.relationship)}`}>{n.relationship || '—'}</span>
                  </div>
                  <p className="text-sm font-black text-[#151c27] truncate">{n.nominee_name}</p>
                  {n.date_of_birth && <p className="text-xs text-[#777587]">DOB: {fmtDate(n.date_of_birth)}</p>}
                  {n.contact_number && <p className="text-xs text-[#777587]">{n.contact_number}</p>}
                  {n.percentage_share != null && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[#777587]">Share</span>
                        <span className="text-xs font-black text-[#3525cd]">{n.percentage_share}%</span>
                      </div>
                      <div className="h-1.5 bg-[#f0f3ff] rounded-full overflow-hidden">
                        <div className="h-full bg-[#3525cd] rounded-full" style={{ width: `${n.percentage_share}%` }} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(n)} className="btn btn-ghost btn-icon btn-sm text-[#777587] hover:text-[#3525cd]"><Pencil size={14} /></button>
                  <button onClick={() => setDeleteTarget(n)} className="btn btn-ghost btn-icon btn-sm text-[#777587] hover:text-rose-600"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Nominee' : 'Add Nominee'} size="md"
        footer={<><button className="btn btn-outline" onClick={() => setModalOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>{saveMut.isPending ? 'Saving…' : 'Save'}</button></>}>
        <div className="space-y-4">
          <div>
            <label className="form-label">Nominee Name *</label>
            <input className="form-control" value={form.nominee_name} onChange={e => setF('nominee_name', e.target.value)} placeholder="Full name" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Relationship *</label>
              <select className="form-control" value={form.relationship} onChange={e => setF('relationship', e.target.value)}>
                <option value="">Select…</option>
                {['spouse','child','parent','sibling','other'].map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Date of Birth</label>
              <input type="date" className="form-control" value={form.date_of_birth} onChange={e => setF('date_of_birth', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Share % (1-100)</label>
              <input type="number" className="form-control" value={form.percentage_share} onChange={e => setF('percentage_share', e.target.value)} placeholder="50" min="1" max="100" />
            </div>
            <div>
              <label className="form-label">Contact Number</label>
              <input className="form-control" value={form.contact_number} onChange={e => setF('contact_number', e.target.value)} placeholder="+91 98765 43210" />
            </div>
          </div>
          <div>
            <label className="form-label">Address</label>
            <textarea className="form-control" rows={2} value={form.address} onChange={e => setF('address', e.target.value)} placeholder="Nominee's address" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="rounded" checked={form.is_primary} onChange={e => setF('is_primary', e.target.checked)} />
            <span className="text-sm text-[#464555]">Primary nominee</span>
          </label>
          <p className="text-xs text-[#777587] bg-amber-50 border border-amber-200 rounded-lg p-2">Total share across all nominees cannot exceed 100%.</p>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        title="Remove Nominee"
        message={`Remove ${deleteTarget?.nominee_name} as your nominee?`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ─── ACCOUNT SETTINGS SECTION ────────────────────────────────────────────────

function AccountSection() {
  const { user, saveAuth, token } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [name,  setName]  = useState(user?.name  || '');
  const [email, setEmail] = useState(user?.email || '');
  const [color, setColor] = useState(user?.avatar_color || '#3525cd');

  const { data: myDepts = [] } = useQuery({
    queryKey: ['my-departments', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const all = await apiGet('/employees');
      const me  = all.find(e => e.id === user.id);
      return me?.departments || [];
    },
    enabled: !!user?.id,
  });

  const saveMut = useMutation({
    mutationFn: () => apiPut('/auth/profile', { name, avatar_color: color, email }),
    onSuccess: data => {
      saveAuth(token, { ...user, name: data.name, avatar_color: data.avatar_color, email: data.email });
      toast('Profile updated.', 'success');
    },
    onError: e => toast(e.message, 'error'),
  });

  const [sendVerify] = [useMutation({
    mutationFn: () => apiPost('/auth/send-verification', {}),
    onSuccess: data => { toast(data.message || 'Verification code sent.', 'info'); setVerifyModal(true); },
    onError: e => toast(e.message, 'error'),
  })];
  const [verifyModal, setVerifyModal] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const submitVerify = useMutation({
    mutationFn: () => apiPost('/auth/verify-email', { code: verifyCode }),
    onSuccess: data => {
      toast(data.message || 'Email verified!', 'success');
      saveAuth(token, { ...user, email_verified: true });
      setVerifyModal(false); setVerifyCode('');
    },
    onError: e => toast(e.message, 'error'),
  });

  return (
    <div className="space-y-5">
      {/* Account Info */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <SectionHeader>Account Info</SectionHeader>
          {user?.email_verified ? (
            <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
              <ShieldCheck size={13} /> Verified
            </span>
          ) : (
            <button onClick={() => sendVerify.mutate()} disabled={sendVerify.isPending}
              className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-300 font-bold hover:bg-amber-100">
              <ShieldAlert size={13} className="inline mr-1" />{sendVerify.isPending ? 'Sending…' : 'Verify Email'}
            </button>
          )}
        </div>
        <div>
          <label className="form-label flex items-center gap-1.5"><Mail size={13} className="text-[#3525cd]" /> Company Email</label>
          <input className="form-control" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <p className="text-[0.7rem] text-[#777587] mt-1">Changing email updates your login credentials.</p>
        </div>
        {myDepts.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[#f0f3ff]">
            <p className="text-xs text-[#777587] mb-1">Departments</p>
            <div className="flex flex-wrap gap-1">
              {myDepts.map(d => (
                <span key={d.id} className="text-xs font-semibold px-2 py-0.5 rounded-md bg-[#f0f3ff] text-[#3525cd] border border-[#c7c4d8]">
                  {d.name}{d.role && d.role !== 'Member' ? ` · ${d.role}` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Display Settings */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5">
        <SectionHeader>Display Settings</SectionHeader>
        <div className="flex items-center gap-4 my-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-black text-white shadow-md flex-shrink-0" style={{ background: color }}>
            {initials(name || user?.name || '')}
          </div>
          <div>
            <p className="text-sm font-bold text-[#151c27]">{name || user?.name}</p>
            <p className="text-xs text-[#777587]">Click a color to change your avatar</p>
          </div>
        </div>
        <div className="mb-4">
          <label className="form-label mb-2">Avatar Color</label>
          <div className="flex gap-2 flex-wrap">
            {AVATAR_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 flex-shrink-0"
                style={{ background: c, borderColor: color === c ? '#fff' : 'transparent', outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: '1px' }} />
            ))}
          </div>
        </div>
        <div className="mb-4">
          <label className="form-label">Display Name</label>
          <input className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
        </div>
        <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !name.trim()}
          className="btn btn-primary btn-sm flex items-center gap-2">
          {saveMut.isPending ? <><span className="spinner w-3.5 h-3.5" /> Saving…</> : <><Save size={14} /> Save Changes</>}
        </button>
      </div>

      <Modal open={verifyModal} onClose={() => setVerifyModal(false)} title="Enter Verification Code"
        footer={<><button className="btn btn-outline" onClick={() => setVerifyModal(false)}>Cancel</button><button className="btn btn-primary" onClick={() => submitVerify.mutate()} disabled={submitVerify.isPending || verifyCode.length < 6}>{submitVerify.isPending ? 'Verifying…' : 'Verify'}</button></>}>
        <p className="text-xs text-[#777587] mb-3">Enter the 6-digit code sent to <strong>{user?.email}</strong>.</p>
        <input className="form-control tracking-widest text-center text-lg font-black" maxLength={6} placeholder="123456" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} />
      </Modal>
    </div>
  );
}

// ─── PRIVACY & SECURITY SECTION ──────────────────────────────────────────────

function PrivacySection() {
  const { user, saveAuth, token } = useAuth();
  const toast = useToast();

  const [curPw,  setCurPw]  = useState('');
  const [newPw,  setNewPw]  = useState('');
  const [confPw, setConfPw] = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [delModal, setDelModal] = useState(false);
  const [delReason, setDelReason] = useState('');

  const changePw = useMutation({
    mutationFn: () => apiPut('/auth/change-password', { currentPassword: curPw, newPassword: newPw }),
    onSuccess: () => { toast('Password changed.', 'success'); setCurPw(''); setNewPw(''); setConfPw(''); },
    onError: e => toast(e.message, 'error'),
  });

  const deactivate = useMutation({
    mutationFn: () => apiPost('/auth/deactivate', {}),
    onSuccess: () => toast('Account deactivated.', 'warning'),
    onError: e => toast(e.message, 'error'),
  });

  const requestDel = useMutation({
    mutationFn: () => apiPost('/auth/request-deletion', { reason: delReason }),
    onSuccess: data => { toast(data.message || 'Deletion request submitted.', 'success'); setDelModal(false); setDelReason(''); },
    onError: e => toast(e.message, 'error'),
  });

  function handlePwSubmit() {
    if (newPw !== confPw) { toast('Passwords do not match.', 'error'); return; }
    if (newPw.length < 6) { toast('Password must be at least 6 characters.', 'error'); return; }
    changePw.mutate();
  }

  return (
    <div className="space-y-5">
      {/* Change Password */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5">
        <SectionHeader>Change Password</SectionHeader>
        <div className="space-y-4 mt-4">
          <div>
            <label className="form-label">Current Password</label>
            <div className="relative">
              <input className="form-control pr-10" type={showCur ? 'text' : 'password'} value={curPw} onChange={e => setCurPw(e.target.value)} placeholder="••••••••" />
              <button type="button" onClick={() => setShowCur(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777587] hover:text-[#151c27]">
                {showCur ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="form-label">New Password</label>
            <div className="relative">
              <input className="form-control pr-10" type={showNew ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min. 6 characters" />
              <button type="button" onClick={() => setShowNew(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777587] hover:text-[#151c27]">
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="form-label">Confirm New Password</label>
            <input className="form-control" type="password" value={confPw} onChange={e => setConfPw(e.target.value)} placeholder="Repeat new password" />
          </div>
          {newPw && confPw && newPw !== confPw && (
            <p className="text-xs text-rose-600">Passwords do not match.</p>
          )}
          <button onClick={handlePwSubmit} disabled={changePw.isPending || !curPw || !newPw || !confPw}
            className="btn btn-primary btn-sm flex items-center gap-2">
            {changePw.isPending ? <><span className="spinner w-3.5 h-3.5" /> Updating…</> : <><Check size={14} /> Update Password</>}
          </button>
        </div>
      </div>

      {/* GDPR Controls */}
      <div className="bg-white rounded-xl border border-rose-200 shadow-sm p-5">
        <h2 className="text-sm font-black text-rose-700 uppercase tracking-wider flex items-center gap-2 mb-2">
          <AlertTriangle size={15} className="text-rose-600" /> Account Controls &amp; Privacy (GDPR)
        </h2>
        <p className="text-xs text-[#777587] mb-4">Manage your account deactivation or submit a GDPR Right to be Forgotten deletion request.</p>
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => deactivate.mutate()} disabled={deactivate.isPending}
            className="btn btn-outline btn-sm border-amber-300 text-amber-800 hover:bg-amber-50">
            {deactivate.isPending ? 'Deactivating…' : 'Deactivate Account'}
          </button>
          <button onClick={() => setDelModal(true)} className="btn btn-danger btn-sm flex items-center gap-1.5">
            <Trash2 size={13} /> Request Account Deletion (GDPR)
          </button>
        </div>
      </div>

      <Modal open={delModal} onClose={() => setDelModal(false)} title="Request Account Deletion (GDPR)"
        footer={<><button className="btn btn-outline" onClick={() => setDelModal(false)}>Cancel</button><button className="btn btn-danger" onClick={() => requestDel.mutate()} disabled={requestDel.isPending}>{requestDel.isPending ? 'Submitting…' : 'Submit Deletion Request'}</button></>}>
        <p className="text-xs text-[#777587] mb-3">Under GDPR Right to be Forgotten, you can request permanent deletion of your profile and data. HR will review your request.</p>
        <label className="form-label">Reason for deletion (optional)</label>
        <textarea className="form-control text-xs" rows={3} placeholder="Provide a reason..." value={delReason} onChange={e => setDelReason(e.target.value)} />
      </Modal>
    </div>
  );
}

// ─── WORKPLACE LINK SECTION ──────────────────────────────────────────────────

function WorkplaceLinkSection({ link }) {
  const navigate = useNavigate();
  const descriptions = {
    '/portal/attendance': 'View your attendance records, check-in/out history, and working hours.',
    '/portal/leaves':     'Apply for leaves, view your leave balance, and track leave requests.',
    '/portal/payslips':   'Download payslips, view salary structure and payment history.',
    '/portal/documents':  'Access your offer letter, contracts, and other HR documents.',
    '/portal/performance':'View your performance reviews, goals, and feedback.',
  };
  return (
    <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-[#f0f3ff] flex items-center justify-center text-[#3525cd]">
          <link.icon size={20} />
        </div>
        <div>
          <SectionHeader>{link.label}</SectionHeader>
        </div>
      </div>
      <p className="text-sm text-[#464555] mb-4">{descriptions[link.path]}</p>
      <button onClick={() => navigate(link.path)} className="btn btn-primary btn-sm flex items-center gap-2">
        Go to {link.label} <ExternalLink size={13} />
      </button>
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────

export default function EmployeePortalProfile() {
  const { user } = useAuth();
  const empId = user?.id;
  const [section, setSection] = useState('overview');

  const workplaceLink = WORKPLACE_LINKS.find(l => l.label.toLowerCase() === section.toLowerCase());

  function renderContent() {
    switch (section) {
      case 'overview':    return <OverviewSection empId={empId} onNavigate={setSection} />;
      case 'personal':    return <PersonalSection empId={empId} />;
      case 'family':      return <FamilySection empId={empId} />;
      case 'education':   return <EducationSection empId={empId} />;
      case 'experience':  return <ExperienceSection empId={empId} />;
      case 'skills':      return <SkillsSection empId={empId} />;
      case 'banking':     return <BankingSection empId={empId} />;
      case 'health':      return <HealthSection empId={empId} />;
      case 'nominees':    return <NomineesSection empId={empId} />;
      case 'account':     return <AccountSection />;
      case 'privacy':     return <PrivacySection />;
      default:
        if (workplaceLink) return <WorkplaceLinkSection link={workplaceLink} />;
        return null;
    }
  }

  function NavItem({ item, active, onClick }) {
    return (
      <button
        onClick={onClick}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-all ${
          active
            ? 'bg-[#f0f3ff] text-[#3525cd] font-black'
            : 'text-[#464555] hover:bg-[#f8f9ff] hover:text-[#151c27] font-medium'
        }`}
      >
        <item.icon size={15} className={active ? 'text-[#3525cd]' : 'text-[#777587]'} />
        <span className="flex-1 truncate">{item.label}</span>
        {item.external && <ExternalLink size={11} className="text-[#c7c4d8] flex-shrink-0" />}
      </button>
    );
  }

  return (
    <div className="flex gap-6 min-h-[calc(100vh-120px)] max-w-6xl mx-auto">
      {/* Sidebar */}
      <div className="w-[220px] flex-shrink-0">
        <div className="sticky top-6 space-y-1">
          {/* Avatar + name */}
          <div className="flex items-center gap-2.5 px-3 py-3 mb-2">
            <Avatar name={user?.name || ''} color={user?.avatar_color || '#3525cd'} size={36} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-[#151c27] truncate">{user?.name || '—'}</p>
              <p className="text-xs text-[#777587] truncate">{user?.position || user?.role || ''}</p>
            </div>
          </div>

          {/* My Profile group */}
          <div>
            <p className="text-[10px] font-black text-[#c7c4d8] uppercase tracking-widest px-3 mb-1">My Profile</p>
            {MY_PROFILE_SECTIONS.map(item => (
              <NavItem key={item.key} item={item} active={section === item.key} onClick={() => setSection(item.key)} />
            ))}
          </div>

          {/* Workplace group */}
          <div className="pt-2">
            <p className="text-[10px] font-black text-[#c7c4d8] uppercase tracking-widest px-3 mb-1">Workplace</p>
            {WORKPLACE_LINKS.map(link => (
              <NavItem
                key={link.path}
                item={{ ...link, key: link.label.toLowerCase(), external: true }}
                active={section === link.label.toLowerCase()}
                onClick={() => setSection(link.label.toLowerCase())}
              />
            ))}
          </div>

          {/* Account group */}
          <div className="pt-2">
            <p className="text-[10px] font-black text-[#c7c4d8] uppercase tracking-widest px-3 mb-1">Account</p>
            {ACCOUNT_SECTIONS.map(item => (
              <NavItem key={item.key} item={item} active={section === item.key} onClick={() => setSection(item.key)} />
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {renderContent()}
      </div>
    </div>
  );
}
