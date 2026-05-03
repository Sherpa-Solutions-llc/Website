import os

directory = r"C:\Users\choos\Documents\Antigravity\sherpa_solutions"
script_tag = '\n    <script src="static/analytics.js"></script>\n'

for filename in os.listdir(directory):
    if filename.endswith(".html"):
        filepath = os.path.join(directory, filename)
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Don't inject if already there
        if 'static/analytics.js' not in content:
            # We don't want to track the admin panel themselves in the same way, but it's okay to track settings.html just to see activity. Or maybe skip it.
            if filename == "settings.html" or filename == "login.html":
                continue

            if '</body>' in content:
                content = content.replace('</body>', script_tag + '</body>')
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"Injected into {filename}")
            else:
                print(f"No </body> tag found in {filename}")
