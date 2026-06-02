import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck, Mail, Lock, Zap, Building2, BarChart2 } from 'lucide-react';
import { usePlatformAuth } from '@/context/PlatformAuthContext';
import { platformLogin } from '@/lib/platformApi';

export default function PlatformLogin() {
  const { saveAuth } = usePlatformAuth();
  const navigate = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await platformLogin(email, password);
      saveAuth(data.token, data.admin);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
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
              <ShieldCheck size={22} className="text-[#3525cd]" />
            </div>
            <div>
              <span className="text-white font-black text-base tracking-tight block">Platform Admin</span>
              <span className="text-white/60 text-xs">LeaveTracker Console</span>
            </div>
          </div>

          <h1 className="text-4xl font-black leading-tight tracking-[-0.04em] text-white mb-4">
            Super Admin<br />
            <span className="opacity-80">Control Panel</span>
          </h1>
          <p className="text-white/75 text-sm leading-relaxed max-w-sm mb-8">
            Manage all organizations on the LeaveTracker platform. Review registration requests, monitor activity, and keep the ecosystem running.
          </p>

          <div className="flex flex-col gap-3 mb-7">
            {[
              { icon: <Building2 size={16} />,  title: 'Organization Management', desc: 'Approve, review and manage all companies' },
              { icon: <ShieldCheck size={16} />, title: 'Access Control',          desc: 'Full visibility across all tenants' },
              { icon: <BarChart2 size={16} />,   title: 'Platform Analytics',      desc: 'Users, orgs, and activity at a glance' },
              { icon: <Zap size={16} />,         title: 'Instant Approvals',       desc: 'Approve orgs and send credentials by email' },
            ].map(f => (
              <div key={f.title} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.25)', backdropFilter: 'blur(10px)' }}>
                  {f.icon}
                </div>
                <div>
                  <strong className="block text-white text-sm font-bold">{f.title}</strong>
                  <span className="text-white/60 text-xs">{f.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center px-8 md:px-16 py-10 bg-white border-l border-[#c7c4d8] overflow-y-auto">
        <div className="w-full max-w-sm">
          {/* Mobile branding */}
          <div className="flex items-center gap-2 mb-8 md:hidden">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: '#3525cd' }}>
              <ShieldCheck size={16} className="text-white" />
            </div>
            <span className="text-base font-black text-[#3525cd]">Platform Admin</span>
          </div>

          <div className="mb-9">
            <h2 className="text-[2rem] font-black text-[#151c27] tracking-[-0.04em] leading-tight mb-2">
              Welcome back
            </h2>
            <p className="text-sm text-[#464555]">Sign in to the Platform Admin Console.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[0.72rem] font-bold uppercase tracking-widest text-[#464555] mb-1.5">Email Address</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#777587]" />
                <input
                  type="email" required autoComplete="email"
                  className="w-full pl-9 pr-4 py-2.5 border border-[#c7c4d8] rounded-lg text-sm font-medium bg-white text-[#151c27] transition-all outline-none focus:border-[#3525cd] focus:ring-2 focus:ring-[#3525cd]/20 placeholder:text-[#777587]"
                  placeholder="platform@lumoslogic.com"
                  value={email} onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-[0.72rem] font-bold uppercase tracking-widest text-[#464555] mb-1.5">Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#777587]" />
                <input
                  type={showPw ? 'text' : 'password'} required autoComplete="current-password"
                  className="w-full pl-9 pr-10 py-2.5 border border-[#c7c4d8] rounded-lg text-sm font-medium bg-white text-[#151c27] transition-all outline-none focus:border-[#3525cd] focus:ring-2 focus:ring-[#3525cd]/20 placeholder:text-[#777587]"
                  placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)}
                />
                <button type="button" onClick={() => setShowPw(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777587] hover:text-[#151c27] p-1 transition-colors">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-[0.83rem] text-rose-700 bg-rose-50 border border-rose-200 border-l-4 border-l-rose-500 rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-4 bg-[#3525cd] text-white font-bold text-base rounded-xl hover:bg-[#4f46e5] transition-all shadow-lg shadow-[#3525cd]/20 active:scale-[0.98] mt-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {loading ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> Signing in…</>
              ) : 'Sign In to Console'}
            </button>
          </form>

          <p className="text-center text-[0.72rem] text-[#777587] mt-6">
            Restricted to authorized platform administrators only.
          </p>
        </div>
      </div>
    </div>
  );
}
