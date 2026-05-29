import React from 'react';
import { Menu, ShieldCheck, Users, UserCircle, Bell, BellOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { usePushNotification } from '@/hooks/usePushNotification';

export function Header({ title, subtitle, onMenuClick }) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const { user, isRootAdmin, isAdmin, isEmployee } = useAuth();
  const { permission, subscribed, requestAndSubscribe, isSupported } = usePushNotification(user?.id);

  const roleLabel = isRootAdmin ? 'Root Admin' : isAdmin ? 'HR Admin' : 'Employee';
  const RoleIcon  = isRootAdmin ? ShieldCheck : isAdmin ? Users : UserCircle;
  const roleStyle = isRootAdmin
    ? 'bg-purple-50 text-purple-700 border-purple-200'
    : isAdmin
      ? 'bg-[#f0f3ff] text-[#3525cd] border-[#c7c4d8]'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200';

  return (
    <header className="h-16 flex items-center px-7 gap-3.5 flex-shrink-0 relative z-10
      bg-white border-b border-[#c7c4d8] shadow-sm">

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

      <span className={`hidden sm:flex items-center gap-1.5 text-[0.72rem] font-bold px-2.5 py-1 rounded-full border flex-shrink-0 ${roleStyle}`}>
        <RoleIcon size={11} />
        {roleLabel}
      </span>

      {/* Push notification bell — pulses until user grants permission */}
      {isSupported && (
        <button
          onClick={requestAndSubscribe}
          title={permission === 'granted' ? 'Notifications enabled' : 'Click to enable push notifications'}
          className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors flex-shrink-0 ${
            permission === 'granted'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
              : 'border-amber-200 bg-amber-50 text-amber-500 animate-pulse'
          }`}
        >
          <Bell size={15} />
        </button>
      )}

      <span className="hidden sm:flex text-[0.78rem] text-[#464555] font-semibold bg-white border border-[#c7c4d8] px-3.5 py-1.5 rounded-lg shadow-sm flex-shrink-0">
        {today}
      </span>
    </header>
  );
}
