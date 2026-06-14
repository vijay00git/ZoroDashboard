import glob

files = glob.glob('public/js/*.js')

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Do not modify ai.js as it's already fixed
    if 'ai.js' in filepath:
        continue

    # In script.js, inject the global handler at the top
    if 'script.js' in filepath:
        handler_code = """window.runTurboHandler = function(fn) {
    document.addEventListener('turbo:load', fn);
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
};

"""
        if 'window.runTurboHandler' not in content:
            content = handler_code + content
    
    # Replace all occurrences
    content = content.replace("document.addEventListener('turbo:load', () => {", "window.runTurboHandler(() => {")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

print("All JS files updated to use runTurboHandler")
