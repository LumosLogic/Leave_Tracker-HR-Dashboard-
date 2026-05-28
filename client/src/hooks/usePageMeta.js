import { useLocation } from 'react-router-dom';

const META = {
  '/dashboard':         { title: 'Dashboard',         subtitle: 'Overview of attendance' },
  '/calendar':          { title: 'Calendar',           subtitle: 'Attendance overview' },
  '/leaves':            { title: 'Leave Management',   subtitle: 'Apply and manage leaves' },
  '/employees':         { title: 'Team Members',       subtitle: 'Manage team members' },
  '/settings':          { title: 'Settings',           subtitle: 'Configure work schedule and integrations' },
  '/profile':           { title: 'My Profile',         subtitle: 'Manage your account settings' },
  '/root/dashboard':    { title: 'Dashboard',          subtitle: 'System-wide overview' },
  '/root/calendar':     { title: 'Calendar',           subtitle: 'Company calendar & attendance' },
  '/root/leaves':       { title: 'Leave Management',   subtitle: 'All employee leave requests' },
  '/root/employees':    { title: 'Team Members',       subtitle: 'Manage all users and roles' },
  '/root/settings':     { title: 'Settings',           subtitle: 'Configure work schedule and integrations' },
  '/root/profile':      { title: 'My Profile',         subtitle: 'Manage your account settings' },
};

export function usePageMeta() {
  const { pathname } = useLocation();
  return META[pathname] || { title: 'HR Tracker', subtitle: '' };
}
