import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { AppLayout }      from '@/components/layout/AppLayout';
import { RootLayout }     from '@/components/layout/RootLayout';
import { EmployeeLayout } from '@/components/layout/EmployeeLayout';
import { ForcePasswordChangeModal } from '@/components/ForcePasswordChangeModal';
import Login        from '@/pages/Login';
import Dashboard    from '@/pages/Dashboard';
import Calendar     from '@/pages/Calendar';
import Leaves       from '@/pages/Leaves';
import Employees    from '@/pages/Employees';
import Settings     from '@/pages/Settings';
import RootDashboard from '@/pages/RootDashboard';
import ManageHR      from '@/pages/ManageHR';
import Broadcast     from '@/pages/Broadcast';
import EmployeeHome  from '@/pages/EmployeeHome';
import MyLeaves      from '@/pages/MyLeaves';
import MyAttendance  from '@/pages/MyAttendance';
import MyProfile     from '@/pages/MyProfile';

function defaultPath(user) {
  if (!user) return '/login';
  if (user.role === 'root_admin') return '/root/dashboard';
  if (user.role === 'employee')   return '/portal/home';
  return '/dashboard';
}

function PrivateRoute({ children }) {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" replace />;
}

// HR + root_admin can access HR-level pages
function HRRoute({ children }) {
  const { token, isAdmin } = useAuth();
  if (!token)   return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/portal/home" replace />;
  return children;
}

// Only root_admin can access root-level pages
function RootRoute({ children }) {
  const { token, isRootAdmin } = useAuth();
  if (!token)        return <Navigate to="/login" replace />;
  if (!isRootAdmin)  return <Navigate to="/dashboard" replace />;
  return children;
}

// Only employees can access the employee portal
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
      <Route path="/login" element={token ? <Navigate to={home} replace /> : <Login />} />

      {/* ── HR Admin area (admin + root_admin) ── */}
      <Route element={<HRRoute><AppLayout /></HRRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/calendar"  element={<Calendar />} />
        <Route path="/leaves"    element={<Leaves />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/settings"  element={<Settings />} />
        <Route path="/profile"   element={<MyProfile />} />
      </Route>

      {/* ── Root Admin area (root_admin only) ── */}
      <Route element={<RootRoute><RootLayout /></RootRoute>}>
        <Route path="/root/dashboard"  element={<RootDashboard />} />
        <Route path="/root/calendar"   element={<Calendar />} />
        <Route path="/root/leaves"     element={<Leaves />} />
        <Route path="/root/employees"  element={<Employees />} />
        <Route path="/root/settings"   element={<Settings />} />
        <Route path="/root/manage-hr"  element={<ManageHR />} />
        <Route path="/root/broadcast"  element={<Broadcast />} />
        <Route path="/root/profile"    element={<MyProfile />} />
      </Route>

      {/* ── Employee portal (employee only) ── */}
      <Route element={<EmployeeRoute><EmployeeLayout /></EmployeeRoute>}>
        <Route path="/portal/home"       element={<EmployeeHome />} />
        <Route path="/portal/leaves"     element={<MyLeaves />} />
        <Route path="/portal/attendance" element={<MyAttendance />} />
        <Route path="/portal/profile"    element={<MyProfile />} />
      </Route>

      <Route index element={<Navigate to={home} replace />} />
      <Route path="*" element={<Navigate to={home} replace />} />
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
