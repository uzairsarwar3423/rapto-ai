import os
import glob

test_dir = "/home/uzair/vocaply-system/services/ai-pipeline/tests"
files = glob.glob(f"{test_dir}/*.py")

replacements = [
    ("ModelTier.FLASH_LITE", "ModelTier.MINI"),
    ('body["checks"]["openai"]', 'body["checks"]["ai"]'),
    ('body["checks"]["gemini"]', 'body["checks"]["ai"]'),
    ('GEMINI_RATE_LIMIT_EXHAUSTED', 'AI_RATE_LIMIT_EXHAUSTED'),
    ('_call_sdk_text', '_call_openai_parsed'),
    ('max_openai_retries', 'openai_max_retries'),
]

for file_path in files:
    with open(file_path, "r") as f:
        content = f.read()
        
    new_content = content
    for old, new in replacements:
        new_content = new_content.replace(old, new)
        
    if new_content != content:
        with open(file_path, "w") as f:
            f.write(new_content)
        print(f"Updated {file_path}")
