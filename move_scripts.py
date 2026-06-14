import glob
import re

files = glob.glob('public/index.html') + glob.glob('public/pages/*.html')

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find all script tags in the document
    # We want to extract scripts that are at the bottom of the body
    # Let's extract ALL scripts except the turbo one.
    
    # Regex to find <script>...</script>
    # Note: re.DOTALL is needed for inline scripts
    script_pattern = re.compile(r'<script.*?>.*?</script>', re.DOTALL | re.IGNORECASE)
    
    # We don't want to move the turbo script which is already in head
    turbo_script = '<script type="module">import "https://cdn.skypack.dev/@hotwired/turbo";</script>'
    
    all_scripts = script_pattern.findall(content)
    scripts_to_move = [s for s in all_scripts if 'hotwired/turbo' not in s]
    
    if not scripts_to_move:
        continue
        
    # Remove these scripts from their current locations
    new_content = content
    for s in scripts_to_move:
        new_content = new_content.replace(s, '')
        
    # Ensure they have defer attribute if they are src scripts without defer
    modified_scripts = []
    for s in scripts_to_move:
        if 'src=' in s and 'defer' not in s:
            s = s.replace('<script ', '<script defer ')
        modified_scripts.append(s)
        
    # Insert them before </head>
    script_block = '\n'.join(modified_scripts) + '\n'
    new_content = new_content.replace('</head>', script_block + '</head>')
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)

print("Scripts moved to head successfully.")
