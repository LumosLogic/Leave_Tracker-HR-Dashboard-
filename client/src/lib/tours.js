// Tour step definitions for Driver.js walkthroughs.
// IDs referenced here must match id="tour-*" attributes in the layout components.

export const adminTourSteps = [
  {
    popover: {
      title: '👋 Welcome to LeaveTracker!',
      description: "Let's take a quick tour so you can hit the ground running. Click <strong>Next</strong> to continue or <strong>Skip Tour</strong> to explore on your own.",
      side: 'over',
      align: 'center',
    },
  },
  {
    element: '#tour-nav-overview',
    popover: {
      title: '📊 Overview',
      description: 'Your main navigation — <strong>Dashboard</strong>, <strong>Calendar</strong>, <strong>Leaves</strong>, <strong>Employees</strong>, <strong>Regularization</strong>, and <strong>Announcements</strong>.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#tour-nav-hr',
    popover: {
      title: '👥 HR Management',
      description: 'Manage <strong>Departments</strong>, <strong>Holidays</strong>, <strong>Leave Policies</strong>, <strong>Shifts & Roster</strong>, <strong>Onboarding</strong>, and <strong>Exit Management</strong>.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#tour-nav-finance',
    popover: {
      title: '💰 Finance',
      description: 'Handle <strong>Payroll</strong>, <strong>Expenses</strong>, <strong>Assets</strong>, and generate <strong>Reports</strong> for your organization.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#tour-nav-people',
    popover: {
      title: '🎯 People',
      description: 'Track <strong>Performance</strong> reviews and manage employee <strong>Documents</strong>.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#tour-nav-account',
    popover: {
      title: '🔔 Account',
      description: 'View <strong>Notifications</strong>, adjust <strong>Settings</strong>, and manage your <strong>Profile</strong>.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#tour-user-card',
    popover: {
      title: '👤 Your Profile',
      description: 'Your name and role are shown here. Click <strong>Sign Out</strong> when you\'re done for the day.',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '#tour-main-content',
    popover: {
      title: '🏠 Your Workspace',
      description: 'All your data and actions appear right here. You\'re all set — enjoy using <strong>LeaveTracker</strong>! 🎉',
      side: 'left',
      align: 'center',
    },
  },
];

export const employeeTourSteps = [
  {
    popover: {
      title: '👋 Welcome to LeaveTracker!',
      description: "Let's take a quick tour of your Employee Portal. Click <strong>Next</strong> to continue or <strong>Skip Tour</strong> to explore on your own.",
      side: 'over',
      align: 'center',
    },
  },
  {
    element: '#tour-emp-workspace',
    popover: {
      title: '🏠 My Workspace',
      description: 'Your everyday hub — <strong>My Dashboard</strong>, <strong>My Leaves</strong>, <strong>My Attendance</strong>, and the <strong>Team Calendar</strong>.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#tour-emp-selfservice',
    popover: {
      title: '⚙️ Self Service',
      description: 'Request <strong>Regularizations</strong>, submit <strong>Expenses</strong>, view your <strong>Payslips</strong>, and access <strong>Documents</strong>.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#tour-emp-growth',
    popover: {
      title: '🚀 Growth',
      description: 'Track your <strong>Performance</strong>, complete <strong>Onboarding</strong> tasks, and initiate exit requests if needed.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#tour-emp-company',
    popover: {
      title: '🏢 Company',
      description: 'Stay updated with <strong>Announcements</strong>, check your <strong>Notifications</strong>, and manage your <strong>Profile</strong>.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#tour-emp-user-card',
    popover: {
      title: '👤 Your Account',
      description: 'Your profile is shown here. Use <strong>Sign Out</strong> when you\'re done. Enjoy using LeaveTracker! 🎉',
      side: 'top',
      align: 'start',
    },
  },
];
