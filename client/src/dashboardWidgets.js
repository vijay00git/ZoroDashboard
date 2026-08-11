// Single source of truth for the Dashboard's widget set, shared between
// Dashboard.jsx (renders + migrates saved layouts) and Settings.jsx (the
// enable/disable toggle list) — these two previously hardcoded their own
// copies of this list and had already drifted out of sync (Settings was
// missing several widgets Dashboard had already shipped).
export const DEFAULT_WIDGET_ORDER = [
  { id: 'profile_widget',       enabled: true },
  { id: 'tasks',                enabled: true },
  { id: 'pomodoro_widget',      enabled: true },
  { id: 'learning',             enabled: true },
  { id: 'matrix',               enabled: true },
  { id: 'scratchpad',           enabled: true },
  { id: 'draft',                enabled: true },
  { id: 'links',                enabled: true },
  { id: 'hydration',            enabled: true },
  { id: 'timesheet_widget',     enabled: true },
  { id: 'events',               enabled: true },
  { id: 'clocks',               enabled: true },
  { id: 'csv_organizer_widget',        enabled: true },
  { id: 'ss_bucket_widget',            enabled: true },
  { id: 'resume_widget',               enabled: true },
  { id: 'cypress_widget',              enabled: true },
  { id: 'cypress_coverage_widget',     enabled: true },
  { id: 'cypress_local_status_widget', enabled: true },
];

export const WIDGET_NAMES = {
  profile_widget: 'Career Profile',
  tasks: 'Status Checklist',
  pomodoro_widget: 'Focus Timer',
  learning: 'Active Learning',
  matrix: 'Pinned Matrix',
  scratchpad: 'Scratchpad',
  draft: 'Daily Status Draft',
  links: 'Frequently Visited Links',
  hydration: 'Hydration',
  timesheet_widget: 'Timesheet',
  events: 'Upcoming Events',
  clocks: 'World Clocks',
  csv_organizer_widget: 'CSV Organizer',
  ss_bucket_widget: 'Screenshot Vault',
  resume_widget: 'Resume Tracker',
  cypress_widget: 'Cypress Runs',
  cypress_coverage_widget: 'Test Coverage',
  cypress_local_status_widget: 'Local Run Status',
};
