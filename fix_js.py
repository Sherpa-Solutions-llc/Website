import codecs

html_path = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\services.html'

with codecs.open(html_path, 'r', 'utf-8') as f:
    html = f.read()

# Fix the broken section from line 239 to 260.
corrupted_section = """            const tsLength = tsPath.getTotalLength();
            const ppLength();

            // Nodes mapped to their approximate path fractions
            const tsNodes = [
                { frac: 0.13, el: document.querySelectorAll('.ts-node')[1] }, // Competitor Analysis
                { frac: 0.26, el: document.querySelectorAll('.ts-node')[2] }, // Operational Review
                { frac: 0.41, el: document.querySelectorAll('.ts-node')[3] }, // Quality Assessment
                { frac: 0.55, el: document.querySelectorAll('.ts-node')[4] }, // AI Integration
                { frac: 0.70, el: document.querySelectorAll('.ts-node')[5] }, // Strategy Execution
                { frac: 0.85, el: document.querySelectorAll('.ts-node')[6] }  // Market Dominati   ];

      sherpaIcons = ["fa-person-hiking"];
            const peopleIcons = ["fa-person-walking", "fa-person-walking-with-cane", "fa-person", "fa-person-dre       const sherpaColoraccent)"];
            const peopleColors = ["#4a5c4a", "#5a6d5a", "var(--primary)", "#6b8a6b"];

            function spawnConvoy() {
                const pathChoice = Math.random() < 0.3 ? 'pp' : 'ts';
                const convoySpeed = 15000 + Math.random() * 10000;
                const convoyPauses = true;

      targetPath = pathChoice === 'ts' ? """

fixed_section = """            const tsLength = tsPath.getTotalLength();
            const ppLength = ppPath.getTotalLength();

            // Nodes mapped to their approximate path fractions
            const tsNodes = [
                { frac: 0.13, el: document.querySelectorAll('.ts-node')[1] }, // Competitor Analysis
                { frac: 0.26, el: document.querySelectorAll('.ts-node')[2] }, // Operational Review
                { frac: 0.41, el: document.querySelectorAll('.ts-node')[3] }, // Quality Assessment
                { frac: 0.55, el: document.querySelectorAll('.ts-node')[4] }, // Marketing Strategy
                { frac: 0.70, el: document.querySelectorAll('.ts-node')[5] }, // Leadership Coaching
                { frac: 0.85, el: document.querySelectorAll('.ts-node')[6] }, // AI Integration Review
                { frac: 0.95, el: document.querySelectorAll('.ts-node')[7] }  // Strategy Development
            ];

            const sherpaIcons = ["fa-person-hiking"];
            const peopleIcons = ["fa-person-walking", "fa-person-walking-with-cane", "fa-person", "fa-person-dress"];
            const sherpaColors = ["var(--accent)"];
            const peopleColors = ["#4a5c4a", "#5a6d5a", "var(--primary)", "#6b8a6b"];

            function spawnConvoy() {
                const pathChoice = Math.random() < 0.3 ? 'pp' : 'ts';
                const convoySpeed = 15000 + Math.random() * 10000;
                const convoyPauses = true;

                const targetPath = pathChoice === 'ts' ? """

if corrupted_section in html:
    html = html.replace(corrupted_section, fixed_section)
    print("Fixed corrupted section!")
else:
    print("Could not find the exact corrupted string, searching piece by piece.")
    # More robust replacement
    import re
    html = re.sub(r'const ppLength\(\);.*?(?=const totalLength)', fixed_section.split('const ppLength = ppPath.getTotalLength();')[1], html, flags=re.DOTALL)
    html = html.replace('const tsLength = tsPath.getTotalLength();\n            const ppLength();', 'const tsLength = tsPath.getTotalLength();\n            const ppLength = ppPath.getTotalLength();')

with codecs.open(html_path, 'w', 'utf-8') as f:
    f.write(html)
