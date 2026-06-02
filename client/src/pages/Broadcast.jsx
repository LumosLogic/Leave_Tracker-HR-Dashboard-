import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, Mail, Send } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/context/ToastContext';

function Section({ icon, title, iconBg, children }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#f0f3ff]">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <h2 className="font-black text-[#151c27] text-base">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function RecipientSelect({ value, onChange, employees, label }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      <select className="form-control" value={value} onChange={e => onChange(e.target.value)}>
        <option value="">All Employees</option>
        {employees.map(e => (
          <option key={e.id} value={e.id}>{e.name} — {e.department || e.role}</option>
        ))}
      </select>
    </div>
  );
}

export default function Broadcast() {
  const toast = useToast();

  const { data: allUsers = [] } = useQuery({
    queryKey: ['all-users-broadcast'],
    queryFn: () => apiGet('/employees'),
  });
  const employees = allUsers.filter(u => u.role !== 'root_admin');

  const [nTitle,   setNTitle]   = useState('');
  const [nBody,    setNBody]    = useState('');
  const [nUrl,     setNUrl]     = useState('');
  const [nTarget,  setNTarget]  = useState('');
  const [nSending, setNSending] = useState(false);

  const [eSubject, setESubject] = useState('');
  const [eMessage, setEMessage] = useState('');
  const [eTarget,  setETarget]  = useState('');
  const [eSending, setESending] = useState(false);

  async function sendNotification() {
    if (!nTitle.trim() || !nBody.trim()) return toast('Enter title and message', 'warning');
    setNSending(true);
    try {
      const res = await apiPost('/notifications/send', {
        title:          nTitle.trim(),
        body:           nBody.trim(),
        url:            nUrl.trim() || '/',
        target_user_id: nTarget || null,
      });
      toast(`Notification sent to ${res.sent} device${res.sent !== 1 ? 's' : ''}`, 'success');
      setNTitle(''); setNBody(''); setNUrl(''); setNTarget('');
    } catch (err) { toast(err.message, 'error'); }
    finally { setNSending(false); }
  }

  async function sendEmail() {
    if (!eSubject.trim() || !eMessage.trim()) return toast('Enter subject and message', 'warning');
    setESending(true);
    try {
      const res = await apiPost('/root/send-email', {
        subject:        eSubject.trim(),
        message:        eMessage.trim(),
        target_user_id: eTarget || null,
      });
      toast(`Email sent to ${res.sent} recipient${res.sent !== 1 ? 's' : ''}`, 'success');
      setESubject(''); setEMessage(''); setETarget('');
    } catch (err) { toast(err.message, 'error'); }
    finally { setESending(false); }
  }

  return (
    <div>
      {/* Hero Banner */}
      <div className="rounded-xl p-6 mb-6 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #3525cd 0%, #4f46e5 50%, #712ae2 100%)' }}>
        <div className="flex items-center gap-2 mb-1">
          <Bell size={14} className="text-white/70" />
          <span className="text-xs font-bold text-white/70 uppercase tracking-widest">Root Admin</span>
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">Broadcast Centre</h1>
        <p className="text-white/75 text-sm mt-1">
          Send push notifications and emails to all employees or a specific person.
        </p>
      </div>

      <div className="max-w-3xl space-y-5">
        {/* Push Notification */}
        <Section
          icon={<Bell size={18} className="text-[#3525cd]" />}
          title="Send Push Notification"
          iconBg="bg-[#f0f3ff]"
        >
          <div className="space-y-4">
            <RecipientSelect label="Recipient" value={nTarget} onChange={setNTarget} employees={employees} />
            <div>
              <label className="form-label">Title *</label>
              <input className="form-control" placeholder="e.g. Office Closed Tomorrow" value={nTitle} onChange={e => setNTitle(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Message *</label>
              <textarea className="form-control" rows={3} placeholder="Notification message…" value={nBody} onChange={e => setNBody(e.target.value)} />
            </div>
            <div>
              <label className="form-label">
                Link URL <span className="text-[#777587] font-normal">(optional — defaults to /)</span>
              </label>
              <input className="form-control" placeholder="/portal/home" value={nUrl} onChange={e => setNUrl(e.target.value)} />
            </div>
            <div className="flex items-center gap-3 pt-1 border-t border-[#f0f3ff]">
              <button
                onClick={sendNotification}
                disabled={nSending}
                className="btn btn-primary btn-sm"
              >
                {nSending ? <span className="spinner w-4 h-4" /> : <Send size={14} />}
                {nTarget ? 'Send to Employee' : 'Broadcast to All'}
              </button>
              <span className="text-xs text-[#777587]">
                {nTarget
                  ? `→ ${employees.find(e => String(e.id) === nTarget)?.name || 'selected'}`
                  : `→ ${employees.length} employee${employees.length !== 1 ? 's' : ''}`}
              </span>
            </div>
          </div>
        </Section>

        {/* Email */}
        <Section
          icon={<Mail size={18} className="text-emerald-600" />}
          title="Send Email"
          iconBg="bg-emerald-50"
        >
          <div className="space-y-4">
            <RecipientSelect label="Recipient" value={eTarget} onChange={setETarget} employees={employees} />
            <div>
              <label className="form-label">Subject *</label>
              <input className="form-control" placeholder="e.g. Important Company Announcement" value={eSubject} onChange={e => setESubject(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Message *</label>
              <textarea className="form-control" rows={6} placeholder="Write your message here… (supports line breaks)" value={eMessage} onChange={e => setEMessage(e.target.value)} />
            </div>
            <div className="flex items-center gap-3 pt-1 border-t border-[#f0f3ff]">
              <button
                onClick={sendEmail}
                disabled={eSending}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-all"
              >
                {eSending ? <span className="spinner w-4 h-4" /> : <Send size={14} />}
                {eTarget ? 'Send Email' : 'Email All'}
              </button>
              <span className="text-xs text-[#777587]">
                {eTarget
                  ? `→ ${employees.find(e => String(e.id) === eTarget)?.name || 'selected'}`
                  : `→ ${employees.length} recipient${employees.length !== 1 ? 's' : ''}`}
              </span>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
