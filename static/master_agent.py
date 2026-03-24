import asyncio
import json
from .base_agent import BaseAgent
from .stock_agent import StockMonitorAgent
from .research_agent import ResearchAgent
from .web_agent import WebDeveloperAgent
from .data_agent import DataAnalystAgent
from .code_agent import CodeReviewerAgent
from .qa_agent import SoftwareTesterAgent
from .file_editor_agent import FileEditorAgent

class MasterAgent(BaseAgent):
    def __init__(self, callback_manager):
        super().__init__(callback_manager, "Master Agent")
        self.stock_agent = StockMonitorAgent(callback_manager)
        self.research_agent = ResearchAgent(callback_manager)
        self.web_agent = WebDeveloperAgent(callback_manager)
        self.data_agent = DataAnalystAgent(callback_manager)
        self.code_agent = CodeReviewerAgent(callback_manager)
        self.qa_agent = SoftwareTesterAgent(callback_manager)
        self.file_editor_agent = FileEditorAgent(callback_manager)
        
        # Halt coordination
        self.cancel_event = asyncio.Event()

    def reset_memory(self):
        super().reset_memory()
        self.stock_agent.reset_memory()
        self.research_agent.reset_memory()
        self.web_agent.reset_memory()
        self.data_agent.reset_memory()
        self.code_agent.reset_memory()
        self.qa_agent.reset_memory()
        self.cancel_event.clear()
        
        # Halt coordination
        self.cancel_event = asyncio.Event()

    async def run_task(self, payload: dict):
        """
        Main entry point for handling a task.
        Analyzes the intent and routes to the correct agent(s) using Function Calling.
        """
        task_description = payload.get("task", "Analyze this attachment")
        file_data = payload.get("file_data")
        mime_type = payload.get("mime_type")
        file_name = payload.get("file_name", "snippet")
        llm_model = payload.get("llm_model", "gemini-2.5-flash")

        await self.update_status("Planning")
        await self.update_progress(10)
        file_msg = f" [Attached File: {file_name}]" if file_data else ""
        await self.log(f"Analyzing new task: {task_description}{file_msg}")
        
        # Define dummy tools for Gemini to intelligently choose from
        def call_stock_agent(symbol: str, analysis_request: str):
            """Retrieves the real-time stock price, company summary, and historical performance charts for a given stock TICKER symbol (e.g. TSLA, AAPL, BP). You MUST specify the exact symbol."""
            pass

        def call_research_agent(search_query: str):
            """Searches the live web and scrapes pages to research a topic."""
            pass

        def call_web_agent(web_request: str):
            """Writes HTML/CSS codebase to build a website or tool, or modifies an existing codebase/website."""
            pass

        def call_data_agent(analysis_request: str):
            """Analyzes an uploaded CSV spreadsheet using pandas."""
            pass

        def call_code_reviewer(review_request: str):
            """Reviews user-provided code for security and performance."""
            pass

        def call_qa_agent(test_request: str):
            """Writes automated unit tests for software applications."""
            pass

        def call_file_editor(file_name: str, error_description: str):
            """Reads a server-side source file, applies an AI fix for the described error, validates it, and writes it back. Use when the user reports an error or bug in a specific file and wants it resolved automatically. file_name should be just the filename (e.g. 'telegram_bot.py') or relative path."""
            pass

        def ask_user(question: str):
            """Suspends execution to politely ask the user a clarifying question if their prompt is too vague or missing details."""
            pass

        tools = [
            call_stock_agent, 
            call_research_agent, 
            call_web_agent, 
            call_data_agent, 
            call_code_reviewer, 
            call_qa_agent,
            call_file_editor,
            ask_user
        ]

        file_hint = "\n[SYSTEM NOTE: An image/file has been attached. You can see it directly. If the request is for visual analysis or general questions, answer directly without delegating.]" if file_data else ""
        system_prompt = f"""You are the Master Orchestrator for the Agent Nexus Dashboard. 
You have direct access to the live internet and real-time market data through your specialized agents.
CRITICAL INSTRUCTION: If the user asks about ANY fact, stock data, or internet information, you MUST proactively use the appropriate tool to retrieve it. 
Do NOT rely on your past knowledge or apologize for past failures. JUST DO IT by calling a tool.
If the Request is too vague, call the 'ask_user' tool.
If the user's message is JUST a conversational greeting or acknowledgement, you can answer directly without calling tools. HOWEVER, if they ask for actual specific data (like a stock price), you absolutely MUST call the corresponding tool.{file_hint}
"""
        prompt = f"User's request: {task_description}"

        if self.cancel_event.is_set():
            return await self.log("Task halted before execution.", "error")
            
        await self.log("Invoking Gemini Function Calling for autonomous routing...", "info")
        response = await self.prompt_llm(prompt, file_data, mime_type, tools, llm_model, system_prompt)
        
        if self.cancel_event.is_set():
            return await self.log("Task halted after initial analysis.", "error")
        
        # If no tool was called, we just chat back the response
        if not getattr(response, "function_calls", None):
            await self.update_progress(100)
            await self.update_status("Completed")
            result_text = response if isinstance(response, str) else getattr(response, "text", "Task completed.")
            await self.log("No specialized agents needed. Handling directly.", "success")
            await self.chat(str(result_text).strip())
            return
            
        function_calls = response.function_calls
        
        # If the LLM wants to ask a question, we handle that interactively
        for call in function_calls:
            if call.name == "ask_user":
                question_text = call.args.get("question", "Could you clarify your request?")
                await self.log("Asking user for clarification...", level="info")
                
                # Suspend execution until the user replies
                user_reply = await self.ask_user(question_text)
                await self.log(f"User Replied: {user_reply}", level="success")
                
                # Re-run task implicitly with the new context in the LLM's memory
                payload["task"] = f"User clarification: {user_reply}. Please continue fulfilling the original request using the appropriate tools."
                return await self.run_task(payload)

        await self.update_status("Delegating")
        await self.update_progress(30)
        
        # Build God View Mermaid Diagram
        diagram: str = "graph TD\nMaster[Master Orchestrator]\n"
        has_delegation = False
        for idx, call in enumerate(function_calls):
            if call.name != "ask_user":
                agent_map = {
                    "call_stock_agent": "Stock Monitor",
                    "call_research_agent": "Research Agent",
                    "call_web_agent": "Web Developer",
                    "call_data_agent": "Data Analyst",
                    "call_code_reviewer": "Code Reviewer",
                    "call_qa_agent": "Software Tester",
                    "call_file_editor": "File Editor"
                }
                sub_agent = agent_map.get(call.name, call.name)
                diagram += f"Master -->|Delegates| Node{idx}[{sub_agent}]\n"
                has_delegation = True
                
        if has_delegation:
            await self.callback_manager.broadcast({
                "type": "diagram",
                "diagram": diagram
            })
        
        # Prepare sub-agent tasks
        tasks = []
        # Agents that run asynchronously/concurrently
        for call in function_calls:
            name = call.name
            args = call.args
            
            if name == "call_stock_agent":
                await self.stock_agent.update_status("Standby")
                async def run_stock(symbol, analysis_request):
                    await self.log(f"Delegating to Stock Monitor for {symbol}...")
                    return await self.stock_agent.run(symbol, analysis_request)
                tasks.append(run_stock(args.get("symbol"), args.get("analysis_request")))
                
            elif name == "call_research_agent":
                await self.research_agent.update_status("Standby")
                async def run_res(query):
                    await self.log(f"Delegating to Research Agent for {query}...")
                    return await self.research_agent.run(query)
                tasks.append(run_res(args.get("search_query")))

            elif name == "call_data_agent":
                await self.data_agent.update_status("Standby")
                async def run_data(pld):
                    await self.log("Delegating to Data Analyst Agent...")
                    return await self.data_agent.run(pld)
                tasks.append(run_data(payload))

            elif name == "call_code_reviewer":
                await self.code_agent.update_status("Standby")
                async def run_code(pld):
                    await self.log("Delegating to Code Reviewer Agent...")
                    return await self.code_agent.run(pld)
                tasks.append(run_code(payload))

            elif name == "call_qa_agent":
                await self.qa_agent.update_status("Standby")
                async def run_qa(pld):
                    await self.log("Delegating to Software Tester Agent...")
                    return await self.qa_agent.run(pld)
                tasks.append(run_qa(payload))

            elif name == "call_file_editor":
                await self.file_editor_agent.update_status("Standby")
                _fe_file = args.get("file_name", "")
                _fe_err = args.get("error_description", "")
                async def run_file_editor(fn, err):
                    await self.log(f"Delegating to File Editor Agent for {fn}...")
                    return await self.file_editor_agent.run(fn, err)
                tasks.append(run_file_editor(_fe_file, _fe_err))
                
        results: str = ""
        # Execute the data-gathering agents concurrently
        if tasks:
            if self.cancel_event.is_set():
                return await self.log("Task halted before execution phase.", "error")
            await self.update_progress(50)
            gathered_results = await asyncio.gather(*tasks)
            for res in gathered_results:
                results += f"{res}\n\n"
            await self.update_progress(80)

        # Web Dev runs sequentially AFTER the other agents finish if requested
        for call in function_calls:
            if self.cancel_event.is_set():
                return await self.log("Task halted before Web Agent execution phase.", "error")
            if call.name == "call_web_agent":
                await self.web_agent.update_status("Standby")
                await self.log("Delegating to Web Developer Agent...")
                web_prompt = f"Using this context:\n{results}\n\nFulfill the web development requirement: {call.args.get('web_request', call.args.get('website_topic'))}"
                web_res: str = str(await self.web_agent.run(web_prompt))
                results += f"Web Dev Output saved at: {web_res}\n\n"
                
                # Auto-QA the website changes
                await self.qa_agent.update_status("Standby")
                await self.log("Auto-delegating to QA Agent to test web changes...", "info")
                qa_prompt = f"The website was just modified with these requirements: {call.args.get('web_request', call.args.get('website_topic'))}.\nWeb Output:\n{web_res}\n\nPlease test the website codebase to ensure the requirement is completed and all functionality is in-place and not broken."
                qa_res: str = str(await self.qa_agent.run({"task": qa_prompt}))
                results += f"QA Test Results:\n{qa_res}\n\n"
                
                await self.update_progress(95)
        await self.update_status("Completed")
        await self.update_progress(100)
        await self.log(f"All coordinated tasks finished successfully.", level="success")
        
        if self.cancel_event.is_set():
            return await self.log("Task halted before final summary.", "error")
            
        # Summarize the raw multi-agent logs and send them as a human-readable chat!
        summary_prompt = f"Please summarize the following task execution results comprehensively for the user:\n{results}"
        summary = await self.prompt_llm(summary_prompt, None, None, None, llm_model)
        
        if '<a href=' in str(summary):
            await self.chat(summary)
        else:
            await self.chat(str(summary).strip())

        # Generate follow-up suggestions
        try:
            sugg_prompt = f"Based on this previous request: '{task_description}', suggest 3 distinct, actionable, and very short follow-up prompts the user could ask next. Return EXACTLY a raw JSON list of 3 strings. Example: [\"Find recent news on this\", \"Compare this to Microsoft\", \"Write a report\"]"
            s_resp = await self.prompt_llm(sugg_prompt, None, None, None, llm_model)
            s_text = str(s_resp.text if hasattr(s_resp, 'text') else s_resp).strip()
            # Clean up potential markdown formatting
            s_text = s_text.replace('```json', '').replace('```', '').strip()
            import json
            suggestions = json.loads(s_text)
            if isinstance(suggestions, list) and len(suggestions) > 0:
                await self.callback_manager.broadcast({
                    "type": "suggestions",
                    "suggestions": suggestions[:3]
                })
        except Exception as e:
            await self.log(f"Could not generate suggestions", "warning")
