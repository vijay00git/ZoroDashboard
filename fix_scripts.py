import glob
import re

master_scripts = """  <script defer src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/flatpickr"></script>
  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js"></script>
  <script defer src="/js/script.js"></script>
  <script defer src="/js/dashboard.js"></script>
  <script defer src="/js/ai.js"></script>
  <script defer src="/js/goal.js"></script>
  <script defer src="/js/productivity.js"></script>
  <script defer src="/js/quicklaunch.js"></script>
  <script defer src="/js/water.js"></script>
  <script defer src="/js/settings.js"></script>
  <script defer src="/js/status.js"></script>
  <script defer src="/js/timesheet.js"></script>"""

files = glob.glob('public/index.html') + glob.glob('public/pages/*.html')

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove all existing <script src="...">
    content = re.sub(r'<script[^>]*src="[^"]*"[^>]*></script>', '', content)
    
    # Insert master scripts right before </head>
    content = content.replace('</head>', master_scripts + '\n</head>')
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

print("Master scripts injected successfully.")
