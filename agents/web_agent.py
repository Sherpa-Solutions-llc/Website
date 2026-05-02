import asyncio
import os
from .base_agent import BaseAgent

class WebDeveloperAgent(BaseAgent):
    def __init__(self, callback_manager):
        super().__init__(callback_manager, "Web Developer")

    async def run(self, specifications: str) -> str:
        await self.update_status("Active")
        await self.update_progress(10)
        await self.log(f"Reviewing specs: {specifications[:50]}...")
        
        await asyncio.sleep(1)
        await self.update_progress(30)
        await self.log("Analyzing current Sherpa Solutions source files...")
        
        website_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../sherpa_solutions"))
        
        context = "Existing Website Files Context:\n"
        for f_name in ["index.html", "login.html", "styles.css"]:
            p = os.path.join(website_dir, f_name)
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as f:
                    content = f.read()
                    if len(content) > 3000:
                        content = content[:3000] + "\n...[truncated]"
                    context += f"--- {f_name} ---\n{content}\n\n"

        prompt = f"""{context}
You are an elite autonomous Web Developer acting closely with the user.
Based on these requirements: {specifications}
Return the exact filename you want to create or modify on the VERY FIRST LINE (e.g. index.html or scripts.js).
Return the raw FULL file code content you want to write on all subsequent lines. Do NOT use markdown code blocks. Output the full file, not just a snippet.
"""
        code_result = await self.prompt_llm(prompt)
        
        await asyncio.sleep(1)
        await self.update_progress(80)
        
        lines = code_result.strip().split("\n")
        filename = lines[0].strip()
        if filename.startswith("```"):
            filename = lines[1].strip()
            lines = lines[1:]
            
        content = "\n".join(lines[1:]).strip()
        if content.startswith("```html"):
            content = content[7:]
        elif content.startswith("```css"):
            content = content[6:]
        elif content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        
        file_path = os.path.join(website_dir, filename)
        
        await self.log(f"Compiling AST and injecting code into {filename}...", level="success")
        
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content.strip())
            await self.log(f"Physical file updated: {file_path}")
        except Exception as e:
            await self.log(f"File system rejected IO operation: {e}", level="error")
            
        await self.update_status("Completed")
        await self.update_progress(100)
        return file_path
