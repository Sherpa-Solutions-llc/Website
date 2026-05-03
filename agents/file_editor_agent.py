"""
FileEditorAgent — reads a server-side file, applies an AI-generated fix, validates it, and writes it back.
Safe: only operates within the sherpa_solutions directory. Creates a .bak backup before writing.
"""

import ast
import os
import traceback
from .base_agent import BaseAgent

# Root directory that this agent is allowed to edit
SAFE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # sherpa_solutions/


class FileEditorAgent(BaseAgent):
    def __init__(self, callback_manager):
        super().__init__(callback_manager, "File Editor")

    async def run(self, file_hint: str, error_description: str) -> str:
        """
        file_hint        — filename or partial path (e.g. 'telegram_bot.py', 'agents/stock_agent.py')
        error_description — description of the error to fix (from Gemini vision analysis or user text)
        """
        await self.update_status("Locating File")
        await self.log(f"Looking for file matching: {file_hint}")

        # --- 1. Resolve the file path safely ---
        file_path = self._resolve_path(file_hint)
        if not file_path:
            msg = f"Could not find a file matching '{file_hint}' inside the sherpa_solutions directory."
            await self.log(msg, "error")
            await self.chat(msg)
            return msg

        await self.log(f"Found file: {file_path}", "success")
        await self.update_status("Reading File")

        # --- 2. Read the file ---
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                original_content = f.read()
        except Exception as e:
            msg = f"Failed to read {file_path}: {e}"
            await self.log(msg, "error")
            await self.chat(msg)
            return msg

        await self.update_status("Generating Fix")
        await self.log("Sending file + error to Gemini for fix generation...")

        # --- 3. Ask Gemini to produce a fixed version ---
        prompt = f"""You are an expert Python/web developer.

The following file has an error. Produce a COMPLETE, corrected version of the file.

FILE PATH: {file_path}
ERROR DESCRIPTION: {error_description}

CURRENT FILE CONTENTS:
```
{original_content}
```

RULES:
- Return ONLY the corrected file contents — no explanations, no markdown fences, no commentary.
- Preserve all existing functionality; only fix the reported error.
- Do not truncate or summarise the file.
"""
        fixed_content = await self.prompt_llm(prompt)

        if not fixed_content or len(fixed_content) < 20:
            msg = "Gemini did not return a valid fix."
            await self.log(msg, "error")
            await self.chat(msg)
            return msg

        # Strip accidental markdown fences if Gemini adds them
        if fixed_content.startswith("```"):
            lines = fixed_content.splitlines()
            # Remove first and last fence lines
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            fixed_content = "\n".join(lines)

        # --- 4. Validate Python syntax (for .py files) ---
        if file_path.endswith(".py"):
            await self.log("Validating Python syntax...")
            try:
                ast.parse(fixed_content)
                await self.log("Syntax check passed.", "success")
            except SyntaxError as se:
                msg = f"Gemini's fix has a syntax error ({se}). File NOT written. Please try again."
                await self.log(msg, "error")
                await self.chat(msg)
                return msg

        # --- 5. Backup original and write fix ---
        await self.update_status("Applying Fix")
        bak_path = file_path + ".bak"
        try:
            with open(bak_path, "w", encoding="utf-8") as f:
                f.write(original_content)
            await self.log(f"Backup saved to {bak_path}")

            with open(file_path, "w", encoding="utf-8") as f:
                f.write(fixed_content)
            await self.log(f"Fix applied to {file_path}", "success")
        except Exception as e:
            msg = f"Failed to write fix: {e}"
            await self.log(msg, "error")
            await self.chat(msg)
            return msg

        # --- 6. Report summary ---
        original_lines = len(original_content.splitlines())
        fixed_lines = len(fixed_content.splitlines())
        summary = (
            f"Fix applied successfully to {os.path.basename(file_path)}.\n"
            f"Lines: {original_lines} -> {fixed_lines}. "
            f"Backup saved as {os.path.basename(bak_path)}.\n"
            f"The server's --reload watcher will pick up the change automatically."
        )
        await self.update_status("Completed")
        await self.log(summary, "success")
        await self.chat(summary)
        return summary

    def _resolve_path(self, hint: str) -> str | None:
        """Find a file within SAFE_ROOT matching the hint. Returns absolute path or None."""
        hint = hint.replace("\\", "/").strip("/")
        # Direct match relative to SAFE_ROOT
        candidate = os.path.join(SAFE_ROOT, hint)
        if os.path.isfile(candidate):
            return candidate
        # Search by filename only
        filename = os.path.basename(hint)
        for root, dirs, files in os.walk(SAFE_ROOT):
            # Skip venv and __pycache__
            dirs[:] = [d for d in dirs if d not in ("venv", "__pycache__", ".git", "node_modules")]
            if filename in files:
                full = os.path.join(root, filename)
                # Safety check: must be inside SAFE_ROOT
                if os.path.abspath(full).startswith(SAFE_ROOT):
                    return full
        return None
