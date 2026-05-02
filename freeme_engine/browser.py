# freeme_engine/browser.py
import asyncio
from playwright.async_api import async_playwright, Browser, Page, BrowserContext

class PlaywrightBrowserManager:
    """
    Manages the lifecycle of a headless or visible Playwright browser session
    for the FreeMe autonomous opt-out engine.
    """
    def __init__(self, headless: bool = True):
        self.headless = headless
        self.playwright = None
        self.browser: Browser = None
        self.context: BrowserContext = None
        
    async def initialize(self) -> Page:
        """Starts the browser and returns a fresh page."""
        self.playwright = await async_playwright().start()
        
        # We use Chromium by default for maximum compatibility with VLM parsing
        self.browser = await self.playwright.chromium.launch(
            headless=self.headless,
            args=["--disable-blink-features=AutomationControlled"] # Anti-bot mitigation
        )
        
        # Create a persistent context to mimic a real user session and hold cookies
        self.context = await self.browser.new_context(
            viewport={'width': 1280, 'height': 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        
        page = await self.context.new_page()
        return page
        
    async def respawn_visible(self, current_page: Page) -> Page:
        """
        Extracts state from the current invisible session, destroys it,
        and spawns a visible session exactly where it left off.
        """
        # 1. Capture State
        url = current_page.url
        cookies = await self.context.cookies()
        
        # 2. Destroy Headless Session (Browser level only to preserve playwright engine)
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
            
        # 3. Spin up Visible Session
        self.headless = False
        self.browser = await self.playwright.chromium.launch(
            headless=self.headless,
            args=["--disable-blink-features=AutomationControlled"]
        )
        self.context = await self.browser.new_context(
            viewport={'width': 1280, 'height': 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        
        # 4. Inject State
        await self.context.add_cookies(cookies)
        
        # 5. Navigate back to exact URL
        new_page = await self.context.new_page()
        await new_page.goto(url)
        return new_page
        
    async def close(self):
        """Cleans up browser processes to prevent memory leaks."""
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

# Helper for quick procedural testing
async def launch_test_page(url: str, headless: bool = False):
    """Utility function to verify Playwright installation and network connectivity."""
    manager = PlaywrightBrowserManager(headless=headless)
    page = await manager.initialize()
    
    print(f"[Browser] Navigating to {url}...")
    await page.goto(url)
    title = await page.title()
    print(f"[Browser] Successfully loaded: {title}")
    
    await asyncio.sleep(2) # Hold the page open briefly before GC closes it
    await manager.close()
