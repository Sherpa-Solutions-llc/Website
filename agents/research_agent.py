import asyncio
from .base_agent import BaseAgent

class ResearchAgent(BaseAgent):
    def __init__(self, callback_manager):
        super().__init__(callback_manager, "Research Agent")

    async def run(self, topic: str) -> str:
        import urllib.request
        import json
        import ssl
        
        # Bypass Windows SSL certificate verification bugs
        ssl_ctx = ssl._create_unverified_context()
        
        await self.update_status("Active")
        await self.update_progress(10)
        await self.log(f"Starting research on topic: {topic}")
        
        api_key = "fc-7d4e11ebbcf24f5090ef1d509e88840b"
        
        # 1. Search Firecrawl
        await self.update_progress(30)
        await self.log(f"Searching the live web for: {topic}...")
        
        try:
            search_req = urllib.request.Request(
                "https://api.firecrawl.dev/v2/search",
                data=json.dumps({"query": topic}).encode("utf-8"),
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            )
            search_res = await asyncio.to_thread(urllib.request.urlopen, search_req, context=ssl_ctx)
            search_data = json.loads(search_res.read().decode("utf-8"))
            
            if search_data.get("success") and search_data["data"].get("web"):
                top_url = search_data["data"]["web"][0]["url"]
                await self.log(f"Found source: {top_url}. Scraping content...", level="info")
                
                # 2. Scrape the URL
                await self.update_progress(60)
                scrape_req = urllib.request.Request(
                    "https://api.firecrawl.dev/v2/scrape",
                    data=json.dumps({"url": top_url, "formats": ["markdown"]}).encode("utf-8"),
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                )
                scrape_res = await asyncio.to_thread(urllib.request.urlopen, scrape_req, context=ssl_ctx)
                scrape_data = json.loads(scrape_res.read().decode("utf-8"))
                
                if scrape_data.get("success"):
                    markdown_content = scrape_data["data"]["markdown"]
                    
                    # 3. Analyze with LLM
                    await self.update_progress(80)
                    await self.log("Analyzing scraped content...")
                    prompt = f"Based on this live web data about '{topic}':\n\n{markdown_content[:8000]}\n\nProvide a concise 3-bullet-point summary of the core facts."
                    research_result = await self.prompt_llm(prompt)
                else:
                    raise Exception("Failed to scrape.")
            else:
                 raise Exception("No search results found.")
                 
        except Exception as e:
            await self.log(f"Live web search failed ({str(e)}). Falling back to internal knowledge...", level="error")
            prompt = f"Conduct a brief research on the topic: '{topic}' and provide a concise 3-bullet-point summary using your internal knowledge."
            research_result = await self.prompt_llm(prompt)
        
        await self.update_progress(90)
        await self.log(f"Research finalized. Findings extracted.", level="success")
        await self.update_status("Completed")
        await self.update_progress(100)
        
        return research_result
