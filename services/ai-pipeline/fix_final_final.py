import os

f1 = "/home/uzair/vocaply-system/services/ai-pipeline/tests/test_cleanup_endpoint.py"
with open(f1, "r") as f:
    content = f.read()

content = content.replace('assert "detail" in data', 'assert "error_code" in data')

with open(f1, "w") as f:
    f.write(content)

print(f"Fixed {f1}")
