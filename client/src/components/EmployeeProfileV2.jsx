import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Pencil, UserCheck, Umbrella, Home, Key, Download, Plus,
  Trash2, User, Briefcase, GraduationCap, CreditCard, Shield, Calendar,
  BarChart3, Settings, Phone, Mail, MapPin, Heart, Users, FileText,
  Building2, Award, BookOpen, Activity, AlertCircle, CheckCircle2,
  ChevronDown, ChevronUp, Loader2, X, Save, Eye, EyeOff, Banknote,
  Globe, Fingerprint, Clock, AlarmClock, Timer, Coffee,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/Badge';
import { fmtDate, MONTHS, countWorkingDaysInRange, countLeaveDaysInRange } from '@/lib/utils';

// ─── Helpers ────────────────────────────────────────────────────────────────

function InfoRow({ label, value, icon: Icon }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[#f0f3ff] last:border-0">
      {Icon && (
        <div className="w-7 h-7 rounded-lg bg-[#f0f3ff] flex items-center justify-center flex-shrink-0 mt-0.5">
          <Icon size={13} className="text-[#3525cd]" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[0.7rem] text-[#777587] font-medium">{label}</p>
        <p className="text-sm font-semibold text-[#151c27] break-words">{value || '—'}</p>
      </div>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, action }) {
  return (
    <div className="bg-white rounded-xl border border-[#c7c4d8] p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-black text-[#151c27] uppercase tracking-wider flex items-center gap-2">
          {Icon && <Icon size={14} className="text-[#3525cd]" />}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ icon: Icon, text, action }) {
  return (
    <div className="text-center py-8">
      <Icon size={32} className="mx-auto mb-2 text-[#c7c4d8]" />
      <p className="text-sm text-[#777587]">{text}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function LoadingSection() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={24} className="animate-spin text-[#3525cd]" />
    </div>
  );
}

function AdminBtn({ onClick, label = 'Edit', size = 'sm' }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#c7c4d8] bg-white text-[0.7rem] font-bold text-[#464555] hover:bg-[#f0f3ff] hover:text-[#3525cd] hover:border-[#3525cd]/40 transition-all">
      <Pencil size={11} /> {label}
    </button>
  );
}

const PROFICIENCY_COLORS = { beginner: 'bg-amber-100 text-amber-700', intermediate: 'bg-blue-100 text-blue-700', advanced: 'bg-emerald-100 text-emerald-700', expert: 'bg-purple-100 text-purple-700' };
const DOC_VERIFY_COLORS  = { pending: 'bg-amber-100 text-amber-700', verified: 'bg-emerald-100 text-emerald-700', rejected: 'bg-rose-100 text-rose-700' };

// ─── Tab Definitions ─────────────────────────────────────────────────────────

const TABS_ALL = [
  { id: 'overview',     label: 'Overview',     icon: BarChart3 },
  { id: 'personal',     label: 'Personal',     icon: User },
  { id: 'professional', label: 'Professional', icon: Briefcase },
  { id: 'education',    label: 'Education',    icon: GraduationCap },
  { id: 'compensation', label: 'Compensation', icon: Banknote,  adminOnly: true },
  { id: 'compliance',   label: 'Compliance',   icon: Shield,    adminOnly: true },
  { id: 'work',         label: 'Work',         icon: Clock },
  { id: 'performance',  label: 'Performance',  icon: Activity },
];

// ─── Section: Personal Tab ───────────────────────────────────────────────────

function PersonalTab({ empId, isAdmin }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [editModal, setEditModal]   = useState(null); // 'basic'|'address'|'emergency'|'health'
  const [form, setForm]             = useState({});
  const [ecModal, setEcModal]       = useState(null); // null | record (for edit)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: personal = {}, isLoading: pLoad } = useQuery({
    queryKey: ['epv2-personal', empId],
    queryFn: () => apiGet(`/profile/${empId}/personal`),
  });
  const { data: contacts = [], isLoading: cLoad } = useQuery({
    queryKey: ['epv2-emergency', empId],
    queryFn: () => apiGet(`/profile/${empId}/emergency-contacts`),
  });
  const { data: health = {} } = useQuery({
    queryKey: ['epv2-health', empId],
    queryFn: () => apiGet(`/profile/${empId}/health`),
  });

  const saveMut = useMutation({
    mutationFn: (body) => apiPut(`/profile/${empId}/personal`, body),
    onSuccess: () => { toast('Saved', 'success'); qc.invalidateQueries({ queryKey: ['epv2-personal', empId] }); setEditModal(null); },
    onError: e => toast(e.message, 'error'),
  });
  const saveHealthMut = useMutation({
    mutationFn: (body) => apiPut(`/profile/${empId}/health`, body),
    onSuccess: () => { toast('Saved', 'success'); qc.invalidateQueries({ queryKey: ['epv2-health', empId] }); setEditModal(null); },
    onError: e => toast(e.message, 'error'),
  });
  const ecMut = useMutation({
    mutationFn: (body) => ecModal?.id ? apiPut(`/profile/${empId}/emergency-contacts/${ecModal.id}`, body) : apiPost(`/profile/${empId}/emergency-contacts`, body),
    onSuccess: () => { toast('Saved', 'success'); qc.invalidateQueries({ queryKey: ['epv2-emergency', empId] }); setEcModal(null); },
    onError: e => toast(e.message, 'error'),
  });
  const delEcMut = useMutation({
    mutationFn: (id) => apiDelete(`/profile/${empId}/emergency-contacts/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['epv2-emergency', empId] }); },
    onError: e => toast(e.message, 'error'),
  });

  if (pLoad) return <LoadingSection />;

  const openBasic = () => { setForm({ ...personal }); setEditModal('basic'); };
  const openAddress = () => { setForm({ ...personal }); setEditModal('address'); };
  const openHealth = () => { setForm({ ...health }); setEditModal('health'); };
  const openEc = (rec = {}) => { setForm({ contact_name: rec.contact_name || '', relationship: rec.relationship || '', mobile_number: rec.mobile_number || '', alternate_number: rec.alternate_number || '', email: rec.email || '', address: rec.address || '', is_primary: rec.is_primary || false }); setEcModal(rec); };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Basic Info */}
      <SectionCard title="Basic Information" icon={User}
        action={isAdmin && <AdminBtn onClick={openBasic} />}>
        <InfoRow label="Salutation" value={personal.salutation} />
        <InfoRow label="Full Name" value={[personal.salutation, personal.name, personal.middle_name, personal.surname].filter(Boolean).join(' ')} icon={User} />
        <InfoRow label="Date of Birth" value={personal.date_of_birth ? fmtDate(personal.date_of_birth) : null} />
        <InfoRow label="Gender" value={personal.gender} />
        <InfoRow label="Blood Group" value={personal.blood_group} icon={Heart} />
        <InfoRow label="Marital Status" value={personal.marital_status} />
        <InfoRow label="Nationality" value={personal.nationality} />
        <InfoRow label="Religion" value={personal.religion} />
        <InfoRow label="Citizenship" value={personal.citizenship} icon={Globe} />
        <InfoRow label="Height" value={personal.height} />
        <InfoRow label="Weight" value={personal.weight} />
      </SectionCard>

      {/* Contact */}
      <SectionCard title="Contact Information" icon={Phone}
        action={isAdmin && <AdminBtn onClick={openBasic} />}>
        <InfoRow label="Company Email" value={personal.email} icon={Mail} />
        <InfoRow label="Personal Email" value={personal.personal_email} icon={Mail} />
        <InfoRow label="Mobile" value={personal.phone} icon={Phone} />
      </SectionCard>

      {/* Current Address */}
      <SectionCard title="Current Address" icon={MapPin}
        action={isAdmin && <AdminBtn onClick={openAddress} />}>
        <InfoRow label="Address Line 1" value={personal.current_address_line1} />
        <InfoRow label="Address Line 2" value={personal.current_address_line2} />
        <InfoRow label="City" value={personal.current_city} />
        <InfoRow label="State" value={personal.current_state} />
        <InfoRow label="Country" value={personal.current_country} />
        <InfoRow label="Postal Code" value={personal.current_postal_code} />
      </SectionCard>

      {/* Permanent Address */}
      <SectionCard title="Permanent Address" icon={Home}
        action={isAdmin && <AdminBtn onClick={openAddress} />}>
        <InfoRow label="Address" value={personal.permanent_address} />
        <InfoRow label="City" value={personal.permanent_city} />
        <InfoRow label="State" value={personal.permanent_state} />
        <InfoRow label="Country" value={personal.permanent_country} />
        <InfoRow label="Postal Code" value={personal.permanent_postal_code} />
      </SectionCard>

      {/* Health */}
      <SectionCard title="Health Information" icon={Heart}
        action={isAdmin && <AdminBtn onClick={openHealth} />}>
        <InfoRow label="Blood Group" value={health.blood_group} />
        <InfoRow label="Allergies" value={health.allergies} />
        <InfoRow label="Medical Conditions" value={health.medical_conditions} />
        <InfoRow label="Disabilities" value={health.disabilities} />
        {isAdmin && <InfoRow label="Health Insurance" value={health.health_insurance_provider} />}
        {isAdmin && <InfoRow label="Insurance Number" value={health.health_insurance_number} />}
        <InfoRow label="Emergency Medical Notes" value={health.emergency_medical_notes} />
      </SectionCard>

      {/* Emergency Contacts */}
      <SectionCard title="Emergency Contacts" icon={AlertCircle}
        action={isAdmin && <AdminBtn onClick={() => openEc()} label="Add" />}>
        {cLoad ? <LoadingSection /> : contacts.length === 0
          ? <EmptyState icon={AlertCircle} text="No emergency contacts added" />
          : contacts.map(c => (
            <div key={c.id} className="py-3 border-b border-[#f0f3ff] last:border-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-[#151c27]">{c.contact_name} {c.is_primary && <span className="ml-1 text-[0.6rem] bg-[#3525cd] text-white px-1.5 py-0.5 rounded-full">Primary</span>}</p>
                  <p className="text-xs text-[#777587]">{c.relationship}</p>
                  <p className="text-xs text-[#464555] mt-0.5">{c.mobile_number}</p>
                  {c.email && <p className="text-xs text-[#464555]">{c.email}</p>}
                </div>
                {isAdmin && (
                  <div className="flex gap-1">
                    <button onClick={() => openEc(c)} className="p-1.5 rounded hover:bg-[#f0f3ff] text-[#3525cd]"><Pencil size={12} /></button>
                    <button onClick={() => delEcMut.mutate(c.id)} className="p-1.5 rounded hover:bg-rose-50 text-rose-500"><Trash2 size={12} /></button>
                  </div>
                )}
              </div>
            </div>
          ))
        }
      </SectionCard>

      {/* Edit Basic Modal */}
      <Modal open={editModal === 'basic'} onClose={() => setEditModal(null)} title="Edit Basic Information" size="lg"
        footer={<div className="flex justify-end gap-3"><button className="btn btn-outline" onClick={() => setEditModal(null)}>Cancel</button><button className="btn btn-primary" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>{saveMut.isPending ? 'Saving…' : 'Save'}</button></div>}>
        <div className="grid grid-cols-2 gap-4">
          {[['salutation','Salutation'],['name','First Name'],['middle_name','Middle Name'],['surname','Last Name'],['phone','Mobile'],['personal_email','Personal Email'],['date_of_birth','Date of Birth','date'],['gender','Gender'],['blood_group','Blood Group'],['marital_status','Marital Status'],['nationality','Nationality'],['religion','Religion'],['citizenship','Citizenship'],['height','Height'],['weight','Weight']].map(([k,l,t]) => (
            <div key={k}><label className="form-label">{l}</label><input className="form-control" type={t||'text'} value={form[k]||''} onChange={e=>set(k,e.target.value)}/></div>
          ))}
        </div>
      </Modal>

      {/* Edit Address Modal */}
      <Modal open={editModal === 'address'} onClose={() => setEditModal(null)} title="Edit Addresses" size="lg"
        footer={<div className="flex justify-end gap-3"><button className="btn btn-outline" onClick={() => setEditModal(null)}>Cancel</button><button className="btn btn-primary" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>{saveMut.isPending ? 'Saving…' : 'Save'}</button></div>}>
        <div className="grid grid-cols-1 gap-4">
          <p className="text-xs font-black text-[#777587] uppercase tracking-wider">Current Address</p>
          <div className="grid grid-cols-2 gap-4">
            {[['current_address_line1','Address Line 1'],['current_address_line2','Address Line 2'],['current_city','City'],['current_state','State'],['current_country','Country'],['current_postal_code','Postal Code']].map(([k,l])=>(
              <div key={k}><label className="form-label">{l}</label><input className="form-control" value={form[k]||''} onChange={e=>set(k,e.target.value)}/></div>
            ))}
          </div>
          <p className="text-xs font-black text-[#777587] uppercase tracking-wider mt-2">Permanent Address</p>
          <div className="grid grid-cols-2 gap-4">
            {[['permanent_address','Address'],['permanent_city','City'],['permanent_state','State'],['permanent_country','Country'],['permanent_postal_code','Postal Code']].map(([k,l])=>(
              <div key={k}><label className="form-label">{l}</label><input className="form-control" value={form[k]||''} onChange={e=>set(k,e.target.value)}/></div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Edit Health Modal */}
      <Modal open={editModal === 'health'} onClose={() => setEditModal(null)} title="Edit Health Information" size="md"
        footer={<div className="flex justify-end gap-3"><button className="btn btn-outline" onClick={() => setEditModal(null)}>Cancel</button><button className="btn btn-primary" onClick={() => saveHealthMut.mutate(form)} disabled={saveHealthMut.isPending}>{saveHealthMut.isPending ? 'Saving…' : 'Save'}</button></div>}>
        <div className="grid grid-cols-2 gap-4">
          {[['blood_group','Blood Group'],['allergies','Allergies'],['medical_conditions','Medical Conditions'],['disabilities','Disabilities'],['emergency_medical_notes','Emergency Medical Notes'],['health_insurance_provider','Insurance Provider'],['health_insurance_number','Insurance Number'],['health_insurance_expiry','Insurance Expiry','date']].map(([k,l,t])=>(
            <div key={k}><label className="form-label">{l}</label><input className="form-control" type={t||'text'} value={form[k]||''} onChange={e=>set(k,e.target.value)}/></div>
          ))}
        </div>
      </Modal>

      {/* Emergency Contact Modal */}
      <Modal open={ecModal !== null} onClose={() => setEcModal(null)} title={ecModal?.id ? 'Edit Emergency Contact' : 'Add Emergency Contact'} size="md"
        footer={<div className="flex justify-end gap-3"><button className="btn btn-outline" onClick={() => setEcModal(null)}>Cancel</button><button className="btn btn-primary" onClick={() => ecMut.mutate(form)} disabled={ecMut.isPending}>{ecMut.isPending ? 'Saving…' : 'Save'}</button></div>}>
        <div className="grid grid-cols-2 gap-4">
          {[['contact_name','Name *'],['relationship','Relationship'],['mobile_number','Mobile *'],['alternate_number','Alternate Number'],['email','Email'],['address','Address']].map(([k,l])=>(
            <div key={k}><label className="form-label">{l}</label><input className="form-control" value={form[k]||''} onChange={e=>set(k,e.target.value)}/></div>
          ))}
          <div className="flex items-center gap-2 col-span-2">
            <input type="checkbox" id="ecPrimary" checked={form.is_primary||false} onChange={e=>set('is_primary',e.target.checked)} className="accent-[#3525cd]"/>
            <label htmlFor="ecPrimary" className="text-sm text-[#464555]">Primary contact</label>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Section: Professional Tab ───────────────────────────────────────────────

function ProfessionalTab({ empId, isAdmin, onEdit, emp }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [skillModal, setSkillModal] = useState(null);
  const [expModal, setExpModal]     = useState(null);
  const [form, setForm]             = useState({});
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: prof = {}, isLoading } = useQuery({
    queryKey: ['epv2-professional', empId],
    queryFn: () => apiGet(`/profile/${empId}/professional`),
  });
  const { data: skills = [] } = useQuery({
    queryKey: ['epv2-skills', empId],
    queryFn: () => apiGet(`/profile/${empId}/skills`),
  });
  const { data: experiences = [] } = useQuery({
    queryKey: ['epv2-experience', empId],
    queryFn: () => apiGet(`/profile/${empId}/experience`),
  });

  const skillMut = useMutation({
    mutationFn: (body) => skillModal?.id ? apiPut(`/profile/${empId}/skills/${skillModal.id}`, body) : apiPost(`/profile/${empId}/skills`, body),
    onSuccess: () => { toast('Saved', 'success'); qc.invalidateQueries({ queryKey: ['epv2-skills', empId] }); setSkillModal(null); },
    onError: e => toast(e.message, 'error'),
  });
  const delSkillMut = useMutation({
    mutationFn: (id) => apiDelete(`/profile/${empId}/skills/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['epv2-skills', empId] }),
    onError: e => toast(e.message, 'error'),
  });
  const expMut = useMutation({
    mutationFn: (body) => expModal?.id ? apiPut(`/profile/${empId}/experience/${expModal.id}`, body) : apiPost(`/profile/${empId}/experience`, body),
    onSuccess: () => { toast('Saved', 'success'); qc.invalidateQueries({ queryKey: ['epv2-experience', empId] }); setExpModal(null); },
    onError: e => toast(e.message, 'error'),
  });
  const delExpMut = useMutation({
    mutationFn: (id) => apiDelete(`/profile/${empId}/experience/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['epv2-experience', empId] }),
    onError: e => toast(e.message, 'error'),
  });

  const openSkill = (rec = {}) => { setForm({ skill_name: rec.skill_name||'', skill_category: rec.skill_category||'technical', proficiency_level: rec.proficiency_level||'intermediate', years_of_experience: rec.years_of_experience||'', can_read: rec.can_read||false, can_write: rec.can_write||false, can_speak: rec.can_speak||false }); setSkillModal(rec); };
  const openExp   = (rec = {}) => { setForm({ company_name: rec.company_name||'', designation: rec.designation||'', industry: rec.industry||'', department: rec.department||'', employment_type: rec.employment_type||'', start_date: rec.start_date||'', end_date: rec.end_date||'', last_salary: rec.last_salary||'', manager_name: rec.manager_name||'', reason_leaving: rec.reason_leaving||'' }); setExpModal(rec); };

  if (isLoading) return <LoadingSection />;

  const techSkills = skills.filter(s => s.skill_category === 'technical');
  const softSkills = skills.filter(s => s.skill_category === 'soft');
  const languages  = skills.filter(s => s.skill_category === 'language');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Employment Details */}
      <SectionCard title="Employment Details" icon={Briefcase}
        action={isAdmin && <AdminBtn onClick={() => onEdit(emp, 'employment')} />}>
        <InfoRow label="Employee ID" value={prof.employee_id || emp.employee_id} />
        <InfoRow label="Department" value={prof.departments?.map(d => d.name).join(', ') || prof.department} icon={Building2} />
        <InfoRow label="Designation" value={prof.position} />
        <InfoRow label="Grade" value={prof.grade} />
        <InfoRow label="Pay Cadre" value={prof.pay_cadre} />
        <InfoRow label="Cost Centre" value={prof.cost_centre} />
        <InfoRow label="Division" value={prof.division} />
        <InfoRow label="Employment Type" value={prof.employment_type} />
        <InfoRow label="Work Mode" value={prof.work_mode} />
        <InfoRow label="Status" value={prof.employee_status} />
      </SectionCard>

      {/* Org Structure */}
      <SectionCard title="Organisation Structure" icon={Users}>
        <InfoRow label="Joining Date" value={prof.joining_date ? fmtDate(prof.joining_date) : null} />
        <InfoRow label="Confirmation Date" value={prof.confirmation_date ? fmtDate(prof.confirmation_date) : null} />
        <InfoRow label="Reporting Manager" value={prof.manager?.name} icon={User} />
        <InfoRow label="HOD" value={prof.hod?.name} />
        <InfoRow label="Branch" value={prof.branch?.name} icon={MapPin} />
        <InfoRow label="Work Location" value={prof.location} />
        <InfoRow label="Weekly Off" value={prof.weekly_off_day} />
        <InfoRow label="Work Hours/Day" value={prof.work_hours_per_day ? `${prof.work_hours_per_day}h` : null} />
        {prof.probation_applicable && <InfoRow label="Probation" value={`${prof.probation_months} months`} />}
      </SectionCard>

      {/* Skills */}
      <SectionCard title="Skills" icon={Award}
        action={isAdmin && <AdminBtn onClick={() => openSkill()} label="Add Skill" />}>
        {skills.length === 0 ? <EmptyState icon={Award} text="No skills added yet" /> : (
          <div className="space-y-4">
            {techSkills.length > 0 && (
              <div>
                <p className="text-[0.65rem] font-black text-[#777587] uppercase tracking-wider mb-2">Technical</p>
                <div className="flex flex-wrap gap-2">
                  {techSkills.map(s => (
                    <div key={s.id} className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#e7eefe] bg-[#f9f9ff]">
                      <span className="text-xs font-semibold text-[#151c27]">{s.skill_name}</span>
                      <span className={`text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full ${PROFICIENCY_COLORS[s.proficiency_level] || 'bg-gray-100 text-gray-600'}`}>{s.proficiency_level}</span>
                      {isAdmin && <button onClick={() => delSkillMut.mutate(s.id)} className="hidden group-hover:block text-rose-400 hover:text-rose-600"><X size={11}/></button>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {softSkills.length > 0 && (
              <div>
                <p className="text-[0.65rem] font-black text-[#777587] uppercase tracking-wider mb-2">Soft Skills</p>
                <div className="flex flex-wrap gap-2">
                  {softSkills.map(s => (
                    <div key={s.id} className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#e7eefe] bg-[#f0f3ff]">
                      <span className="text-xs font-semibold text-[#3525cd]">{s.skill_name}</span>
                      {isAdmin && <button onClick={() => delSkillMut.mutate(s.id)} className="hidden group-hover:block text-rose-400"><X size={11}/></button>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {languages.length > 0 && (
              <div>
                <p className="text-[0.65rem] font-black text-[#777587] uppercase tracking-wider mb-2">Languages</p>
                {languages.map(s => (
                  <div key={s.id} className="flex items-center justify-between py-1.5">
                    <span className="text-sm font-semibold text-[#151c27]">{s.skill_name}</span>
                    <div className="flex gap-2 text-[0.65rem]">
                      {s.can_read  && <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold">Read</span>}
                      {s.can_write && <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold">Write</span>}
                      {s.can_speak && <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-bold">Speak</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Work Experience */}
      <SectionCard title="Work Experience" icon={Briefcase}
        action={isAdmin && <AdminBtn onClick={() => openExp()} label="Add" />}>
        {experiences.length === 0 ? <EmptyState icon={Briefcase} text="No experience records" /> : (
          <div className="space-y-4">
            {experiences.map(e => (
              <div key={e.id} className="p-3 rounded-xl border border-[#f0f3ff] bg-[#f9f9ff]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-[#151c27]">{e.designation}</p>
                    <p className="text-xs font-bold text-[#3525cd]">{e.company_name}</p>
                    <p className="text-xs text-[#777587] mt-0.5">{e.start_date ? fmtDate(e.start_date) : '—'} → {e.end_date ? fmtDate(e.end_date) : 'Present'}</p>
                    {e.industry && <p className="text-xs text-[#777587]">{e.industry}</p>}
                  </div>
                  {isAdmin && <div className="flex gap-1">
                    <button onClick={() => openExp(e)} className="p-1.5 rounded hover:bg-white text-[#3525cd]"><Pencil size={12}/></button>
                    <button onClick={() => delExpMut.mutate(e.id)} className="p-1.5 rounded hover:bg-rose-50 text-rose-500"><Trash2 size={12}/></button>
                  </div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Skill Modal */}
      <Modal open={skillModal !== null} onClose={() => setSkillModal(null)} title={skillModal?.id ? 'Edit Skill' : 'Add Skill'} size="md"
        footer={<div className="flex justify-end gap-3"><button className="btn btn-outline" onClick={() => setSkillModal(null)}>Cancel</button><button className="btn btn-primary" onClick={() => skillMut.mutate(form)} disabled={skillMut.isPending}>{skillMut.isPending ? 'Saving…' : 'Save'}</button></div>}>
        <div className="space-y-4">
          <div><label className="form-label">Skill Name *</label><input className="form-control" value={form.skill_name||''} onChange={e=>set('skill_name',e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="form-label">Category</label>
              <select className="form-control" value={form.skill_category||'technical'} onChange={e=>set('skill_category',e.target.value)}>
                {['technical','soft','language','other'].map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
              </select></div>
            <div><label className="form-label">Proficiency</label>
              <select className="form-control" value={form.proficiency_level||'intermediate'} onChange={e=>set('proficiency_level',e.target.value)}>
                {['beginner','intermediate','advanced','expert'].map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
              </select></div>
            <div><label className="form-label">Years of Experience</label><input className="form-control" type="number" value={form.years_of_experience||''} onChange={e=>set('years_of_experience',e.target.value)}/></div>
          </div>
          {form.skill_category === 'language' && (
            <div className="flex gap-4">
              {[['can_read','Read'],['can_write','Write'],['can_speak','Speak']].map(([k,l])=>(
                <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form[k]||false} onChange={e=>set(k,e.target.checked)} className="accent-[#3525cd]"/>{l}</label>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Experience Modal */}
      <Modal open={expModal !== null} onClose={() => setExpModal(null)} title={expModal?.id ? 'Edit Experience' : 'Add Experience'} size="lg"
        footer={<div className="flex justify-end gap-3"><button className="btn btn-outline" onClick={() => setExpModal(null)}>Cancel</button><button className="btn btn-primary" onClick={() => expMut.mutate(form)} disabled={expMut.isPending}>{expMut.isPending ? 'Saving…' : 'Save'}</button></div>}>
        <div className="grid grid-cols-2 gap-4">
          {[['company_name','Company Name *'],['designation','Designation'],['industry','Industry'],['department','Department'],['employment_type','Employment Type'],['start_date','Start Date','date'],['end_date','End Date','date'],['last_salary','Last Salary','number'],['manager_name','Manager Name'],['reason_leaving','Reason for Leaving']].map(([k,l,t])=>(
            <div key={k}><label className="form-label">{l}</label><input className="form-control" type={t||'text'} value={form[k]||''} onChange={e=>set(k,e.target.value)}/></div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

// ─── Section: Education Tab ───────────────────────────────────────────────────

function EducationTab({ empId, isAdmin }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [eduModal,  setEduModal]  = useState(null);
  const [trainModal,setTrainModal]= useState(null);
  const [certModal, setCertModal] = useState(null);
  const [form, setForm] = useState({});
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: education = [], isLoading } = useQuery({ queryKey: ['epv2-education', empId], queryFn: () => apiGet(`/profile/${empId}/education`) });
  const { data: training  = [] } = useQuery({ queryKey: ['epv2-training',   empId], queryFn: () => apiGet(`/profile/${empId}/training`) });
  const { data: certs     = [] } = useQuery({ queryKey: ['epv2-certs',      empId], queryFn: () => apiGet(`/profile/${empId}/certifications`) });

  const eduMut   = useMutation({ mutationFn: b => eduModal?.id  ? apiPut(`/profile/${empId}/education/${eduModal.id}`, b)    : apiPost(`/profile/${empId}/education`, b),    onSuccess: () => { toast('Saved','success'); qc.invalidateQueries({queryKey:['epv2-education',empId]}); setEduModal(null);  }, onError: e=>toast(e.message,'error') });
  const trainMut = useMutation({ mutationFn: b => trainModal?.id? apiPut(`/profile/${empId}/training/${trainModal.id}`, b)   : apiPost(`/profile/${empId}/training`, b),     onSuccess: () => { toast('Saved','success'); qc.invalidateQueries({queryKey:['epv2-training',empId]}); setTrainModal(null);}, onError: e=>toast(e.message,'error') });
  const certMut  = useMutation({ mutationFn: b => certModal?.id ? apiPut(`/profile/${empId}/certifications/${certModal.id}`,b): apiPost(`/profile/${empId}/certifications`,b), onSuccess: () => { toast('Saved','success'); qc.invalidateQueries({queryKey:['epv2-certs',empId]});  setCertModal(null); }, onError: e=>toast(e.message,'error') });
  const delEdu   = useMutation({ mutationFn: id => apiDelete(`/profile/${empId}/education/${id}`),        onSuccess: () => qc.invalidateQueries({queryKey:['epv2-education',empId]}) });
  const delTrain = useMutation({ mutationFn: id => apiDelete(`/profile/${empId}/training/${id}`),         onSuccess: () => qc.invalidateQueries({queryKey:['epv2-training',empId]}) });
  const delCert  = useMutation({ mutationFn: id => apiDelete(`/profile/${empId}/certifications/${id}`),   onSuccess: () => qc.invalidateQueries({queryKey:['epv2-certs',empId]}) });

  const openEdu   = (r={}) => { setForm({degree_level:r.degree_level||'',institution:r.institution||'',board_university:r.board_university||'',specialization:r.specialization||'',year_of_passing:r.year_of_passing||'',percentage:r.percentage||'',cgpa:r.cgpa||'',degree_class:r.degree_class||''}); setEduModal(r); };
  const openTrain = (r={}) => { setForm({training_name:r.training_name||'',training_type:r.training_type||'other',training_provider:r.training_provider||'',start_date:r.start_date||'',end_date:r.end_date||'',duration_hours:r.duration_hours||'',completion_status:r.completion_status||'in_progress',score:r.score||'',certificate_url:r.certificate_url||'',remarks:r.remarks||''}); setTrainModal(r); };
  const openCert  = (r={}) => { setForm({certification_name:r.certification_name||'',issuing_authority:r.issuing_authority||'',issue_date:r.issue_date||'',expiry_date:r.expiry_date||'',certification_number:r.certification_number||'',file_url:r.file_url||'',is_lifetime:r.is_lifetime||false}); setCertModal(r); };

  const DEGREE_LEVELS = ['SSC / 10th','HSC / 12th','Diploma','Graduation','Post Graduation','PhD','Other'];

  if (isLoading) return <LoadingSection />;

  return (
    <div className="space-y-5">
      {/* Education */}
      <SectionCard title="Educational Qualifications" icon={GraduationCap}
        action={isAdmin && <AdminBtn onClick={() => openEdu()} label="Add" />}>
        {education.length === 0 ? <EmptyState icon={GraduationCap} text="No qualifications added" /> : (
          <div className="space-y-3">
            {education.map(e => (
              <div key={e.id} className="p-3 rounded-xl border border-[#f0f3ff] bg-[#f9f9ff] flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-black text-[#151c27]">{e.degree_level || 'Qualification'}</p>
                    {e.specialization && <span className="text-[0.65rem] bg-[#e7eefe] text-[#3525cd] px-1.5 py-0.5 rounded-full font-bold">{e.specialization}</span>}
                  </div>
                  <p className="text-xs font-semibold text-[#464555]">{e.institution}</p>
                  {e.board_university && <p className="text-xs text-[#777587]">{e.board_university}</p>}
                  <div className="flex gap-3 mt-1 text-xs text-[#777587]">
                    {e.year_of_passing && <span>Year: {e.year_of_passing}</span>}
                    {e.percentage && <span>Score: {e.percentage}%</span>}
                    {e.cgpa && <span>CGPA: {e.cgpa}</span>}
                  </div>
                </div>
                {isAdmin && <div className="flex gap-1"><button onClick={() => openEdu(e)} className="p-1.5 rounded hover:bg-white text-[#3525cd]"><Pencil size={12}/></button><button onClick={() => delEdu.mutate(e.id)} className="p-1.5 rounded hover:bg-rose-50 text-rose-500"><Trash2 size={12}/></button></div>}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Certifications */}
      <SectionCard title="Certifications" icon={Award}
        action={isAdmin && <AdminBtn onClick={() => openCert()} label="Add" />}>
        {certs.length === 0 ? <EmptyState icon={Award} text="No certifications added" /> : (
          <div className="space-y-3">
            {certs.map(c => (
              <div key={c.id} className="p-3 rounded-xl border border-[#f0f3ff] bg-[#f9f9ff] flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-[#151c27]">{c.certification_name}</p>
                  {c.issuing_authority && <p className="text-xs text-[#3525cd] font-semibold">{c.issuing_authority}</p>}
                  <div className="flex gap-3 mt-0.5 text-xs text-[#777587]">
                    {c.issue_date && <span>Issued: {fmtDate(c.issue_date)}</span>}
                    {c.is_lifetime ? <span className="text-emerald-600 font-bold">Lifetime</span> : c.expiry_date && <span>Expires: {fmtDate(c.expiry_date)}</span>}
                  </div>
                  {c.file_url && <a href={c.file_url} target="_blank" rel="noreferrer" className="text-xs text-[#3525cd] underline mt-1 flex items-center gap-1"><Download size={10}/> View Certificate</a>}
                </div>
                {isAdmin && <div className="flex gap-1"><button onClick={() => openCert(c)} className="p-1.5 rounded hover:bg-white text-[#3525cd]"><Pencil size={12}/></button><button onClick={() => delCert.mutate(c.id)} className="p-1.5 rounded hover:bg-rose-50 text-rose-500"><Trash2 size={12}/></button></div>}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Training */}
      <SectionCard title="Training & Learning" icon={BookOpen}
        action={isAdmin && <AdminBtn onClick={() => openTrain()} label="Add" />}>
        {training.length === 0 ? <EmptyState icon={BookOpen} text="No training records" /> : (
          <div className="space-y-3">
            {training.map(t => (
              <div key={t.id} className="p-3 rounded-xl border border-[#f0f3ff] bg-[#f9f9ff] flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-[#151c27]">{t.training_name}</p>
                  {t.training_provider && <p className="text-xs text-[#464555]">{t.training_provider}</p>}
                  <div className="flex gap-3 mt-0.5 flex-wrap">
                    <span className={`text-[0.65rem] font-bold px-1.5 py-0.5 rounded-full ${t.completion_status === 'completed' ? 'bg-emerald-100 text-emerald-700' : t.completion_status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{t.completion_status}</span>
                    {t.duration_hours && <span className="text-xs text-[#777587]">{t.duration_hours}h</span>}
                    {t.score && <span className="text-xs text-[#777587]">Score: {t.score}</span>}
                  </div>
                </div>
                {isAdmin && <div className="flex gap-1"><button onClick={() => openTrain(t)} className="p-1.5 rounded hover:bg-white text-[#3525cd]"><Pencil size={12}/></button><button onClick={() => delTrain.mutate(t.id)} className="p-1.5 rounded hover:bg-rose-50 text-rose-500"><Trash2 size={12}/></button></div>}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Education Modal */}
      <Modal open={eduModal !== null} onClose={() => setEduModal(null)} title={eduModal?.id ? 'Edit Qualification' : 'Add Qualification'} size="lg"
        footer={<div className="flex justify-end gap-3"><button className="btn btn-outline" onClick={() => setEduModal(null)}>Cancel</button><button className="btn btn-primary" onClick={() => eduMut.mutate(form)} disabled={eduMut.isPending}>{eduMut.isPending ? 'Saving…' : 'Save'}</button></div>}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className="form-label">Degree Level</label>
            <select className="form-control" value={form.degree_level||''} onChange={e=>set('degree_level',e.target.value)}>
              <option value="">— Select —</option>
              {DEGREE_LEVELS.map(d=><option key={d} value={d}>{d}</option>)}
            </select></div>
          {[['institution','Institution / School *'],['board_university','Board / University'],['specialization','Specialization / Stream'],['year_of_passing','Year of Passing','number'],['percentage','Percentage','number'],['cgpa','CGPA','number'],['degree_class','Class / Division']].map(([k,l,t])=>(
            <div key={k}><label className="form-label">{l}</label><input className="form-control" type={t||'text'} value={form[k]||''} onChange={e=>set(k,e.target.value)}/></div>
          ))}
        </div>
      </Modal>

      {/* Certification Modal */}
      <Modal open={certModal !== null} onClose={() => setCertModal(null)} title={certModal?.id ? 'Edit Certification' : 'Add Certification'} size="md"
        footer={<div className="flex justify-end gap-3"><button className="btn btn-outline" onClick={() => setCertModal(null)}>Cancel</button><button className="btn btn-primary" onClick={() => certMut.mutate(form)} disabled={certMut.isPending}>{certMut.isPending ? 'Saving…' : 'Save'}</button></div>}>
        <div className="grid grid-cols-2 gap-4">
          {[['certification_name','Certification Name *'],['issuing_authority','Issuing Authority'],['issue_date','Issue Date','date'],['expiry_date','Expiry Date','date'],['certification_number','Certificate Number'],['file_url','Certificate URL']].map(([k,l,t])=>(
            <div key={k}><label className="form-label">{l}</label><input className="form-control" type={t||'text'} value={form[k]||''} onChange={e=>set(k,e.target.value)}/></div>
          ))}
          <label className="flex items-center gap-2 text-sm col-span-2"><input type="checkbox" checked={form.is_lifetime||false} onChange={e=>set('is_lifetime',e.target.checked)} className="accent-[#3525cd]"/>Lifetime Certificate (no expiry)</label>
        </div>
      </Modal>

      {/* Training Modal */}
      <Modal open={trainModal !== null} onClose={() => setTrainModal(null)} title={trainModal?.id ? 'Edit Training' : 'Add Training'} size="lg"
        footer={<div className="flex justify-end gap-3"><button className="btn btn-outline" onClick={() => setTrainModal(null)}>Cancel</button><button className="btn btn-primary" onClick={() => trainMut.mutate(form)} disabled={trainMut.isPending}>{trainMut.isPending ? 'Saving…' : 'Save'}</button></div>}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className="form-label">Training Name *</label><input className="form-control" value={form.training_name||''} onChange={e=>set('training_name',e.target.value)}/></div>
          <div><label className="form-label">Type</label>
            <select className="form-control" value={form.training_type||'other'} onChange={e=>set('training_type',e.target.value)}>
              {['online','offline','workshop','conference','internal','external','other'].map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
            </select></div>
          <div><label className="form-label">Status</label>
            <select className="form-control" value={form.completion_status||'in_progress'} onChange={e=>set('completion_status',e.target.value)}>
              {[['planned','Planned'],['in_progress','In Progress'],['completed','Completed'],['cancelled','Cancelled']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select></div>
          {[['training_provider','Provider'],['start_date','Start Date','date'],['end_date','End Date','date'],['duration_hours','Duration (hrs)','number'],['score','Score / Grade'],['certificate_url','Certificate URL'],['remarks','Remarks']].map(([k,l,t])=>(
            <div key={k}><label className="form-label">{l}</label><input className="form-control" type={t||'text'} value={form[k]||''} onChange={e=>set(k,e.target.value)}/></div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

// ─── Section: Compensation Tab ────────────────────────────────────────────────

function CompensationTab({ empId, isAdmin, onEdit, emp }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [bankModal, setBankModal]   = useState(null);
  const [nomModal,  setNomModal]    = useState(null);
  const [form, setForm] = useState({});
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: payroll, isLoading: pLoad }  = useQuery({ queryKey: ['epv2-payroll',  empId], queryFn: () => apiGet('/payroll/structure', { userId: empId }) });
  const { data: banking  = [], isLoading: bLoad } = useQuery({ queryKey: ['epv2-banking',  empId], queryFn: () => apiGet(`/profile/${empId}/banking`) });
  const { data: nominees = [] } = useQuery({ queryKey: ['epv2-nominees', empId], queryFn: () => apiGet(`/profile/${empId}/nominees`) });

  const bankMut = useMutation({ mutationFn: b => bankModal?.id ? apiPut(`/profile/${empId}/banking/${bankModal.id}`,b) : apiPost(`/profile/${empId}/banking`,b), onSuccess: () => { toast('Saved','success'); qc.invalidateQueries({queryKey:['epv2-banking',empId]}); setBankModal(null); }, onError: e=>toast(e.message,'error') });
  const delBank = useMutation({ mutationFn: id => apiDelete(`/profile/${empId}/banking/${id}`), onSuccess: () => qc.invalidateQueries({queryKey:['epv2-banking',empId]}) });
  const nomMut  = useMutation({ mutationFn: b => nomModal?.id  ? apiPut(`/profile/${empId}/nominees/${nomModal.id}`,b)  : apiPost(`/profile/${empId}/nominees`,b),  onSuccess: () => { toast('Saved','success'); qc.invalidateQueries({queryKey:['epv2-nominees',empId]}); setNomModal(null); }, onError: e=>toast(e.message,'error') });
  const delNom  = useMutation({ mutationFn: id => apiDelete(`/profile/${empId}/nominees/${id}`), onSuccess: () => qc.invalidateQueries({queryKey:['epv2-nominees',empId]}) });

  const openBank = (r={}) => { setForm({bank_name:r.bank_name||'',branch_name:r.branch_name||'',branch_code:r.branch_code||'',account_number:r.account_number||'',account_holder_name:r.account_holder_name||'',account_type:r.account_type||'savings',ifsc_code:r.ifsc_code||'',payment_method:r.payment_method||'bank_transfer',is_primary:r.is_primary||false}); setBankModal(r); };
  const openNom  = (r={}) => { setForm({nominee_name:r.nominee_name||'',relationship:r.relationship||'',date_of_birth:r.date_of_birth||'',percentage_share:r.percentage_share||'',contact_number:r.contact_number||'',address:r.address||''}); setNomModal(r); };

  const totalNomShare = nominees.reduce((s, n) => s + (parseFloat(n.percentage_share) || 0), 0);

  return (
    <div className="space-y-5">
      {/* Salary Overview */}
      <SectionCard title="Salary Overview" icon={Banknote}
        action={isAdmin && <AdminBtn onClick={() => onEdit(emp, 'salary')} />}>
        {pLoad ? <LoadingSection /> : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[['CTC (Annual)', emp.ctc ? `₹${Number(emp.ctc).toLocaleString('en-IN')}` : null],['Salary Structure', emp.salary_structure],['Salary Basis', emp.salary_on],['Basic', payroll?.basic ? `₹${Number(payroll.basic).toLocaleString('en-IN')}` : null],['HRA', payroll?.hra ? `₹${Number(payroll.hra).toLocaleString('en-IN')}` : null],['Gross', payroll ? `₹${[payroll.basic,payroll.hra,payroll.da,payroll.transport_allowance,payroll.medical_allowance,payroll.other_allowances].filter(Boolean).reduce((s,v)=>s+Number(v),0).toLocaleString('en-IN')}` : null]].map(([l,v])=>(
              <div key={l} className="bg-[#f9f9ff] rounded-xl p-3 border border-[#f0f3ff]">
                <p className="text-[0.65rem] text-[#777587] font-medium">{l}</p>
                <p className="text-sm font-black text-[#151c27] mt-0.5">{v || '—'}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Bank Accounts */}
      <SectionCard title="Bank Accounts" icon={CreditCard}
        action={isAdmin && <AdminBtn onClick={() => openBank()} label="Add" />}>
        {bLoad ? <LoadingSection /> : banking.length === 0 ? <EmptyState icon={CreditCard} text="No bank accounts added" /> : (
          <div className="space-y-3">
            {banking.map(b => (
              <div key={b.id} className="p-3 rounded-xl border border-[#f0f3ff] bg-[#f9f9ff] flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2"><p className="text-sm font-black text-[#151c27]">{b.bank_name}</p>{b.is_primary && <span className="text-[0.6rem] bg-[#3525cd] text-white px-1.5 py-0.5 rounded-full font-bold">Primary</span>}</div>
                  <p className="text-xs text-[#464555] font-mono mt-0.5">{b.account_number}</p>
                  <div className="flex gap-3 text-xs text-[#777587] mt-0.5">
                    {b.branch_name && <span>{b.branch_name}</span>}
                    {b.ifsc_code && <span>IFSC: {b.ifsc_code}</span>}
                    <span className="capitalize">{b.account_type}</span>
                  </div>
                </div>
                {isAdmin && <div className="flex gap-1"><button onClick={() => openBank(b)} className="p-1.5 rounded hover:bg-white text-[#3525cd]"><Pencil size={12}/></button><button onClick={() => delBank.mutate(b.id)} className="p-1.5 rounded hover:bg-rose-50 text-rose-500"><Trash2 size={12}/></button></div>}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Nominees */}
      <SectionCard title="Nominees" icon={Users}
        action={isAdmin && <AdminBtn onClick={() => openNom()} label="Add" />}>
        {nominees.length === 0 ? <EmptyState icon={Users} text="No nominees added" /> : (
          <>
            <div className="space-y-3">
              {nominees.map(n => (
                <div key={n.id} className="p-3 rounded-xl border border-[#f0f3ff] bg-[#f9f9ff] flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-[#151c27]">{n.nominee_name}</p>
                    <p className="text-xs text-[#777587]">{n.relationship}{n.date_of_birth && ` · ${fmtDate(n.date_of_birth)}`}</p>
                    {n.percentage_share && <p className="text-xs font-bold text-[#3525cd] mt-0.5">{n.percentage_share}% share</p>}
                  </div>
                  {isAdmin && <div className="flex gap-1"><button onClick={() => openNom(n)} className="p-1.5 rounded hover:bg-white text-[#3525cd]"><Pencil size={12}/></button><button onClick={() => delNom.mutate(n.id)} className="p-1.5 rounded hover:bg-rose-50 text-rose-500"><Trash2 size={12}/></button></div>}
                </div>
              ))}
            </div>
            <div className={`mt-3 px-3 py-2 rounded-lg text-xs font-bold ${totalNomShare === 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              Total nomination share: {totalNomShare}% {totalNomShare !== 100 && '(should be 100%)'}
            </div>
          </>
        )}
      </SectionCard>

      {/* Bank Modal */}
      <Modal open={bankModal !== null} onClose={() => setBankModal(null)} title={bankModal?.id ? 'Edit Bank Account' : 'Add Bank Account'} size="lg"
        footer={<div className="flex justify-end gap-3"><button className="btn btn-outline" onClick={() => setBankModal(null)}>Cancel</button><button className="btn btn-primary" onClick={() => bankMut.mutate(form)} disabled={bankMut.isPending}>{bankMut.isPending ? 'Saving…' : 'Save'}</button></div>}>
        <div className="grid grid-cols-2 gap-4">
          {[['bank_name','Bank Name *'],['branch_name','Branch Name'],['branch_code','Branch Code'],['account_number','Account Number *'],['account_holder_name','Account Holder Name'],['ifsc_code','IFSC Code']].map(([k,l])=>(
            <div key={k}><label className="form-label">{l}</label><input className="form-control" value={form[k]||''} onChange={e=>set(k,e.target.value)}/></div>
          ))}
          <div><label className="form-label">Account Type</label>
            <select className="form-control" value={form.account_type||'savings'} onChange={e=>set('account_type',e.target.value)}>
              {['savings','current','salary','nre','nro','other'].map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
            </select></div>
          <div><label className="form-label">Payment Method</label>
            <select className="form-control" value={form.payment_method||'bank_transfer'} onChange={e=>set('payment_method',e.target.value)}>
              {[['bank_transfer','Bank Transfer'],['cheque','Cheque'],['cash','Cash'],['upi','UPI']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select></div>
          <label className="flex items-center gap-2 text-sm col-span-2"><input type="checkbox" checked={form.is_primary||false} onChange={e=>set('is_primary',e.target.checked)} className="accent-[#3525cd]"/>Set as primary salary account</label>
        </div>
      </Modal>

      {/* Nominee Modal */}
      <Modal open={nomModal !== null} onClose={() => setNomModal(null)} title={nomModal?.id ? 'Edit Nominee' : 'Add Nominee'} size="md"
        footer={<div className="flex justify-end gap-3"><button className="btn btn-outline" onClick={() => setNomModal(null)}>Cancel</button><button className="btn btn-primary" onClick={() => nomMut.mutate(form)} disabled={nomMut.isPending}>{nomMut.isPending ? 'Saving…' : 'Save'}</button></div>}>
        <div className="grid grid-cols-2 gap-4">
          {[['nominee_name','Nominee Name *'],['relationship','Relationship *'],['date_of_birth','Date of Birth','date'],['percentage_share','Share %','number'],['contact_number','Contact Number'],['address','Address']].map(([k,l,t])=>(
            <div key={k}><label className="form-label">{l}</label><input className="form-control" type={t||'text'} value={form[k]||''} onChange={e=>set(k,e.target.value)}/></div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

// ─── Section: Compliance Tab ──────────────────────────────────────────────────

function ComplianceTab({ empId, onEdit, emp }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [docModal,  setDocModal]  = useState(null);
  const [immiModal, setImmiModal] = useState(null);
  const [form, setForm] = useState({});
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: govDocs = [],  isLoading: dLoad } = useQuery({ queryKey: ['epv2-govdocs',  empId], queryFn: () => apiGet(`/profile/${empId}/government-docs`) });
  const { data: immigration = [] } = useQuery({ queryKey: ['epv2-immig',    empId], queryFn: () => apiGet(`/profile/${empId}/immigration`) });
  const { data: statutory = {} }   = useQuery({ queryKey: ['epv2-stat',     empId], queryFn: () => apiGet(`/profile/${empId}/statutory`) });

  const docMut  = useMutation({ mutationFn: b => docModal?.id  ? apiPut(`/profile/${empId}/government-docs/${docModal.id}`,b)  : apiPost(`/profile/${empId}/government-docs`,b),  onSuccess: () => { toast('Saved','success'); qc.invalidateQueries({queryKey:['epv2-govdocs',empId]}); setDocModal(null); },  onError: e=>toast(e.message,'error') });
  const verifyMut = useMutation({ mutationFn: ({ id, status }) => apiPatch(`/profile/${empId}/government-docs/${id}/verify`, { verification_status: status }), onSuccess: () => qc.invalidateQueries({queryKey:['epv2-govdocs',empId]}), onError: e=>toast(e.message,'error') });
  const delDoc  = useMutation({ mutationFn: id => apiDelete(`/profile/${empId}/government-docs/${id}`), onSuccess: () => qc.invalidateQueries({queryKey:['epv2-govdocs',empId]}) });
  const immiMut = useMutation({ mutationFn: b => immiModal?.id ? apiPut(`/profile/${empId}/immigration/${immiModal.id}`,b) : apiPost(`/profile/${empId}/immigration`,b), onSuccess: () => { toast('Saved','success'); qc.invalidateQueries({queryKey:['epv2-immig',empId]}); setImmiModal(null); }, onError: e=>toast(e.message,'error') });
  const delImmi = useMutation({ mutationFn: id => apiDelete(`/profile/${empId}/immigration/${id}`), onSuccess: () => qc.invalidateQueries({queryKey:['epv2-immig',empId]}) });

  const openDoc  = (r={}) => { setForm({document_type:r.document_type||'',document_number:r.document_number||'',issue_date:r.issue_date||'',expiry_date:r.expiry_date||'',issuing_authority:r.issuing_authority||'',remarks:r.remarks||''}); setDocModal(r); };
  const openImmi = (r={}) => { setForm({citizenship:r.citizenship||'',immigration_type:r.immigration_type||'',immigration_no:r.immigration_no||'',passport_number:r.passport_number||'',visa_type:r.visa_type||'',issue_date:r.issue_date||'',expiry_date:r.expiry_date||'',country:r.country||'',remarks:r.remarks||''}); setImmiModal(r); };

  const DOC_TYPES = ['aadhar','pan','passport','driving_license','voter_id','ration_card','uan','esic','pf','birth_certificate','other'];

  return (
    <div className="space-y-5">
      {/* Government Documents */}
      <SectionCard title="Government Documents" icon={FileText}
        action={<AdminBtn onClick={() => openDoc()} label="Add" />}>
        {dLoad ? <LoadingSection /> : govDocs.length === 0 ? <EmptyState icon={FileText} text="No documents added" /> : (
          <div className="space-y-3">
            {govDocs.map(d => (
              <div key={d.id} className="p-3 rounded-xl border border-[#f0f3ff] bg-[#f9f9ff] flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-black text-[#151c27] capitalize">{d.document_type.replace(/_/g,' ')}</p>
                    <span className={`text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full ${DOC_VERIFY_COLORS[d.verification_status]}`}>{d.verification_status}</span>
                  </div>
                  {d.document_number && <p className="text-xs font-mono text-[#464555] mt-0.5">{d.document_number}</p>}
                  <div className="flex gap-3 text-xs text-[#777587] mt-0.5">
                    {d.issue_date   && <span>Issued: {fmtDate(d.issue_date)}</span>}
                    {d.expiry_date  && <span>Expires: {fmtDate(d.expiry_date)}</span>}
                  </div>
                  {d.file_url && <a href={d.file_url} target="_blank" rel="noreferrer" className="text-xs text-[#3525cd] underline mt-1 flex items-center gap-1"><Download size={10}/> View</a>}
                </div>
                <div className="flex gap-1 flex-col">
                  <div className="flex gap-1">
                    <button onClick={() => openDoc(d)} className="p-1.5 rounded hover:bg-white text-[#3525cd]"><Pencil size={12}/></button>
                    <button onClick={() => delDoc.mutate(d.id)} className="p-1.5 rounded hover:bg-rose-50 text-rose-500"><Trash2 size={12}/></button>
                  </div>
                  {d.verification_status !== 'verified' && <button onClick={() => verifyMut.mutate({ id: d.id, status: 'verified' })} className="text-[0.6rem] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold hover:bg-emerald-200">Verify</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Statutory */}
      <SectionCard title="Statutory Information" icon={Shield}
        action={<AdminBtn onClick={() => onEdit(emp, 'statutory')} />}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6">
          {[['PF Applicable', statutory.pf_applicable ? 'Yes' : 'No'],['PF Number', statutory.pf_no],['UAN Number', statutory.uan_no],['ESI Applicable', statutory.esi_applicable ? 'Yes' : 'No'],['ESI Number', statutory.esi_no],['ESI Dispensary', statutory.esi_dispensary],['PT Applicable', statutory.pt_applicable ? 'Yes' : 'No'],['PT Rule', statutory.pt_rule],['Aadhar', statutory.aadhar_no],['PAN', statutory.pan_number],['Gratuity', statutory.gratuity_applicable ? 'Yes' : 'No'],['OT Applicable', statutory.ot_applicable ? 'Yes' : 'No'],['OT Rate', statutory.ot_rate],['Bonus', statutory.bonus_applicable ? 'Yes' : 'No']].map(([l,v])=>(
            <InfoRow key={l} label={l} value={v} />
          ))}
        </div>
      </SectionCard>

      {/* Immigration */}
      <SectionCard title="Immigration Details" icon={Globe}
        action={<AdminBtn onClick={() => openImmi()} label={immigration.length ? 'Edit' : 'Add'} />}>
        {immigration.length === 0 ? <EmptyState icon={Globe} text="No immigration records" /> : (
          immigration.map(i => (
            <div key={i.id} className="space-y-1">
              <InfoRow label="Citizenship"       value={i.citizenship} />
              <InfoRow label="Immigration Type"  value={i.immigration_type} />
              <InfoRow label="Immigration No."   value={i.immigration_no} />
              <InfoRow label="Passport Number"   value={i.passport_number} />
              <InfoRow label="Visa Type"         value={i.visa_type} />
              <InfoRow label="Issue Date"        value={i.issue_date ? fmtDate(i.issue_date) : null} />
              <InfoRow label="Expiry Date"       value={i.expiry_date ? fmtDate(i.expiry_date) : null} />
              <InfoRow label="Country"           value={i.country} />
              {i.remarks && <InfoRow label="Remarks" value={i.remarks} />}
              {immigration.length > 1 && (
                <button onClick={() => delImmi.mutate(i.id)} className="text-xs text-rose-500 mt-2 flex items-center gap-1"><Trash2 size={11}/>Remove</button>
              )}
            </div>
          ))
        )}
      </SectionCard>

      {/* Doc Modal */}
      <Modal open={docModal !== null} onClose={() => setDocModal(null)} title={docModal?.id ? 'Edit Document' : 'Add Document'} size="md"
        footer={<div className="flex justify-end gap-3"><button className="btn btn-outline" onClick={() => setDocModal(null)}>Cancel</button><button className="btn btn-primary" onClick={() => docMut.mutate(form)} disabled={docMut.isPending}>{docMut.isPending ? 'Saving…' : 'Save'}</button></div>}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className="form-label">Document Type *</label>
            <select className="form-control" value={form.document_type||''} onChange={e=>set('document_type',e.target.value)}>
              <option value="">— Select —</option>
              {DOC_TYPES.map(t=><option key={t} value={t}>{t.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>)}
            </select></div>
          {[['document_number','Document Number'],['issue_date','Issue Date','date'],['expiry_date','Expiry Date','date'],['issuing_authority','Issuing Authority'],['remarks','Remarks']].map(([k,l,t])=>(
            <div key={k}><label className="form-label">{l}</label><input className="form-control" type={t||'text'} value={form[k]||''} onChange={e=>set(k,e.target.value)}/></div>
          ))}
        </div>
      </Modal>

      {/* Immigration Modal */}
      <Modal open={immiModal !== null} onClose={() => setImmiModal(null)} title="Immigration Details" size="lg"
        footer={<div className="flex justify-end gap-3"><button className="btn btn-outline" onClick={() => setImmiModal(null)}>Cancel</button><button className="btn btn-primary" onClick={() => immiMut.mutate(form)} disabled={immiMut.isPending}>{immiMut.isPending ? 'Saving…' : 'Save'}</button></div>}>
        <div className="grid grid-cols-2 gap-4">
          {[['citizenship','Citizenship'],['immigration_type','Immigration Type'],['immigration_no','Immigration No.'],['passport_number','Passport Number'],['visa_type','Visa Type'],['issue_date','Issue Date','date'],['expiry_date','Expiry Date','date'],['country','Country'],['remarks','Remarks']].map(([k,l,t])=>(
            <div key={k}><label className="form-label">{l}</label><input className="form-control" type={t||'text'} value={form[k]||''} onChange={e=>set(k,e.target.value)}/></div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

// ─── Section: Work Tab ────────────────────────────────────────────────────────
// Reuses existing query keys so data comes from cache if already loaded

function WorkTab({ empId, isAdmin }) {
  const { data: assets = [] } = useQuery({
    queryKey: ['emp-assets', empId],
    queryFn: () => apiGet('/assets', { userId: empId }),
  });
  const { data: docs = [] } = useQuery({
    queryKey: ['emp-docs', empId],
    queryFn: () => apiGet('/documents', { userId: empId }),
  });

  return (
    <div className="space-y-5">
      {/* Assets */}
      <SectionCard title="Assigned Assets" icon={Briefcase}>
        {assets.length === 0 ? <EmptyState icon={Briefcase} text="No assets assigned" /> : (
          <div className="space-y-2">
            {assets.map(a => (
              <div key={a.id} className="flex items-center justify-between py-2.5 border-b border-[#f0f3ff] last:border-0">
                <div>
                  <p className="text-sm font-semibold text-[#151c27]">{a.name}</p>
                  <p className="text-xs text-[#777587]">{a.category}{a.serial_number && ` · ${a.serial_number}`}</p>
                </div>
                <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full ${a.status === 'assigned' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{a.status}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Documents */}
      <SectionCard title="Documents" icon={FileText}>
        {docs.length === 0 ? <EmptyState icon={FileText} text="No documents uploaded" /> : (
          <div className="space-y-2">
            {docs.map(d => (
              <div key={d.id} className="flex items-center justify-between py-2.5 border-b border-[#f0f3ff] last:border-0">
                <div>
                  <p className="text-sm font-semibold text-[#151c27]">{d.name}</p>
                  <p className="text-xs text-[#777587]">{d.category}</p>
                </div>
                {d.file_url && <a href={d.file_url} target="_blank" rel="noreferrer" className="p-1.5 rounded hover:bg-[#f0f3ff] text-[#3525cd]"><Download size={14}/></a>}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="p-5 bg-[#f0f3ff] rounded-xl border border-[#e7eefe] text-center">
        <Clock size={24} className="mx-auto mb-2 text-[#3525cd]" />
        <p className="text-sm font-bold text-[#151c27]">Full Attendance & Leave History</p>
        <p className="text-xs text-[#777587] mt-1">Switch to the <strong>Leave & Attendance</strong> tab in the existing profile for detailed records, filters, and exports.</p>
      </div>
    </div>
  );
}

// ─── Section: Performance Tab ─────────────────────────────────────────────────

function PerformanceTab({ empId }) {
  const { data: goals   = [], isLoading: gLoad } = useQuery({ queryKey: ['emp-goals',   empId], queryFn: () => apiGet('/performance/goals',   { userId: empId }) });
  const { data: reviews = [] }                   = useQuery({ queryKey: ['emp-reviews', empId], queryFn: () => apiGet('/performance/reviews', { userId: empId }) });
  const { data: exits   = [] }                   = useQuery({ queryKey: ['emp-exit',    empId], queryFn: () => apiGet('/exit',                { userId: empId }) });

  const exitReq = exits[0];

  return (
    <div className="space-y-5">
      {/* Goals */}
      <SectionCard title="Performance Goals" icon={BarChart3}>
        {gLoad ? <LoadingSection /> : goals.length === 0 ? <EmptyState icon={BarChart3} text="No goals set" /> : (
          <div className="space-y-3">
            {goals.map(g => (
              <div key={g.id} className="p-3 rounded-xl border border-[#f0f3ff] bg-[#f9f9ff]">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-bold text-[#151c27]">{g.title}</p>
                  <span className={`text-[0.65rem] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${g.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{g.status}</span>
                </div>
                <div className="w-full bg-[#e7eefe] rounded-full h-1.5"><div className="h-1.5 rounded-full bg-[#3525cd] transition-all" style={{ width: `${g.progress || 0}%` }}/></div>
                <p className="text-xs text-[#777587] mt-1">{g.progress || 0}% · {g.review_cycle}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Reviews */}
      <SectionCard title="Performance Reviews" icon={Activity}>
        {reviews.length === 0 ? <EmptyState icon={Activity} text="No reviews recorded" /> : (
          <div className="space-y-3">
            {reviews.map(r => (
              <div key={r.id} className="p-3 rounded-xl border border-[#f0f3ff] bg-[#f9f9ff]">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-bold text-[#151c27]">{r.review_cycle} · {r.review_type}</p>
                  {r.final_rating && <span className="text-sm font-black text-[#3525cd]">{r.final_rating}/5</span>}
                </div>
                <span className={`text-[0.65rem] font-bold px-1.5 py-0.5 rounded-full ${r.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Exit */}
      {exitReq && (
        <SectionCard title="Exit Information" icon={AlertCircle}>
          <InfoRow label="Resignation Date"  value={exitReq.resignation_date ? fmtDate(exitReq.resignation_date) : null} />
          <InfoRow label="Last Working Day"  value={exitReq.last_working_day  ? fmtDate(exitReq.last_working_day)  : null} />
          <InfoRow label="Notice Period"     value={exitReq.notice_period_days ? `${exitReq.notice_period_days} days` : null} />
          <InfoRow label="Reason"            value={exitReq.reason} />
          <InfoRow label="Status"            value={exitReq.status} />
        </SectionCard>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EmployeeProfileV2({ emp, onBack, onEdit }) {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin' || user.role === 'root_admin';

  const now = new Date();
  const [currentTab, setCurrentTab] = useState('overview');

  // Header: always loaded — reuse the queries already in place from Employees.jsx context
  // These share the same queryKey so if the parent already loaded them, no extra fetch occurs
  const curMonth = now.getMonth() + 1;
  const curYear  = now.getFullYear();
  const today    = now.toISOString().split('T')[0];

  const { data: curAttendance = [] } = useQuery({
    queryKey: ['emp-att-cur', emp.id, curYear, curMonth],
    queryFn: () => apiGet('/attendance', { year: curYear, month: curMonth, userId: emp.id }),
    staleTime: 60000,
  });
  const { data: curLeaves = [] } = useQuery({
    queryKey: ['emp-leaves-cur', emp.id, curYear, curMonth],
    queryFn: () => apiGet('/leaves', { userId: emp.id, year: curYear, month: curMonth }),
    staleTime: 60000,
  });
  const { data: overview = {} } = useQuery({
    queryKey: ['epv2-overview', emp.id],
    queryFn: () => apiGet(`/profile/${emp.id}/overview`),
    staleTime: 60000,
  });

  const todayRecord  = curAttendance.find(r => r.date === today);
  const presentCount = curAttendance.filter(r => ['present','half_day','wfh'].includes(r.status)).length;
  const leaveCount   = curLeaves.filter(l => l.status === 'approved').length;
  const lateCount    = curAttendance.filter(r => r.is_late).length;

  const empName = [emp.salutation, emp.name, emp.middle_name, emp.surname].filter(Boolean).join(' ');
  const deptLabel = emp.departments?.length > 0 ? emp.departments.map(d => d.name).join(', ') : emp.department || '—';
  const statusCls = emp.employee_status === 'inactive' ? 'bg-rose-100 text-rose-700' : emp.employee_status === 'on_leave' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';

  const TABS = TABS_ALL.filter(t => !t.adminOnly || isAdmin);

  return (
    <div className="space-y-4">
      {/* ── Action bar ── */}
      <div className="bg-white rounded-2xl border border-[#c7c4d8] shadow-sm px-4 py-3 flex items-center gap-2 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-[#464555] hover:text-[#3525cd] transition-colors mr-2">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="w-px h-6 bg-[#e7eefe] mx-1 flex-shrink-0" />
        {isAdmin && (
          <>
            <button onClick={() => onEdit(emp)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#c7c4d8] bg-white text-xs font-bold text-[#464555] hover:bg-[#f0f3ff] hover:text-[#3525cd] hover:border-[#3525cd]/40 transition-all">
              <Pencil size={13}/> Edit Profile
            </button>
            <button onClick={() => onEdit(emp, 'account')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#c7c4d8] bg-white text-xs font-bold text-[#464555] hover:bg-[#f0f3ff] hover:text-[#3525cd] transition-all">
              <Key size={13}/> Reset Password
            </button>
          </>
        )}
        <button onClick={() => setCurrentTab('work')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#c7c4d8] bg-white text-xs font-bold text-[#464555] hover:bg-emerald-50 hover:text-emerald-700 transition-all">
          <UserCheck size={13}/> Attendance
        </button>
        <button onClick={() => setCurrentTab('performance')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#c7c4d8] bg-white text-xs font-bold text-[#464555] hover:bg-[#f0f3ff] hover:text-[#3525cd] transition-all">
          <BarChart3 size={13}/> Performance
        </button>
      </div>

      {/* ── Sticky Header ── */}
      <div className="bg-white rounded-2xl border border-[#c7c4d8] shadow-sm p-5">
        <div className="flex flex-col md:flex-row gap-5 items-start">
          {/* Avatar + photo */}
          <div className="relative flex-shrink-0">
            {emp.profile_photo_url
              ? <img src={emp.profile_photo_url} alt={empName} className="w-20 h-20 rounded-2xl object-cover border-2 border-[#e7eefe] shadow-sm" />
              : <Avatar name={emp.name} color={emp.avatar_color} size={80} className="rounded-2xl" />
            }
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white bg-emerald-400 shadow-sm" />
          </div>

          {/* Core info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-xl font-black text-[#151c27] truncate">{empName}</h2>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${statusCls}`}>{emp.employee_status || 'Active'}</span>
              {todayRecord && <StatusBadge status={todayRecord.status} />}
            </div>
            <p className="text-sm text-[#464555] font-semibold">{emp.position || '—'}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-[#777587]">
              <span className="flex items-center gap-1"><Building2 size={11}/>{deptLabel}</span>
              {emp.email && <span className="flex items-center gap-1"><Mail size={11}/>{emp.email}</span>}
              {emp.phone && <span className="flex items-center gap-1"><Phone size={11}/>{emp.phone}</span>}
              {emp.joining_date && <span className="flex items-center gap-1"><Calendar size={11}/>Joined {fmtDate(emp.joining_date)}</span>}
              {emp.employee_id && <span className="flex items-center gap-1"><Fingerprint size={11}/>ID: {emp.employee_id}</span>}
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2 flex-shrink-0">
            {[['Present', presentCount, 'text-emerald-600 bg-emerald-50'],['Leaves', leaveCount, 'text-amber-600 bg-amber-50'],['Late', lateCount, 'text-rose-500 bg-rose-50']].map(([l,v,cls])=>(
              <div key={l} className={`text-center px-3 py-2 rounded-xl ${cls}`}>
                <p className="text-lg font-black">{v}</p>
                <p className="text-[0.65rem] font-bold uppercase tracking-wider">{l}</p>
                <p className="text-[0.6rem] opacity-70">This month</p>
              </div>
            ))}
          </div>
        </div>

        {/* Profile completion bar */}
        {overview.profileCompletion !== undefined && (
          <div className="mt-4 pt-4 border-t border-[#f0f3ff]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-[#464555]">Profile Completion</span>
              <span className="text-xs font-black text-[#3525cd]">{overview.profileCompletion}%</span>
            </div>
            <div className="h-1.5 bg-[#e7eefe] rounded-full">
              <div className="h-1.5 rounded-full bg-gradient-to-r from-[#3525cd] to-[#712ae2] transition-all" style={{ width: `${overview.profileCompletion}%` }}/>
            </div>
          </div>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div className="bg-white rounded-2xl border border-[#c7c4d8] shadow-sm">
        <div className="flex overflow-x-auto scrollbar-hide border-b border-[#f0f3ff]">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setCurrentTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${currentTab === tab.id ? 'border-[#3525cd] text-[#3525cd]' : 'border-transparent text-[#777587] hover:text-[#151c27]'}`}>
                <Icon size={13}/>{tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Tab content ── */}
        <div className="p-5">
          {currentTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Quick info cards */}
              {[
                ['Department',    deptLabel,              Building2],
                ['Position',      emp.position,           Briefcase],
                ['Employment',    emp.employment_type,    Users],
                ['Work Mode',     emp.work_mode,          Home],
                ['Grade',         emp.grade,              Award],
                ['Branch',        overview.branch?.name,  MapPin],
                ['Manager',       overview.manager?.name, User],
                ['Joining Date',  emp.joining_date ? fmtDate(emp.joining_date) : null, Calendar],
                ['Status',        emp.employee_status,    CheckCircle2],
              ].map(([l,v,Icon])=>(
                <div key={l} className="flex items-center gap-3 p-3 rounded-xl border border-[#f0f3ff] bg-[#f9f9ff]">
                  <div className="w-8 h-8 rounded-lg bg-[#e7eefe] flex items-center justify-center flex-shrink-0">
                    <Icon size={14} className="text-[#3525cd]"/>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.65rem] text-[#777587] font-medium">{l}</p>
                    <p className="text-sm font-bold text-[#151c27] truncate">{v || '—'}</p>
                  </div>
                </div>
              ))}
              {/* Section counts */}
              {overview.sectionCounts && Object.entries(overview.sectionCounts).map(([k,v])=>(
                <div key={k} className="flex items-center justify-between p-3 rounded-xl border border-[#f0f3ff] bg-[#f9f9ff]">
                  <span className="text-xs font-semibold text-[#464555] capitalize">{k}</span>
                  <span className="text-sm font-black text-[#3525cd]">{v} records</span>
                </div>
              ))}
            </div>
          )}

          {currentTab === 'personal'     && <PersonalTab    empId={emp.id} isAdmin={isAdmin} />}
          {currentTab === 'professional' && <ProfessionalTab empId={emp.id} isAdmin={isAdmin} onEdit={onEdit} emp={emp} />}
          {currentTab === 'education'    && <EducationTab   empId={emp.id} isAdmin={isAdmin} />}
          {currentTab === 'compensation' && <CompensationTab empId={emp.id} isAdmin={isAdmin} onEdit={onEdit} emp={emp} />}
          {currentTab === 'compliance'   && <ComplianceTab   empId={emp.id} onEdit={onEdit} emp={emp} />}
          {currentTab === 'work'         && <WorkTab         empId={emp.id} isAdmin={isAdmin} />}
          {currentTab === 'performance'  && <PerformanceTab  empId={emp.id} />}
        </div>
      </div>
    </div>
  );
}
