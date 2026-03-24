import asyncio
import os
import base64
from typing import cast
from google import genai  # type: ignore[import-untyped]
from google.genai import types  # type: ignore[import-untyped]

class BaseAgent:
    def __init__(self, callback_manager, agent_name: str):
        self.callback_manager = callback_manager
        self.agent_name = agent_name
        self.conversation_history = []  # Store past context
        self._memory_loaded = False
        self.pending_question_future: asyncio.Future | None = None
        self.api_key = os.environ.get("GEMINI_API_KEY", "")
        if self.api_key and self.api_key != "your_gemini_api_key_here":
            self.client = genai.Client(api_key=self.api_key)
        else:
            self.client = None
            
    def reset_memory(self):
        self.conversation_history = []
        self._memory_loaded = False
        fut = self.pending_question_future
        if isinstance(fut, asyncio.Future) and not fut.done():
            fut.cancel()
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
        fut = self.pending_question_future
        if isinstance(fut, asyncio.Future) and not fut.done():
            fut.cancel()
            
        self.pending_question_future = asyncio.Future()
        
        await self.callback_manager.broadcast({
            "type": "question",
            "agent": self.agent_name,
            "question": question
        })
        await self.update_status("Waiting on User")
        
        # Wait until the main WebSocket handler sets the result of this future
        response = await cast(asyncio.Future, self.pending_question_future)
        self.pending_question_future = None
        
        await self.update_status("Active")
        return response
        
    async def prompt_llm(self, prompt: str, image_data: str | None = None, mime_type: str | None = None, tools: list | None = None, model_name: str = 'gemini-2.5-flash', system_instruction: str | None = None):
        """Helper to invoke Gemini LLM with full chat memory"""
        if not self.client:
            import asyncio
            await asyncio.sleep(2)  # Simulate network request delay so UI animations can complete naturally
            return "Simulated LLM response (No valid API key provided)"
        try:
            import agent_database as database  # type: ignore[import-not-found]
            
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

            config_kwargs: dict[str, object] = {}
            if tools:
                config_kwargs["tools"] = tools
                # Disable auto function calling — our stub functions just `pass`,
                # so the new SDK (1.68+) would auto-call them and get None back.
                # We handle function_calls manually in the master agent.
                config_kwargs["automatic_function_calling"] = types.AutomaticFunctionCallingConfig(disable=True)
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
            import asyncio as _asyncio  # re-import to avoid UnboundLocalError from local import above
            err_str = str(e)
            # Handle Gemini rate-limit (429) gracefully: wait and retry once
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                await self.log("Rate limit hit — waiting 20s before retry...", "warning")
                await _asyncio.sleep(20)
                try:
                    response = await self.client.aio.models.generate_content(
                        model=model_name,
                        contents=contents,
                        config=types.GenerateContentConfig(**config_kwargs) if config_kwargs else None
                    )
                    result_text: str = getattr(response, "text", None) or ""
                    self.conversation_history.append({"role": "user", "content": prompt})
                    self.conversation_history.append({"role": "model", "content": result_text})
                    return result_text
                except Exception as retry_e:
                    retry_msg = str(retry_e)
                    return f"The AI model is currently rate-limited. Please wait a moment and try again. ({retry_msg[:120]})"  # type: ignore[index]
            err_msg = str(err_str)
            return f"Error connecting to Gemini: {err_msg[:300]}"  # type: ignore[index]
