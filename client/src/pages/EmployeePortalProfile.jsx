import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User, UserCircle, Users, BookOpen, Briefcase, Zap, CreditCard, Heart, Shield,
  Clock, Umbrella, BarChart3, FileText, Star, Settings, Lock, ExternalLink,
  Plus, Pencil, Trash2, X, Check, Eye, EyeOff, Save, AlertTriangle,
  ShieldCheck, ShieldAlert, Mail, ChevronRight, Building2, MapPin, Phone,
  CheckCircle2, Download, MoreHorizontal, Calendar, TrendingUp, Activity,
  Layers, BadgeCheck, ClipboardList,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { fmtDate, fmtTime, initials } from '@/lib/utils';

// ─── Constants ───────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#3525cd','#4f46e5','#712ae2','#8a4cfc','#10B981','#EC4899','#F59E0B','#EF4444','#F97316',
];

const TABS = [
  { key: 'overview',     label: 'Overview' },
  { key: 'personal',     label: 'Personal' },
  { key: 'professional', label: 'Professional' },
  { key: 'documents',    label: 'Documents' },
  { key: 'work',         label: 'Work' },
  { key: 'payroll',      label: 'Payroll' },
  { key: 'performance',  label: 'Performance' },
  { key: 'account',      label: 'Account' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function maskAccount(num) {
  if (!num) return '—';
  const s = String(num);
  return '****' + s.slice(-4);
}

function proficiencyColor(level) {
  const map = {
    beginner:     'bg-slate-100 text-slate-700',
    intermediate: 'bg-blue-100 text-blue-700',
    advanced:     'bg-emerald-100 text-emerald-700',
    expert:       'bg-purple-100 text-purple-700',
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

function calcExperience(joiningDate) {
  if (!joiningDate) return '—';
  const diff = Date.now() - new Date(joiningDate).getTime();
  const months = Math.floor(diff / (1000 * 60 * 60 * 24 * 30.44));
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem} Month${rem !== 1 ? 's' : ''}`;
  if (rem === 0) return `${years} Year${years !== 1 ? 's' : ''}`;
  return `${years} Year${years !== 1 ? 's' : ''} ${rem} Month${rem !== 1 ? 's' : ''}`;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Shared UI Atoms ──────────────────────────────────────────────────────────

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

function InfoPill({ icon: Icon, text }) {
  if (!text) return null;
  return (
    <span className="flex items-center gap-1 text-xs text-[#464555]">
      {Icon && <Icon size={13} className="text-[#777587]" />}
      {text}
    </span>
  );
}

// ─── PROFILE HEADER CARD ─────────────────────────────────────────────────────

function ProfileHeaderCard({ empId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['profile-overview', empId],
    queryFn: () => apiGet(`/profile/${empId}/overview`),
    enabled: !!empId,
  });

  if (isLoading) return <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-6 animate-pulse h-36" />;
  if (!data) return null;

  const name = data.name || '—';
  const position = data.position || '—';
  const empNo = data.employee_id || data.device_enrollment_id || '—';
  const department = data.department || '—';
  const branchName = data.branch?.name || null;
  const employmentType = (data.employment_type || 'full_time').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const managerName = data.manager?.name || null;
  const managerPos = data.manager?.position || null;
  const joiningDate = data.joining_date;
  const experience = calcExperience(joiningDate);
  const phone = data.phone || '—';
  const email = data.email || '—';
  const status = data.employee_status || 'active';
  const avatarColor = data.avatar_color || '#3525cd';
  const profilePhoto = data.profile_photo_url || null;

  const workLocation = [data.current_city, data.current_state].filter(Boolean).join(', ')
    || branchName
    || '—';

  return (
    <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-5">
      <div className="flex flex-col sm:flex-row items-start gap-5">
        {/* Left: status + avatar + info */}
        <div className="flex items-start gap-4 flex-1 min-w-0">
          {/* Active badge stacked above avatar */}
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold px-2 py-0.5 rounded-full capitalize">
              {status}
            </span>
            {profilePhoto ? (
              <img
                src={profilePhoto}
                alt={name}
                className="w-20 h-20 rounded-full object-cover border-2 border-[#c7c4d8] shadow"
              />
            ) : (
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-black border-2 border-white shadow-md"
                style={{ background: avatarColor }}
              >
                {initials(name)}
              </div>
            )}
          </div>

          {/* Name / position / pills */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="text-xl font-black text-[#151c27]">{name}</h1>
              <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
            </div>
            <p className="text-sm text-[#464555] mt-0.5">{position}</p>

            <div className="flex flex-wrap items-center gap-3 mt-2">
              <InfoPill icon={Building2} text={empNo} />
              <InfoPill icon={Layers} text={department} />
              <InfoPill icon={MapPin} text={branchName} />
              <InfoPill icon={Clock} text={employmentType} />
            </div>

            {managerName && (
              <p className="text-xs text-[#777587] mt-2">
                Reporting To: <span className="font-semibold text-[#464555]">{managerName}{managerPos ? ` (${managerPos})` : ''}</span>
              </p>
            )}

            {joiningDate && (
              <p className="text-xs text-[#777587] mt-1">
                Joined on {fmtDate(joiningDate)}
                {experience && experience !== '—' ? <span className="ml-1">• {experience}</span> : null}
              </p>
            )}
          </div>
        </div>

        {/* Right: 2x2 contact grid */}
        <div className="sm:w-64 flex-shrink-0 grid grid-cols-1 gap-1.5 w-full sm:self-start">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-[#f8f9ff] border border-[#f0f3ff]">
            <Mail size={13} className="text-[#3525cd] flex-shrink-0" />
            <span className="text-xs text-[#464555] truncate">{email}</span>
            <Check size={11} className="text-emerald-500 ml-auto flex-shrink-0" />
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-[#f8f9ff] border border-[#f0f3ff]">
            <Phone size={13} className="text-[#3525cd] flex-shrink-0" />
            <span className="text-xs text-[#464555] truncate">{phone}</span>
            <Check size={11} className="text-emerald-500 ml-auto flex-shrink-0" />
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-[#f8f9ff] border border-[#f0f3ff]">
            <MapPin size={13} className="text-[#3525cd] flex-shrink-0" />
            <span className="text-xs text-[#464555] truncate">{workLocation}</span>
            <Check size={11} className="text-emerald-500 ml-auto flex-shrink-0" />
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-[#f8f9ff] border border-[#f0f3ff]">
            <BadgeCheck size={13} className="text-[#3525cd] flex-shrink-0" />
            <span className="text-xs text-[#464555] truncate">
              {employmentType === 'Full Time' ? 'Permanent' : employmentType}
            </span>
            <Check size={11} className="text-emerald-500 ml-auto flex-shrink-0" />
          </div>
        </div>
      </div>

      {/* Actions row */}
      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[#f0f3ff]">
        <button className="btn btn-primary btn-sm flex items-center gap-1.5">
          <Pencil size={13} /> Edit Profile
        </button>
        <button className="btn btn-outline btn-sm flex items-center gap-1.5">
          <Download size={13} /> Download Profile
        </button>
        <button className="btn btn-ghost btn-icon btn-sm text-[#777587] ml-auto">
          <MoreHorizontal size={16} />
        </button>
      </div>
    </div>
  );
}

// ─── OVERVIEW TAB ────────────────────────────────────────────────────────────

function OverviewTab({ empId }) {
  const { data: overview, isLoading: ovLoading } = useQuery({
    queryKey: ['profile-overview', empId],
    queryFn: () => apiGet(`/profile/${empId}/overview`),
    enabled: !!empId,
  });

  const { data: leaves = [] } = useQuery({
    queryKey: ['leaves'],
    queryFn: () => apiGet('/leaves'),
  });

  const { data: policies = [] } = useQuery({
    queryKey: ['leave-policies'],
    queryFn: () => apiGet('/leave-policies'),
  });

  if (ovLoading) return <Spinner />;
  if (!overview) return null;

  const joiningDate = overview.joining_date;
  const experience = calcExperience(joiningDate);
  const managerName = overview.manager?.name || overview.manager_name || '—';

  // Leave balance calculation
  const myLeaves = leaves.filter(l => l.status === 'approved');
  const totalUsed = myLeaves.reduce((acc, l) => {
    const start = new Date(l.start_date);
    const end = new Date(l.end_date);
    const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return acc + days;
  }, 0);
  const totalAlloc = policies.reduce((acc, p) => acc + (p.days_allowed || 0), 0);
  const leaveBalance = Math.max(0, totalAlloc - totalUsed);

  // Today's attendance from overview
  const todayAtt = overview.todayAttendance || null;
  const attStatus = todayAtt?.status || null;
  const checkInTime = todayAtt?.check_in ? fmtTime(todayAtt.check_in.slice(0, 5)) : null;

  // Recent activity synthesis
  const recentLeaves = [...leaves]
    .sort((a, b) => new Date(b.created_at || b.start_date) - new Date(a.created_at || a.start_date))
    .slice(0, 3);

  const activities = [
    todayAtt && {
      icon: Clock,
      color: 'bg-emerald-50 text-emerald-600',
      title: attStatus === 'present' ? 'Checked In' : attStatus === 'absent' ? 'Marked Absent' : 'Attendance Recorded',
      desc: checkInTime ? `Check-in at ${checkInTime}` : 'Today',
      time: 'Today',
    },
    ...recentLeaves.map(l => ({
      icon: Umbrella,
      color: 'bg-[#f0f3ff] text-[#3525cd]',
      title: `Leave ${l.status === 'approved' ? 'Approved' : l.status === 'rejected' ? 'Rejected' : 'Applied'}`,
      desc: `${fmtDate(l.start_date)} – ${fmtDate(l.end_date)}`,
      time: timeAgo(l.created_at || l.start_date),
    })),
  ].filter(Boolean).slice(0, 4);

  const summaryCards = [
    { label: 'Employee ID',       value: overview.employee_id || overview.device_enrollment_id || '—', icon: BadgeCheck },
    { label: 'Department',        value: overview.department || '—',                          icon: Layers },
    { label: 'Designation',       value: overview.position || overview.designation || '—',    icon: Briefcase },
    { label: 'Joining Date',      value: joiningDate ? fmtDate(joiningDate) : '—',            icon: Calendar },
    { label: 'Experience',        value: experience,                                           icon: TrendingUp },
    { label: 'Reporting Manager', value: managerName,                                          icon: User },
  ];

  return (
    <div className="space-y-5">
      {/* Employee Summary Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {summaryCards.map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 mb-1">
              <card.icon size={13} className="text-[#3525cd]" />
              <span className="text-[10px] font-bold text-[#777587] uppercase tracking-wide">{card.label}</span>
            </div>
            <span className="text-sm font-black text-[#151c27] leading-tight">{card.value}</span>
          </div>
        ))}
      </div>

      {/* Two-column: Snapshot + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Today's Snapshot */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm">
          <div className="p-5 border-b border-[#f0f3ff]">
            <SectionHeader>Today's Snapshot</SectionHeader>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            {/* Attendance */}
            <div className="border border-[#e8e6f4] rounded-xl p-4 bg-[#fafbff]">
              <div className="flex items-center gap-1.5 mb-2">
                <Clock size={13} className="text-[#3525cd]" />
                <span className="text-xs font-bold text-[#777587] uppercase tracking-wide">Attendance</span>
              </div>
              {attStatus ? (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${
                  attStatus === 'present' ? 'bg-emerald-50 text-emerald-700' :
                  attStatus === 'absent'  ? 'bg-rose-50 text-rose-700' :
                  'bg-amber-50 text-amber-700'
                }`}>{attStatus.replace('_', ' ')}</span>
              ) : (
                <span className="text-xs font-bold text-[#777587]">Not recorded</span>
              )}
              {checkInTime && <p className="text-xs text-[#464555] mt-1">In: {checkInTime}</p>}
              <Link to="/portal/attendance" className="text-xs text-[#3525cd] font-semibold mt-2 flex items-center gap-0.5 hover:underline">
                View Attendance <ChevronRight size={11} />
              </Link>
            </div>

            {/* Leave Balance */}
            <div className="border border-[#e8e6f4] rounded-xl p-4 bg-[#fafbff]">
              <div className="flex items-center gap-1.5 mb-2">
                <Umbrella size={13} className="text-[#3525cd]" />
                <span className="text-xs font-bold text-[#777587] uppercase tracking-wide">Leave Balance</span>
              </div>
              <p className="text-2xl font-black text-[#151c27]">{leaveBalance} <span className="text-sm font-semibold text-[#777587]">Days</span></p>
              <p className="text-xs text-[#777587]">Total Alloc: {totalAlloc}</p>
              <Link to="/portal/leaves" className="text-xs text-[#3525cd] font-semibold mt-2 flex items-center gap-0.5 hover:underline">
                View Leave <ChevronRight size={11} />
              </Link>
            </div>

            {/* Current Shift */}
            <div className="border border-[#e8e6f4] rounded-xl p-4 bg-[#fafbff]">
              <div className="flex items-center gap-1.5 mb-2">
                <Activity size={13} className="text-[#3525cd]" />
                <span className="text-xs font-bold text-[#777587] uppercase tracking-wide">Current Shift</span>
              </div>
              <p className="text-sm font-bold text-[#151c27]">General Shift</p>
              <p className="text-xs text-[#777587]">09:00 AM – 06:00 PM</p>
              <Link to="/portal/attendance" className="text-xs text-[#3525cd] font-semibold mt-2 flex items-center gap-0.5 hover:underline">
                View Schedule <ChevronRight size={11} />
              </Link>
            </div>

            {/* Performance */}
            <div className="border border-[#e8e6f4] rounded-xl p-4 bg-[#fafbff]">
              <div className="flex items-center gap-1.5 mb-2">
                <Star size={13} className="text-[#3525cd]" />
                <span className="text-xs font-bold text-[#777587] uppercase tracking-wide">Performance</span>
              </div>
              <p className="text-lg font-black text-[#151c27]">4.6 <span className="text-sm font-semibold text-[#777587]">/ 5</span></p>
              <div className="flex gap-0.5 mt-0.5">
                {[1,2,3,4,5].map(i => (
                  <Star key={i} size={10} className={i <= 4 ? 'text-amber-400 fill-amber-400' : 'text-[#c7c4d8]'} />
                ))}
              </div>
              <Link to="/portal/performance" className="text-xs text-[#3525cd] font-semibold mt-2 flex items-center gap-0.5 hover:underline">
                View Performance <ChevronRight size={11} />
              </Link>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-[#f0f3ff]">
            <SectionHeader>Recent Activity</SectionHeader>
            <Link to="/portal/attendance" className="text-xs text-[#3525cd] font-semibold hover:underline">View All</Link>
          </div>
          <div className="p-4 space-y-3">
            {activities.length === 0 ? (
              <p className="text-sm text-[#777587] text-center py-4">No recent activity</p>
            ) : (
              activities.map((act, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${act.color}`}>
                    <act.icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#151c27]">{act.title}</p>
                    <p className="text-xs text-[#777587] truncate">{act.desc}</p>
                  </div>
                  <span className="text-xs text-[#c7c4d8] flex-shrink-0">{act.time}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Two-column: Personal Info + Contact & Address */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <PersonalInfoReadCard empId={empId} />
        <ContactAddressReadCard empId={empId} />
      </div>
    </div>
  );
}

// Overview read-only cards

function PersonalInfoReadCard({ empId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['profile-personal', empId],
    queryFn: () => apiGet(`/profile/${empId}/personal`),
    enabled: !!empId,
  });

  return (
    <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm">
      <div className="flex items-center justify-between p-5 border-b border-[#f0f3ff]">
        <SectionHeader>Personal Information</SectionHeader>
      </div>
      {isLoading ? <Spinner /> : (
        <div className="p-5 grid grid-cols-2 gap-4">
          {[
            { label: 'Full Name',     value: data?.full_name || data?.name },
            { label: 'Date of Birth', value: data?.date_of_birth ? fmtDate(data.date_of_birth) : null },
            { label: 'Gender',        value: data?.gender },
            { label: 'Blood Group',   value: data?.blood_group },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-[#777587] mb-0.5">{label}</p>
              <p className="text-sm font-semibold text-[#151c27]">{value || '—'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContactAddressReadCard({ empId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['profile-personal', empId],
    queryFn: () => apiGet(`/profile/${empId}/personal`),
    enabled: !!empId,
  });

  const currentAddr = [
    data?.current_address_line1,
    data?.current_address_line2,
    data?.current_city,
    data?.current_state,
    data?.current_country,
    data?.current_postal_code,
  ].filter(Boolean).join(', ');

  return (
    <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm">
      <div className="flex items-center justify-between p-5 border-b border-[#f0f3ff]">
        <SectionHeader>Contact &amp; Address</SectionHeader>
      </div>
      {isLoading ? <Spinner /> : (
        <div className="p-5 space-y-3">
          {[
            { label: 'Phone',             value: data?.phone },
            { label: 'Personal Email',    value: data?.personal_email },
            { label: 'Current Address',   value: currentAddr },
            { label: 'Permanent Address', value: data?.permanent_address },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-[#777587] mb-0.5">{label}</p>
              <p className="text-sm font-semibold text-[#151c27]">{value || '—'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PERSONAL TAB ────────────────────────────────────────────────────────────

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
              { label: 'Full Name',      val: data?.full_name || data?.name },
              { label: 'Gender',         val: data?.gender },
              { label: 'Date of Birth',  val: data?.date_of_birth ? fmtDate(data.date_of_birth) : null },
              { label: 'Blood Group',    val: data?.blood_group },
              { label: 'Marital Status', val: data?.marital_status },
              { label: 'Nationality',    val: data?.nationality },
              { label: 'Religion',       val: data?.religion },
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
  function openEdit(m) {
    setEditing(m);
    setForm({ relationship: m.relationship || '', name: m.name || '', date_of_birth: m.date_of_birth || '', gender: m.gender || '', occupation: m.occupation || '', contact_number: m.contact_number || '', dependent: m.dependent || false });
    setModalOpen(true);
  }
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

const EDU_BLANK = { degree_level: '', institution: '', board_university: '', specialization: '', from_year: '', to_year: '', year_of_passing: '', result_type: 'percentage', percentage: '', cgpa: '', degree_class: '', education_mode: '', education_country: 'India', enrollment_number: '', remarks: '' };
const DEGREE_LEVELS = ['SSC / 10th','HSC / 12th','Diploma','Graduation','Post Graduation','PhD','Other'];
const EDU_COUNTRIES = ['India','United States','United Kingdom','Canada','Australia','UAE','Singapore','Germany','France','Japan','Other'];

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
    setForm({ degree_level: r.degree_level||'', institution: r.institution||'', board_university: r.board_university||'', specialization: r.specialization||'', from_year: r.from_year||'', to_year: r.to_year||'', year_of_passing: r.year_of_passing||'', result_type: r.result_type||'percentage', percentage: r.percentage||'', cgpa: r.cgpa||'', degree_class: r.degree_class||'', education_mode: r.education_mode||'', education_country: r.education_country||'India', enrollment_number: r.enrollment_number||'', remarks: r.remarks||'' });
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Qualification' : 'Add Qualification'} size="lg"
        footer={<><button className="btn btn-outline" onClick={() => setModalOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.institution}>{saveMut.isPending ? 'Saving…' : 'Save Qualification'}</button></>}>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="form-label">Degree Level</label>
            <select className="form-control" value={form.degree_level} onChange={e=>setF('degree_level',e.target.value)}>
              <option value="">— Select —</option>
              {DEGREE_LEVELS.map(d=><option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div><label className="form-label">Education Mode</label>
            <select className="form-control" value={form.education_mode} onChange={e=>setF('education_mode',e.target.value)}>
              <option value="">— Select —</option>
              {['Regular','Distance Learning','Online','Part-Time','Full-Time'].map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div><label className="form-label">Institution / School <span className="text-rose-500">*</span></label>
            <input className="form-control" value={form.institution} onChange={e=>setF('institution',e.target.value)} placeholder="e.g. IIT Bombay"/>
          </div>
          <div><label className="form-label">Board / University</label>
            <input className="form-control" value={form.board_university} onChange={e=>setF('board_university',e.target.value)} placeholder="e.g. Mumbai University"/>
          </div>
          <div><label className="form-label">Specialization / Stream</label>
            <input className="form-control" value={form.specialization} onChange={e=>setF('specialization',e.target.value)} placeholder="e.g. Computer Science"/>
          </div>
          <div><label className="form-label">Country</label>
            <select className="form-control" value={form.education_country} onChange={e=>setF('education_country',e.target.value)}>
              {EDU_COUNTRIES.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label className="form-label">From Year</label>
            <input className="form-control" type="number" min="1950" max={new Date().getFullYear()} placeholder="e.g. 2018" value={form.from_year} onChange={e=>setF('from_year',e.target.value)}/>
          </div>
          <div><label className="form-label">To Year</label>
            <input className="form-control" type="number" min="1950" max={new Date().getFullYear()} placeholder="e.g. 2022" value={form.to_year} onChange={e=>setF('to_year',e.target.value)}/>
          </div>
          <div><label className="form-label">Year of Passing</label>
            <input className="form-control" type="number" min="1950" max={new Date().getFullYear()} value={form.year_of_passing} onChange={e=>setF('year_of_passing',e.target.value)}/>
          </div>
          <div><label className="form-label">Enrollment / Roll Number</label>
            <input className="form-control" placeholder="Optional" value={form.enrollment_number} onChange={e=>setF('enrollment_number',e.target.value)}/>
          </div>
          <div className="col-span-2"><label className="form-label">Result Type</label>
            <div className="flex gap-4">
              {['percentage','cgpa'].map(t=>(
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="portal-result-type" value={t} checked={form.result_type===t} onChange={()=>setF('result_type',t)} className="accent-[#3525cd]"/>
                  <span className="text-sm font-semibold text-[#464555]">{t==='percentage'?'Percentage':'CGPA'}</span>
                </label>
              ))}
            </div>
          </div>
          {form.result_type==='percentage' ? (
            <div><label className="form-label">Percentage (%)</label>
              <input className="form-control" type="number" min="0" max="100" step="0.01" value={form.percentage} onChange={e=>setF('percentage',e.target.value)}/>
            </div>
          ) : (
            <div><label className="form-label">CGPA</label>
              <input className="form-control" type="number" min="0" max="10" step="0.01" value={form.cgpa} onChange={e=>setF('cgpa',e.target.value)}/>
            </div>
          )}
          <div><label className="form-label">Class / Division</label>
            <select className="form-control" value={form.degree_class} onChange={e=>setF('degree_class',e.target.value)}>
              <option value="">— Select —</option>
              {['Distinction','First Class','Second Class','Pass','Fail'].map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-span-2"><label className="form-label">Remarks <span className="text-xs font-normal text-[#777587]">(optional)</span></label>
            <textarea className="form-control" rows={2} placeholder="e.g. Gold Medalist, University Rank Holder…" value={form.remarks} onChange={e=>setF('remarks',e.target.value)}/>
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

// ─── DOCUMENTS / PAYROLL / PERFORMANCE REDIRECT CARDS ────────────────────────

function ExternalLinkCard({ to, icon: Icon, title, description, buttonLabel }) {
  const navigate = useNavigate();
  return (
    <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-[#f0f3ff] flex items-center justify-center text-[#3525cd]">
          <Icon size={20} />
        </div>
        <SectionHeader>{title}</SectionHeader>
      </div>
      <p className="text-sm text-[#464555] mb-4">{description}</p>
      <button onClick={() => navigate(to)} className="btn btn-primary btn-sm flex items-center gap-2">
        {buttonLabel} <ExternalLink size={13} />
      </button>
    </div>
  );
}

// ─── TAB CONTENT RENDERER ────────────────────────────────────────────────────

function TabContent({ tab, empId }) {
  switch (tab) {
    case 'overview':
      return <OverviewTab empId={empId} />;

    case 'personal':
      return <PersonalSection empId={empId} />;

    case 'professional':
      return (
        <div className="space-y-5">
          <FamilySection empId={empId} />
          <ExperienceSection empId={empId} />
          <EducationSection empId={empId} />
        </div>
      );

    case 'documents':
      return (
        <ExternalLinkCard
          to="/portal/documents"
          icon={FileText}
          title="Documents"
          description="Access your offer letter, contracts, and other HR documents."
          buttonLabel="Go to Documents"
        />
      );

    case 'work':
      return (
        <div className="space-y-5">
          <SkillsSection empId={empId} />
          <BankingSection empId={empId} />
        </div>
      );

    case 'payroll':
      return (
        <ExternalLinkCard
          to="/portal/payslips"
          icon={BarChart3}
          title="Payroll"
          description="Download payslips, view salary structure and payment history."
          buttonLabel="Go to Payroll"
        />
      );

    case 'performance':
      return (
        <ExternalLinkCard
          to="/portal/performance"
          icon={Star}
          title="Performance"
          description="View your performance reviews, goals, and feedback."
          buttonLabel="Go to Performance"
        />
      );

    case 'account':
      return (
        <div className="space-y-5">
          <AccountSection />
          <PrivacySection />
        </div>
      );

    default:
      return null;
  }
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────

export default function EmployeePortalProfile() {
  const { user } = useAuth();
  const empId = user?.id;
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="w-full space-y-5 pb-10">
      {/* Profile Header Card — always visible */}
      <ProfileHeaderCard empId={empId} />

      {/* Horizontal Tab Navigation */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-x-auto">
        <div className="flex min-w-max">
          {TABS.map((tab, idx) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3.5 text-sm font-semibold whitespace-nowrap transition-all border-b-2 ${
                activeTab === tab.key
                  ? 'text-[#3525cd] border-[#3525cd] font-black bg-[#f8f9ff]'
                  : 'text-[#777587] border-transparent hover:text-[#464555] hover:bg-[#f8f9ff]'
              } ${idx === 0 ? 'rounded-tl-xl' : ''} ${idx === TABS.length - 1 ? 'rounded-tr-xl' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <TabContent tab={activeTab} empId={empId} />
    </div>
  );
}
