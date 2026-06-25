import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, User, Mail, Phone, Globe, MessageSquare, CheckCircle2, ArrowRight, Clock } from 'lucide-react';
import { apiPost } from '@/lib/api';

export default function Register() {
  const [step, setStep] = useState(1); // 1 = form, 2 = success

  const [form, setForm] = useState({
    company_name: '',
    name: '',
    email: '',
    phone: '',
    website: '',
    message: '',
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiPost('/register-org', {
        company_name: form.company_name.trim(),
        name:         form.name.trim(),
        email:        form.email.trim(),
        phone:        form.phone.trim() || undefined,
        website:      form.website.trim() || undefined,
        message:      form.message.trim() || undefined,
      });
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (step === 2) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f9f9ff] p-6">
        <div className="bg-white rounded-2xl border border-[#c7c4d8] shadow-lg p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-5">
            <Clock size={32} className="text-amber-600" />
          </div>
          <h2 className="text-2xl font-black text-[#151c27] mb-2">Request Submitted!</h2>
          <p className="text-[#464555] text-sm mb-4">
            Thank you, <strong>{form.name}</strong>! Your registration request for <strong>{form.company_name}</strong> is now pending review.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 text-left">
            <p className="text-sm text-amber-800 font-semibold mb-1">What happens next?</p>
            <ul className="text-xs text-amber-700 space-y-1">
              <li className="flex items-start gap-1.5"><CheckCircle2 size={12} className="mt-0.5 flex-shrink-0" /> Our team reviews your organization details</li>
              <li className="flex items-start gap-1.5"><CheckCircle2 size={12} className="mt-0.5 flex-shrink-0" /> You receive an approval email within 24 hours</li>
              <li className="flex items-start gap-1.5"><CheckCircle2 size={12} className="mt-0.5 flex-shrink-0" /> Email includes your login credentials and org slug</li>
            </ul>
          </div>
          <p className="text-xs text-[#777587] mb-4">Approval sent to <strong>{form.email}</strong></p>
          <Link to="/login"
            className="w-full py-3 bg-[#3525cd] text-white font-bold rounded-xl hover:bg-[#4f46e5] transition-all flex items-center justify-center gap-2">
            Back to Login <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    );
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
            Start Your<br />
            <span className="opacity-80">Free Organization</span><br />
            <em className="not-italic text-white/90">Today.</em>
          </h1>
          <p className="text-white/75 text-sm leading-relaxed max-w-sm mb-7">
            Set up your own private HR workspace in 60 seconds. Full attendance tracking, leave management, and team analytics — all under your organization's name.
          </p>
          <div className="space-y-3">
            {[
              { title: 'Isolated Data', desc: 'Your company data is fully private and separate from others' },
              { title: 'Custom API Keys', desc: 'Bring your own Google Calendar, Clockify, and SMTP settings' },
              { title: 'Multi-role System', desc: 'Root Admin → HR Admin → Employee role hierarchy' },
              { title: 'Scale Freely', desc: 'Add unlimited employees, holidays, and events' },
            ].map(f => (
              <div key={f.title} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-white/20 border border-white/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <CheckCircle2 size={12} className="text-white" />
                </div>
                <div>
                  <strong className="block text-white text-sm font-bold">{f.title}</strong>
                  <span className="text-white/70 text-xs">{f.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center px-8 md:px-16 py-10 bg-white relative overflow-y-auto border-l border-[#c7c4d8]">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 md:hidden">
            <div className="w-8 h-8 rounded-lg bg-[#3525cd] flex items-center justify-center flex-shrink-0">
              <img src="/LogoWithoutName.svg" alt="LeaveTracker" className="w-5 h-5" />
            </div>
            <span className="text-base font-black text-[#3525cd]">LeaveTracker</span>
          </div>

          <div className="mb-6">
            <h2 className="text-[1.75rem] font-black text-[#151c27] tracking-[-0.04em] leading-tight mb-2">
              Register your organization
            </h2>
            <p className="text-sm text-[#464555]">Submit your details — we'll review and email your credentials within 24 hours.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="form-label">Company Name <span className="text-rose-500">*</span></label>
              <div className="relative">
                <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#777587]" />
                <input type="text" className="form-control pl-9" required
                  placeholder="Acme Corp" value={form.company_name}
                  onChange={e => set('company_name', e.target.value)} />
              </div>
            </div>

            <div>
              <label className="form-label">Your Full Name <span className="text-rose-500">*</span></label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#777587]" />
                <input type="text" className="form-control pl-9" required
                  placeholder="Jane Smith" value={form.name}
                  onChange={e => set('name', e.target.value)} />
              </div>
            </div>

            <div>
              <label className="form-label">Work Email <span className="text-rose-500">*</span></label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#777587]" />
                <input type="email" className="form-control pl-9" required
                  placeholder="jane@acmecorp.com" value={form.email}
                  onChange={e => set('email', e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Phone <span className="text-[#777587] font-normal normal-case tracking-normal">(Optional)</span></label>
                <div className="relative">
                  <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#777587]" />
                  <input type="tel" className="form-control pl-9"
                    placeholder="+91 98765…" value={form.phone}
                    onChange={e => set('phone', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="form-label">Website <span className="text-[#777587] font-normal normal-case tracking-normal">(Optional)</span></label>
                <div className="relative">
                  <Globe size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#777587]" />
                  <input type="url" className="form-control pl-9"
                    placeholder="https://…" value={form.website}
                    onChange={e => set('website', e.target.value)} />
                </div>
              </div>
            </div>

            <div>
              <label className="form-label">Message <span className="text-[#777587] font-normal">(optional)</span></label>
              <div className="relative">
                <MessageSquare size={15} className="absolute left-3 top-3 text-[#777587]" />
                <textarea className="form-control pl-9 resize-none" rows={2}
                  placeholder="Tell us about your company…" value={form.message}
                  onChange={e => set('message', e.target.value)} />
              </div>
            </div>

            {error && (
              <div className="text-[0.83rem] text-rose-700 bg-rose-50 border border-rose-200 border-l-4 border-l-rose-500 rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3.5 bg-[#3525cd] text-white font-bold text-base rounded-xl hover:bg-[#4f46e5] transition-all shadow-lg shadow-[#3525cd]/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {loading ? (
                <><span className="spinner w-4 h-4" /> Submitting request…</>
              ) : (
                <>Submit Registration Request <ArrowRight size={16} /></>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-[#464555] mt-4">
            Already have an account?{' '}
            <Link to="/login" className="text-[#3525cd] font-bold hover:underline">Sign in</Link>
          </p>

          <p className="text-center text-[0.72rem] text-[#777587] mt-3">
            LeaveTracker — Multi-Tenant HR Management
          </p>
        </div>
      </div>
    </div>
  );
}
