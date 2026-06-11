# ZORO's Productivity Suite ⚡

Welcome to **ZORO's Productivity Suite**, an all-in-one, locally hosted productivity dashboard designed to keep track of your most important day-to-day tasks, timesheets, hydration, daily standup reports, and quick links.

Built with vanilla web technologies, Node.js, and a beautifully modernized dark/light UI, this suite ensures absolute privacy by saving your data securely on your local file system—no cloud syncing required!

---

## 🌟 Features

*   **🏠 Dashboard**: A centralized overview featuring a live clock, dynamic greetings, quick statistics, and at-a-glance Pomodoro timer and hydration progress.
*   **📊 Sync Hub**: TestRail matrix generation and logic management.
*   **📝 Productivity Hub**: 
    *   Integrated task manager with drag-and-drop prioritization.
    *   Built-in Pomodoro focus timer with notifications.
    *   Markdown-supported quick notes editor with preview functionality.
*   **📅 Timesheet Manager**: 
    *   Upload, view, edit, and analyze your monthly timesheets (CSV support).
    *   Auto-calculates daily hours, late check-ins, and extra working hours.
    *   Integrates your ICS calendar and personal leaves to show upcoming global events.
    *   Generates interactive analytical charts for hours tracked and work mode distribution.
*   **💧 Hydration Tracker**: A visual, animated water tracker to ensure you meet your daily hydration goals.
*   **🚀 Quick-Launch**: An interactive bookmark manager with drag-and-drop folders, built-in emoji picker, and one-click URL launching.
*   **📝 Daily Status Workstation**: AI-powered standup report generator that automatically formats your raw daily notes into professional markdown/PDF status reports using predefined templates.
*   **🤖 ZORO AI Assistant**: A globally available, intelligent AI assistant (powered by Gemini API) built directly into the dashboard to help you analyze tasks, format timesheets, summarize data, and boost your productivity.

---

## 📂 Project Structure

The codebase is neatly organized for maintainability:

```text
Test Reporter/
├── server.js              ← Main backend Express server
├── start.sh               ← Application launcher
├── package.json           ← Node dependencies
├── .gitignore             ← Git rules (protects your data)
│
├── public/                ← Static frontend assets
│   ├── index.html         ← Main Dashboard page
│   ├── pages/             ← Application modules (Timesheet, Productivity, etc.)
│   ├── css/               ← Stylesheets (Global theme, page-specific CSS)
│   └── js/                ← Client-side scripts (AI logic, module interactions)
│
├── data/                  ← Persisted user data (Auto-generated)
│   ├── matrices/          ← Sync Hub state logic
│   ├── notes/             ← Productivity markdown notes
│   ├── timesheets/        ← Uploaded Timesheet CSVs
│   ├── quicklaunch/       ← Bookmark links and folders
│   ├── templates/         ← Daily Status templates
│   └── calendar.ics       ← Your uploaded calendar file
│
└── scripts/               ← Dev/Test scratch utility scripts
```

---

## 🛠️ Technology Stack

*   **Frontend**: HTML5, Vanilla JavaScript, CSS3 (Custom Variables, CSS Grid, Glassmorphism UI)
*   **Backend Proxy**: Node.js, Express.js
*   **Third-party Libraries**:
    *   [Chart.js](https://www.chartjs.org/) (Data Analytics)
    *   [Flatpickr](https://flatpickr.js.org/) (Date Selection)
    *   [node-ical](https://www.npmjs.com/package/node-ical) (Calendar Parsing)
    *   [jsPDF & AutoTable](https://parall.ax/products/jspdf) (PDF Report Generation)
*   **AI Integration**: Google Gemini API

---

## ⚙️ Setup & Installation

Since this application saves data to your local machine, you need to run the lightweight local Node.js server.

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

### Instructions
1. **Clone the repository:**
   ```bash
   git clone https://github.com/vijay00git/ZoroDashboard.git
   cd ZoroDashboard
   ```

2. **Install dependencies:**
   ```bash
   npm install express cors node-ical
   ```

3. **Start the local server:**
   ```bash
   ./start.sh
   ```
   *(Or manually run `node server.js` and open `http://localhost:3000` in your browser).*

4. **Add AI Capabilities (Optional):**
   Click the AI icon in the bottom right corner of the dashboard and paste your Gemini API key to unlock smart AI features across the suite.

---

## 🔒 Data Storage & Privacy

Privacy is a core feature. All your personal data is saved securely to the `data/` folder in the project root.

> **⚠️ Note to Contributors/Forks:** The `.gitignore` is pre-configured to ensure your personal `data/` directory and test `scripts/` are never accidentally pushed to the public repository.

---

## 🤝 Contributing

Feel free to fork this project, submit pull requests, or use it as a foundation for your own personalized local dashboard. If you find bugs or have feature requests, please open an issue!

Enjoy your new Productivity Suite! ⚡
