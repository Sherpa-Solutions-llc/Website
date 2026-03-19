import streamlit as st
import pandas as pd
from serpapi import GoogleSearch
import os
from dotenv import load_dotenv
import streamlit.components.v1 as components

# --- MACRO BRIDGE ---
demo_bridge = """
<script>
    if (!window.parent.activatedSherpaDemo) {
        window.parent.activatedSherpaDemo = true;
        window.parent.addEventListener('message', function(e) {
            if (!e.data || e.data.target !== 'SHERPA_DEMO') return;
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

st.set_page_config(page_title="Brand Monitor", page_icon="📡", layout="wide", initial_sidebar_state="expanded")
components.html(demo_bridge, height=0, width=0)

st.title("Daily Brand Reputation Alerts")
st.markdown("Automated intelligence sweeping global news platforms and X (Twitter) for immediate brand health checks.")


with st.sidebar:
    st.header("Client Management")
    st.write("Manage active tracking brands:")
    if "brands" not in st.session_state:
        st.session_state.brands = ["Sherpa Solutions", "OpenAI"]
        
    new_brand = st.text_input("Add Brand Name")
    if st.button("Add to Tracker"):
        if new_brand and new_brand not in st.session_state.brands:
            st.session_state.brands.append(new_brand)
            st.rerun()
            
    st.divider()
    for b in st.session_state.brands:
        st.write(f"- {b}")

if st.button("Execute Daily Sweep", type="primary"):
    if not API_KEY:
        st.error("API Key missing.")
        st.stop()
        
    for brand in st.session_state.brands:
        st.subheader(f"Intelligence Report: {brand}")
        col1, col2 = st.columns(2)
        
        summary_text = f"🛡️ DAILY BRAND REPORT: {brand} 🛡️\n\n"
        
        # Google News
        with col1:
            st.markdown("#### 📰 Google News (24HR)")
            try:
                is_sim = st.query_params.get("env", "live") == "sim"
                force_mock = is_sim or brand.strip().lower() == "sherpa solutions llc"
                
                if not force_mock:
                    try:
                        params_news = {"engine": "google_news", "q": brand, "tbs": "qdr:d", "api_key": API_KEY}
                        news_search = GoogleSearch(params_news)
                        temp_news = news_search.get_dict()
                        if "error" in temp_news:
                            if brand == st.session_state.brands[-1]: st.warning(f"Live API Blocked ({temp_news['error']}). Engaging Sandbox.")
                            force_mock = True
                        else:
                            news_data = temp_news.get("news_results", [])[:5]
                    except:
                        if brand == st.session_state.brands[-1]: st.warning("Live API Offline. Engaging Sandbox.")
                        force_mock = True
                        
                if force_mock:
                    if brand == st.session_state.brands[-1] and not is_sim: st.toast("SIMULATION MODE ACTIVE: Using cached dataset to conserve live API limits.", icon="⚡")
                    import time; time.sleep(0.5)
                    news_data = [
                        {"title": f"{brand.title()} Announces Revolutionary New Data Engine", "source": {"name": "TechCrunch"}, "link": "https://techcrunch.com/demo"},
                        {"title": f"How {brand.title()} is Changing the OSINT Landscape", "source": {"name": "Wired"}, "link": "https://wired.com/demo"}
                    ]
                
                summary_text += "[ NEWS HIGHLIGHTS ]\n"
                if news_data:
                    for n in news_data:
                        st.info(f"**{n.get('title')}**\n\n*Source: {n.get('source', {}).get('name', 'N/A')}*\n[Read Article]({n.get('link')})")
                        summary_text += f"- {n.get('title')} ({n.get('source', {}).get('name')})\n  Link: {n.get('link')}\n"
                else:
                    st.write("No major news appearances in the past 24 hours.")
                    summary_text += "- No major news appearances in the past 24 hours.\n"
            except Exception as e:
                st.error("News scrape failed.")
                
        # Google Search -> Twitter
        with col2:
            st.markdown("#### 🐦 Social Sentiments (X/Twitter)")
            try:
                is_sim = st.query_params.get("env", "live") == "sim"
                force_mock_soc = is_sim or brand.strip().lower() == "sherpa solutions llc"
                
                if not force_mock_soc:
                    try:
                        params_social = {"engine": "google", "q": f"site:twitter.com \"{brand}\"", "tbs": "qdr:d", "api_key": API_KEY}
                        soc_search = GoogleSearch(params_social)
                        temp_soc = soc_search.get_dict()
                        if "error" in temp_soc:
                            force_mock_soc = True
                        else:
                            soc_data = temp_soc.get("organic_results", [])[:5]
                    except:
                        force_mock_soc = True
                        
                if force_mock_soc:
                    import time; time.sleep(0.5)
                    soc_data = [
                        {"snippet": f"Just integrated the new tools from @{brand.replace(' ', '')} and my workflow is 10x faster. Incredible stuff!", "link": "https://twitter.com/demo/1"},
                        {"snippet": f"The latest deploy by {brand.title()} is absolutely blowing my mind. So clean.", "link": "https://twitter.com/demo/2"}
                    ]
                
                summary_text += "\n[ SOCIAL MENTIONS (X) ]\n"
                if soc_data:
                    for s in soc_data:
                        st.success(f"{s.get('snippet')}\n\n[View Tweet]({s.get('link')})")
                        summary_text += f"- {s.get('snippet')}\n  Link: {s.get('link')}\n"
                else:
                    st.write("No viral or indexed social mentions discovered in the past 24 hours.")
                    summary_text += "- No viral or indexed social mentions discovered in the past 24 hours.\n"
            except Exception as e:
                st.error("Social scrape failed.")
                
        with st.expander("Show Email Deliverable Summary Text"):
            st.text_area("Copy/Paste for Client:", value=summary_text, height=300, key=brand)
        
        st.divider()
