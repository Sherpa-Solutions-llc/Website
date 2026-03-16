import asyncio
import os
import base64
from google import genai
from google.genai import types

class BaseAgent:
    def __init__(self, callback_manager, agent_name: str):
        self.callback_manager = callback_manager
        self.agent_name = agent_name
        self.conversation_history = []  # Store past context
        self._memory_loaded = False
        self.pending_question_future = None
        self.api_key = os.environ.get("GEMINI_API_KEY", "")
        if self.api_key and self.api_key != "your_gemini_api_key_here":
            self.client = genai.Client(api_key=self.api_key)
        else:
            self.client = None
            
    def reset_memory(self):
        self.conversation_history = []
        self._memory_loaded = False
        if self.pending_question_future and not self.pending_question_future.done():
            self.pending_question_future.cancel()
        self.pending_question_future = None

    async def log(self, message: str, level: str = "info"):
        """Send a log message to the dashboard"""
        await self.callback_manager.broadcast({
            "type": "log",
            "agent": self.agent_name,
            "message": message,
            "level": level
        })
        
    async def chat(self, message: str):
        """Send a conversational reply directly to the dashboard chat window"""
        await self.callback_manager.broadcast({
            "type": "chat",
            "agent": self.agent_name,
            "message": message
        })
        
    async def update_status(self, status: str):
        """Update the agent's status on the dashboard"""
        await self.callback_manager.broadcast({
            "type": "status",
            "agent": self.agent_name,
            "status": status
        })

    async def update_progress(self, progress: int):
        """Update the agent's progress percentage on the dashboard"""
        await self.callback_manager.broadcast({
            "type": "progress",
            "agent": self.agent_name,
            "progress": progress
        })

    async def ask_user(self, question: str) -> str:
        """Suspend agent execution, broadcast a question to the UI, and wait for a reply"""
        if self.pending_question_future and not self.pending_question_future.done():
            self.pending_question_future.cancel()
            
        self.pending_question_future = asyncio.Future()
        
        await self.callback_manager.broadcast({
            "type": "question",
            "agent": self.agent_name,
            "question": question
        })
        await self.update_status("Waiting on User")
        
        # Wait until the main WebSocket handler sets the result of this future
        response = await self.pending_question_future
        self.pending_question_future = None
        
        await self.update_status("Active")
        return response
        
    async def prompt_llm(self, prompt: str, image_data: str = None, mime_type: str = None, tools: list = None, model_name: str = 'models/gemini-2.0-flash', system_instruction: str = None):
        """Helper to invoke Gemini LLM with full chat memory"""
        if not self.client:
            import asyncio
            await asyncio.sleep(2)  # Simulate network request delay so UI animations can complete naturally
            return "Simulated LLM response (No valid API key provided)"
        try:
            import agent_database as database
            
            # Lazily load history from DB once per agent instantiation
            if not getattr(self, "_memory_loaded", False) and hasattr(self.callback_manager, "session_id"):
                rows = await database.get_agent_memory(self.callback_manager.session_id, self.agent_name)
                if rows:
                    self.conversation_history = [{"role": r["role"], "content": r["content"]} for r in rows]
                self._memory_loaded = True

            # Build the history using genai.types.Content for simple multi-turn chat
            contents = []
            for turn in self.conversation_history:
                role = turn["role"]
                # Map roles correctly to Gemini API ("user" or "model")
                if role == "system" or role == "user":
                    api_role = "user" 
                else:
                    api_role = "model"
                contents.append(types.Content(role=api_role, parts=[types.Part.from_text(text=turn["content"])]))

            # Add current actual prompt
            new_parts = [types.Part.from_text(text=prompt)]
            if image_data and mime_type:
                file_bytes = base64.b64decode(image_data)
                new_parts.append(types.Part.from_bytes(data=file_bytes, mime_type=mime_type))
            contents.append(types.Content(role="user", parts=new_parts))

            config_kwargs = {}
            if tools:
                config_kwargs["tools"] = tools
            if system_instruction:
                config_kwargs["system_instruction"] = system_instruction

            await self.log("Calling genai generate_content...")
            response = await self.client.aio.models.generate_content(
                model=model_name,
                contents=contents,
                config=types.GenerateContentConfig(**config_kwargs) if config_kwargs else None
            )

            if tools and getattr(response, "function_calls", None):
                self.conversation_history.append({"role": "user", "content": prompt})
                return response
            
            result_text = response.text if response.text else ""
            
            # Save to memory if successful
            self.conversation_history.append({"role": "user", "content": prompt})
            self.conversation_history.append({"role": "model", "content": result_text})
            
            if hasattr(self.callback_manager, "session_id"):
                await database.save_agent_memory(self.callback_manager.session_id, self.agent_name, "user", prompt)
                await database.save_agent_memory(self.callback_manager.session_id, self.agent_name, "model", result_text)
            
            return result_text
        except Exception as e:
            import traceback
            err_str = traceback.format_exc()
            return f"Error connecting to Gemini: {str(e)}\n\n{err_str}"
