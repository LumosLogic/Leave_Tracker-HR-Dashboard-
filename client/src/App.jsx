import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { AppLayout }      from '@/components/layout/AppLayout';
import { RootLayout }     from '@/components/layout/RootLayout';
import { EmployeeLayout } from '@/components/layout/EmployeeLayout';
import { ForcePasswordChangeModal } from '@/components/ForcePasswordChangeModal';

import LandingPage      from '@/pages/LandingPage';
import Login            from '@/pages/Login';
import Register         from '@/pages/Register';
import ForgotPassword   from '@/pages/ForgotPassword';
import ResetPassword    from '@/pages/ResetPassword';

// ── HR Admin / Root Admin pages ──
import Dashboard        from '@/pages/Dashboard';
import Calendar         from '@/pages/Calendar';
import Leaves           from '@/pages/Leaves';
import Employees        from '@/pages/Employees';
import Settings         from '@/pages/Settings';
import OrgSettings      from '@/pages/OrgSettings';
import RootDashboard    from '@/pages/RootDashboard';
import ManageHR         from '@/pages/ManageHR';
import Broadcast        from '@/pages/Broadcast';
import MyProfile        from '@/pages/MyProfile';
import Departments      from '@/pages/Departments';
import HolidaysPage     from '@/pages/Holidays';
import LeavePolicies    from '@/pages/LeavePolicies';
import Regularization   from '@/pages/Regularization';
import Reports          from '@/pages/Reports';
import Documents        from '@/pages/Documents';
import Payroll          from '@/pages/Payroll';
import Assets           from '@/pages/Assets';
import ExpensesPage     from '@/pages/Expenses';
import AnnouncementsPage from '@/pages/Announcements';
import Shifts           from '@/pages/Shifts';
import Performance      from '@/pages/Performance';
import Onboarding       from '@/pages/Onboarding';
import ExitManagement   from '@/pages/ExitManagement';
import NotificationCenter from '@/pages/NotificationCenter';

// ── Employee portal pages ──
import EmployeeHome     from '@/pages/EmployeeHome';
import MyLeaves         from '@/pages/MyLeaves';
import MyAttendance     from '@/pages/MyAttendance';
import TeamCalendar     from '@/pages/TeamCalendar';

function defaultPath(user) {
  if (!user) return '/login';
  if (user.role === 'root_admin') return '/root/dashboard';
  if (user.role === 'employee')   return '/portal/home';
  return '/dashboard';
}

function HRRoute({ children }) {
  const { token, isAdmin } = useAuth();
  if (!token)   return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/portal/home" replace />;
  return children;
}

function RootRoute({ children }) {
  const { token, isRootAdmin } = useAuth();
  if (!token)        return <Navigate to="/login" replace />;
  if (!isRootAdmin)  return <Navigate to="/dashboard" replace />;
  return children;
}

function EmployeeRoute({ children }) {
  const { token, isEmployee } = useAuth();
  if (!token)      return <Navigate to="/login" replace />;
  if (!isEmployee) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  const { token, user } = useAuth();
  const home = defaultPath(user);

  return (
    <Routes>
      <Route path="/" element={token ? <Navigate to={home} replace /> : <LandingPage />} />
      <Route path="/login"            element={token ? <Navigate to={home} replace /> : <Login />} />
      <Route path="/register"         element={token ? <Navigate to={home} replace /> : <Register />} />
      <Route path="/forgot-password"  element={<ForgotPassword />} />
      <Route path="/reset-password"   element={<ResetPassword />} />

      {/* ── HR Admin area (admin + root_admin) ── */}
      <Route element={<HRRoute><AppLayout /></HRRoute>}>
        <Route path="/dashboard"        element={<Dashboard />} />
        <Route path="/calendar"         element={<Calendar />} />
        <Route path="/leaves"           element={<Leaves />} />
        <Route path="/employees"        element={<Employees />} />
        <Route path="/departments"      element={<Departments />} />
        <Route path="/holidays"         element={<HolidaysPage />} />
        <Route path="/leave-policies"   element={<LeavePolicies />} />
        <Route path="/regularization"   element={<Regularization />} />
        <Route path="/reports"          element={<Reports />} />
        <Route path="/documents"        element={<Documents />} />
        <Route path="/payroll"          element={<Payroll />} />
        <Route path="/assets"           element={<Assets />} />
        <Route path="/expenses"         element={<ExpensesPage />} />
        <Route path="/announcements"    element={<AnnouncementsPage />} />
        <Route path="/shifts"           element={<Shifts />} />
        <Route path="/performance"      element={<Performance />} />
        <Route path="/onboarding"       element={<Onboarding />} />
        <Route path="/exit-management"  element={<ExitManagement />} />
        <Route path="/notifications"    element={<NotificationCenter />} />
        <Route path="/settings"         element={<Settings />} />
        <Route path="/profile"          element={<MyProfile />} />
      </Route>

      {/* ── Root Admin area (root_admin only) ── */}
      <Route element={<RootRoute><RootLayout /></RootRoute>}>
        <Route path="/root/dashboard"       element={<RootDashboard />} />
        <Route path="/root/calendar"        element={<Calendar />} />
        <Route path="/root/leaves"          element={<Leaves />} />
        <Route path="/root/employees"       element={<Employees />} />
        <Route path="/root/departments"     element={<Departments />} />
        <Route path="/root/holidays"        element={<HolidaysPage />} />
        <Route path="/root/leave-policies"  element={<LeavePolicies />} />
        <Route path="/root/regularization"  element={<Regularization />} />
        <Route path="/root/reports"         element={<Reports />} />
        <Route path="/root/documents"       element={<Documents />} />
        <Route path="/root/payroll"         element={<Payroll />} />
        <Route path="/root/assets"          element={<Assets />} />
        <Route path="/root/expenses"        element={<ExpensesPage />} />
        <Route path="/root/announcements"   element={<AnnouncementsPage />} />
        <Route path="/root/shifts"          element={<Shifts />} />
        <Route path="/root/performance"     element={<Performance />} />
        <Route path="/root/onboarding"      element={<Onboarding />} />
        <Route path="/root/exit-management" element={<ExitManagement />} />
        <Route path="/root/notifications"   element={<NotificationCenter />} />
        <Route path="/root/settings"        element={<Settings />} />
        <Route path="/root/manage-hr"       element={<ManageHR />} />
        <Route path="/root/broadcast"       element={<Broadcast />} />
        <Route path="/root/profile"         element={<MyProfile />} />
        <Route path="/root/org-settings"    element={<OrgSettings />} />
      </Route>

      {/* ── Employee portal (employee only) ── */}
      <Route element={<EmployeeRoute><EmployeeLayout /></EmployeeRoute>}>
        <Route path="/portal/home"             element={<EmployeeHome />} />
        <Route path="/portal/leaves"           element={<MyLeaves />} />
        <Route path="/portal/attendance"       element={<MyAttendance />} />
        <Route path="/portal/team-calendar"    element={<TeamCalendar />} />
        <Route path="/portal/documents"        element={<Documents />} />
        <Route path="/portal/expenses"         element={<ExpensesPage />} />
        <Route path="/portal/payslips"         element={<Payroll />} />
        <Route path="/portal/performance"      element={<Performance />} />
        <Route path="/portal/onboarding"       element={<Onboarding />} />
        <Route path="/portal/exit"             element={<ExitManagement />} />
        <Route path="/portal/regularization"   element={<Regularization />} />
        <Route path="/portal/notifications"    element={<NotificationCenter />} />
        <Route path="/portal/announcements"    element={<AnnouncementsPage />} />
        <Route path="/portal/profile"          element={<MyProfile />} />
      </Route>

      <Route path="*" element={<Navigate to={token ? home : '/'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
          <ForcePasswordChangeModal />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
