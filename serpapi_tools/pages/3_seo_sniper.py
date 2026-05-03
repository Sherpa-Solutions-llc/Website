import streamlit as st
import pandas as pd
from serpapi import GoogleSearch
import os
from dotenv import load_dotenv
import streamlit.components.v1 as components

# --- MACRO BRIDGE ---
demo_bridge = """
<script>
    if (!window.parent.activatedSherpaDemoV2) {
        window.parent.activatedSherpaDemoV2 = true;
        window.parent.addEventListener('message', function(e) {
            if (!e.data) return;
            
            // Theme Sync Override
            if (e.data.type === 'SHERPA_THEME') {
                const doc = window.parent.document;
                let style = doc.getElementById('sherpa-theme-override');
                if (e.data.theme.base === 'light') {
                    if (!style) {
                        style = doc.createElement('style');
                        style.id = 'sherpa-theme-override';
                        doc.head.appendChild(style);
                    }
                    style.innerHTML = `
                        .stApp { background-color: #ffffff !important; }
                        [data-testid="stSidebar"] { background-color: #f0f2f6 !important; }
                        .stApp, .stApp p, .stApp h1, .stApp h2, .stApp h3, .stApp h4, .stApp h5, .stApp h6, .stApp label, .stApp li { color: #31333F !important; }
                        [data-testid="stHeader"] { background-color: rgba(255, 255, 255, 0.5) !important; }
                        [data-testid="stExpander"] details, [data-testid="stExpander"] summary { background-color: #f0f2f6 !important; border-color: #cccccc !important; color: #31333F !important; }
                        [data-testid="stExpander"] details * { color: #31333F !important; }
                        .stTextInput input, div[data-testid="stSelectbox"] > div > div { background-color: #f0f2f6 !important; border-color: #cccccc !important; }
                        .stTextInput input, div[data-testid="stSelectbox"] * { color: #31333F !important; }
                        div[data-testid="stSelectbox"] svg { fill: #31333F !important; color: #31333F !important; }
                        [data-baseweb="popover"], [data-baseweb="popover"] > div, [data-baseweb="menu"], ul[role="listbox"], [data-testid="stVirtualDropdown"] { background-color: #ffffff !important; border-color: #cccccc !important; }
                        ul[role="listbox"] li, [data-testid="stVirtualDropdown"] li, [role="option"] { color: #31333F !important; background-color: #ffffff !important; }
                        ul[role="listbox"] li:hover, [data-testid="stVirtualDropdown"] li:hover, [role="option"]:hover { background-color: #f0f2f6 !important; color: #ff6600 !important; }
                        .stButton button[kind="secondary"] { color: #31333F !important; background-color: #f0f2f6 !important; border-color: #cccccc !important; }
                        .stButton button[kind="primary"] { color: white !important; }
                        .stDataFrame, .stTable { filter: invert(1) hue-rotate(180deg); }
                    `;
                } else {
                    if (style) style.remove();
                }
                return;
            }

            if (e.data.target !== 'SHERPA_DEMO') return;
            const doc = window.parent.document;
            if (e.data.action === 'FILL') {
                const inputs = doc.querySelectorAll('input[type="text"]');
                if (inputs.length > e.data.index) {
                    const el = inputs[e.data.index];
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                    nativeInputValueSetter.call(el, e.data.value);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
            if (e.data.action === 'CLICK') {
                const buttons = doc.querySelectorAll('button');
                for (let b of buttons) {
                    if (b.innerText.includes(e.data.text)) {
                        b.click();
                        break;
                    }
                }
            }
        });
    }
</script>
"""

load_dotenv()
API_KEY = os.getenv("SERPAPI_API_KEY")

st.set_page_config(page_title="SEO Competitor Sniper", page_icon="🎯", layout="wide")
components.html(demo_bridge, height=0, width=0)

st.title("SEO Competitor Sniper Audit Tool")
st.markdown("Deconstruct the exact SERP features that are driving traffic away from your clients.")


col1, col2 = st.columns(2)
with col1:
    keyword = st.text_input("Target Keyword", value="enterprise it consulting services")
with col2:
    client_domain = st.text_input("Client Domain to highlight (optional)", value="sherpa-solutions")

if st.button("Generate Snipe Audit", type="primary"):
    if not API_KEY:
        st.error("Missing SerpApi key.")
        st.stop()
        
    with st.spinner("Analyzing SERP variables..."):
        params = {
            "engine": "google",
            "q": keyword,
            "api_key": API_KEY,
            "num": 10 # get top 10 to check client rank
        }
        
        try:
            is_sim = st.query_params.get("env", "live") == "sim"
            force_mock = is_sim or keyword.strip().lower() == "best crm software"
            
            if not force_mock:
                try:
                    search = GoogleSearch(params)
                    temp_res = search.get_dict()
                    if "error" in temp_res:
                        st.warning(f"Live API Blocked ({temp_res['error']}). Engaging Sandbox Fallback.")
                        force_mock = True
                    else:
                        results = temp_res
                except:
                    st.warning("Live API Offline. Engaging Sandbox Fallback.")
                    force_mock = True
                    
            if force_mock:
                if not is_sim: st.toast("SIMULATION MODE ACTIVE: Using cached dataset to conserve live API limits.", icon="⚡")
                import time; time.sleep(1.0)
                results = {
                    "answer_box": {"snippet": f"The top platforms for {keyword} include Salesforce, HubSpot, and Zoho, all known for excellent tracking and automation features.", "link": "https://www.forbes.com/advisor/business/software/"},
                    "ads": [
                        {"title": f"HubSpot Official Site - Best {keyword.title()} for Startups", "link": "https://www.hubspot.com/", "snippet": f"Scale your business with HubSpot's unified {keyword} platform. Start tracking leads today."},
                        {"title": f"Salesforce - World's #1 {keyword.title()} Platform", "link": "https://www.salesforce.com/", "snippet": "Drive growth and connect with customers like never before. 30-day free trial."}
                    ],
                    "organic_results": [
                        {"title": f"Best {keyword.title()} of 2026", "link": "https://www.forbes.com/advisor/business/software/", "snippet": f"Compare the best {keyword} platforms based on pricing, functionality, and user reviews."},
                        {"title": f"10 Top {keyword.title()} Systems Tested & Ranked", "link": "https://www.pcmag.com/picks/", "snippet": "We tested the leading suites on the market. Here are the clear winners."},
                        {"title": f"What is {keyword.title()}? A Comprehensive Guide", "link": "https://www.salesforce.com/guide/", "snippet": "Learn everything you need to know about strategy and implementation."},
                        {"title": f"Sherpa Solutions - Custom Enterprise {keyword.title()} Automation", "link": "https://sherpa-solutions-llc.com/", "snippet": "Bespoke implementations and data integrations powered by Sherpa Solutions."},
                        {"title": f"Zoho - Cloud {keyword.title()} for Business", "link": "https://www.zoho.com/", "snippet": "Empowers organizations to manage customer relations effectively in the cloud."}
                    ]
                }
            
            # Extract categories
            organic = results.get("organic_results", [])[:5]
            ads = results.get("ads", [])
            answer_box = results.get("answer_box", {})
            
            report_text = f"# SEO Sniper Audit: {keyword}\n\n"
            
            # --- FEATURED SNIPPET ---
            st.subheader("1. Featured Snippet (Position Zero)")
            if answer_box:
                snippet_text = answer_box.get("snippet") or answer_box.get("list") or "N/A"
                source = answer_box.get("link", "N/A")
                st.info(f"**Text:** {snippet_text}\n\n**Source URL:** {source}")
                report_text += f"## Featured Snippet\n- Text: {snippet_text}\n- Source: {source}\n\n"
            else:
                st.write("No featured snippet triggered for this query.")
                report_text += "## Featured Snippet\nNone triggered.\n\n"
                
            st.divider()
            
            # --- PAID ADS ---
            st.subheader("2. Paid Competitors (PPC)")
            if ads:
                for idx, ad in enumerate(ads, 1):
                    st.error(f"**Ad {idx}:** [{ad.get('title')}]({ad.get('link')})\n\n*(Copy: {ad.get('snippet', 'N/A')})*")
                    report_text += f"## Paid Ad {idx}\n- Title: {ad.get('title')}\n- URL: {ad.get('link')}\n- Copy: {ad.get('snippet')}\n\n"
            else:
                st.write("No paid search ads appearing at the top of this SERP.")
                report_text += "## Paid Ads\nNone triggered.\n\n"
                
            st.divider()
            
            # --- ORGANIC ---
            st.subheader("3. Top 5 Organic Competitors")
            if organic:
                for idx, org in enumerate(organic, 1):
                    is_client = client_domain.lower() in org.get('link', '').lower() if client_domain else False
                    color = "green" if is_client else "inherit"
                    marker = "🔥 CLIENT MATCH" if is_client else ""
                    
                    st.markdown(f"<p style='color: {color};'><b>{idx}. {org.get('title')}</b> {marker}</p>", unsafe_allow_html=True)
                    st.write(f"URL: {org.get('link')}")
                    st.write(f"Snippet: {org.get('snippet')}")
                    
                    report_text += f"{idx}. {org.get('title')} {marker}\n  URL: {org.get('link')}\n  Snippet: {org.get('snippet')}\n\n"
            
            # Check if domain in 6-10
            client_rank = None
            for idx, res in enumerate(results.get("organic_results", []), 1):
                if client_domain and client_domain.lower() in res.get('link', '').lower():
                    client_rank = idx
                    break
                    
            if client_domain:
                if client_rank and client_rank <= 10:
                    st.success(f"Client domain found organically at rank #{client_rank}!")
                else:
                    st.warning("Client domain was NOT found in the top 10 organic results.")
                    
            st.download_button("Export Snapshot as Text", data=report_text, file_name=f"seo_sniper_{keyword}.txt")
                    
        except Exception as e:
            st.error(f"Error fetching SERP: {e}")
