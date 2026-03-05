import re

filepath = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\services.html'

with open(filepath, 'r', encoding='utf-8') as f:
    html = f.read()

# We want to replace the entire <svg class="trail-svg" ... </svg> block
# The original starts with `<svg class="trail-svg" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice">`
# And ends with `</svg>` right before `<!-- Partnership Summit Node -->`

start_marker = '<svg class="trail-svg"'
end_marker = '</svg>'

start_idx = html.find(start_marker)
if start_idx != -1:
    end_idx = html.find(end_marker, start_idx) + len(end_marker)

    new_svg = '''<svg class="trail-svg" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice">
                <defs>
                    <linearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="#E8F1F5" />
                        <stop offset="100%" stop-color="#FFFFFF" />
                    </linearGradient>
                    <linearGradient id="sunGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#FFD6A5" />
                        <stop offset="100%" stop-color="#FF9E79" />
                    </linearGradient>
                    <linearGradient id="mountainBase" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="rgba(122, 142, 99, 0.15)" />
                        <stop offset="100%" stop-color="rgba(122, 142, 99, 0.02)" />
                    </linearGradient>
                    <linearGradient id="mountainFore" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="rgba(74, 92, 74, 0.2)" />
                        <stop offset="100%" stop-color="rgba(74, 92, 74, 0.05)" />
                    </linearGradient>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                    <filter id="softGlow">
                        <feGaussianBlur stdDeviation="8" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                <!-- Sky Background -->
                <rect width="1000" height="600" fill="url(#skyGrad)" />

                <!-- The Sun -->
                <circle cx="200" cy="150" r="60" fill="url(#sunGrad)" filter="url(#softGlow)" opacity="0.8" />

                <!-- Birds in the Distance -->
                <g fill="#4a5c4a" opacity="0.6">
                    <path d="M 600 120 Q 610 110 620 120 Q 610 115 600 120 Z" />
                    <path d="M 620 120 Q 630 110 640 120 Q 630 115 620 120 Z" />
                    
                    <path d="M 650 140 Q 658 132 666 140 Q 658 136 650 140 Z" />
                    <path d="M 666 140 Q 674 132 682 140 Q 674 136 666 140 Z" />
                    
                    <path d="M 580 155 Q 586 148 592 155 Q 586 152 580 155 Z" />
                    <path d="M 592 155 Q 598 148 604 155 Q 598 152 592 155 Z" />
                </g>

                <!-- Background Mountains (Lighter) -->
                <path d="M-100,600 L150,250 L350,400 L600,150 L850,350 L1100,600 Z" fill="url(#mountainBase)" />
                <!-- Background Snowcaps -->
                <path d="M150,250 L200,287.5 L175,320 L150,280 L125,320 L100,287.5 Z" fill="#ffffff" opacity="0.9"/>
                <path d="M600,150 L650,190 L625,230 L590,190 L560,230 L535,190 Z" fill="#ffffff" opacity="0.9"/>

                <!-- Foreground Mountains (Darker, sharper) -->
                <path d="M0,600 L400,100 L650,450 L950,200 L1100,350 L1100,600 Z" fill="url(#mountainFore)" />
                <!-- Foreground Snowcaps -->
                <path d="M400,100 L450,170 L410,210 L390,160 L350,220 L330,170 Z" fill="#ffffff" opacity="0.95"/>
                <path d="M950,200 L980,240 L950,270 L930,230 L900,280 L880,240 Z" fill="#ffffff" opacity="0.95"/>

                <!-- Mountain Ridges / Definition Lines -->
                <path d="M400,100 L480,280 L450,450" stroke="rgba(255,255,255,0.4)" stroke-width="2" fill="none" />
                <path d="M400,100 L320,350" stroke="rgba(0,0,0,0.05)" stroke-width="3" fill="none" />
                <path d="M950,200 L920,350" stroke="rgba(0,0,0,0.05)" stroke-width="2" fill="none" />

                <!-- The Straight Partnership Path (Left to Peak) -->
                <path d="M100,550 L400,100" stroke="var(--accent)" stroke-width="8" stroke-dasharray="10,10" fill="none"
                    filter="url(#glow)" />

                <!-- The Winding Traditional Services Path -->
                <path d="M100,550 C 300,550 200,400 450,450 C 700,500 600,300 850,350 C 950,370 900,150 700,100"
                    stroke="var(--primary)" stroke-width="4" stroke-dasharray="6,6" fill="none" opacity="0.6" />
            </svg>'''

    final_html = html[:start_idx] + new_svg + html[end_idx:]
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(final_html)
    print("Success: Updated SVG canvas with scenic details.")
else:
    print("Error: Could not find <svg> block.")
