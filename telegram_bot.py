"""
Telegram bot integration using raw httpx polling.
No python-telegram-bot dependency — runs natively in FastAPI's event loop.
"""

import os
import asyncio
import base64
import httpx
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
API_BASE = f"https://api.telegram.org/bot{TOKEN}"

# Per-chat state: are we waiting on an agent clarification reply?
_pending_questions: dict[int, asyncio.Future] = {}

HELP_TEXT = (
    "Sherpa Command Bridge\n\n"
    "Commands:\n"
    "/ping   - Test connectivity\n"
    "/status - Live agent health\n"
    "/help   - This message\n\n"
    "Or send any message to the Master Agent:\n"
    "  \"What's the price of AAPL?\"\n"
    "  \"Research AI regulation news\"\n"
    "  \"Review my code for security issues\""
)


async def tg_send(chat_id: int, text: str) -> bool:
    """Send a plain-text message to a Telegram chat. Returns True on success."""
    if len(text) > 4000:
        text = text[:3997] + "..."
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                f"{API_BASE}/sendMessage",
                json={"chat_id": chat_id, "text": text}
            )
            ok = r.json().get("ok", False)
            if ok:
                print(f"[Telegram] Sent to {chat_id}: {text[:80]}")
            else:
                print(f"[Telegram] sendMessage failed: {r.text[:200]}")
            return ok
    except Exception as e:
        print(f"[Telegram] Send exception to {chat_id}: {e}")
        return False


class TelegramCallbackAdapter:
    """
    Implements the ConnectionManager.broadcast() interface —
    routes agent output back to a Telegram chat via tg_send().
    """

    def __init__(self, chat_id: int):
        self.chat_id = chat_id
        self.active_connections = []  # Satisfies any attribute reads in agent code

    async def connect(self, ws): pass
    def disconnect(self, ws): pass

    async def broadcast(self, message: dict):
        t = message.get("type")
        print(f"[TelegramAdapter] broadcast type={t} chat={self.chat_id}")

        try:
            if t == "chat":
                content = (message.get("message") or "").strip()
                if content:
                    await tg_send(self.chat_id, f"Agent:\n{content}")

            elif t == "question":
                question = message.get("question", "")
                agent = message.get("agent", "Agent")
                if question:
                    fut: asyncio.Future = asyncio.get_event_loop().create_future()
                    _pending_questions[self.chat_id] = fut
                    await tg_send(
                        self.chat_id,
                        f"Question from {agent}:\n{question}\n\nReply here to continue."
                    )

            elif t == "log":
                level = message.get("level", "info")
                if level in ("error", "warning"):
                    label = "Warning" if level == "warning" else "Error"
                    await tg_send(
                        self.chat_id,
                        f"{label} [{message.get('agent', '')}]: {message.get('message', '')}"
                    )

            elif t == "status":
                status_val = message.get("status", "")
                if status_val in ("Completed", "Halted", "Error"):
                    labels = {"Completed": "Done", "Halted": "Stopped", "Error": "Error"}
                    await tg_send(
                        self.chat_id,
                        f"{labels[status_val]}: {message.get('agent', 'Agent')}"
                    )

        except Exception as e:
            print(f"[TelegramAdapter] Exception in broadcast: {e}")
            import traceback; traceback.print_exc()


async def tg_download_photo(file_id: str) -> tuple[str, str]:
    """Download a Telegram photo by file_id. Returns (base64_data, mime_type)."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(f"{API_BASE}/getFile", json={"file_id": file_id})
            file_path = r.json()["result"]["file_path"]
            img_url = f"https://api.telegram.org/file/bot{TOKEN}/{file_path}"
            img_r = await client.get(img_url)
            b64 = base64.b64encode(img_r.content).decode("utf-8")
            mime = "image/jpeg" if file_path.endswith(".jpg") else "image/png"
            print(f"[Telegram] Downloaded photo {file_id}: {len(img_r.content)} bytes")
            return b64, mime
    except Exception as e:
        print(f"[Telegram] Failed to download photo {file_id}: {e}")
        return "", ""


async def handle_agent_task(chat_id: int, text: str, username: str, master_agent, global_manager,
                            file_data: str = None, mime_type: str = None, file_name: str = None):
    """Run a task through the Master Agent and stream replies back to Telegram."""
    ack = f'Instruction received. Routing to Master Agent...\n"{text}"'
    if file_data:
        ack += "\n[Image attached]"
    await tg_send(chat_id, ack)

    adapter = TelegramCallbackAdapter(chat_id=chat_id)

    # Swap callback_manager on master agent and all sub-agents
    original_manager = master_agent.callback_manager
    sub_attrs = ['stock_agent', 'research_agent', 'web_agent', 'data_agent', 'code_agent', 'qa_agent', 'file_editor_agent']

    master_agent.callback_manager = adapter
    for attr in sub_attrs:
        sub = getattr(master_agent, attr, None)
        if sub:
            sub.callback_manager = adapter

    payload = {"task": text}
    if file_data:
        payload["file_data"] = file_data
        payload["mime_type"] = mime_type or "image/jpeg"
        payload["file_name"] = file_name or "photo.jpg"

    print(f"[Telegram] Starting run_task for chat={chat_id} user=@{username} has_image={bool(file_data)}")
    try:
        await master_agent.run_task(payload)
        print(f"[Telegram] run_task complete for chat={chat_id}")
    except asyncio.CancelledError:
        await tg_send(chat_id, "Task was cancelled.")
    except Exception as e:
        import traceback
        print(f"[Telegram] run_task exception chat={chat_id}: {e}")
        traceback.print_exc()
        await tg_send(chat_id, f"Agent error: {str(e)[:400]}")
    finally:
        master_agent.callback_manager = original_manager
        for attr in sub_attrs:
            sub = getattr(master_agent, attr, None)
            if sub:
                sub.callback_manager = original_manager
        _pending_questions.pop(chat_id, None)
        print(f"[Telegram] Manager restored for chat={chat_id}")


async def handle_status(chat_id: int, master_agent, global_manager):
    if master_agent:
        try:
            agent_status = getattr(master_agent, '_status', 'Idle')
            memory_len = len(getattr(master_agent, 'conversation_history', []))
            is_cancelled = master_agent.cancel_event.is_set() if hasattr(master_agent, 'cancel_event') else False
            ws_count = len(getattr(global_manager, 'active_connections', []))
            await tg_send(
                chat_id,
                f"Sherpa Live Status\n"
                f"------------------------\n"
                f"Master Agent: {agent_status or 'Idle'}\n"
                f"WebSocket Clients: {ws_count}\n"
                f"Memory Depth: {memory_len} messages\n"
                f"Cancel Flag: {'SET' if is_cancelled else 'Clear'}\n"
                f"Bridge: Active"
            )
        except Exception as e:
            await tg_send(chat_id, f"Status error: {e}")
    else:
        await tg_send(chat_id, "Agent not connected.")


async def poll_telegram(master_agent=None, global_manager=None):
    """
    Long-poll Telegram getUpdates in a loop, running natively in FastAPI's event loop.
    This avoids python-telegram-bot entirely to eliminate event loop conflicts.
    """
    if not TOKEN:
        print("[Telegram] ERROR: TELEGRAM_BOT_TOKEN not set. Bot will not start.")
        return

    print(f"[Telegram] Starting httpx polling (token ...{TOKEN[-6:]})")

    # First: clear any pending updates from old sessions
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(f"{API_BASE}/getUpdates", json={"offset": -1, "limit": 1, "timeout": 0})
            data = r.json()
            offset = (data["result"][-1]["update_id"] + 1) if data.get("result") else None
            print(f"[Telegram] Cleared pending updates. Starting offset: {offset}")
    except Exception as e:
        print(f"[Telegram] Failed to clear pending updates: {e}")
        offset = None

    # Announce to console that bot is live
    print("[Telegram] Bot is live and polling for messages.")

    while True:
        try:
            params = {"timeout": 30, "allowed_updates": ["message"]}
            if offset is not None:
                params["offset"] = offset

            async with httpx.AsyncClient(timeout=40.0) as client:
                resp = await client.post(f"{API_BASE}/getUpdates", json=params)

            data = resp.json()
            if not data.get("ok"):
                err_code = data.get("error_code")
                if err_code == 409:
                    # Another instance is polling — back off and let it die
                    print(f"[Telegram] 409 Conflict: another instance is running. Waiting 30s...")
                    await asyncio.sleep(30)
                elif err_code == 401:
                    print(f"[Telegram] 401 Unauthorized: bot token is invalid. Stopping.")
                    return
                else:
                    print(f"[Telegram] getUpdates error: {data}")
                    await asyncio.sleep(5)
                continue

            for update in data.get("result", []):
                offset = update["update_id"] + 1
                message = update.get("message", {})
                chat_id = message.get("chat", {}).get("id")
                from_info = message.get("from", {})
                username = from_info.get("username") or from_info.get("first_name", "unknown")

                if not chat_id:
                    continue

                # --- Detect photo messages ---
                photo_list = message.get("photo")  # list of PhotoSize, largest last
                file_data = None
                mime_type = None
                file_name = None
                if photo_list:
                    # Pick the highest-resolution version
                    best = photo_list[-1]
                    file_id = best.get("file_id", "")
                    caption = (message.get("caption") or "").strip()
                    text = caption if caption else "Please describe and analyse this image in detail."
                    print(f"[Telegram] Photo from @{username} (chat={chat_id}), caption={caption!r}")
                    file_data, mime_type = await tg_download_photo(file_id)
                    file_name = "photo.jpg"
                    if not file_data:
                        await tg_send(chat_id, "Sorry, I couldn't download the image. Please try again.")
                        continue
                else:
                    text = (message.get("text") or "").strip()
                    if not text:
                        continue
                    print(f"[Telegram] Message from @{username} (chat={chat_id}): {text}")

                # --- Handle clarification reply ---
                if chat_id in _pending_questions and not file_data:
                    fut = _pending_questions.pop(chat_id)
                    if not fut.done():
                        print(f"[Telegram] Resolving pending question for chat={chat_id}")
                        fut.set_result(text)
                        await tg_send(chat_id, f'Got it: "{text}" — continuing...')
                        continue

                # --- Handle commands ---
                if text == "/ping" or text.startswith("/ping "):
                    await tg_send(chat_id, "Pong! Bot is alive.")

                elif text == "/start" or text.startswith("/start "):
                    await tg_send(chat_id, f"Hello {from_info.get('first_name', '')}!\n\n{HELP_TEXT}")

                elif text == "/help" or text.startswith("/help "):
                    await tg_send(chat_id, HELP_TEXT)

                elif text == "/status" or text.startswith("/status "):
                    await handle_status(chat_id, master_agent, global_manager)

                else:
                    # Route to Master Agent in a background task so polling continues unblocked
                    if master_agent:
                        asyncio.create_task(
                            handle_agent_task(
                                chat_id, text, username, master_agent, global_manager,
                                file_data=file_data, mime_type=mime_type, file_name=file_name
                            )
                        )
                    else:
                        await tg_send(chat_id, "Master Agent not connected. Please restart the server.")

        except asyncio.CancelledError:
            print("[Telegram] Polling cancelled.")
            break
        except Exception as e:
            print(f"[Telegram] Polling exception: {e}")
            await asyncio.sleep(5)
