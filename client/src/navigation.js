// Single source of truth for the app's page list — shared between Navbar.jsx
// (the sidebar) and CommandPalette.jsx (Ctrl+K quick-nav), so the two can't
// drift out of sync the way the dashboard widget lists once did.
import {
  LayoutDashboard,
  RefreshCw,
  NotebookPen,
  CheckSquare,
  CalendarDays,
  Droplets,
  Rocket,
  FileText,
  GraduationCap,
  Briefcase,
  FileSpreadsheet,
  GalleryHorizontalEnd,
  ListChecks,
  TerminalSquare,
  Radar,
  Settings,
} from 'lucide-react';

export const MAIN_NAV = [
  { path: '/',               label: 'Dashboard',     icon: LayoutDashboard },
  { path: '/synchub',        label: 'Sync Hub',      icon: RefreshCw },
  { path: '/notebook',       label: 'Notebook',      icon: NotebookPen },
  { path: '/task-manager',   label: 'Task Manager',  icon: CheckSquare },
  { path: '/timesheet',      label: 'Timesheet',     icon: CalendarDays },
  { path: '/water',          label: 'Hydration',     icon: Droplets },
  { path: '/quicklaunch',    label: 'Quick Launch',  icon: Rocket },
  { path: '/status',         label: 'Daily Status',  icon: FileText },
  { path: '/goal',           label: 'Learn Skills',  icon: GraduationCap },
  { path: '/resume',         label: 'Resume Up',     icon: Briefcase },
  { path: '/csv-organizer',  label: 'CSV Organizer', icon: FileSpreadsheet },
  { path: '/ss-bucket',      label: 'SS Bucket',     icon: GalleryHorizontalEnd },
  { path: '/testcase-dashboard', label: 'Jenkins Runner', icon: ListChecks },
  { path: '/cypress-runner', label: 'Cypress Runner', icon: TerminalSquare },
  { path: '/automation-finder', label: 'Automation Finder', icon: Radar },
];

export const SETTINGS_NAV_ITEM = { path: '/settings', label: 'Settings', icon: Settings };
