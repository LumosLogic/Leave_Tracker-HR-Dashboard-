import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserCircle, Lock, Save, Eye, EyeOff, Check, Building2, Briefcase, Mail } from 'lucide-react';
import { apiPut } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { initials } from '@/lib/utils';

const AVATAR_COLORS = [
  '#3525cd','#4f46e5','#712ae2','#8a4cfc','#10B981','#EC4899',
  '#F59E0B','#EF4444','#F97316','#2a313d','#065F46','#7F1D1D',
];

export default function MyProfile() {
  const { user, saveAuth, token } = useAuth();
  const toast = useToast();

  const [name,  setName]  = useState(user?.name  || '');
  const [email, setEmail] = useState(user?.email || '');
  const [color, setColor] = useState(user?.avatar_color || '#3525cd');

  const [curPw,  setCurPw]  = useState('');
  const [newPw,  setNewPw]  = useState('');
  const [confPw, setConfPw] = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const saveProfile = useMutation({
    mutationFn: () => apiPut('/auth/profile', { name, avatar_color: color, email }),
    onSuccess: (data) => {
      saveAuth(token, { ...user, name: data.name, avatar_color: data.avatar_color, email: data.email });
      toast('Profile updated.', 'success');
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const changePw = useMutation({
    mutationFn: () => apiPut('/auth/change-password', { currentPassword: curPw, newPassword: newPw }),
    onSuccess: () => {
      toast('Password changed successfully.', 'success');
      setCurPw(''); setNewPw(''); setConfPw('');
    },
    onError: (e) => toast(e.message, 'error'),
  });

  function handlePwSubmit() {
    if (newPw !== confPw) { toast('Passwords do not match.', 'error'); return; }
    if (newPw.length < 6) { toast('Password must be at least 6 characters.', 'error'); return; }
    changePw.mutate();
  }

  return (
    <div className="p-5 md:p-8 max-w-2xl mx-auto space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-black text-[#151c27] tracking-tight">My Profile</h1>
        <p className="text-[#777587] text-sm mt-0.5">Manage your personal information and password.</p>
      </div>

      {/* Account Info — email editable */}
      <div className="bg-white rounded-xl shadow-card border border-[#c7c4d8] p-6">
        <h2 className="text-sm font-black text-[#151c27] uppercase tracking-wider flex items-center gap-2 mb-5">
          <UserCircle size={15} className="text-[#3525cd]" /> Account Info
        </h2>
        <div className="space-y-3">
          <div>
            <label className="form-label flex items-center gap-1.5"><Mail size={13} className="text-[#3525cd]" /> Email Address</label>
            <input className="form-control" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" />
            <p className="text-[0.7rem] text-[#777587] mt-1">Changing your email will update your login credentials.</p>
          </div>
          {[
            { icon: <Building2 size={15} />, label:'Department', value: user?.department },
            { icon: <Briefcase size={15} />, label:'Position',   value: user?.position },
          ].map(({ icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 py-2.5 border-t border-[#f0f3ff]">
              <div className="w-8 h-8 bg-[#f0f3ff] rounded-lg flex items-center justify-center text-[#464555] flex-shrink-0">{icon}</div>
              <div>
                <p className="text-xs text-[#777587]">{label}</p>
                <p className="text-sm font-semibold text-[#151c27]">{value || '—'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Editable profile */}
      <div className="bg-white rounded-xl shadow-card border border-[#c7c4d8] p-6">
        <h2 className="text-sm font-black text-[#151c27] uppercase tracking-wider flex items-center gap-2 mb-5">
          <UserCircle size={15} className="text-[#3525cd]" /> Display Settings
        </h2>

        {/* Avatar preview */}
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-black text-white flex-shrink-0 shadow-md"
            style={{ background: color }}>
            {initials(name || user?.name || '')}
          </div>
          <div>
            <p className="text-sm font-bold text-[#151c27]">{name || user?.name}</p>
            <p className="text-xs text-[#777587] mt-0.5">Click a color to change your avatar</p>
          </div>
        </div>

        {/* Color picker */}
        <div className="mb-5">
          <label className="form-label mb-2">Avatar Color</label>
          <div className="flex gap-2 flex-wrap">
            {AVATAR_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 flex-shrink-0"
                style={{ background: c, borderColor: color === c ? '#fff' : 'transparent', outline: color === c ? `2px solid ${c}` : 'none', outlineOffset:'1px' }} />
            ))}
          </div>
        </div>

        {/* Name */}
        <div className="mb-5">
          <label className="form-label">Display Name</label>
          <input className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
        </div>

        <button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending || !name.trim()}
          className="btn btn-primary btn-sm flex items-center gap-2">
          {saveProfile.isPending ? <><span className="spinner w-3.5 h-3.5" /> Saving…</> : <><Save size={14} /> Save Changes</>}
        </button>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-xl shadow-card border border-[#c7c4d8] p-6">
        <h2 className="text-sm font-black text-[#151c27] uppercase tracking-wider flex items-center gap-2 mb-5">
          <Lock size={15} className="text-[#3525cd]" /> Change Password
        </h2>

        <div className="space-y-4">
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
            <p className="text-xs text-rose-600 flex items-center gap-1">Passwords do not match.</p>
          )}

          <button onClick={handlePwSubmit} disabled={changePw.isPending || !curPw || !newPw || !confPw}
            className="btn btn-primary btn-sm flex items-center gap-2">
            {changePw.isPending ? <><span className="spinner w-3.5 h-3.5" /> Updating…</> : <><Check size={14} /> Update Password</>}
          </button>
        </div>
      </div>
    </div>
  );
}
