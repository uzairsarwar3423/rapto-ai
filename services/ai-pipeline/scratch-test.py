import asyncio
from openai import AsyncOpenAI
import os
from dotenv import load_dotenv

load_dotenv('/home/uzair/vocaply-system/services/ai-pipeline/.env')

async def main():
    client = AsyncOpenAI(api_key=os.environ['OPENAI_API_KEY'])
    try:
        res = await client.chat.completions.create(
            model=os.environ['OPENAI_GPT41_MINI_MODEL_NAME'],
            messages=[{"role": "user", "content": "hi"}]
        )
        print(res)
    except Exception as e:
        print(type(e))
        print(e)
        if hasattr(e, 'status_code'):
            print("Status code:", e.status_code)

asyncio.run(main())
