import traceback
import asyncio
from agents.base_agent import BaseAgent

class SoftwareTesterAgent(BaseAgent):
    def __init__(self, callback_manager):
        super().__init__(callback_manager, "Software Tester")

    async def run(self, payload: dict):
        try:
            await self.log("Initializing QA test generation suite...", "info")
            await self.update_status("Generating Tests")
            
            task_description = payload.get("task", "")
            
            prompt = f"""You are a Senior QA Automation Engineer.
Your task is to write highly comprehensive Unit Tests (using Python pytest, JavaScript Jest, etc. depending on context).
Deeply analyze the user's request or the previously generated code and output the full test suite scripts in Markdown code blocks. Explicitly include edge cases and happy paths.

User context/request: {task_description}"""

            await self.update_progress(50)
            await self.log("Generating edge cases and mocking testing frameworks...", "info")
            
            qa_result = await self.prompt_llm(prompt)
            
            await self.update_progress(100)
            await self.log("QA test suite generated.", "success")
            await self.update_status("Idle")
            
            await self.chat(qa_result)
            return qa_result

        except Exception as e:
            await self.log(f"Error in QA Agent: {str(e)}", "error")
            await self.update_status("Error")
            traceback.print_exc()
            return f"QA Generation failed: {str(e)}"
