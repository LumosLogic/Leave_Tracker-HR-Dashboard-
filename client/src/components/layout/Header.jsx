import React, { useState, useEffect } from 'react';
import { Menu, ShieldCheck, Users, UserCircle, Bell, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { GlobalSearchModal } from '@/components/ui/GlobalSearchModal';

export function Header({ title, subtitle, onMenuClick }) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const { user, isRootAdmin, isAdmin, isEmployee } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(s => !s);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const { data: countData } = useQuery({
    queryKey: ['notif-count'],
    queryFn: () => apiGet('/notifications/unread-count'),
    refetchInterval: 30000,
    enabled: !!user,
  });
  const unreadCount = countData?.count || 0;
  const notifPath   = isEmployee ? '/portal/notifications' : isRootAdmin ? '/root/notifications' : '/notifications';

  const roleLabel = isRootAdmin ? 'Root Admin' : isAdmin ? 'HR Admin' : 'Employee';
  const RoleIcon  = isRootAdmin ? ShieldCheck : isAdmin ? Users : UserCircle;
  const roleStyle = isRootAdmin
    ? 'bg-purple-50 text-purple-700 border-purple-200'
    : isAdmin
      ? 'bg-[#f0f3ff] text-[#3525cd] border-[#c7c4d8]'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200';

  return (
    <>
      <header className="h-16 flex items-center px-7 gap-3.5 flex-shrink-0 relative z-10 bg-white border-b border-[#c7c4d8] shadow-sm">
        <button
          onClick={onMenuClick}
          className="md:hidden w-9 h-9 flex flex-col justify-center items-center gap-1.5 border border-[#c7c4d8] bg-white rounded-lg shadow-sm"
        >
          <Menu size={18} className="text-[#464555]" />
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="text-[1.12rem] font-black tracking-tight leading-none text-[#151c27]">
            {title}
          </h1>
          {subtitle && <p className="text-[0.78rem] text-[#777587] mt-0.5">{subtitle}</p>}
        </div>

        {/* Global Search Trigger */}
        <button
          onClick={() => setSearchOpen(true)}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#c7c4d8] bg-[#f9f9ff] text-xs text-[#777587] hover:border-[#3525cd]/40 hover:text-[#151c27] transition-colors"
        >
          <Search size={14} className="text-[#3525cd]" />
          <span>Search...</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white border border-[#c7c4d8] text-[0.6rem] font-mono font-bold">Ctrl K</kbd>
        </button>

        <span className={`hidden sm:flex items-center gap-1.5 text-[0.72rem] font-bold px-2.5 py-1 rounded-full border flex-shrink-0 ${roleStyle}`}>
          <RoleIcon size={11} />
          {roleLabel}
        </span>

        {/* In-app notification bell */}
        <Link to={notifPath} className="relative flex-shrink-0">
          <div className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#c7c4d8] bg-white hover:bg-[#f0f3ff] hover:border-[#3525cd]/40 transition-colors text-[#464555] hover:text-[#3525cd]">
            <Bell size={16} />
          </div>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-[#3525cd] text-white text-[0.55rem] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        <span className="hidden sm:flex text-[0.78rem] text-[#464555] font-semibold bg-white border border-[#c7c4d8] px-3.5 py-1.5 rounded-lg shadow-sm flex-shrink-0">
          {today}
        </span>
      </header>

      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

