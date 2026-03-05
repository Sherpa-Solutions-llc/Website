import os, codecs

base_dir = r'C:\\Users\\choos\\Documents\\Antigravity\\sherpa_solutions'

services = {
    'service_competitor_analysis.html': {
        'title': 'Competitor Analysis',
        'icon': 'fa-solid fa-briefcase',
        'subtitle': 'Mapping the competitive landscape to uncover strategic advantages.',
        'content': [
            'Our Sherpa experts conduct a deep dive into your market position, identifying key competitors, their strengths, weaknesses, and market share.',
            'We analyze pricing models, product features, go‑to‑market strategies, and customer sentiment to reveal gaps you can exploit.',
            'Deliverables include a comprehensive competitor matrix, actionable recommendations, and a roadmap to differentiate your offerings and capture market share.'
        ]
    },
    'service_operational_review.html': {
        'title': 'Operational Review',
        'icon': 'fa-solid fa-cogs',
        'subtitle': 'Optimizing processes for efficiency and scalability.',
        'content': [
            'We audit your end‑to‑end workflows, technology stack, and resource allocation to pinpoint bottlenecks and waste.',
            'Through value‑stream mapping and lean principles, we redesign processes to reduce cycle time, improve quality, and lower costs.',
            'The final report provides a prioritized action plan, KPI dashboard templates, and change‑management guidance.'
        ]
    },
    'service_quality_assessment.html': {
        'title': 'Quality Assessment',
        'icon': 'fa-solid fa-check-circle',
        'subtitle': 'Ensuring product and service excellence at every touchpoint.',
        'content': [
            'Our team evaluates your quality management systems against industry standards (ISO, Six Sigma, etc.).',
            'We perform root‑cause analysis of defects, customer complaints, and audit findings.',
            'Recommendations include process controls, training programs, and continuous‑improvement cycles to elevate customer satisfaction.'
        ]
    },
    'service_marketing_strategy.html': {
        'title': 'Marketing Strategy',
        'icon': 'fa-solid fa-bullhorn',
        'subtitle': 'Crafting data‑driven campaigns that resonate and convert.',
        'content': [
            'We develop a full‑funnel marketing plan aligned with your business goals, from brand positioning to performance media.',
            'Our approach combines audience segmentation, messaging frameworks, channel mix optimization, and ROI modeling.',
            'You receive a tactical calendar, creative briefs, and measurement dashboards to track impact in real time.'
        ]
    },
    'service_leadership_coaching.html': {
        'title': 'Leadership Coaching',
        'icon': 'fa-solid fa-user-tie',
        'subtitle': 'Empowering executives to lead with confidence and vision.',
        'content': [
            'One‑on‑one coaching sessions focus on strategic decision‑making, stakeholder communication, and change leadership.',
            'We use psychometric assessments and 360° feedback to tailor development plans.',
            'Outcomes include heightened executive presence, improved team alignment, and measurable performance gains.'
        ]
    },
    'service_ai_integration.html': {
        'title': 'AI Integration Review',
        'icon': 'fa-solid fa-robot',
        'subtitle': 'Leveraging artificial intelligence to accelerate innovation.',
        'content': [
            'We assess your data readiness, model selection, and integration architecture to embed AI into core processes.',
            'Proof‑of‑concepts are built, tested, and iterated to ensure business value before full rollout.',
            'Deliverables include a technical roadmap, risk mitigation plan, and ROI forecast.'
        ]
    },
    'service_strategy_development.html': {
        'title': 'Strategy Development',
        'icon': 'fa-solid fa-chess-board',
        'subtitle': 'Designing long‑term growth strategies grounded in data.',
        'content': [
            'We facilitate strategic workshops, market analysis, and scenario planning to define clear, actionable goals.',
            'Roadmaps cover product portfolio, go‑to‑market, and investment priorities with measurable milestones.',
            'The final deliverable is a living strategy document and a governance framework for execution.'
        ]
    }
}

html_template = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sherpa Solutions LLC | {title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="/static/styles.css">
</head>
<body>
    <header>
        <div class="logo-container"><a href="index.html"><img src="/static/sherpa_logo.png" alt="Sherpa Solutions LLC"></a></div>
        <ul class="nav-links">
            <li><a href="index.html">Home</a></li>
            <li><a href="about.html">About Us</a></li>
            <li><a href="services.html" class="active">Our Services</a></li>
            <li><a href="merchandise.html">Merchandise</a></li>
            <li><a href="contact.html">Contact</a></li>
        </ul>
        <a href="contact.html" class="btn btn-primary">Start Your Ascent</a>
    </header>
    <div class="page-header" style="background: linear-gradient(135deg, var(--bg-color), #E8F1F5);">
        <h1 style="color: var(--primary);">{title}</h1>
        <p style="color: var(--secondary);">{subtitle}</p>
    </div>
    <section class="basic-section">
        <div class="section-container" style="max-width: 800px; margin: 4rem auto; text-align: center;">
            <i class="{icon}" style="font-size: 4rem; color: var(--accent); margin-bottom: 2rem;"></i>
            <h2 style="font-family: 'Outfit', sans-serif; color: var(--primary); margin-bottom: 1rem;">{title} Overview</h2>
            {paragraphs}
            <a href="contact.html" class="btn btn-secondary">Request a Consultation</a>
        </div>
    </section>
    <footer>
        <div class="footer-bottom"><p>&copy; 2026 Sherpa Solutions LLC. All rights reserved.</p></div>
    </footer>
</body>
</html>'''

for filename, data in services.items():
    paragraphs = ''
    for p in data['content']:
        paragraphs += f'<p style="font-size: 1.1rem; line-height: 1.8; color: #555; margin-bottom: 2rem;">{p}</p>\n            '
    html = html_template.format(title=data['title'], subtitle=data['subtitle'], icon=data['icon'], paragraphs=paragraphs)
    path = os.path.join(base_dir, filename)
    with codecs.open(path, 'w', 'utf-8') as f:
        f.write(html)
print('Generated service pages')
