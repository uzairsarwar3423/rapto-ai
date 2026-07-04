import re
import os

filepath = "/home/uzair/vocaply-system/services/ai-pipeline/tests/test_openai_client.py"

with open(filepath, "r") as f:
    content = f.read()

# Fix mock import
content = content.replace('"src.services.ai_client.genai.Client"', '"src.services.openai_client.AsyncOpenAI"')

# Fix max retries
content = content.replace("settings.max_openai_retries = 2", "settings.openai_max_retries = 2")

# Fix _call_sdk_text -> _call_openai_parsed for structured calls
# TestGenerateStructuredSuccess
content = content.replace('with patch.object(client, "_call_sdk_text", new_callable=AsyncMock) as mock_call:',
                          'with patch.object(client, "_call_openai_parsed", new_callable=AsyncMock) as mock_call:')
content = content.replace('mock_call.return_value = (\n                valid_json,\n                {"input_token_count": 100, "output_token_count": 50},\n            )',
                          'mock_call.return_value = (\n                EchoSchema(message="hello", value=42),\n                {"input_token_count": 100, "output_token_count": 50},\n                valid_json,\n            )')

content = content.replace('mock_call.return_value = (\n                \'{"message": "test", "value": 1}\',\n                {"input_token_count": input_tokens, "output_token_count": output_tokens},\n            )',
                          'mock_call.return_value = (\n                EchoSchema(message="test", value=1),\n                {"input_token_count": input_tokens, "output_token_count": output_tokens},\n                \'{"message": "test", "value": 1}\',\n            )')

content = content.replace('mock_call.return_value = (\n                \'{"message": "latency test", "value": 0}\',\n                {"input_token_count": 10, "output_token_count": 5},\n            )',
                          'mock_call.return_value = (\n                EchoSchema(message="latency test", value=0),\n                {"input_token_count": 10, "output_token_count": 5},\n                \'{"message": "latency test", "value": 0}\',\n            )')

# Fix side_effect for schema mismatch triggers corrective retry
content = content.replace('async def side_effect(*args: Any, **kwargs: Any) -> tuple[str, dict]:',
                          'async def side_effect(*args: Any, **kwargs: Any) -> tuple[Any, dict, str]:')
content = content.replace('return (\'{"wrong_field": "bad"}\', {"input_token_count": 10, "output_token_count": 5})',
                          'from pydantic import ValidationError\n                raise ValidationError.from_exception_data("Parsing Failed", [])')
content = content.replace('return (\'{"message": "corrected", "value": 99}\', {"input_token_count": 15, "output_token_count": 8})',
                          'return (EchoSchema(message="corrected", value=99), {"input_token_count": 15, "output_token_count": 8}, \'{"message": "corrected", "value": 99}\')')

# Fix _call_sdk_text patch when using side_effect
content = content.replace('with patch.object(client, "_call_sdk_text", side_effect=side_effect):',
                          'with patch.object(client, "_call_openai_parsed", side_effect=side_effect):')

# Fix Schema validation on both attempts raises
content = content.replace('mock_call.return_value = (bad_json, {"input_token_count": 10, "output_token_count": 5})',
                          'from pydantic import ValidationError\n            mock_call.side_effect = ValidationError.from_exception_data("Parsing Failed", [])')

# Fix Exception codes
content = content.replace('GEMINI_SCHEMA_VALIDATION_ERROR', 'AI_SCHEMA_VALIDATION_ERROR')
content = content.replace('GEMINI_NON_RETRYABLE_ERROR', 'AI_NON_RETRYABLE_ERROR')


with open(filepath, "w") as f:
    f.write(content)
