import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, Mail, Send, Users, User } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { Avatar } from '@/components/ui/Avatar';

function Section({ icon, title, color, children }) {
  return (
    <div className="bg-[#2a313d] border border-[#464555]/40 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#464555]/40"
        style={{ background: 'rgba(255,255,255,.04)' }}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
          {icon}
        </div>
        <h2 className="font-black text-white text-base">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function EmployeeSelect({ value, onChange, employees, label }) {
  return (
    <div>
      <label className="block text-xs font-bold text-[#c7c4d8] mb-1.5">{label}</label>
      <select
        className="w-full bg-[#151c27] border border-[#464555] text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#4f46e5]"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
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

  // Push notification state
  const [nTitle,    setNTitle]    = useState('');
  const [nBody,     setNBody]     = useState('');
  const [nUrl,      setNUrl]      = useState('');
  const [nTarget,   setNTarget]   = useState('');
  const [nSending,  setNSending]  = useState(false);

  // Email state
  const [eSubject,  setESubject]  = useState('');
  const [eMessage,  setEMessage]  = useState('');
  const [eTarget,   setETarget]   = useState('');
  const [eSending,  setESending]  = useState(false);

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

  const inputCls = 'w-full bg-[#151c27] border border-[#464555] text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#4f46e5] placeholder:text-[#464555]';

  return (
    <div className="p-6 md:p-8 min-h-screen bg-[#1a2030]">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Bell size={16} className="text-[#c3c0ff]" />
            <span className="text-xs font-bold text-[#c3c0ff] uppercase tracking-widest">Root Admin</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Broadcast Centre</h1>
          <p className="text-[#c7c4d8] text-sm mt-1">
            Send push notifications and emails to all employees or a specific person.
          </p>
        </div>

        <div className="space-y-6">
          {/* Push Notification */}
          <Section
            icon={<Bell size={18} className="text-white" />}
            title="Send Push Notification"
            color="bg-[#3525cd]"
          >
            <div className="space-y-4">
              <EmployeeSelect
                label="Recipient"
                value={nTarget}
                onChange={setNTarget}
                employees={employees}
              />
              <div>
                <label className="block text-xs font-bold text-[#c7c4d8] mb-1.5">Title *</label>
                <input
                  className={inputCls}
                  placeholder="e.g. Office Closed Tomorrow"
                  value={nTitle}
                  onChange={e => setNTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#c7c4d8] mb-1.5">Message *</label>
                <textarea
                  className={inputCls}
                  rows={3}
                  placeholder="Notification message…"
                  value={nBody}
                  onChange={e => setNBody(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#c7c4d8] mb-1.5">
                  Link URL <span className="text-[#464555] font-normal">(optional — defaults to /)</span>
                </label>
                <input
                  className={inputCls}
                  placeholder="/portal/home"
                  value={nUrl}
                  onChange={e => setNUrl(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={sendNotification}
                  disabled={nSending}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-all"
                  style={{ background: 'linear-gradient(135deg, #3525cd, #4f46e5)' }}
                >
                  {nSending ? <span className="spinner w-4 h-4" /> : <Send size={15} />}
                  {nTarget ? 'Send to Employee' : 'Broadcast to All'}
                </button>
                <span className="text-xs text-[#464555]">
                  {nTarget
                    ? `→ ${employees.find(e => String(e.id) === nTarget)?.name || 'selected'}`
                    : `→ ${employees.length} employee${employees.length !== 1 ? 's' : ''}`}
                </span>
              </div>
            </div>
          </Section>

          {/* Email */}
          <Section
            icon={<Mail size={18} className="text-white" />}
            title="Send Email"
            color="bg-emerald-700"
          >
            <div className="space-y-4">
              <EmployeeSelect
                label="Recipient"
                value={eTarget}
                onChange={setETarget}
                employees={employees}
              />
              <div>
                <label className="block text-xs font-bold text-[#c7c4d8] mb-1.5">Subject *</label>
                <input
                  className={inputCls}
                  placeholder="e.g. Important Company Announcement"
                  value={eSubject}
                  onChange={e => setESubject(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#c7c4d8] mb-1.5">Message *</label>
                <textarea
                  className={inputCls}
                  rows={6}
                  placeholder="Write your message here… (supports line breaks)"
                  value={eMessage}
                  onChange={e => setEMessage(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={sendEmail}
                  disabled={eSending}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 transition-all"
                >
                  {eSending ? <span className="spinner w-4 h-4" /> : <Send size={15} />}
                  {eTarget ? 'Send Email' : 'Email All'}
                </button>
                <span className="text-xs text-[#464555]">
                  {eTarget
                    ? `→ ${employees.find(e => String(e.id) === eTarget)?.name || 'selected'}`
                    : `→ ${employees.length} recipient${employees.length !== 1 ? 's' : ''}`}
                </span>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
