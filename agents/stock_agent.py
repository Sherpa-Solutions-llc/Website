import asyncio
import yfinance as yf
from .base_agent import BaseAgent

class StockMonitorAgent(BaseAgent):
    def __init__(self, callback_manager):
        super().__init__(callback_manager, "Stock Monitor")

    async def run(self, symbol: str, analysis_request: str = None) -> str:
        await self.update_status("Active")
        await self.update_progress(10)
        await self.log(f"Fetching data for {symbol}...")
        
        # Simulate network delay for effect
        await asyncio.sleep(1)
        
        try:
            await self.update_progress(40)
            ticker = yf.Ticker(symbol)
            info = ticker.info
            current_price = info.get("currentPrice", "N/A")
            company_name = info.get("shortName", symbol)
            summary = info.get("longBusinessSummary", "")[:300] + "..."
            
            # Fetch last month of historical data
            hist = ticker.history(period="1mo")
            if not hist.empty:
                # Ensure we only try to select columns that actually exist in the dataframe
                cols = [c for c in ['Open', 'High', 'Low', 'Close', 'Volume'] if c in hist.columns]
                hist_str = hist[cols].tail(14).to_string() if cols else str(hist.tail(14))
            else:
                hist_str = "No historical data available for this symbol."
            
            await self.update_progress(60)
            await self.log(f"Gathered info for {company_name}: Price ${current_price}", level="success")
            
            result_context = f"Company: {company_name}\nPrice: ${current_price}\nSummary: {summary}\n\nRecent Historical Data (Last 14 days):\n{hist_str}"
            
            # Optionally summarize with LLM
            await self.log("Analyzing stock data with Gemini...")
            if analysis_request:
                analysis_prompt = f"Using the following stock data:\n{result_context}\n\nPlease answer this request: {analysis_request}"
            else:
                analysis_prompt = f"Write a 2-sentence summary of the following stock data:\n{result_context}"
            analysis = await self.prompt_llm(analysis_prompt)
            await self.log(f"Analysis complete: {analysis}")
            
            await self.update_status("Completed")
            await self.update_progress(100)
            return analysis
        except Exception as e:
            import traceback
            err_str = traceback.format_exc()
            await self.log(f"Failed to fetch stock data for {symbol}: {str(e)}", level="error")
            await self.log(f"Traceback:\n{err_str}", level="error")
            await self.update_status("Error")
            await self.update_progress(0)
            return f"Error analyzing {symbol}: {str(e)}"
