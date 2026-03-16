import pandas as pd
import io
import traceback
from agents.base_agent import BaseAgent

class DataAnalystAgent(BaseAgent):
    def __init__(self, callback_manager):
        super().__init__(callback_manager, "Data Analyst")

    async def run(self, payload: dict):
        try:
            await self.log("Initializing data analysis sequence...", "info")
            await self.update_status("Processing Data")
            
            task_description = payload.get("task", "")
            file_data = payload.get("file_data")
            file_name = payload.get("file_name", "")

            if not file_data or not file_name.endswith('.csv'):
                result = await self.prompt_llm(
                    f"You are a Data Analyst Agent. The user asked: {task_description}. However, no CSV file was provided. Let the user know you securely require a .csv spreadsheet file to perform advanced analytics."
                )
                await self.chat(result)
                await self.update_status("Idle")
                await self.progress(0)
                return result

            # Decode the CSV and load into pandas
            import base64
            csv_content = base64.b64decode(file_data).decode('utf-8')
            df = pd.read_csv(io.StringIO(csv_content))
            
            info_buf = io.StringIO()
            df.info(buf=info_buf)
            df_info = info_buf.getvalue()
            
            df_head = df.head(5).to_markdown()
            df_stats = df.describe().to_markdown()

            prompt = f"""You are an expert Data Analyst Agent.
The user provided a CSV file named '{file_name}' and asked: "{task_description}"

Here is the DataFrame schema:
{df_info}

Here is the dataset head (first 5 rows):
{df_head}

Here are the mathematical summary statistics:
{df_stats}

Please critically analyze this data and provide a comprehensive, markdown-formatted report explicitly answering the user's query. Use tables or lists where applicable."""

            await self.log("Analyzing statistical DataFrame with Gemini...", "info")
            await self.progress(50)
            
            analysis_result = await self.prompt_llm(prompt)
            
            await self.progress(100)
            await self.log("Data analysis complete.", "success")
            await self.update_status("Idle")
            
            await self.chat(analysis_result)
            return analysis_result

        except Exception as e:
            await self.log(f"Error in Data Analyst Agent: {str(e)}", "error")
            await self.update_status("Error")
            traceback.print_exc()
            return f"Data analysis failed: {str(e)}"
