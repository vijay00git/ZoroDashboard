# ZORO's Productivity Suite ⚡

Welcome to **ZORO's Productivity Suite**, an all-in-one, locally hosted productivity dashboard designed to keep track of your most important day-to-day tasks, timesheets, hydration, and quick links.

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

---

## 🛠️ Technology Stack

*   **Frontend**: HTML5, Vanilla JavaScript, CSS3 (Custom Variables, CSS Grid, Glassmorphism UI)
*   **Backend Proxy**: Node.js, Express.js
*   **Third-party Libraries**:
    *   [Chart.js](https://www.chartjs.org/) (Data Analytics)
    *   [Flatpickr](https://flatpickr.js.org/) (Date Selection)
    *   [node-ical](https://www.npmjs.com/package/node-ical) (Calendar Parsing)

---

## ⚙️ Setup & Installation

Since this application saves data to your local machine (bypassing CORS limitations), you need to run the lightweight local Node.js proxy server.

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
   node server.js
   ```
   *(Or run `./start.sh` if you have configured the bash script).*

4. **Open the Application:**
   Open your browser and navigate to the project directory, then open `index.html`. 
   > **Note:** The Express server runs on `http://localhost:3000` to handle file saving and API fetching, while the frontend is served as static HTML files.

---

## 📂 Data Storage

Privacy is a core feature. All your personal data is saved securely to automatically generated folders in the project root:
*   `saved_notes/` - Your markdown productivity notes.
*   `saved_quicklaunch/` - Your bookmark links and folders (`data.json`).
*   `saved_timesheets/` - Your uploaded timesheet CSVs.
*   `saved_matrices/` - Your Sync Hub state logic.

> **⚠️ Note to Contributors/Forks:** The `.gitignore` is pre-configured to ensure your personal `saved_*/` directories are never pushed to the public repository.

---

## 🤝 Contributing

Feel free to fork this project, submit pull requests, or use it as a foundation for your own personalized local dashboard. If you find bugs or have feature requests, please open an issue!

Enjoy your new Productivity Suite! ⚡
