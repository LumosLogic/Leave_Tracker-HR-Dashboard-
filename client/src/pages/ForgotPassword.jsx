import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Zap, CheckCircle2 } from 'lucide-react';
import { apiPost } from '@/lib/api';

export default function ForgotPassword() {
  const [email,   setEmail]   = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [sent,    setSent]    = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await apiPost('/auth/forgot-password', { email, ...(orgSlug.trim() && { org_slug: orgSlug.trim().toLowerCase() }) });
      setSent(true);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-screen grid md:grid-cols-2 bg-[#f9f9ff] overflow-hidden">

      {/* Left brand panel */}
      <div className="hidden md:flex flex-col justify-center px-12 py-8 relative overflow-hidden bg-[#3525cd]">
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)', backgroundSize: '48px 48px' }} />
        <div className="absolute inset-0 bg-gradient-to-br from-[#3525cd]/80 via-[#712ae2]/40 to-[#3525cd]/90 pointer-events-none" />
        <div className="relative z-10 text-white">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <img src="/LogoWithoutName.svg" alt="LeaveTracker" className="w-7 h-7" />
            </div>
            <span className="text-white font-black text-lg tracking-tight">LeaveTracker</span>
          </div>
          <h1 className="text-4xl font-black leading-tight tracking-[-0.04em] text-white mb-4">
            Forgot your<br />
            <span className="opacity-80">password?</span><br />
            <em className="not-italic text-white/90">No problem.</em>
          </h1>
          <p className="text-white/75 text-sm leading-relaxed max-w-sm mb-7">
            Enter your registered email address and we'll send you a secure link to reset your password. The link expires in 1 hour.
          </p>
          <div className="flex items-center gap-3.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0"
              style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.25)', backdropFilter: 'blur(10px)' }}>
              <Zap size={18} />
            </div>
            <div>
              <strong className="block text-white text-sm font-bold">Secure Reset Link</strong>
              <span className="text-white/70 text-xs">One-time link sent directly to your email</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center px-8 md:px-16 py-10 bg-white relative overflow-y-auto border-l border-[#c7c4d8]">
        <div className="w-full max-w-sm relative z-10">

          {/* Mobile branding */}
          <div className="flex items-center gap-2 mb-8 md:hidden">
            <div className="w-8 h-8 rounded-lg bg-[#3525cd] flex items-center justify-center flex-shrink-0">
              <img src="/LogoWithoutName.svg" alt="LeaveTracker" className="w-5 h-5" />
            </div>
            <span className="text-base font-black text-[#3525cd]">LeaveTracker</span>
          </div>

          {sent ? (
            /* Success state */
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 size={32} className="text-emerald-600" />
              </div>
              <h2 className="text-2xl font-black text-[#151c27] tracking-tight mb-3">Check your email</h2>
              <p className="text-sm text-[#464555] leading-relaxed mb-6">
                If an account exists for <strong>{email}</strong>, a password reset link has been sent. Check your inbox (and spam folder).
              </p>
              <p className="text-xs text-[#777587] mb-8">The link expires in 1 hour.</p>
              <Link to="/login"
                className="flex items-center justify-center gap-2 text-sm text-[#3525cd] font-bold hover:underline">
                <ArrowLeft size={15} /> Back to Login
              </Link>
            </div>
          ) : (
            /* Form state */
            <>
              <div className="mb-9">
                <h2 className="text-[2rem] font-black text-[#151c27] tracking-[-0.04em] leading-tight mb-2">
                  Reset Password
                </h2>
                <p className="text-sm text-[#464555]">Enter your email and we'll send you a reset link.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="form-label">Organization Slug <span className="text-[#777587] font-normal">(optional)</span></label>
                  <input
                    type="text" className="form-control"
                    placeholder="e.g. lumoslogic"
                    value={orgSlug}
                    onChange={e => setOrgSlug(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Email Address</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#777587]" />
                    <input
                      type="email" className="form-control pl-9" required autoFocus
                      placeholder="name@company.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-[0.83rem] text-rose-700 bg-rose-50 border border-rose-200 border-l-4 border-l-rose-500 rounded-xl px-4 py-3">
                    {error}
                  </div>
                )}

                <button
                  type="submit" disabled={loading}
                  className="w-full py-4 bg-[#3525cd] text-white font-bold text-base rounded-xl hover:bg-[#4f46e5] transition-all shadow-lg shadow-[#3525cd]/20 active:scale-[0.98] mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center gap-2 justify-center">
                      <span className="spinner w-4 h-4" /> Sending link…
                    </span>
                  ) : 'Send Reset Link'}
                </button>
              </form>

              <div className="flex items-center justify-center mt-6">
                <Link to="/login"
                  className="flex items-center gap-1.5 text-sm text-[#464555] hover:text-[#3525cd] transition-colors">
                  <ArrowLeft size={15} /> Back to Login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
