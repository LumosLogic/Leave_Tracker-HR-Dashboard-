import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { Bell, CheckCheck, Trash2, Megaphone, DollarSign, Receipt, Monitor, Target, UserCheck, LogOut as ExitIcon, ClipboardList } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPut, apiDelete } from '@/lib/api';

const TYPE_CFG = {
  regularization: { icon: <ClipboardList size={14} />, bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   strip: '#F59E0B', label: 'Regularization' },
  payroll:        { icon: <DollarSign size={14} />,    bg: 'bg-[#f0f3ff]',  text: 'text-[#3525cd]',   border: 'border-[#c7c4d8]',   strip: '#3525cd', label: 'Payroll' },
  expense:        { icon: <Receipt size={14} />,       bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', strip: '#10B981', label: 'Expense' },
  announcement:   { icon: <Megaphone size={14} />,     bg: 'bg-[#f0f3ff]',  text: 'text-[#712ae2]',   border: 'border-[#c7c4d8]',   strip: '#712ae2', label: 'Announcement' },
  asset:          { icon: <Monitor size={14} />,       bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200',    strip: '#06B6D4', label: 'Asset' },
  performance:    { icon: <Target size={14} />,        bg: 'bg-amber-50',   text: 'text-amber-800',   border: 'border-amber-200',   strip: '#F59E0B', label: 'Performance' },
  onboarding:     { icon: <UserCheck size={14} />,     bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', strip: '#10B981', label: 'Onboarding' },
  exit:           { icon: <ExitIcon size={14} />,      bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    strip: '#EF4444', label: 'Exit' },
  info:           { icon: <Bell size={14} />,          bg: 'bg-[#f0f3ff]',  text: 'text-[#464555]',   border: 'border-[#c7c4d8]',   strip: '#c7c4d8', label: 'Info' },
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 7) return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return 'Just now';
}

export default function NotificationCenter() {
  const { isEmployee } = useAuth();
  const wrap = isEmployee ? 'p-5 md:p-8 max-w-4xl mx-auto' : '';
  const toast = useToast();
  const qc    = useQueryClient();

  const { data: _notifData, isLoading } = useQuery({ queryKey: ['notifications'], queryFn: () => apiGet('/notifications') });
  const notifications = Array.isArray(_notifData) ? _notifData : [];

  function invalidateNotifs() {
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['notif-count'] });
  }

  const readMut = useMutation({
    mutationFn: id => apiPut(`/notifications/${id}/read`),
    onSuccess: invalidateNotifs,
  });

  const readAllMut = useMutation({
    mutationFn: () => apiPut('/notifications/mark-all-read'),
    onSuccess: () => { toast('All marked as read', 'success'); invalidateNotifs(); },
  });

  const delMut = useMutation({
    mutationFn: id => apiDelete(`/notifications/${id}`),
    onSuccess: invalidateNotifs,
  });

  const unread = notifications.filter(n => !n.is_read).length;

  // Group: Today, This Week, Earlier
  const now      = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const weekAgo  = new Date(now - 7 * 864e5).toISOString();

  const groups = [
    { label: 'Today',      items: notifications.filter(n => n.created_at.startsWith(todayStr)) },
    { label: 'This Week',  items: notifications.filter(n => !n.created_at.startsWith(todayStr) && n.created_at >= weekAgo) },
    { label: 'Earlier',    items: notifications.filter(n => n.created_at < weekAgo) },
  ].filter(g => g.items.length > 0);

  return (
    <div className={wrap}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">
            {unread > 0 ? <span className="font-bold text-[#3525cd]">{unread} unread</span> : 'All caught up'} · {notifications.length} total
          </p>
        </div>
        {unread > 0 && (
          <button className="btn btn-outline" onClick={() => readAllMut.mutate()} disabled={readAllMut.isPending}>
            {readAllMut.isPending ? <><span className="spinner w-4 h-4" />Marking…</> : <><CheckCheck size={15} />Mark All Read</>}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="loading"><div className="spinner" />Loading notifications…</div>
      ) : notifications.length === 0 ? (
        <div className="empty-state">
          <Bell size={48} className="mx-auto mb-3 text-[#c7c4d8]" />
          <p className="font-semibold text-[#464555] mb-1">You're all caught up!</p>
          <p className="text-sm">No notifications yet — they'll appear here when there's activity.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.label}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[0.7rem] font-black uppercase tracking-widest text-[#777587]">{group.label}</span>
                <div className="flex-1 h-px bg-[#f0f3ff]" />
              </div>
              <div className="flex flex-col gap-2">
                {group.items.map(n => {
                  const cfg = TYPE_CFG[n.type] || TYPE_CFG.info;
                  return (
                    <div key={n.id}
                      className={`card overflow-hidden cursor-pointer hover:shadow-card-hover transition-all duration-200 ${!n.is_read ? 'border-[#3525cd]/20' : ''}`}
                      onClick={() => { if (!n.is_read) readMut.mutate(n.id); }}>
                      {!n.is_read && <div className="h-0.5 w-full" style={{ background: cfg.strip }} />}
                      <div className="p-4 flex items-start gap-3">
                        {/* Unread dot */}
                        <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-0.5">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${cfg.bg}`}>
                            <span className={cfg.text}>{cfg.icon}</span>
                          </div>
                          {!n.is_read && <div className="w-1.5 h-1.5 rounded-full bg-[#3525cd]" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-bold text-sm ${!n.is_read ? 'text-[#151c27]' : 'text-[#464555]'}`}>{n.title}</span>
                              <span className={`badge ${cfg.bg} ${cfg.text} ${cfg.border} border text-[0.6rem]`}>{cfg.label}</span>
                            </div>
                            <span className="text-[0.65rem] text-[#c7c4d8] flex-shrink-0">{timeAgo(n.created_at)}</span>
                          </div>
                          <p className="text-xs text-[#777587] mt-1 leading-relaxed">{n.message}</p>
                        </div>
                        <button
                          className="p-1.5 rounded-lg text-[#c7c4d8] hover:text-rose-500 hover:bg-rose-50 flex-shrink-0 transition-colors"
                          onClick={e => { e.stopPropagation(); delMut.mutate(n.id); }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
