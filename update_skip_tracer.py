import os
import re

file_path = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\skip_tracer.html'
with open(file_path, 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('background: rgba(0,0,0,0.3);', 'background: var(--surface-color);')
text = text.replace('border: 1px solid rgba(255,255,255,0.1);', 'border: 1px solid var(--border-color);')
text = text.replace('h3 style="color: white;', 'h3 style="color: var(--text-dark);')
text = text.replace('background: rgba(0,0,0,0.5);', 'background: var(--surface-color);')
text = text.replace('border: 1px solid rgba(255,255,255,0.05);', 'border: 1px solid var(--border-color);')
text = text.replace('h4 style="color: white;', 'h4 style="color: var(--text-dark);')
text = text.replace('background: rgba(255,255,255,0.1);', 'background: var(--bg-color);')
text = text.replace('background: #0d1117;', 'background: var(--bg-color);')
text = text.replace('border: 1px solid rgba(255,255,255,0.2);', 'border: 1px solid var(--border-color);')
text = text.replace('padding: 0.8rem; border-radius: 4px; color: white;', 'padding: 0.8rem; border-radius: 4px; color: var(--text-dark);')
text = text.replace('border-bottom: 1px solid rgba(255,255,255,0.1);', 'border-bottom: 1px solid var(--border-color);')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(text)

print('Successfully replaced hardcoded styles in skip_tracer.html')
