import os
import glob

prompts_dir = "/home/uzair/vocaply-system/services/ai-pipeline/src/prompts"
files = glob.glob(os.path.join(prompts_dir, "*_system.txt"))

for f in files:
    with open(f, 'r') as file:
        content = file.read()
    
    new_content = content.replace("JSON array", "JSON object matching the requested schema")
    
    if new_content != content:
        with open(f, 'w') as file:
            file.write(new_content)
        print(f"Updated {f}")

print("Done")
