import re

# Fix test_cleanup_endpoint.py
f1 = "/home/uzair/vocaply-system/services/ai-pipeline/tests/test_cleanup_endpoint.py"
with open(f1, "r") as f:
    content = f.read()

content = content.replace('"openai_cost":', '"ai_cost":')
content = content.replace("'openai_cost':", "'ai_cost':")
content = content.replace('"flash_lite"', '"mini"')
content = content.replace("'flash_lite'", "'mini'")

with open(f1, "w") as f:
    f.write(content)

# Fix test_openai_client.py
f2 = "/home/uzair/vocaply-system/services/ai-pipeline/tests/test_openai_client.py"
with open(f2, "r") as f:
    content2 = f.read()

old_slow_call = """        async def slow_call(*args: Any, **kwargs: Any) -> tuple[str, dict]:
            started_times.append(time.monotonic())
            await asyncio.sleep(call_duration)
            return ('{"message": "ok", "value": 0}', {"input_token_count": 10, "output_token_count": 5})"""

new_slow_call = """        async def slow_call(*args: Any, **kwargs: Any) -> tuple[Any, dict, str]:
            started_times.append(time.monotonic())
            await asyncio.sleep(call_duration)
            return (EchoSchema(message="ok", value=0), {"input_token_count": 10, "output_token_count": 5}, '{"message": "ok", "value": 0}')"""

if old_slow_call in content2:
    content2 = content2.replace(old_slow_call, new_slow_call)
    with open(f2, "w") as f:
        f.write(content2)
    print(f"Fixed {f2}")
else:
    print(f"Could not find old_slow_call in {f2}")

