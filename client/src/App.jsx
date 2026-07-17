import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { FeatureFlagProvider, useFeature } from '@/context/FeatureFlagContext';
import { AppLayout }      from '@/components/layout/AppLayout';
import { RootLayout }     from '@/components/layout/RootLayout';
import { EmployeeLayout } from '@/components/layout/EmployeeLayout';
import { ForcePasswordChangeModal } from '@/components/ForcePasswordChangeModal';
import { Lock } from 'lucide-react';

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
import ManageRootAdmins from '@/pages/ManageRootAdmins';
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
import Branches              from '@/pages/Branches';
import BiometricDevices      from '@/pages/BiometricDevices';
import BiometricPinMapping   from '@/pages/BiometricPinMapping';
import BiometricLogs         from '@/pages/BiometricLogs';
import BiometricSettings     from '@/pages/BiometricSettings';

// ── Employee portal pages ──
import EmployeeHome     from '@/pages/EmployeeHome';
import MyLeaves         from '@/pages/MyLeaves';
import MyAttendance     from '@/pages/MyAttendance';
import TeamCalendar     from '@/pages/TeamCalendar';

// Shows a locked screen when a feature is disabled for the org
function FeatureRoute({ featureKey, children }) {
  const enabled = useFeature(featureKey);
  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-[#f0f3ff] border border-[#c7c4d8] flex items-center justify-center mx-auto mb-4">
          <Lock size={28} className="text-[#3525cd]/40" />
        </div>
        <h2 className="text-xl font-black text-[#151c27] mb-2">Feature Not Available</h2>
        <p className="text-sm text-[#777587] max-w-sm">
          This module is not enabled for your organization. Contact your platform administrator to enable it.
        </p>
      </div>
    );
  }
  return children;
}

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
        <Route path="/attendance"       element={<Navigate to="/calendar" replace />} />
        <Route path="/leaves"           element={<Leaves />} />

        <Route path="/employees"        element={<Employees />} />
        <Route path="/departments"      element={<Departments />} />
        <Route path="/holidays"         element={<HolidaysPage />} />
        <Route path="/leave-policies"   element={<FeatureRoute featureKey="leave_policies"><LeavePolicies /></FeatureRoute>} />
        <Route path="/regularization"   element={<FeatureRoute featureKey="regularization"><Regularization /></FeatureRoute>} />
        <Route path="/reports"          element={<FeatureRoute featureKey="reports"><Reports /></FeatureRoute>} />
        <Route path="/documents"        element={<FeatureRoute featureKey="documents"><Documents /></FeatureRoute>} />
        <Route path="/payroll"          element={<FeatureRoute featureKey="payroll"><Payroll /></FeatureRoute>} />
        <Route path="/assets"           element={<FeatureRoute featureKey="assets"><Assets /></FeatureRoute>} />
        <Route path="/expenses"         element={<FeatureRoute featureKey="expenses"><ExpensesPage /></FeatureRoute>} />
        <Route path="/announcements"    element={<FeatureRoute featureKey="announcements"><AnnouncementsPage /></FeatureRoute>} />
        <Route path="/shifts"           element={<FeatureRoute featureKey="shifts"><Shifts /></FeatureRoute>} />
        <Route path="/performance"      element={<FeatureRoute featureKey="performance"><Performance /></FeatureRoute>} />
        <Route path="/onboarding"       element={<FeatureRoute featureKey="onboarding"><Onboarding /></FeatureRoute>} />
        <Route path="/exit-management"  element={<FeatureRoute featureKey="exit_management"><ExitManagement /></FeatureRoute>} />
        <Route path="/notifications"    element={<NotificationCenter />} />
        <Route path="/settings"         element={<Settings />} />
        <Route path="/profile"          element={<MyProfile />} />
        <Route path="/branches"          element={<FeatureRoute featureKey="branches"><Branches /></FeatureRoute>} />
        <Route path="/biometric/devices" element={<FeatureRoute featureKey="biometric"><BiometricDevices /></FeatureRoute>} />
        <Route path="/biometric/mapping" element={<FeatureRoute featureKey="biometric"><BiometricPinMapping /></FeatureRoute>} />
        <Route path="/biometric/logs"    element={<FeatureRoute featureKey="biometric"><BiometricLogs /></FeatureRoute>} />
        <Route path="/biometric/settings" element={<FeatureRoute featureKey="biometric"><BiometricSettings /></FeatureRoute>} />
      </Route>

      {/* ── Root Admin area (root_admin only) ── */}
      <Route element={<RootRoute><RootLayout /></RootRoute>}>
        <Route path="/root/dashboard"       element={<RootDashboard />} />
        <Route path="/root/calendar"        element={<Calendar />} />
        <Route path="/root/leaves"          element={<Leaves />} />
        <Route path="/root/employees"       element={<Employees />} />
        <Route path="/root/departments"     element={<Departments />} />
        <Route path="/root/holidays"        element={<HolidaysPage />} />
        <Route path="/root/leave-policies"  element={<FeatureRoute featureKey="leave_policies"><LeavePolicies /></FeatureRoute>} />
        <Route path="/root/regularization"  element={<FeatureRoute featureKey="regularization"><Regularization /></FeatureRoute>} />
        <Route path="/root/reports"         element={<FeatureRoute featureKey="reports"><Reports /></FeatureRoute>} />
        <Route path="/root/documents"       element={<FeatureRoute featureKey="documents"><Documents /></FeatureRoute>} />
        <Route path="/root/payroll"         element={<FeatureRoute featureKey="payroll"><Payroll /></FeatureRoute>} />
        <Route path="/root/assets"          element={<FeatureRoute featureKey="assets"><Assets /></FeatureRoute>} />
        <Route path="/root/expenses"        element={<FeatureRoute featureKey="expenses"><ExpensesPage /></FeatureRoute>} />
        <Route path="/root/announcements"   element={<FeatureRoute featureKey="announcements"><AnnouncementsPage /></FeatureRoute>} />
        <Route path="/root/shifts"          element={<FeatureRoute featureKey="shifts"><Shifts /></FeatureRoute>} />
        <Route path="/root/performance"     element={<FeatureRoute featureKey="performance"><Performance /></FeatureRoute>} />
        <Route path="/root/onboarding"      element={<FeatureRoute featureKey="onboarding"><Onboarding /></FeatureRoute>} />
        <Route path="/root/exit-management" element={<FeatureRoute featureKey="exit_management"><ExitManagement /></FeatureRoute>} />
        <Route path="/root/notifications"   element={<NotificationCenter />} />
        <Route path="/root/settings"        element={<Settings />} />
        <Route path="/root/manage-hr"            element={<ManageHR />} />
        <Route path="/root/manage-root-admins"  element={<ManageRootAdmins />} />
        <Route path="/root/broadcast"       element={<Broadcast />} />
        <Route path="/root/profile"         element={<MyProfile />} />
        <Route path="/root/org-settings"    element={<OrgSettings />} />
        <Route path="/root/biometric/devices" element={<FeatureRoute featureKey="biometric"><BiometricDevices /></FeatureRoute>} />
        <Route path="/root/biometric/mapping" element={<FeatureRoute featureKey="biometric"><BiometricPinMapping /></FeatureRoute>} />
        <Route path="/root/biometric/logs"    element={<FeatureRoute featureKey="biometric"><BiometricLogs /></FeatureRoute>} />
      </Route>

      {/* ── Employee portal (employee only) ── */}
      <Route element={<EmployeeRoute><EmployeeLayout /></EmployeeRoute>}>
        <Route path="/portal/home"           element={<EmployeeHome />} />
        <Route path="/portal/leaves"         element={<MyLeaves />} />
        <Route path="/portal/attendance"     element={<MyAttendance />} />
        <Route path="/portal/team-calendar"  element={<TeamCalendar />} />
        <Route path="/portal/documents"      element={<FeatureRoute featureKey="documents"><Documents /></FeatureRoute>} />
        <Route path="/portal/expenses"       element={<FeatureRoute featureKey="expenses"><ExpensesPage /></FeatureRoute>} />
        <Route path="/portal/payslips"       element={<FeatureRoute featureKey="payroll"><Payroll /></FeatureRoute>} />
        <Route path="/portal/performance"    element={<FeatureRoute featureKey="performance"><Performance /></FeatureRoute>} />
        <Route path="/portal/onboarding"     element={<FeatureRoute featureKey="onboarding"><Onboarding /></FeatureRoute>} />
        <Route path="/portal/exit"           element={<FeatureRoute featureKey="exit_management"><ExitManagement /></FeatureRoute>} />
        <Route path="/portal/regularization" element={<FeatureRoute featureKey="regularization"><Regularization /></FeatureRoute>} />
        <Route path="/portal/notifications"  element={<NotificationCenter />} />
        <Route path="/portal/announcements"  element={<FeatureRoute featureKey="announcements"><AnnouncementsPage /></FeatureRoute>} />
        <Route path="/portal/profile"        element={<MyProfile />} />
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
          <FeatureFlagProvider>
            <AppRoutes />
            <ForcePasswordChangeModal />
          </FeatureFlagProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
