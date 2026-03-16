import traceback
from agents.base_agent import BaseAgent

class CodeReviewerAgent(BaseAgent):
    def __init__(self, callback_manager):
        super().__init__(callback_manager, "Code Reviewer")

    async def run(self, payload: dict):
        try:
            await self.log("Initializing code review sequence...", "info")
            await self.update_status("Reviewing Code")
            
            task_description = payload.get("task", "")
            file_data = payload.get("file_data")
            file_name = payload.get("file_name", "snippet")
            mime_type = payload.get("mime_type", "")

            code_content = ""
            if file_data and ("text" in mime_type or not mime_type):
                import base64
                code_content = f"\n\nFile Name: {file_name}\n```\n{base64.b64decode(file_data).decode('utf-8')}\n```\n"

            prompt = f"""You are a Principal Software Engineer acting as an aggressive Code Reviewer.
Your task is to review the code provided and identify bugs, security vulnerabilities, edge cases, and performance optimizations.
Return a beautifully structured Markdown report with specific code block recommendations for fixing the issues.

User context/request: {task_description}
{code_content}"""

            await self.progress(50)
            await self.log("Analyzing codebase for vulnerabilities and optimization paths...", "info")
            
            review_result = await self.prompt_llm(prompt)
            
            await self.progress(100)
            await self.log("Code review complete.", "success")
            await self.update_status("Idle")
            
            await self.chat(review_result)
            return review_result

        except Exception as e:
            await self.log(f"Error in Code Review Agent: {str(e)}", "error")
            await self.update_status("Error")
            traceback.print_exc()
            return f"Code review failed: {str(e)}"
