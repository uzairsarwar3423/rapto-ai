import os
import glob

directory = "/home/uzair/vocaply-system/services/ai-pipeline/tests"
files = glob.glob(f"{directory}/*.py")

replacements = [
    ("GeminiCallResult", "AICallResult"),
    ("GeminiNonRetryableError", "AINonRetryableError"),
    ("GeminiRateLimitExhaustedError", "AIRateLimitExhaustedError"),
    ("GeminiSchemaValidationError", "AISchemaValidationError"),
    ("GeminiTimeoutError", "AITimeoutError"),
    ("GeminiClient", "OpenAIClient"),
    ("Gemini", "OpenAI"),
    ("gemini_client", "ai_client"),
    ("mock_gemini_client", "mock_openai_client"),
    ("mock_gemini_cls", "mock_openai_cls"),
    ("gemini", "openai"),
]

for file_path in files:
    with open(file_path, "r") as f:
        content = f.read()

    new_content = content
    for old, new in replacements:
        new_content = new_content.replace(old, new)

    if content != new_content:
        with open(file_path, "w") as f:
            f.write(new_content)
        print(f"Updated {file_path}")
