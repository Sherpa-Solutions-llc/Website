import os

services_path = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\services.html'
css_path = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\styles.css'

# ── 1. Create the new Partnership Path HTML block ───────────────────────────
partnership_html = '''
    <section class="partnership-hero">
        <div class="partnership-container">
            <div class="partnership-text">
                <div class="hero-badge">The Sherpa Advantage</div>
                <h2 data-cms="partners-head">The Partnership Path</h2>
                <p class="lead" data-cms="partners-desc">We don't just advise—we invest in your success. Our core engagement model is designed to completely eliminate your financial risk while maximizing your operational efficiency.</p>
                
                <div class="path-steps">
                    <div class="path-step">
                        <div class="step-number">01</div>
                        <div class="step-content">
                            <h4 data-cms="step1-head">Zero-Cost Assessment</h4>
                            <p data-cms="step1-desc">We perform a comprehensive, completely free deep-dive into your company's operations, technology, and team structure to identify hidden inefficiencies and profit leaks.</p>
                        </div>
                    </div>
                    <div class="path-step">
                        <div class="step-number">02</div>
                        <div class="step-content">
                            <h4 data-cms="step2-head">Performance-Based Obligation</h4>
                            <p data-cms="step2-desc">If adjustments can be made to enhance profitability, we implement them. Sherpa Solutions is obligated to exactly <strong>27% of the savings or additional profits generated</strong>. If we don't save you money, you pay nothing.</p>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="partnership-case-study">
                <div class="case-card">
                    <div class="case-header">
                        <i class="fa-solid fa-chart-pie"></i>
                        <span data-cms="case-label">Real Impact Example</span>
                    </div>
                    <h3 data-cms="case-title">AI Code Vibing</h3>
                    <p data-cms="case-desc">By implementing advanced AI code vibing workflows, we drastically increased developer output, allowing the client to streamline their engineering department without sacrificing velocity.</p>
                    
                    <div class="math-breakdown">
                        <div class="math-row">
                            <span data-cms="math-1-lbl">Original Staff:</span>
                            <strong data-cms="math-1-val">10 Developers</strong>
                        </div>
                        <div class="math-row text-danger">
                            <span data-cms="math-2-lbl">Staff Reduction:</span>
                            <strong data-cms="math-2-val">70% (7 Developers)</strong>
                        </div>
                        <div class="math-row">
                            <span data-cms="math-3-lbl">Average Salary:</span>
                            <strong data-cms="math-3-val">$80,000 / yr</strong>
                        </div>
                        <div class="math-divider"></div>
                        <div class="math-row total-savings">
                            <span data-cms="math-4-lbl">Total Savings Generated:</span>
                            <strong data-cms="math-4-val" style="color:var(--accent);">$560,000 / yr</strong>
                        </div>
                    </div>
                    
                    <div class="our-fee">
                        <span data-cms="fee-lbl">Sherpa Solutions Fee (27%):</span>
                        <strong data-cms="fee-val">$151,200</strong>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <div style="text-align:center; padding-top:6rem;">
        <h2 style="color:var(--primary); font-size:2.5rem; font-family:'Outfit',sans-serif;">How We Find Your Savings</h2>
        <p style="color:var(--secondary); font-size:1.1rem; margin-top:0.5rem;">The tactical levers we pull during execution.</p>
    </div>
'''

with open(services_path, 'r', encoding='utf-8') as f:
    html = f.read()

# Insert right after the page header
anchor = '</div>\n\n    <section class="features">'
if anchor in html:
    html = html.replace(anchor, '</div>\n\n' + partnership_html + '\n    <section class="features" style="padding-top:4rem;">')
    with open(services_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print("Injected Partnership Path HTML.")
else:
    print("Could not find anchor in HTML.")

# ── 2. Append CSS for the new blocks ──────────────────────────────────────
css_append = '''
/* Partnership Path */
.partnership-hero {
    padding: 8rem 5% 0 5%;
    background-color: var(--bg-color);
}

.partnership-container {
    max-width: 1200px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 4rem;
    align-items: center;
}

.partnership-text .lead {
    font-size: 1.2rem;
    color: #4a5c4a;
    margin-bottom: 3rem;
    line-height: 1.7;
}

.partnership-text h2 {
    font-size: 3.5rem;
    color: var(--primary);
    margin-bottom: 1.5rem;
    line-height: 1.1;
}

.path-steps {
    display: flex;
    flex-direction: column;
    gap: 2rem;
}

.path-step {
    display: flex;
    gap: 1.5rem;
}

.step-number {
    font-family: 'Outfit', sans-serif;
    font-size: 2rem;
    font-weight: 800;
    color: var(--accent);
    opacity: 0.8;
    line-height: 1;
    padding-top: 0.2rem;
}

.step-content h4 {
    color: var(--primary);
    font-size: 1.3rem;
    margin-bottom: 0.5rem;
}

.step-content p {
    color: #5a6d5a;
    font-size: 1rem;
}

/* Case Study Card */
.case-card {
    background: #ffffff;
    border-radius: 24px;
    padding: 3rem;
    box-shadow: 0 20px 50px rgba(45, 63, 46, 0.08);
    border: 1px solid rgba(45, 63, 46, 0.05);
    position: relative;
    overflow: hidden;
}

.case-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 6px;
    background: linear-gradient(90deg, var(--primary), var(--accent));
}

.case-header {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 1rem;
    background: rgba(192, 108, 59, 0.1);
    color: var(--accent);
    border-radius: 30px;
    font-size: 0.85rem;
    font-weight: 700;
    margin-bottom: 1.5rem;
}

.case-card h3 {
    font-size: 2rem;
    color: var(--primary);
    margin-bottom: 1rem;
}

.case-card p {
    color: #5a6d5a;
    margin-bottom: 2rem;
    font-size: 1.05rem;
}

.math-breakdown {
    background: var(--bg-color);
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
}

.math-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.8rem;
    font-size: 1.05rem;
}

.math-row:last-child {
    margin-bottom: 0;
}

.math-row span {
    color: #666;
}

.math-row strong {
    color: var(--primary);
}

.math-row.text-danger strong {
    color: #d14949;
}

.math-divider {
    height: 1px;
    background: #ddd;
    margin: 1rem 0;
}

.total-savings {
    font-size: 1.25rem;
    font-weight: 700;
}

.our-fee {
    background: var(--primary);
    color: white;
    padding: 1.2rem;
    border-radius: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 1.1rem;
}

.our-fee strong {
    font-size: 1.4rem;
    color: var(--bg-color);
}

@media (max-width: 900px) {
    .partnership-container {
        grid-template-columns: 1fr;
    }
}
'''

with open(css_path, 'a', encoding='utf-8') as f:
    f.write(css_append)
print("Appended CSS styles.")
