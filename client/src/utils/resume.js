// Shared with ResumeUp.jsx (the editor) and Dashboard.jsx (the Resume
// Tracker widget) — lives here instead of being exported from the page
// component so ResumeUp.jsx can stay component-only for Vite Fast Refresh.
export const calcCompleteness = (d) => {
  const checks = [
    !!d.personalInfo.name,
    !!d.personalInfo.title,
    !!d.personalInfo.email,
    !!d.personalInfo.phone,
    !!d.personalInfo.location,
    !!d.personalInfo.linkedin || !!d.personalInfo.website,
    !!d.summary && d.summary.length > 60,
    d.workExperience.length > 0,
    d.workExperience.length > 1,
    d.workExperience.some(e => e.description?.length > 40),
    d.education.length > 0,
    d.projects.length > 0,
    d.skills.length >= 4,
    d.certificates.length > 0,
    d.languages.length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};
