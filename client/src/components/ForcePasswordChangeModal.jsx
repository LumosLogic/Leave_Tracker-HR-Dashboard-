import React, { useState } from 'react';
import { Eye, EyeOff, ShieldCheck, Check, X, Shield } from 'lucide-react';
import { apiPut } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

function getStrength(pw) {
  let score = 0;
  if (pw.length >= 8)          score++;
  if (/[A-Z]/.test(pw))        score++;
  if (/[a-z]/.test(pw))        score++;
  if (/[0-9]/.test(pw))        score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

const STRENGTH_LABELS = ['', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
const STRENGTH_COLORS = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];
const STRENGTH_BG     = ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-400', 'bg-emerald-500', 'bg-emerald-600'];

export function ForcePasswordChangeModal() {
  const { user, saveAuth, token } = useAuth();
  const [curPw,    setCurPw]    = useState('');
  const [newPw,    setNewPw]    = useState('');
  const [confPw,   setConfPw]   = useState('');
  const [showCur,  setShowCur]  = useState(false);
  const [showNew,  setShowNew]  = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const reqs = [
    { label: 'Minimum 8 characters',        met: newPw.length >= 8 },
    { label: 'At least 1 uppercase letter',  met: /[A-Z]/.test(newPw) },
    { label: 'At least 1 lowercase letter',  met: /[a-z]/.test(newPw) },
    { label: 'At least 1 number',            met: /[0-9]/.test(newPw) },
    { label: 'At least 1 special character', met: /[^A-Za-z0-9]/.test(newPw) },
  ];

  const strength   = getStrength(newPw);
  const allReqsMet = reqs.every(r => r.met);
  const pwsMatch   = !!(newPw && confPw && newPw === confPw);
  const canSubmit  = !!(curPw && allReqsMet && pwsMatch && !loading);

  if (!user?.force_password_change) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true); setError('');
    try {
      await apiPut('/auth/change-password', { currentPassword: curPw, newPassword: newPw });
      saveAuth(token, { ...user, force_password_change: false });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4"
      style={{ background: 'rgba(4,6,14,.8)', backdropFilter: 'blur(12px)' }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-[#c7c4d8] w-full max-w-md overflow-hidden">
        {/* Top gradient accent */}
        <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #3525cd, #4f46e5, #712ae2, #8a4cfc)' }} />

        <div className="p-6 overflow-y-auto max-h-[calc(100vh-80px)]">
          {/* Header */}
          <div className="flex flex-col items-center mb-5">
            <div className="w-12 h-12 rounded-2xl bg-[#3525cd]/10 flex items-center justify-center mb-3">
              <ShieldCheck size={24} className="text-[#3525cd]" />
            </div>
            <h2 className="text-xl font-black text-[#151c27] text-center">Set Your Password</h2>
            <p className="text-sm text-[#777587] text-center mt-1 max-w-xs">
              For security reasons, you must change your temporary password before accessing your dashboard.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Temporary Password */}
            <div>
              <label className="form-label">Temporary Password</label>
              <div className="relative">
                <input
                  type={showCur ? 'text' : 'password'}
                  className="form-control pr-10"
                  value={curPw}
                  onChange={e => setCurPw(e.target.value)}
                  required
                  placeholder="Enter your temporary password"
                  autoFocus
                />
                <button type="button" onClick={() => setShowCur(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777587] hover:text-[#151c27]">
                  {showCur ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {curPw && (
                <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                  <Check size={11} /> Temporary password entered
                </p>
              )}
            </div>

            {/* New Password */}
            <div>
              <label className="form-label">New Password</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  className="form-control pr-10"
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  required
                  placeholder="Create a strong password"
                />
                <button type="button" onClick={() => setShowNew(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777587] hover:text-[#151c27]">
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Strength bar */}
              {newPw && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i}
                        className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= strength ? STRENGTH_BG[strength] : 'bg-[#e7eefe]'}`}
                      />
                    ))}
                  </div>
                  <p className="text-[0.72rem] font-bold" style={{ color: STRENGTH_COLORS[strength] }}>
                    {STRENGTH_LABELS[strength]}
                  </p>
                </div>
              )}

              {/* Requirements checklist */}
              {newPw && (
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  {reqs.map(r => (
                    <span key={r.label}
                      className={`flex items-center gap-1 text-[0.68rem] font-medium transition-colors ${r.met ? 'text-emerald-600' : 'text-[#777587]'}`}>
                      {r.met
                        ? <Check size={10} className="flex-shrink-0" />
                        : <X    size={10} className="flex-shrink-0" />}
                      {r.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="form-label">Confirm Password</label>
              <div className="relative">
                <input
                  type={showConf ? 'text' : 'password'}
                  className="form-control pr-10"
                  value={confPw}
                  onChange={e => setConfPw(e.target.value)}
                  required
                  placeholder="Repeat your new password"
                />
                <button type="button" onClick={() => setShowConf(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777587] hover:text-[#151c27]">
                  {showConf ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {confPw && (
                <p className={`text-xs mt-1 flex items-center gap-1 ${pwsMatch ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {pwsMatch
                    ? <><Check size={11} /> Passwords match</>
                    : <><X    size={11} /> Passwords do not match</>}
                </p>
              )}
            </div>

            {error && (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full btn btn-primary py-3.5 justify-center text-base"
            >
              {loading
                ? <span className="flex items-center gap-2"><span className="spinner w-4 h-4" /> Setting password…</span>
                : <span className="flex items-center gap-2"><ShieldCheck size={16} /> Set New Password</span>
              }
            </button>

            {/* Security note */}
            <p className="text-center text-[0.72rem] text-[#777587] flex items-center justify-center gap-1.5 mt-2">
              <Shield size={11} className="text-[#3525cd]" />
              Keep your password secure. Do not share it with anyone.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
